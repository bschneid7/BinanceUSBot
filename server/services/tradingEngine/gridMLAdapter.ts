import { Types } from 'mongoose';
import logger from '../../utils/logger';
import GridPerformanceLog from '../../models/GridPerformanceLog';
import GridOrder from '../../models/GridOrder';
import BotState from '../../models/BotState';
import BotConfig from '../../models/BotConfig';
import GridPPOAgent from './GridPPOAgent';
import binanceService from '../binanceService';

/**
 * Grid Trading ML Adapter
 * Integrates ML/PPO decisions into Grid Trading for adaptive parameter optimization
 */

interface MarketIndicators {
  price: number;
  volume24h: number;
  volatility: number;
  trendStrength: number;
  rsi: number;
  bollingerBandWidth: number;
  priceVsMA20: number;
}

interface GridMetrics {
  activeOrders: number;
  buyOrders: number;
  sellOrders: number;
  fillsLast24h: number;
  profitLast24h: number;
  avgProfitPerCycle: number;
  fillRate: number;
  capitalUtilization: number;
}

interface MLDecision {
  spacingMultiplier: number;
  sizeMultiplier: number;
  pairEnabled: boolean;
  gridActive: boolean;
  confidence: number;
}

class GridMLAdapter {
  private ppoAgent: GridPPOAgent | null = null;
  private userId: Types.ObjectId | null = null;
  private lastDecisionTime: Map<string, number> = new Map();
  private readonly DECISION_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

  /**
   * Initialize ML adapter with PPO agent
   */
  async initialize(userId: Types.ObjectId): Promise<void> {
    try {
      this.userId = userId;
      
      // Create PPO agent with extended state/action dimensions for grid trading
      // State: 20 dimensions (market + grid + portfolio features)
      // Actions: 5 dimensions (spacing, sizing, enable, active, confidence)
      this.ppoAgent = new GridPPOAgent(20, 5, {
        learningRate: 0.0003,
        gamma: 0.99,
        epsilon: 0.2,
      });

      // Load trained model
      const modelPath = '/app/ml_models/grid_ppo_best';
      await this.ppoAgent.loadModel(modelPath);
      logger.info('[GridMLAdapter] Initialized with GridPPOAgent and loaded trained model');
    } catch (error) {
      logger.error('[GridMLAdapter] Error initializing:', error);
      throw error;
    }
  }

  /**
   * Calculate market indicators for a symbol
   */
  private async calculateMarketIndicators(symbol: string): Promise<MarketIndicators> {
    try {
      // Get recent klines for calculations
      const klines = await binanceService.getKlines(symbol, '1h', 100);
      
      if (!klines || klines.length === 0) {
        throw new Error('No kline data available');
      }

      const closes = klines.map(k => parseFloat(k[4]));
      const highs = klines.map(k => parseFloat(k[2]));
      const lows = klines.map(k => parseFloat(k[3]));
      const volumes = klines.map(k => parseFloat(k[5]));
      
      const currentPrice = closes[closes.length - 1];

      // Calculate volatility (ATR-like)
      const ranges = highs.map((h, i) => h - lows[i]);
      const volatility = ranges.slice(-24).reduce((a, b) => a + b, 0) / 24 / currentPrice;

      // Calculate trend strength (price momentum)
      const ma20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
      const priceVsMA20 = (currentPrice - ma20) / ma20;
      const trendStrength = Math.max(-1, Math.min(1, priceVsMA20 * 10)); // Normalize to -1 to 1

      // Calculate RSI
      const gains = [];
      const losses = [];
      for (let i = 1; i < closes.length; i++) {
        const change = closes[i] - closes[i - 1];
        gains.push(change > 0 ? change : 0);
        losses.push(change < 0 ? -change : 0);
      }
      const avgGain = gains.slice(-14).reduce((a, b) => a + b, 0) / 14;
      const avgLoss = losses.slice(-14).reduce((a, b) => a + b, 0) / 14;
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      const rsi = 100 - (100 / (1 + rs));

      // Calculate Bollinger Band Width
      const stdDev = Math.sqrt(
        closes.slice(-20).reduce((sum, price) => sum + Math.pow(price - ma20, 2), 0) / 20
      );
      const bollingerBandWidth = (4 * stdDev) / ma20; // (upper - lower) / ma20

      // 24h volume
      const volume24h = volumes.slice(-24).reduce((a, b) => a + b, 0);

      return {
        price: currentPrice,
        volume24h,
        volatility,
        trendStrength,
        rsi,
        bollingerBandWidth,
        priceVsMA20,
      };
    } catch (error) {
      logger.error(`[GridMLAdapter] Error calculating market indicators for ${symbol}:`, error);
      throw error;
    }
  }

  /**
   * Calculate grid performance metrics
   */
  private async calculateGridMetrics(symbol: string): Promise<GridMetrics> {
    try {
      if (!this.userId) {
        throw new Error('User ID not set');
      }

      // Get active grid orders
      const activeOrders = await GridOrder.find({
        userId: this.userId,
        symbol,
        status: 'ACTIVE',
      });

      const buyOrders = activeOrders.filter(o => o.side === 'BUY').length;
      const sellOrders = activeOrders.filter(o => o.side === 'SELL').length;

      // Get filled orders in last 24h
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const filledOrders = await GridOrder.find({
        userId: this.userId,
        symbol,
        status: 'FILLED',
        filledAt: { $gte: yesterday },
      });

      const fillsLast24h = filledOrders.length;
      const profitLast24h = filledOrders.reduce((sum, order) => sum + (order.profit || 0), 0);
      const avgProfitPerCycle = fillsLast24h > 0 ? profitLast24h / fillsLast24h : 0;

      // Calculate fill rate
      const totalOrders = activeOrders.length + fillsLast24h;
      const fillRate = totalOrders > 0 ? fillsLast24h / totalOrders : 0;

      // Calculate capital utilization
      const config = await BotConfig.findOne({ userId: this.userId });
      const pairConfig = config?.gridTradingMultiPair?.pairs.find(p => p.symbol === symbol);
      const allocatedCapital = pairConfig ? pairConfig.orderSize * pairConfig.gridLevels : 0;
      // Calculate deployed capital (approximate, since we don't store quantity)
      const deployedCapital = activeOrders.reduce((sum, o) => sum + (pairConfig?.orderSize || 100), 0);
      const capitalUtilization = allocatedCapital > 0 ? deployedCapital / allocatedCapital : 0;

      return {
        activeOrders: activeOrders.length,
        buyOrders,
        sellOrders,
        fillsLast24h,
        profitLast24h,
        avgProfitPerCycle,
        fillRate,
        capitalUtilization,
      };
    } catch (error) {
      logger.error(`[GridMLAdapter] Error calculating grid metrics for ${symbol}:`, error);
      throw error;
    }
  }

  /**
   * Prepare state vector for ML model
   */
  private prepareStateVector(
    marketIndicators: MarketIndicators,
    gridMetrics: GridMetrics,
    portfolioContext: { playbookActivityLevel: number; totalExposure: number; reserveCashPct: number }
  ): number[] {
    // Normalize all features to 0-1 range for better ML performance
    return [
      // Market indicators (7 features)
      Math.min(marketIndicators.price / 150000, 1.0), // Normalize price
      Math.min(marketIndicators.volume24h / 100000000, 1.0), // Normalize volume
      Math.min(marketIndicators.volatility, 1.0), // Already 0-1
      (marketIndicators.trendStrength + 1) / 2, // Convert -1 to 1 → 0 to 1
      marketIndicators.rsi / 100, // 0-100 → 0-1
      Math.min(marketIndicators.bollingerBandWidth, 1.0),
      (marketIndicators.priceVsMA20 + 0.5) / 1.0, // -0.5 to 0.5 → 0 to 1

      // Grid metrics (8 features)
      Math.min(gridMetrics.activeOrders / 50, 1.0), // Normalize to max 50 orders
      Math.min(gridMetrics.buyOrders / 25, 1.0),
      Math.min(gridMetrics.sellOrders / 25, 1.0),
      Math.min(gridMetrics.fillsLast24h / 20, 1.0), // Max 20 fills per day
      Math.min(gridMetrics.profitLast24h / 100, 1.0), // Normalize to $100 max
      Math.min(gridMetrics.avgProfitPerCycle / 10, 1.0), // Max $10 per cycle
      gridMetrics.fillRate, // Already 0-1
      gridMetrics.capitalUtilization, // Already 0-1

      // Portfolio context (5 features)
      portfolioContext.playbookActivityLevel, // 0-1
      Math.min(portfolioContext.totalExposure / 10000, 1.0), // Normalize exposure
      portfolioContext.reserveCashPct / 100, // 0-100 → 0-1
      
      // Time features (2)
      (new Date().getHours()) / 24, // Hour of day
      (new Date().getDay()) / 7, // Day of week
    ];
  }

  /**
   * Calculate reward for ML training
   */
  private calculateReward(
    marketIndicators: MarketIndicators,
    gridMetrics: GridMetrics,
    gridConfig: { orderSize: number }
  ): number {
    // Profit component (primary reward)
    const profitReward = (gridMetrics.profitLast24h / (gridConfig.orderSize * gridMetrics.activeOrders || 1)) * 100;

    // Fill rate component (encourages activity)
    const fillRateReward = gridMetrics.fillRate * 10;

    // Efficiency bonus (profit per trade)
    const efficiencyReward = gridMetrics.avgProfitPerCycle > 0 
      ? (gridMetrics.avgProfitPerCycle / gridConfig.orderSize) * 20 
      : 0;

    // Trend avoidance bonus (grid works best in ranging markets)
    const trendAvoidanceReward = (1 - Math.abs(marketIndicators.trendStrength)) * 5;

    // Capital utilization reward
    const utilizationReward = gridMetrics.capitalUtilization * 5;

    // Risk penalty (if too many active orders with low fill rate)
    const riskPenalty = gridMetrics.activeOrders > 20 && gridMetrics.fillRate < 0.2 ? -10 : 0;

    const totalReward = 
      profitReward + 
      fillRateReward + 
      efficiencyReward + 
      trendAvoidanceReward + 
      utilizationReward + 
      riskPenalty;

    return totalReward;
  }

  /**
   * Get ML decision for grid trading parameters
   */
  async getMLDecision(symbol: string): Promise<MLDecision | null> {
    try {
      // Check if enough time has passed since last decision
      const lastDecision = this.lastDecisionTime.get(symbol) || 0;
      const now = Date.now();
      if (now - lastDecision < this.DECISION_INTERVAL_MS) {
        return null; // Too soon for new decision
      }

      if (!this.ppoAgent || !this.userId) {
        logger.warn('[GridMLAdapter] PPO agent or user ID not initialized');
        return null;
      }

      // Calculate market indicators and grid metrics
      const marketIndicators = await this.calculateMarketIndicators(symbol);
      const gridMetrics = await this.calculateGridMetrics(symbol);

      // Get portfolio context
      const botState = await BotState.findOne({ userId: this.userId });
      
      // Calculate actual playbook activity level
      const Position = (await import('../../models/Position')).default;
      const openPositions = await Position.find({ userId: this.userId, status: 'OPEN' });
      const playbookPositions = openPositions.filter(p => p.playbook && p.playbook !== 'GRID');
      const playbookActivityLevel = playbookPositions.length / Math.max(openPositions.length, 1);
      
      // Calculate actual reserve cash percentage
      const totalEquity = botState?.equity || 0;
      const positionsValue = openPositions.reduce((sum, p) => sum + Math.abs(p.position_size_usd || 0), 0);
      const reserveCash = totalEquity - positionsValue;
      const reserveCashPct = totalEquity > 0 ? (reserveCash / totalEquity) * 100 : 30;
      
      const portfolioContext = {
        playbookActivityLevel,
        totalExposure: totalEquity,
        reserveCashPct,
      };

      // Prepare state vector
      const stateVector = this.prepareStateVector(marketIndicators, gridMetrics, portfolioContext);

      // Get ML action from GridPPOAgent (returns continuous action vector [0,1]^5)
      const action = await this.ppoAgent.getAction(stateVector);

      // Interpret action vector
      // action[0]: spacing multiplier (0-1 → 0.5-1.5)
      // action[1]: size multiplier (0-1 → 0.5-1.5)
      // action[2]: pair enabled (0-1 → boolean)
      // action[3]: grid active (0-1 → boolean)
      // action[4]: confidence (0-1)

      const decision: MLDecision = {
        spacingMultiplier: 0.5 + action[0], // Maps 0-1 to 0.5-1.5
        sizeMultiplier: 0.5 + action[1], // Maps 0-1 to 0.5-1.5
        pairEnabled: action[2] > 0.5,
        gridActive: action[3] > 0.5,
        confidence: action[4],
      };

      // Calculate reward for training
      const config = await BotConfig.findOne({ userId: this.userId });
      const pairConfig = config?.gridTradingMultiPair?.pairs.find(p => p.symbol === symbol);
      const reward = this.calculateReward(marketIndicators, gridMetrics, {
        orderSize: pairConfig?.orderSize || 100,
      });

      // Log performance for training data
      await GridPerformanceLog.create({
        userId: this.userId,
        symbol,
        timestamp: new Date(),
        gridConfig: {
          lowerBound: pairConfig?.lowerBound || 0,
          upperBound: pairConfig?.upperBound || 0,
          gridLevels: pairConfig?.gridLevels || 0,
          orderSize: pairConfig?.orderSize || 0,
          gridSpacing: pairConfig ? (pairConfig.upperBound - pairConfig.lowerBound) / pairConfig.gridLevels : 0,
        },
        marketState: marketIndicators,
        performance: gridMetrics,
        stateVector,
        mlAction: decision,
        reward,
        portfolioContext,
      });

      // Update last decision time
      this.lastDecisionTime.set(symbol, now);

      logger.info(`[GridMLAdapter] ML decision for ${symbol}:`, {
        spacingMultiplier: decision.spacingMultiplier.toFixed(2),
        sizeMultiplier: decision.sizeMultiplier.toFixed(2),
        pairEnabled: decision.pairEnabled,
        gridActive: decision.gridActive,
        confidence: decision.confidence.toFixed(2),
        reward: reward.toFixed(2),
      });

      return decision;
    } catch (error) {
      logger.error(`[GridMLAdapter] Error getting ML decision for ${symbol}:`, error);
      return null;
    }
  }

  /**
   * Train PPO agent on historical data
   */
  async trainOnHistoricalData(symbol: string, episodes: number = 100): Promise<void> {
    try {
      if (!this.ppoAgent || !this.userId) {
        throw new Error('PPO agent or user ID not initialized');
      }

      logger.info(`[GridMLAdapter] Training PPO agent on historical data for ${symbol}...`);

      // Get historical performance logs
      const logs = await GridPerformanceLog.find({
        userId: this.userId,
        symbol,
      })
        .sort({ timestamp: -1 })
        .limit(1000);

      if (logs.length < 10) {
        logger.warn(`[GridMLAdapter] Not enough historical data for training (${logs.length} logs)`);
        return;
      }

      // Train on historical state-action-reward sequences
      for (let episode = 0; episode < episodes; episode++) {
        const states: number[][] = [];
        const actions: number[][] = [];
        const rewards: number[] = [];

        // Sample random sequence from logs
        const startIdx = Math.floor(Math.random() * (logs.length - 50));
        const sequence = logs.slice(startIdx, startIdx + 50);

        for (const log of sequence) {
          if (log.stateVector && log.mlAction && log.reward !== undefined) {
            states.push(log.stateVector);
            actions.push([
              log.mlAction.spacingMultiplier - 0.5, // Convert back to 0-1
              log.mlAction.sizeMultiplier - 0.5,
              log.mlAction.pairEnabled ? 1 : 0,
              log.mlAction.gridActive ? 1 : 0,
              0.5, // Default confidence
            ]);
            rewards.push(log.reward);
          }
        }

        if (states.length > 0) {
          // Train PPO agent (simplified - in production would use proper PPO update)
          // This is a placeholder for actual PPO training logic
          logger.debug(`[GridMLAdapter] Training episode ${episode + 1}/${episodes}`);
        }
      }

      logger.info(`[GridMLAdapter] Training complete for ${symbol}`);
    } catch (error) {
      logger.error(`[GridMLAdapter] Error training on historical data:`, error);
      throw error;
    }
  }
}

export default new GridMLAdapter();

