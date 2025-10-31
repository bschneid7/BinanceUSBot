import logger from '../../utils/logger';
import { Types } from 'mongoose';
import BotConfig from '../../models/BotConfig';
import BotState from '../../models/BotState';
import Position from '../../models/Position';
import marketScanner from './marketScanner';
import mlEnhancedSignalGenerator from './mlEnhancedSignalGenerator';
import riskEngine from './riskEngine';
import executionRouter from './executionRouter';
import positionManager from './positionManager';
import reserveManager from './reserveManager';
import killSwitch from './killSwitch';
import binanceService from '../binanceService';
import lossLimitService from '../lossLimitService';
import positionReconciliationService from '../positionReconciliationService';
import exchangeInfoCache from '../exchangeInfoCache';
import userDataStream from './userDataStream';
import webSocketService from '../webSocketService';
import gridTradingService from './gridTrading';
import multiPairGridTradingService from './gridTradingMultiPair';
import { portfolioRebalancer } from './portfolioRebalancer';

export class TradingEngine {
  private scanIntervals: Map<string, NodeJS.Timeout> = new Map();
  private runningScans: Set<string> = new Set(); // Track active scan cycles

  /**
   * Start the trading engine for a user
   */
  async start(userId: Types.ObjectId): Promise<void> {
    try {
      logger.info(`[TradingEngine] Starting engine for user ${userId}`);

      // Check if scan interval is already active
      const userIdStr = userId.toString();
      if (this.scanIntervals.has(userIdStr)) {
        logger.info('[TradingEngine] Engine already running (scan interval active)');
        return;
      }

      // Get or create state
      const state = await BotState.findOne({ userId });

      // Initialize or update state
      let botState = state;
      if (!botState) {
        botState = await BotState.create({
          userId,
          isRunning: true,
          equity: 0, // Will be initialized by botInitializationService
          currentR: 0, // Will be calculated from equity
          dailyPnl: 0,
          dailyPnlR: 0,
          weeklyPnl: 0,
          weeklyPnlR: 0,
        });
      } else {
        botState.isRunning = true;
        await botState.save();
      }

      // Get config
      const config = await BotConfig.findOne({ userId });
      if (!config) {
        throw new Error('Bot configuration not found');
      }

      // Initialize exchange info cache
      logger.info('[TradingEngine] Initializing exchange info cache...');
      await exchangeInfoCache.refresh();

      // Run position reconciliation on startup
      logger.info('[TradingEngine] Running position reconciliation...');
      const reconciliationResult = await positionReconciliationService.reconcile(userId);
      logger.info('[TradingEngine] Reconciliation complete:', {
        matched: reconciliationResult.matched,
        fixed: reconciliationResult.fixed,
        errors: reconciliationResult.errors.length,
      });

      // Start User Data Stream for real-time order updates
      logger.info('[TradingEngine] Starting User Data Stream...');
      try {
        await userDataStream.start(userId);
        logger.info('[TradingEngine] User Data Stream started successfully');
      } catch (error) {
        logger.error('[TradingEngine] Failed to start User Data Stream:', error);
        logger.warn('[TradingEngine] Continuing without real-time updates (will use polling)');
      }

      // Start WebSocket service for real-time price updates
      logger.info('[TradingEngine] Starting WebSocket price streaming...');
      try {
        // Subscribe to all configured trading pairs
        const tradingPairs = config?.scanner?.pairs || [];
        
        // Connect WebSocket
        await webSocketService.connect();
        
        // Subscribe to each pair
        tradingPairs.forEach(pair => {
          webSocketService.subscribe(pair, (update) => {
            // Price updates are automatically cached in webSocketService
            // No action needed here - services will query latest prices
          });
        });
        
        logger.info(`[TradingEngine] WebSocket streaming active for ${tradingPairs.length} pairs`);
      } catch (error) {
        logger.error('[TradingEngine] Failed to start WebSocket streaming:', error);
        logger.warn('[TradingEngine] Continuing with REST API polling');
      }

      // Start Multi-Pair Grid Trading service (non-blocking)
      logger.info('[TradingEngine] Starting Multi-Pair Grid Trading service...');
      multiPairGridTradingService.start().then(() => {
        logger.info('[TradingEngine] Multi-Pair Grid Trading service started successfully');
      }).catch((error) => {
        logger.error('[TradingEngine] Failed to start Multi-Pair Grid Trading service:', error);
        logger.warn('[TradingEngine] Continuing without Multi-Pair Grid Trading');
      });

      // Start Portfolio Rebalancer
      logger.info('[TradingEngine] Starting Portfolio Rebalancer...');
      try {
        await portfolioRebalancer.start();
        logger.info('[TradingEngine] Portfolio Rebalancer started successfully');
      } catch (error) {
        logger.error('[TradingEngine] Failed to start Portfolio Rebalancer:', error);
        logger.warn('[TradingEngine] Continuing without Portfolio Rebalancer');
      }

      // Start self-scheduling scan loop (prevents overlaps)
      const scheduleNextScan = async () => {
        const userKey = userId.toString();
        
        // Check if already running
        if (this.runningScans.has(userKey)) {
          logger.info('[TradingEngine] Scan cycle still running, skipping...');
          return;
        }
        
        this.runningScans.add(userKey);
        
        try {
          await this.executeScanCycle(userId);
        } catch (error) {
          logger.error('[TradingEngine] Scan cycle error:', error);
        } finally {
          this.runningScans.delete(userKey);
          
          // Check if engine is still supposed to be running
          const currentState = await BotState.findOne({ userId });
          if (currentState?.isRunning) {
            // Schedule next scan
            const currentConfig = await BotConfig.findOne({ userId });
            const refreshMs = currentConfig?.scanner?.refresh_ms ?? 50000;
            const timeout = setTimeout(scheduleNextScan, refreshMs);
            this.scanIntervals.set(userKey, timeout);
          }
        }
      };
      
      // Start first scan immediately
      setTimeout(scheduleNextScan, 0);
      
      logger.info(`[TradingEngine] Engine started - Scanning every ${config?.scanner?.refresh_ms}ms`);
    } catch (error) {
      logger.error('[TradingEngine] Error starting engine:', error);
      throw error;
    }
  }

  /**
   * Stop the trading engine for a user
   */
  async stop(userId: Types.ObjectId): Promise<void> {
    try {
      logger.info(`[TradingEngine] Stopping engine for user ${userId}`);

      const userKey = userId.toString();
      
      // Clear timeout
      const timeout = this.scanIntervals.get(userKey);
      if (timeout) {
        clearTimeout(timeout);
        this.scanIntervals.delete(userKey);
      }
      
      // Remove from running scans
      this.runningScans.delete(userKey);

      // Stop Multi-Pair Grid Trading service
      logger.info('[TradingEngine] Stopping Multi-Pair Grid Trading service...');
      try {
        await multiPairGridTradingService.stop();
        logger.info('[TradingEngine] Multi-Pair Grid Trading service stopped');
      } catch (error) {
        logger.error('[TradingEngine] Error stopping Multi-Pair Grid Trading service:', error);
      }

      // Stop User Data Stream
      logger.info('[TradingEngine] Stopping User Data Stream...');
      try {
        await userDataStream.stop();
        logger.info('[TradingEngine] User Data Stream stopped');
      } catch (error) {
        logger.error('[TradingEngine] Error stopping User Data Stream:', error);
      }

      // Update state
      const state = await BotState.findOne({ userId });
      if (state) {
        state.isRunning = false;
        await state.save();
      }

      logger.info('[TradingEngine] Engine stopped');
    } catch (error) {
      logger.error('[TradingEngine] Error stopping engine:', error);
      throw error;
    }
  }

  /**
   * Execute a single scan cycle
   */
  private async executeScanCycle(userId: Types.ObjectId): Promise<void> {
    try {
      // Check if engine should be running
      const state = await BotState.findOne({ userId });
      if (!state?.isRunning) {
        logger.info('[TradingEngine] Engine not running - skipping scan');
        return;
      }

      const config = await BotConfig.findOne({ userId });
      if (!config) {
        logger.error('[TradingEngine] Config not found - skipping scan');
        return;
      }

      // Check bot status
      if (config.botStatus !== 'ACTIVE') {
        // Check for auto-resume
        const resumed = await killSwitch.checkAutoResume(userId);
        if (!resumed) {
          logger.info(`[TradingEngine] Bot status ${config.botStatus} - skipping scan`);
          return;
        }
        
        // Even if auto-resumed, verify loss limits are cleared
        const tradingAllowedAfterResume = await lossLimitService.enforceLossLimits(userId);
        if (!tradingAllowedAfterResume) {
          logger.warn('[TradingEngine] Auto-resumed but loss limits still active - halting again');
          await killSwitch.execute(userId, 'DAILY', 'Loss limits still active after auto-resume');
          return;
        }
      }

      logger.info('[TradingEngine] ===== Scan Cycle Start =====');

      // Step 1: Update PnL tracking and recalculate R
      try {
        await riskEngine.updatePnLTracking(userId);
      } catch (error) {
        logger.error('[TradingEngine] Failed to update PnL tracking:', error);
        // Continue with stale data - better than stopping
      }
      
      try {
        await this.recalculateEquity(userId);
      } catch (error) {
        logger.error('[TradingEngine] Failed to recalculate equity:', error);
        // Critical - abort scan cycle if equity calculation fails
        return;
      }
      // Note: Reserve levels are checked when placing orders via reserveManager.checkAvailableCapital()

      // Step 2: Check kill-switch
      const killSwitchResult = await riskEngine.checkKillSwitch(userId);
      if (killSwitchResult.shouldHalt) {
        logger.info(`[TradingEngine] Kill-switch triggered: ${killSwitchResult.reason}`);
        await killSwitch.execute(
          userId,
          killSwitchResult.haltType!,
          killSwitchResult.reason!
        );
        return;
      }

      // Step 2.5: Check loss limits
      const tradingAllowed = await lossLimitService.enforceLossLimits(userId);
      if (!tradingAllowed) {
        logger.info('[TradingEngine] Loss limit reached - halting trading');
        return;
      }

      // Step 3: Update all open positions
      try {
        await positionManager.updateAllPositions(userId);
      } catch (error) {
        logger.error('[TradingEngine] Failed to update positions:', error);
        // Continue - position updates are not critical for new signals
      }

      // Step 4: Scan markets
      const marketData = await marketScanner.scanMarkets(userId);

      // Step 5: Generate signals
      const signals = await mlEnhancedSignalGenerator.generateSignals(userId, marketData);

      logger.info(`[TradingEngine] Generated ${signals.length} signals`);

      // Step 6: Process signals
      // Process signals in parallel for better performance
      const results = await Promise.allSettled(
        signals.map(signal => this.processSignalWithRetry(userId, signal))
      );
      
      // Log any failures
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          logger.error({ signal: signals[index], error: result.reason }, 'Signal processing failed after retries');
        }
      });

      logger.info('[TradingEngine] ===== Scan Cycle Complete =====');
    } catch (error) {
      logger.error('[TradingEngine] Error in scan cycle:', error);
    }
  }

  /**
   * Process a trading signal with retry logic
   */
  private async processSignalWithRetry(
    userId: Types.ObjectId,
    signal: typeof signalGenerator.prototype,
    maxRetries: number = 2
  ): Promise<void> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        await this.processSignal(userId, signal);
        return; // Success - exit retry loop
      } catch (error) {
        const isLastAttempt = attempt === maxRetries;
        
        if (isLastAttempt) {
          logger.error(
            { signal, error, attempts: attempt + 1 },
            'Signal processing failed after all retries'
          );
          throw error;
        }
        
        // Exponential backoff: 1s, 2s
        const delay = 1000 * Math.pow(2, attempt);
        logger.warn(
          { signal, error, attempt: attempt + 1, maxRetries, delay },
          'Signal processing failed, retrying...'
        );
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * Process a trading signal
   */
  private async processSignal(
    userId: Types.ObjectId,
    signal: typeof signalGenerator.prototype
  ): Promise<void> {
    try {
      logger.info(`[TradingEngine] Processing signal: ${signal.symbol} ${signal.playbook} ${signal.action}`);

      const config = await BotConfig.findOne({ userId });
      const state = await BotState.findOne({ userId });

      if (!config || !state) {
        await signalGenerator.recordSignal(userId, signal, 'SKIPPED', 'Config or state not found');
        return;
      }

      // Check signal cooldown
      const cooldownCheck = await marketScanner.checkSignalCooldown(
        userId,
        signal.symbol,
        config?.scanner?.pair_signal_cooldown_min
      );

      if (!cooldownCheck.allowed) {
        await signalGenerator.recordSignal(userId, signal, 'SKIPPED', cooldownCheck.reason);
        return;
      }

      // Calculate position size
      // Validate that currentR is fresh (updated within last 5 minutes)
      const now = new Date();
      const rUpdatedAt = state.updatedAt || state.createdAt;
      const rAge = now.getTime() - new Date(rUpdatedAt).getTime();
      const MAX_R_AGE_MS = 5 * 60 * 1000; // 5 minutes
      
      if (rAge > MAX_R_AGE_MS) {
        logger.warn(`[TradingEngine] currentR is stale (${Math.round(rAge/1000)}s old), skipping signal`);
        await signalGenerator.recordSignal(userId, signal, 'SKIPPED', 'Stale R value - equity not recently calculated');
        return;
      }
      
      const riskAmount = state.currentR;
      
      // Validate stop price is different from entry
      if (Math.abs(signal.entryPrice - signal.stopPrice) < 0.0001) {
        logger.warn(`[TradingEngine] Entry price equals stop price for ${signal.symbol}`);
        await signalGenerator.recordSignal(userId, signal, 'SKIPPED', 'Invalid signal: entry price equals stop price');
        return;
      }
      
      let quantity = riskEngine.calculatePositionSize(
        signal.entryPrice,
        signal.stopPrice,
        riskAmount
      );

      // Calculate notional value
      let notional = quantity * signal.entryPrice;

      // Check risk limits
      const riskCheck = await riskEngine.checkRiskLimits(
        userId,
        signal.symbol,
        1.0, // 1R per position
        notional
      );

      if (!riskCheck.approved) {
        await signalGenerator.recordSignal(userId, signal, 'SKIPPED', riskCheck.reason);
        return;
      }

      // Apply correlation guard scaling
      if (riskCheck.maxQuantity !== undefined && riskCheck.maxQuantity < 1.0) {
        const originalQuantity = quantity;
        quantity *= riskCheck.maxQuantity;
        notional = quantity * signal.entryPrice;
        const reductionPct = ((1 - riskCheck.maxQuantity) * 100).toFixed(0);
        logger.info(`[TradingEngine] Position scaled down by ${reductionPct}% (${originalQuantity.toFixed(8)} -> ${quantity.toFixed(8)}) due to correlation guard`);
      }

      // Check available capital
      const capitalCheck = await reserveManager.checkAvailableCapital(userId, notional);
      if (!capitalCheck.available) {
        await signalGenerator.recordSignal(userId, signal, 'SKIPPED', capitalCheck.reason);
        return;
      }

      // Execute the signal
      logger.info(`[TradingEngine] Executing signal: ${signal.symbol} ${signal.action} ${quantity.toFixed(8)} @ $${signal.entryPrice.toFixed(2)}`);

      const orderResult = await executionRouter.executeSignal(
        userId,
        signal,
        quantity
      );

      if (!orderResult.success) {
        await signalGenerator.recordSignal(userId, signal, 'SKIPPED', orderResult.error);
        return;
      }

      // Create position record
      const position = await positionManager.createPosition(
        userId,
        signal.symbol,
        signal.action === 'BUY' ? 'LONG' : 'SHORT',
        orderResult.fillPrice || signal.entryPrice,
        orderResult.filledQuantity || quantity,
        signal.stopPrice,
        signal.playbook,
        signal.targetPrice
      );

      // Record signal as executed
      await signalGenerator.recordSignal(userId, signal, 'EXECUTED');

      // Update last signal time
      await marketScanner.updateLastSignalTime(userId, signal.symbol);

      logger.info(`[TradingEngine] Signal executed successfully - Position ${position._id as any} created`);
    } catch (error) {
      logger.error('[TradingEngine] Error processing signal:', error);
      await signalGenerator.recordSignal(
        userId,
        signal,
        'SKIPPED',
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  /**
   * Recalculate equity and R value
   */
  private async recalculateEquity(userId: Types.ObjectId): Promise<void> {
    try {
      const state = await BotState.findOne({ userId });
      const config = await BotConfig.findOne({ userId });

      if (!state || !config) return;

      // Get all positions
      const openPositions = await Position.find({ userId, status: 'OPEN' });

      // Calculate total unrealized PnL
      let totalUnrealizedPnl = 0;
      openPositions?.forEach(position => {
        totalUnrealizedPnl += position.unrealized_pnl ?? 0;
      });

      // Use existing equity from BotState
      // Get equity from BotState (must be properly initialized)
      let baseEquity = state.equity;
      if (!baseEquity || baseEquity <= 0) {
        throw new Error('BotState equity not initialized. Run botInitializationService first.');
      }
      
      // Only attempt to sync from Binance if API is properly configured
      if (binanceService.isConfigured()) {
        try {
          const accountInfo = await binanceService.getAccountInfo();
          
          // Calculate total portfolio value in USD
          let totalValue = 0;
          
          logger.info('[TradingEngine] Calculating total portfolio value from Binance balances...');
          
          let assetsWithBalance = 0;
          let assetsPriced = 0;
          
          for (const balance of accountInfo.balances) {
            const free = parseFloat(balance.free);
            const locked = parseFloat(balance.locked);
            const total = free + locked;
            
            if (total > 0.00000001) {
              assetsWithBalance++;
              
              if (balance.asset === 'USD' || balance.asset === 'USDT' || balance.asset === 'USDC' || balance.asset === 'BUSD') {
                // Stablecoins count as 1:1 USD
                totalValue += total;
                assetsPriced++;
                logger.info(`[TradingEngine] ${balance.asset}: ${total.toFixed(8)} @ $1.00 = $${total.toFixed(2)}`);
              } else {
                // For other assets, get current price and convert to USD
                // Try USD first (Binance.US primary quote), then USDT, then USDC
                let priceFound = false;
                let assetValueUSD = 0;
                
                for (const quote of ['USD', 'USDT', 'USDC']) {
                  try {
                    const symbol = `${balance.asset}${quote}`;
                    const ticker = await binanceService.getTickerPrice(symbol);
                    if (ticker && ticker.price) {
                      const price = parseFloat(ticker.price);
                      assetValueUSD = total * price;
                      totalValue += assetValueUSD;
                      assetsPriced++;
                      logger.info(`[TradingEngine] ${balance.asset}: ${total.toFixed(8)} @ $${price.toFixed(2)} = $${assetValueUSD.toFixed(2)}`);
                      priceFound = true;
                      break;
                    }
                  } catch (priceError) {
                    // Try next quote currency
                    continue;
                  }
                }
                
                if (!priceFound) {
                  logger.warn(`[TradingEngine] Could not get price for ${balance.asset} (${total.toFixed(8)} units) - skipping from equity calculation`);
                }
              }
            }
          }
          
          logger.info(`[TradingEngine] Total portfolio value: $${totalValue.toFixed(2)} (${assetsPriced}/${assetsWithBalance} assets priced)`);
          
          if (totalValue > 0) {
            // Use calculated value if:
            // 1. We successfully priced at least 90% of assets (high confidence), OR
            // 2. Calculated value is at least 80% of existing equity (reasonable change), OR
            // 3. No existing equity to compare against
            const pricingSuccessRate = assetsWithBalance > 0 ? assetsPriced / assetsWithBalance : 0;
            const minExpectedEquity = (state.equity ?? 0) * 0.8;
            
            if (pricingSuccessRate >= 0.9 || totalValue >= minExpectedEquity || !state.equity) {
              baseEquity = totalValue;
              logger.info(`[TradingEngine] ✅ Synced base equity from Binance API: $${baseEquity.toFixed(2)} (pricing success: ${(pricingSuccessRate * 100).toFixed(1)}%)`);
            } else {
              logger.warn(`[TradingEngine] Calculated equity ($${totalValue.toFixed(2)}) is much lower than existing ($${state.equity.toFixed(2)}), keeping existing value`);
              logger.warn(`[TradingEngine] Pricing success rate: ${(pricingSuccessRate * 100).toFixed(1)}% (${assetsPriced}/${assetsWithBalance} assets)`);
              logger.warn(`[TradingEngine] This usually means price lookups failed for crypto assets`);
              // Keep existing baseEquity
            }
          } else {
            logger.info(`[TradingEngine] Binance API returned 0, using existing equity: $${baseEquity.toFixed(2)}`);
          }
        } catch (error) {
          logger.info(`[TradingEngine] Could not sync from Binance API, using existing equity: $${baseEquity.toFixed(2)}`);
        }
      } else {
        // API not configured - this is normal, equity should be synced manually
        logger.info(`[TradingEngine] Using existing equity (Binance API not configured): $${baseEquity.toFixed(2)}`);
      }

      // Update equity
      state.equity = baseEquity + totalUnrealizedPnl;
      state.currentR = state.equity * config?.risk?.R_pct;

      await state.save();
    } catch (error) {
      logger.error('[TradingEngine] Error recalculating equity:', error);
    }
  }

  /**
   * Get engine status
   */
  async getStatus(userId: Types.ObjectId): Promise<{
    isRunning: boolean;
    lastScanTimestamp?: Date;
    lastSignalTimestamp?: Date;
  }> {
    try {
      const state = await BotState.findOne({ userId });
      return {
        isRunning: state?.isRunning || false,
        lastScanTimestamp: state?.lastScanTimestamp,
        lastSignalTimestamp: state?.lastSignalTimestamp,
      };
    } catch (error) {
      logger.error('[TradingEngine] Error getting status:', error);
      return { isRunning: false };
    }
  }
}

export default new TradingEngine();
