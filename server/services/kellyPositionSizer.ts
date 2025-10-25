import Trade from '../models/Trade';
import BotState from '../models/BotState';
import Position from '../models/Position';
import { Types } from 'mongoose';

/**
 * Kelly Criterion Position Sizing Service
 * 
 * Implements optimal position sizing based on:
 * - Kelly Criterion formula: f* = (bp - q) / b
 * - Win rate and average win/loss from historical trades
 * - Risk-adjusted position sizing with fractional Kelly
 * - Dynamic adjustment based on current drawdown
 * 
 * References:
 * - Kelly, J. L. (1956). "A New Interpretation of Information Rate"
 * - Thorp, E. O. (2008). "The Kelly Criterion in Blackjack, Sports Betting, and the Stock Market"
 */

interface KellyParameters {
  winRate: number;           // Probability of winning (0-1)
  avgWinLossRatio: number;   // Average win / Average loss
  confidence: number;        // Confidence in edge (0-1)
  maxKelly: number;          // Maximum Kelly fraction (default 0.25 = Quarter Kelly)
}

interface PositionSizeResult {
  kellyFraction: number;     // Raw Kelly fraction
  adjustedFraction: number;  // Risk-adjusted fraction
  positionSize: number;      // Position size in USD
  reasoning: string;         // Explanation of sizing decision
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
}

export class KellyPositionSizer {
  private readonly DEFAULT_WIN_RATE = 0.5;
  private readonly DEFAULT_WIN_LOSS_RATIO = 1.5;
  private readonly MIN_TRADES_FOR_KELLY = 20;  // Minimum trades before using Kelly
  private readonly FRACTIONAL_KELLY = 0.25;     // Quarter Kelly (conservative)
  private readonly MAX_POSITION_SIZE = 0.10;    // Max 10% of equity per position
  private readonly MIN_POSITION_SIZE = 100;     // Minimum $100 position

  /**
   * Calculate optimal position size using Kelly Criterion
   */
  async calculatePositionSize(
    userId: Types.ObjectId,
    symbol: string,
    playbook: 'A' | 'B' | 'C' | 'D',
    stopLossDistance: number  // Distance to stop loss as fraction (e.g., 0.02 = 2%)
  ): Promise<PositionSizeResult> {
    try {
      // Get bot state for equity
      const botState = await BotState.findOne({ userId });
      if (!botState) {
        throw new Error('Bot state not found');
      }

      const equity = botState.equity;
      const currentDrawdown = this.calculateCurrentDrawdown(botState);

      // Get historical trade statistics
      const stats = await this.getTradeStatistics(userId, playbook);

      // Calculate Kelly fraction
      const kellyParams: KellyParameters = {
        winRate: stats.winRate,
        avgWinLossRatio: stats.avgWinLossRatio,
        confidence: stats.confidence,
        maxKelly: this.FRACTIONAL_KELLY
      };

      const kellyFraction = this.calculateKellyFraction(kellyParams);

      // Apply risk adjustments
      const adjustedFraction = this.applyRiskAdjustments(
        kellyFraction,
        currentDrawdown,
        stopLossDistance,
        stats.tradeCount
      );

      // Calculate position size
      let positionSize = equity * adjustedFraction;

      // Apply position size limits
      const maxSize = equity * this.MAX_POSITION_SIZE;
      positionSize = Math.min(positionSize, maxSize);
      positionSize = Math.max(positionSize, this.MIN_POSITION_SIZE);

      // Determine risk level
      const riskLevel = this.determineRiskLevel(adjustedFraction);

      // Generate reasoning
      const reasoning = this.generateReasoning(
        kellyFraction,
        adjustedFraction,
        stats,
        currentDrawdown,
        stopLossDistance
      );

      console.log(`[KellyPositionSizer] ${symbol} ${playbook}: $${positionSize.toFixed(2)} (${(adjustedFraction * 100).toFixed(2)}% of equity)`);
      console.log(`[KellyPositionSizer] Reasoning: ${reasoning}`);

      return {
        kellyFraction,
        adjustedFraction,
        positionSize,
        reasoning,
        riskLevel
      };
    } catch (error) {
      console.error('[KellyPositionSizer] Error calculating position size:', error);
      
      // Fallback to conservative sizing
      const botState = await BotState.findOne({ userId });
      const equity = botState?.equity || 10000;
      const fallbackSize = Math.max(equity * 0.02, this.MIN_POSITION_SIZE); // 2% of equity

      return {
        kellyFraction: 0.02,
        adjustedFraction: 0.02,
        positionSize: fallbackSize,
        reasoning: 'Using conservative fallback sizing due to calculation error',
        riskLevel: 'LOW'
      };
    }
  }

  /**
   * Calculate raw Kelly fraction
   * Formula: f* = (bp - q) / b
   * Where:
   *   b = odds received on the bet (avg win / avg loss)
   *   p = probability of winning
   *   q = probability of losing (1 - p)
   */
  private calculateKellyFraction(params: KellyParameters): number {
    const { winRate, avgWinLossRatio, confidence, maxKelly } = params;

    // Kelly formula
    const b = avgWinLossRatio;
    const p = winRate;
    const q = 1 - p;

    let kelly = (b * p - q) / b;

    // Apply confidence adjustment (reduce Kelly if low confidence)
    kelly = kelly * confidence;

    // Apply fractional Kelly (conservative)
    kelly = kelly * maxKelly;

    // Ensure non-negative
    kelly = Math.max(0, kelly);

    return kelly;
  }

  /**
   * Apply risk adjustments based on current conditions
   */
  private applyRiskAdjustments(
    kellyFraction: number,
    currentDrawdown: number,
    stopLossDistance: number,
    tradeCount: number
  ): number {
    let adjusted = kellyFraction;

    // 1. Drawdown adjustment (reduce size during drawdown)
    if (currentDrawdown > 0.05) {
      const drawdownFactor = 1 - (currentDrawdown * 2); // 10% DD = 80% size
      adjusted *= Math.max(0.5, drawdownFactor);
      console.log(`[KellyPositionSizer] Drawdown adjustment: ${(currentDrawdown * 100).toFixed(1)}% DD, reducing by ${((1 - drawdownFactor) * 100).toFixed(0)}%`);
    }

    // 2. Stop loss adjustment (wider stops = smaller size)
    if (stopLossDistance > 0.03) {
      const stopFactor = 0.03 / stopLossDistance; // Normalize to 3% stop
      adjusted *= stopFactor;
      console.log(`[KellyPositionSizer] Stop loss adjustment: ${(stopLossDistance * 100).toFixed(1)}% stop, reducing by ${((1 - stopFactor) * 100).toFixed(0)}%`);
    }

    // 3. Sample size adjustment (reduce if insufficient data)
    if (tradeCount < this.MIN_TRADES_FOR_KELLY) {
      const sampleFactor = tradeCount / this.MIN_TRADES_FOR_KELLY;
      adjusted *= sampleFactor;
      console.log(`[KellyPositionSizer] Sample size adjustment: ${tradeCount} trades, reducing by ${((1 - sampleFactor) * 100).toFixed(0)}%`);
    }

    // 4. Cap at maximum position size
    adjusted = Math.min(adjusted, this.MAX_POSITION_SIZE);

    return adjusted;
  }

  /**
   * Get trade statistics for Kelly calculation
   */
  private async getTradeStatistics(
    userId: Types.ObjectId,
    playbook: 'A' | 'B' | 'C' | 'D'
  ): Promise<{
    winRate: number;
    avgWinLossRatio: number;
    tradeCount: number;
    confidence: number;
  }> {
    // Get recent trades (last 100)
    const trades = await Trade.find({ userId, playbook })
      .sort({ date: -1 })
      .limit(100);

    if (trades.length < 5) {
      // Insufficient data, use defaults
      return {
        winRate: this.DEFAULT_WIN_RATE,
        avgWinLossRatio: this.DEFAULT_WIN_LOSS_RATIO,
        tradeCount: trades.length,
        confidence: 0.5  // Low confidence
      };
    }

    // Calculate win rate
    const wins = trades.filter(t => t.outcome === 'WIN').length;
    const losses = trades.filter(t => t.outcome === 'LOSS').length;
    const winRate = wins / (wins + losses);

    // Calculate average win and loss
    const winTrades = trades.filter(t => t.outcome === 'WIN');
    const lossTrades = trades.filter(t => t.outcome === 'LOSS');

    const avgWin = winTrades.length > 0
      ? winTrades.reduce((sum, t) => sum + t.pnl_r, 0) / winTrades.length
      : 1;

    const avgLoss = lossTrades.length > 0
      ? Math.abs(lossTrades.reduce((sum, t) => sum + t.pnl_r, 0) / lossTrades.length)
      : 1;

    const avgWinLossRatio = avgWin / avgLoss;

    // Calculate confidence based on sample size and consistency
    const confidence = this.calculateConfidence(trades.length, winRate, avgWinLossRatio);

    return {
      winRate,
      avgWinLossRatio,
      tradeCount: trades.length,
      confidence
    };
  }

  /**
   * Calculate confidence in edge based on sample size and consistency
   */
  private calculateConfidence(
    tradeCount: number,
    winRate: number,
    avgWinLossRatio: number
  ): number {
    // Sample size confidence (0-1)
    const sampleConfidence = Math.min(1, tradeCount / 100);

    // Edge confidence (higher win rate or win/loss ratio = higher confidence)
    const expectancy = (winRate * avgWinLossRatio) - (1 - winRate);
    const edgeConfidence = Math.min(1, Math.max(0, expectancy));

    // Combined confidence
    return (sampleConfidence + edgeConfidence) / 2;
  }

  /**
   * Calculate current drawdown
   */
  private calculateCurrentDrawdown(botState: any): number {
    const peakEquity = botState.peakEquity || botState.equity;
    const currentEquity = botState.equity;
    return (peakEquity - currentEquity) / peakEquity;
  }

  /**
   * Determine risk level based on position fraction
   */
  private determineRiskLevel(fraction: number): 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME' {
    if (fraction < 0.02) return 'LOW';
    if (fraction < 0.05) return 'MEDIUM';
    if (fraction < 0.08) return 'HIGH';
    return 'EXTREME';
  }

  /**
   * Generate human-readable reasoning for position size
   */
  private generateReasoning(
    kellyFraction: number,
    adjustedFraction: number,
    stats: any,
    currentDrawdown: number,
    stopLossDistance: number
  ): string {
    const reasons: string[] = [];

    // Base Kelly
    reasons.push(`Kelly: ${(kellyFraction * 100).toFixed(1)}% (Win rate: ${(stats.winRate * 100).toFixed(0)}%, W/L ratio: ${stats.avgWinLossRatio.toFixed(2)})`);

    // Adjustments
    if (currentDrawdown > 0.05) {
      reasons.push(`Drawdown: -${(currentDrawdown * 100).toFixed(1)}%`);
    }

    if (stopLossDistance > 0.03) {
      reasons.push(`Wide stop: ${(stopLossDistance * 100).toFixed(1)}%`);
    }

    if (stats.tradeCount < this.MIN_TRADES_FOR_KELLY) {
      reasons.push(`Limited data: ${stats.tradeCount} trades`);
    }

    // Final size
    reasons.push(`Final: ${(adjustedFraction * 100).toFixed(1)}%`);

    return reasons.join(' | ');
  }

  /**
   * Get current portfolio heat (total risk across all positions)
   */
  async getPortfolioHeat(userId: Types.ObjectId): Promise<number> {
    const positions = await Position.find({ userId, status: 'OPEN' });
    const botState = await BotState.findOne({ userId });
    
    if (!botState) return 0;

    let totalRisk = 0;
    for (const position of positions) {
      const riskPerPosition = Math.abs(position.entry_price - position.stop_price) * position.quantity;
      totalRisk += riskPerPosition;
    }

    return totalRisk / botState.equity;
  }

  /**
   * Check if new position would exceed portfolio heat limit
   */
  async checkPortfolioHeatLimit(
    userId: Types.ObjectId,
    newPositionRisk: number,
    maxHeat: number = 0.20  // Default 20% max portfolio heat
  ): Promise<{ allowed: boolean; currentHeat: number; projectedHeat: number }> {
    const currentHeat = await this.getPortfolioHeat(userId);
    const botState = await BotState.findOne({ userId });
    
    if (!botState) {
      return { allowed: false, currentHeat: 0, projectedHeat: 0 };
    }

    const projectedHeat = currentHeat + (newPositionRisk / botState.equity);
    const allowed = projectedHeat <= maxHeat;

    if (!allowed) {
      console.warn(`[KellyPositionSizer] Portfolio heat limit exceeded: ${(projectedHeat * 100).toFixed(1)}% > ${(maxHeat * 100).toFixed(0)}%`);
    }

    return { allowed, currentHeat, projectedHeat };
  }
}

export default new KellyPositionSizer();

