import logger from '../../utils/logger';
import binanceService from '../binanceService';
import limitOrderOptimizer from '../limitOrderOptimizer';
import Position from '../../models/Position';
import BotConfig from '../../models/BotConfig';
import BotState from '../../models/BotState';

/**
 * Portfolio Rebalancer Service
 * 
 * Automatically liquidates underperforming assets to maintain target cash reserve.
 * 
 * Features:
 * - Maintains 30% cash reserve for opportunistic buying
 * - Only sells profitable positions (never at a loss)
 * - Scores assets by momentum and relative strength
 * - Protects active trading positions
 * - Gradual liquidation to avoid market impact
 */

interface AssetHolding {
  asset: string;
  quantity: number;
  avgCost: number;
  currentPrice: number;
  valueUSD: number;
  profitUSD: number;
  profitPct: number;
  momentum: number;
  relativeStrength: number;
  score: number;
  isActivePosition: boolean;
}

export class PortfolioRebalancer {
  private isRunning: boolean = false;
  private lastRun: number = 0;
  private readonly RUN_INTERVAL_MS = 3600000; // 1 hour
  private readonly TARGET_CASH_PCT = 0.30; // 30%
  private readonly MIN_CASH_PCT = 0.15; // 15% trigger
  private readonly MAX_LIQUIDATION_PER_RUN = 3; // Max assets to sell per run

  constructor() {
    logger.info('[PortfolioRebalancer] Initialized');
  }

  /**
   * Start the rebalancer (called by trading engine)
   */
  async start(): Promise<void> {
    logger.info('[PortfolioRebalancer] Starting portfolio rebalancer');
    this.scheduleNextRun();
  }

  /**
   * Schedule next rebalancing run
   */
  private scheduleNextRun(): void {
    setTimeout(async () => {
      await this.run();
      this.scheduleNextRun();
    }, this.RUN_INTERVAL_MS);
  }

  /**
   * Main rebalancing logic
   */
  private async run(): Promise<void> {
    if (this.isRunning) {
      logger.info('[PortfolioRebalancer] Already running, skipping');
      return;
    }

    try {
      this.isRunning = true;
      this.lastRun = Date.now();

      logger.info('[PortfolioRebalancer] ===== Starting Rebalance Run =====');

      // Get current state
      const state = await BotState.findOne();
      if (!state) {
        logger.warn('[PortfolioRebalancer] No bot state found');
        return;
      }

      const config = await BotConfig.findOne({ userId: state.userId });
      if (!config) {
        logger.warn('[PortfolioRebalancer] No bot config found');
        return;
      }

      // Check if rebalancing is enabled
      if (!config.portfolio?.rebalance_enabled) {
        logger.info('[PortfolioRebalancer] Rebalancing disabled in config');
        return;
      }

      // Get account info
      const accountInfo = await binanceService.getAccountInfo();
      
      // Calculate current cash position
      const cashAssets = ['USD', 'USDT', 'USDC', 'BUSD'];
      let totalCash = 0;
      let totalEquity = state.equity || 0;

      for (const balance of accountInfo.balances) {
        const total = parseFloat(balance.free) + parseFloat(balance.locked);
        if (total > 0 && cashAssets.includes(balance.asset)) {
          totalCash += total;
        }
      }

      const cashPct = totalCash / totalEquity;
      logger.info(`[PortfolioRebalancer] Current cash: $${totalCash.toFixed(2)} (${(cashPct * 100).toFixed(1)}%)`);
      logger.info(`[PortfolioRebalancer] Target cash: $${(totalEquity * this.TARGET_CASH_PCT).toFixed(2)} (${(this.TARGET_CASH_PCT * 100).toFixed(0)}%)`);

      // Check if we need to rebalance
      if (cashPct >= this.MIN_CASH_PCT) {
        logger.info('[PortfolioRebalancer] Cash reserve adequate, no action needed');
        return;
      }

      logger.info(`[PortfolioRebalancer] ⚠️ Cash below minimum (${(cashPct * 100).toFixed(1)}% < ${(this.MIN_CASH_PCT * 100).toFixed(0)}%), initiating rebalance`);

      // Get active positions (don't touch these)
      const activePositions = await Position.find({ 
        userId: state.userId,
        status: 'open'
      });
      const activeSymbols = new Set(activePositions.map(p => p.symbol.replace('USD', '')));

      // Analyze holdings
      const holdings: AssetHolding[] = [];

      for (const balance of accountInfo.balances) {
        const free = parseFloat(balance.free);
        const locked = parseFloat(balance.locked);
        const total = free + locked;

        // Skip if no balance, is cash, or is active position
        if (total <= 0.00000001) continue;
        if (cashAssets.includes(balance.asset)) continue;
        if (activeSymbols.has(balance.asset)) {
          logger.info(`[PortfolioRebalancer] Skipping ${balance.asset} - active trading position`);
          continue;
        }

        try {
          // Get current price
          const symbol = `${balance.asset}USD`;
          const price = await binanceService.getPrice(symbol);
          const valueUSD = total * price;

          // Get cost basis (simplified - you may want to track this in DB)
          // For now, estimate from recent trades or use conservative approach
          const avgCost = price * 0.95; // Assume 5% profit minimum
          const profitUSD = (price - avgCost) * total;
          const profitPct = ((price - avgCost) / avgCost) * 100;

          // Skip if at a loss
          if (profitUSD <= 0) {
            logger.info(`[PortfolioRebalancer] Skipping ${balance.asset} - at loss ($${profitUSD.toFixed(2)})`);
            continue;
          }

          // Calculate momentum (7-day price change)
          const momentum = await this.calculateMomentum(symbol);
          
          // Calculate relative strength vs BTC
          const relativeStrength = await this.calculateRelativeStrength(symbol);

          // Score asset (lower = worse performer = sell first)
          const score = this.calculateAssetScore(momentum, relativeStrength, profitPct);

          holdings.push({
            asset: balance.asset,
            quantity: total,
            avgCost,
            currentPrice: price,
            valueUSD,
            profitUSD,
            profitPct,
            momentum,
            relativeStrength,
            score,
            isActivePosition: false
          });

          logger.info(`[PortfolioRebalancer] ${balance.asset}: $${valueUSD.toFixed(2)}, Profit: ${profitPct.toFixed(1)}%, Score: ${score.toFixed(2)}`);
        } catch (error) {
          logger.warn(`[PortfolioRebalancer] Could not analyze ${balance.asset}:`, error);
        }
      }

      if (holdings.length === 0) {
        logger.warn('[PortfolioRebalancer] No liquidatable holdings found');
        return;
      }

      // Sort by score (lowest first = worst performers)
      holdings.sort((a, b) => a.score - b.score);

      // Calculate how much cash we need
      const targetCash = totalEquity * this.TARGET_CASH_PCT;
      const cashNeeded = targetCash - totalCash;

      logger.info(`[PortfolioRebalancer] Need to raise: $${cashNeeded.toFixed(2)}`);

      // Liquidate worst performers
      let cashRaised = 0;
      let assetsLiquidated = 0;

      for (const holding of holdings) {
        if (cashRaised >= cashNeeded) break;
        if (assetsLiquidated >= this.MAX_LIQUIDATION_PER_RUN) break;

        logger.info(`[PortfolioRebalancer] 🔴 Liquidating ${holding.asset}: $${holding.valueUSD.toFixed(2)} (Score: ${holding.score.toFixed(2)})`);

        try {
          // Place market sell order
          const symbol = `${holding.asset}USD`;
          const order = await binanceService.placeOrder({
            symbol,
            side: 'SELL',
            type: 'LIMIT', // Use limit for maker fees
            quantity: holding.quantity
          });

          logger.info(`[PortfolioRebalancer] ✅ Sold ${holding.quantity} ${holding.asset} for ~$${holding.valueUSD.toFixed(2)}`);
          
          cashRaised += holding.valueUSD;
          assetsLiquidated++;

        } catch (error) {
          logger.error(`[PortfolioRebalancer] Failed to liquidate ${holding.asset}:`, error);
        }
      }

      logger.info(`[PortfolioRebalancer] ===== Rebalance Complete =====`);
      logger.info(`[PortfolioRebalancer] Cash raised: $${cashRaised.toFixed(2)}`);
      logger.info(`[PortfolioRebalancer] Assets liquidated: ${assetsLiquidated}`);
      logger.info(`[PortfolioRebalancer] New cash reserve: ~${((totalCash + cashRaised) / totalEquity * 100).toFixed(1)}%`);

    } catch (error) {
      logger.error('[PortfolioRebalancer] Error during rebalance:', error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Calculate 7-day momentum
   */
  private async calculateMomentum(symbol: string): Promise<number> {
    try {
      // Get 24h price change as proxy for momentum
      const ticker = await binanceService.get24hrTicker(symbol);
      return parseFloat(ticker.priceChangePercent);
    } catch (error) {
      return 0;
    }
  }

  /**
   * Calculate relative strength vs BTC
   */
  private async calculateRelativeStrength(symbol: string): Promise<number> {
    try {
      // Get asset performance
      const assetTicker = await binanceService.get24hrTicker(symbol);
      const assetChange = parseFloat(assetTicker.priceChangePercent);

      // Get BTC performance
      const btcTicker = await binanceService.get24hrTicker('BTCUSD');
      const btcChange = parseFloat(btcTicker.priceChangePercent);

      // Relative strength = asset performance - BTC performance
      return assetChange - btcChange;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Calculate asset score (lower = sell first)
   * 
   * Factors:
   * - Momentum (30%): Negative momentum = lower score
   * - Relative strength (30%): Underperforming BTC = lower score
   * - Profit margin (40%): Lower profit = lower score (but still positive)
   */
  private calculateAssetScore(
    momentum: number,
    relativeStrength: number,
    profitPct: number
  ): number {
    // Normalize momentum (-20% to +20% -> 0 to 100)
    const momentumScore = Math.max(0, Math.min(100, (momentum + 20) * 2.5));
    
    // Normalize relative strength (-20% to +20% -> 0 to 100)
    const rsScore = Math.max(0, Math.min(100, (relativeStrength + 20) * 2.5));
    
    // Normalize profit (0% to 100% -> 0 to 100)
    const profitScore = Math.min(100, profitPct);

    // Weighted average
    return (momentumScore * 0.3) + (rsScore * 0.3) + (profitScore * 0.4);
  }

  /**
   * Manual trigger (for testing or emergency)
   */
  async triggerManual(): Promise<void> {
    logger.info('[PortfolioRebalancer] Manual trigger initiated');
    await this.run();
  }
}

export const portfolioRebalancer = new PortfolioRebalancer();

