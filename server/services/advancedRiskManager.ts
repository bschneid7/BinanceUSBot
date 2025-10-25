import Position from '../models/Position';
import BotState from '../models/BotState';
import BotConfig from '../models/BotConfig';
import Trade from '../models/Trade';
import { Types } from 'mongoose';
import kellyPositionSizer from './kellyPositionSizer';

/**
 * Advanced Risk Manager
 * 
 * Implements sophisticated risk controls:
 * 1. Dynamic drawdown limits (reduce risk as drawdown increases)
 * 2. Portfolio heat management (total risk across all positions)
 * 3. Correlation-based position limits (avoid overexposure to correlated assets)
 * 4. Dynamic stop-loss adjustment (trail stops based on volatility)
 * 5. Time-based risk reduction (reduce size during volatile periods)
 * 6. Consecutive loss protection (reduce size after losing streaks)
 */

interface RiskCheckResult {
  allowed: boolean;
  reason?: string;
  adjustedSize?: number;
  warnings: string[];
}

interface DrawdownLimits {
  maxDrawdown: number;        // Maximum allowed drawdown (e.g., 0.20 = 20%)
  softDrawdown: number;        // Soft limit to start reducing risk (e.g., 0.10 = 10%)
  hardDrawdown: number;        // Hard limit to stop trading (e.g., 0.15 = 15%)
}

interface PortfolioHeatLimits {
  maxHeat: number;             // Maximum total portfolio risk (e.g., 0.20 = 20%)
  maxPerPosition: number;      // Maximum risk per position (e.g., 0.05 = 5%)
  maxCorrelatedHeat: number;   // Maximum risk in correlated positions (e.g., 0.15 = 15%)
}

export class AdvancedRiskManager {
  private readonly DEFAULT_DRAWDOWN_LIMITS: DrawdownLimits = {
    maxDrawdown: 0.25,   // 25% max drawdown
    softDrawdown: 0.10,  // 10% soft limit
    hardDrawdown: 0.20   // 20% hard limit (stop trading)
  };

  private readonly DEFAULT_HEAT_LIMITS: PortfolioHeatLimits = {
    maxHeat: 0.20,           // 20% max portfolio heat
    maxPerPosition: 0.05,    // 5% max per position
    maxCorrelatedHeat: 0.15  // 15% max correlated heat
  };

  private readonly MAX_CONSECUTIVE_LOSSES = 3;
  private readonly VOLATILITY_LOOKBACK = 20;  // Periods for volatility calculation

  /**
   * Pre-trade risk check - validates if new position is allowed
   */
  async preTradeRiskCheck(
    userId: Types.ObjectId,
    symbol: string,
    playbook: 'A' | 'B' | 'C' | 'D',
    proposedSize: number,
    stopLossDistance: number
  ): Promise<RiskCheckResult> {
    const warnings: string[] = [];

    try {
      // 1. Check drawdown limits
      const drawdownCheck = await this.checkDrawdownLimits(userId);
      if (!drawdownCheck.allowed) {
        return {
          allowed: false,
          reason: drawdownCheck.reason,
          warnings
        };
      }
      if (drawdownCheck.warnings) {
        warnings.push(...drawdownCheck.warnings);
      }

      // 2. Check portfolio heat
      const heatCheck = await this.checkPortfolioHeat(userId, proposedSize, stopLossDistance);
      if (!heatCheck.allowed) {
        return {
          allowed: false,
          reason: heatCheck.reason,
          warnings
        };
      }
      if (heatCheck.warnings) {
        warnings.push(...heatCheck.warnings);
      }

      // 3. Check correlation limits
      const correlationCheck = await this.checkCorrelationLimits(userId, symbol, proposedSize);
      if (!correlationCheck.allowed) {
        return {
          allowed: false,
          reason: correlationCheck.reason,
          warnings
        };
      }
      if (correlationCheck.warnings) {
        warnings.push(...correlationCheck.warnings);
      }

      // 4. Check consecutive losses
      const lossStreakCheck = await this.checkConsecutiveLosses(userId, playbook);
      if (lossStreakCheck.adjustmentFactor < 1) {
        warnings.push(`Consecutive losses detected, reducing size by ${((1 - lossStreakCheck.adjustmentFactor) * 100).toFixed(0)}%`);
      }

      // 5. Apply all adjustments
      let adjustedSize = proposedSize * lossStreakCheck.adjustmentFactor;
      
      if (drawdownCheck.adjustmentFactor) {
        adjustedSize *= drawdownCheck.adjustmentFactor;
      }

      console.log(`[AdvancedRiskManager] Pre-trade check passed for ${symbol} ${playbook}`);
      if (warnings.length > 0) {
        console.log(`[AdvancedRiskManager] Warnings: ${warnings.join(', ')}`);
      }

      return {
        allowed: true,
        adjustedSize,
        warnings
      };
    } catch (error) {
      console.error('[AdvancedRiskManager] Error in pre-trade risk check:', error);
      return {
        allowed: false,
        reason: 'Risk check failed due to error',
        warnings
      };
    }
  }

  /**
   * Check drawdown limits and apply dynamic risk reduction
   */
  private async checkDrawdownLimits(userId: Types.ObjectId): Promise<{
    allowed: boolean;
    reason?: string;
    adjustmentFactor?: number;
    warnings?: string[];
  }> {
    const botState = await BotState.findOne({ userId });
    if (!botState) {
      return { allowed: false, reason: 'Bot state not found' };
    }

    const peakEquity = botState.peakEquity || botState.equity;
    const currentEquity = botState.equity;
    const drawdown = (peakEquity - currentEquity) / peakEquity;

    const limits = this.DEFAULT_DRAWDOWN_LIMITS;
    const warnings: string[] = [];

    // Hard limit - stop trading
    if (drawdown >= limits.hardDrawdown) {
      console.error(`[AdvancedRiskManager] Hard drawdown limit hit: ${(drawdown * 100).toFixed(1)}% >= ${(limits.hardDrawdown * 100).toFixed(0)}%`);
      return {
        allowed: false,
        reason: `Hard drawdown limit exceeded: ${(drawdown * 100).toFixed(1)}%`
      };
    }

    // Soft limit - reduce position size
    let adjustmentFactor = 1.0;
    if (drawdown >= limits.softDrawdown) {
      // Linear reduction from soft to hard limit
      // At soft limit (10%): 100% size
      // At hard limit (20%): 50% size
      const drawdownRange = limits.hardDrawdown - limits.softDrawdown;
      const drawdownProgress = (drawdown - limits.softDrawdown) / drawdownRange;
      adjustmentFactor = 1.0 - (0.5 * drawdownProgress);  // Reduce up to 50%

      warnings.push(`Drawdown ${(drawdown * 100).toFixed(1)}%, reducing size to ${(adjustmentFactor * 100).toFixed(0)}%`);
      console.warn(`[AdvancedRiskManager] Soft drawdown limit: reducing size by ${((1 - adjustmentFactor) * 100).toFixed(0)}%`);
    }

    return {
      allowed: true,
      adjustmentFactor,
      warnings: warnings.length > 0 ? warnings : undefined
    };
  }

  /**
   * Check portfolio heat limits
   */
  private async checkPortfolioHeat(
    userId: Types.ObjectId,
    proposedSize: number,
    stopLossDistance: number
  ): Promise<{
    allowed: boolean;
    reason?: string;
    warnings?: string[];
  }> {
    const limits = this.DEFAULT_HEAT_LIMITS;
    const warnings: string[] = [];

    // Calculate proposed risk
    const proposedRisk = proposedSize * stopLossDistance;

    // Check per-position limit
    const botState = await BotState.findOne({ userId });
    if (!botState) {
      return { allowed: false, reason: 'Bot state not found' };
    }

    const riskFraction = proposedRisk / botState.equity;
    if (riskFraction > limits.maxPerPosition) {
      return {
        allowed: false,
        reason: `Position risk ${(riskFraction * 100).toFixed(1)}% exceeds limit ${(limits.maxPerPosition * 100).toFixed(0)}%`
      };
    }

    // Check total portfolio heat
    const heatCheck = await kellyPositionSizer.checkPortfolioHeatLimit(
      userId,
      proposedRisk,
      limits.maxHeat
    );

    if (!heatCheck.allowed) {
      return {
        allowed: false,
        reason: `Portfolio heat ${(heatCheck.projectedHeat * 100).toFixed(1)}% exceeds limit ${(limits.maxHeat * 100).toFixed(0)}%`
      };
    }

    // Warning if approaching limit
    if (heatCheck.projectedHeat > limits.maxHeat * 0.8) {
      warnings.push(`Portfolio heat approaching limit: ${(heatCheck.projectedHeat * 100).toFixed(1)}%`);
    }

    return {
      allowed: true,
      warnings: warnings.length > 0 ? warnings : undefined
    };
  }

  /**
   * Check correlation limits to avoid overexposure
   */
  private async checkCorrelationLimits(
    userId: Types.ObjectId,
    symbol: string,
    proposedSize: number
  ): Promise<{
    allowed: boolean;
    reason?: string;
    warnings?: string[];
  }> {
    const warnings: string[] = [];

    // Get all open positions
    const positions = await Position.find({ userId, status: 'OPEN' });

    // Simple correlation groups (can be enhanced with actual correlation data from CDD)
    const correlationGroups: Record<string, string[]> = {
      'BTC_GROUP': ['BTCUSD', 'BTCUSDT'],
      'ETH_GROUP': ['ETHUSD', 'ETHUSDT'],
      'ALT_MAJOR': ['SOLUSD', 'ADAUSD', 'DOTUSD', 'MATICUSD', 'AVAXUSD'],
      'ALT_DEFI': ['LINKUSD', 'UNIUSD', 'AAVEUSD'],
      'STABLECOIN': ['USDTUSD', 'USDCUSD']
    };

    // Find which group the new symbol belongs to
    let symbolGroup: string | null = null;
    for (const [group, symbols] of Object.entries(correlationGroups)) {
      if (symbols.includes(symbol)) {
        symbolGroup = group;
        break;
      }
    }

    if (!symbolGroup) {
      // Symbol not in any group, allow
      return { allowed: true };
    }

    // Calculate total exposure in this group
    const botState = await BotState.findOne({ userId });
    if (!botState) {
      return { allowed: false, reason: 'Bot state not found' };
    }

    let groupExposure = 0;
    for (const position of positions) {
      if (correlationGroups[symbolGroup].includes(position.symbol)) {
        const positionValue = position.entry_price * position.quantity;
        groupExposure += positionValue;
      }
    }

    const projectedExposure = (groupExposure + proposedSize) / botState.equity;
    const maxCorrelatedExposure = this.DEFAULT_HEAT_LIMITS.maxCorrelatedHeat;

    if (projectedExposure > maxCorrelatedExposure) {
      return {
        allowed: false,
        reason: `Correlated exposure ${(projectedExposure * 100).toFixed(1)}% exceeds limit ${(maxCorrelatedExposure * 100).toFixed(0)}%`
      };
    }

    // Warning if approaching limit
    if (projectedExposure > maxCorrelatedExposure * 0.8) {
      warnings.push(`Correlated exposure (${symbolGroup}) approaching limit: ${(projectedExposure * 100).toFixed(1)}%`);
    }

    return {
      allowed: true,
      warnings: warnings.length > 0 ? warnings : undefined
    };
  }

  /**
   * Check for consecutive losses and reduce size
   */
  private async checkConsecutiveLosses(
    userId: Types.ObjectId,
    playbook: 'A' | 'B' | 'C' | 'D'
  ): Promise<{
    consecutiveLosses: number;
    adjustmentFactor: number;
  }> {
    // Get recent trades
    const recentTrades = await Trade.find({ userId, playbook })
      .sort({ date: -1 })
      .limit(10);

    // Count consecutive losses
    let consecutiveLosses = 0;
    for (const trade of recentTrades) {
      if (trade.outcome === 'LOSS') {
        consecutiveLosses++;
      } else {
        break;  // Stop at first non-loss
      }
    }

    // Apply reduction for consecutive losses
    let adjustmentFactor = 1.0;
    if (consecutiveLosses >= this.MAX_CONSECUTIVE_LOSSES) {
      // Reduce by 20% for each loss beyond threshold
      const excessLosses = consecutiveLosses - this.MAX_CONSECUTIVE_LOSSES + 1;
      adjustmentFactor = Math.max(0.4, 1.0 - (0.2 * excessLosses));  // Min 40% size

      console.warn(`[AdvancedRiskManager] ${consecutiveLosses} consecutive losses, reducing size to ${(adjustmentFactor * 100).toFixed(0)}%`);
    }

    return {
      consecutiveLosses,
      adjustmentFactor
    };
  }

  /**
   * Calculate dynamic stop loss based on volatility
   */
  async calculateDynamicStopLoss(
    symbol: string,
    entryPrice: number,
    side: 'LONG' | 'SHORT',
    baseATRMultiplier: number = 2.0
  ): Promise<number> {
    // This would integrate with market data to get ATR
    // For now, use a simplified approach
    
    // Typical crypto volatility: 2-5% daily
    const estimatedVolatility = 0.03;  // 3% default
    
    // Calculate stop distance
    const stopDistance = estimatedVolatility * baseATRMultiplier;
    
    // Calculate stop price
    const stopPrice = side === 'LONG'
      ? entryPrice * (1 - stopDistance)
      : entryPrice * (1 + stopDistance);

    console.log(`[AdvancedRiskManager] Dynamic stop for ${symbol}: ${stopPrice.toFixed(2)} (${(stopDistance * 100).toFixed(1)}% from entry)`);

    return stopPrice;
  }

  /**
   * Get risk management statistics
   */
  async getRiskStats(userId: Types.ObjectId): Promise<{
    currentDrawdown: number;
    portfolioHeat: number;
    openPositions: number;
    consecutiveLosses: number;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  }> {
    const botState = await BotState.findOne({ userId });
    const positions = await Position.find({ userId, status: 'OPEN' });
    
    if (!botState) {
      throw new Error('Bot state not found');
    }

    // Calculate drawdown
    const peakEquity = botState.peakEquity || botState.equity;
    const currentDrawdown = (peakEquity - botState.equity) / peakEquity;

    // Calculate portfolio heat
    const portfolioHeat = await kellyPositionSizer.getPortfolioHeat(userId);

    // Count consecutive losses
    const recentTrades = await Trade.find({ userId })
      .sort({ date: -1 })
      .limit(10);
    
    let consecutiveLosses = 0;
    for (const trade of recentTrades) {
      if (trade.outcome === 'LOSS') {
        consecutiveLosses++;
      } else {
        break;
      }
    }

    // Determine risk level
    let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW';
    if (currentDrawdown > 0.15 || portfolioHeat > 0.15 || consecutiveLosses >= 5) {
      riskLevel = 'CRITICAL';
    } else if (currentDrawdown > 0.10 || portfolioHeat > 0.12 || consecutiveLosses >= 3) {
      riskLevel = 'HIGH';
    } else if (currentDrawdown > 0.05 || portfolioHeat > 0.08) {
      riskLevel = 'MEDIUM';
    }

    return {
      currentDrawdown,
      portfolioHeat,
      openPositions: positions.length,
      consecutiveLosses,
      riskLevel
    };
  }
}

export default new AdvancedRiskManager();

