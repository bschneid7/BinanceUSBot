/**
 * Dynamic Exit Strategy Service
 * 
 * Calculates ATR-based stop-loss and take-profit levels for improved risk management.
 * Uses Average True Range (ATR) to adapt to market volatility.
 */

import { logger } from '../utils/logger';

interface CandleData {
  high: number;
  low: number;
  close: number;
}

interface ExitLevels {
  stopLoss: number;
  takeProfit: number;
  atr: number;
  riskRewardRatio: number;
}

export class DynamicExitStrategy {
  private atrPeriod: number;
  private atrMultiplierStop: number;
  private riskRewardRatio: number;

  constructor(
    atrPeriod: number = 14,
    atrMultiplierStop: number = 2.0,
    riskRewardRatio: number = 2.0
  ) {
    this.atrPeriod = atrPeriod;
    this.atrMultiplierStop = atrMultiplierStop;
    this.riskRewardRatio = riskRewardRatio;
  }

  /**
   * Calculate ATR (Average True Range)
   */
  calculateATR(candles: CandleData[]): number {
    if (candles.length < this.atrPeriod) {
      logger.warn('[DynamicExitStrategy] Not enough candles for ATR calculation');
      return 0;
    }

    const trueRanges: number[] = [];

    for (let i = 1; i < candles.length; i++) {
      const high = candles[i].high;
      const low = candles[i].low;
      const prevClose = candles[i - 1].close;

      // True Range = max(high - low, abs(high - prevClose), abs(low - prevClose))
      const tr = Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
      );

      trueRanges.push(tr);
    }

    // Calculate ATR as simple moving average of true ranges
    const recentTRs = trueRanges.slice(-this.atrPeriod);
    const atr = recentTRs.reduce((sum, tr) => sum + tr, 0) / recentTRs.length;

    return atr;
  }

  /**
   * Calculate dynamic stop-loss and take-profit levels
   */
  calculateExitLevels(
    entryPrice: number,
    side: 'BUY' | 'SELL',
    candles: CandleData[]
  ): ExitLevels | null {
    const atr = this.calculateATR(candles);

    if (atr === 0) {
      logger.error('[DynamicExitStrategy] ATR is 0, cannot calculate exit levels');
      return null;
    }

    let stopLoss: number;
    let takeProfit: number;

    if (side === 'BUY') {
      // For long positions
      stopLoss = entryPrice - (atr * this.atrMultiplierStop);
      takeProfit = entryPrice + (atr * this.atrMultiplierStop * this.riskRewardRatio);
    } else {
      // For short positions
      stopLoss = entryPrice + (atr * this.atrMultiplierStop);
      takeProfit = entryPrice - (atr * this.atrMultiplierStop * this.riskRewardRatio);
    }

    logger.info({
      event: 'exit_levels_calculated',
      side,
      entryPrice,
      stopLoss,
      takeProfit,
      atr,
      atrMultiplier: this.atrMultiplierStop,
      riskRewardRatio: this.riskRewardRatio,
      stopDistance: Math.abs(entryPrice - stopLoss),
      profitDistance: Math.abs(takeProfit - entryPrice)
    });

    return {
      stopLoss,
      takeProfit,
      atr,
      riskRewardRatio: this.riskRewardRatio
    };
  }

  /**
   * Calculate trailing stop-loss based on ATR
   */
  calculateTrailingStop(
    currentPrice: number,
    entryPrice: number,
    side: 'BUY' | 'SELL',
    atr: number,
    currentStopLoss: number
  ): number {
    let newStopLoss: number;

    if (side === 'BUY') {
      // For long positions, move stop up as price increases
      newStopLoss = currentPrice - (atr * this.atrMultiplierStop);
      
      // Only move stop up, never down
      return Math.max(newStopLoss, currentStopLoss);
    } else {
      // For short positions, move stop down as price decreases
      newStopLoss = currentPrice + (atr * this.atrMultiplierStop);
      
      // Only move stop down, never up
      return Math.min(newStopLoss, currentStopLoss);
    }
  }

  /**
   * Check if stop-loss or take-profit has been hit
   */
  checkExitConditions(
    currentPrice: number,
    stopLoss: number,
    takeProfit: number,
    side: 'BUY' | 'SELL'
  ): { shouldExit: boolean; reason: string | null; pnlPercent: number } {
    if (side === 'BUY') {
      if (currentPrice <= stopLoss) {
        const pnlPercent = ((currentPrice - stopLoss) / stopLoss) * 100;
        return {
          shouldExit: true,
          reason: 'STOP_LOSS_HIT',
          pnlPercent
        };
      }
      
      if (currentPrice >= takeProfit) {
        const pnlPercent = ((currentPrice - takeProfit) / takeProfit) * 100;
        return {
          shouldExit: true,
          reason: 'TAKE_PROFIT_HIT',
          pnlPercent
        };
      }
    } else {
      // SELL side
      if (currentPrice >= stopLoss) {
        const pnlPercent = ((stopLoss - currentPrice) / currentPrice) * 100;
        return {
          shouldExit: true,
          reason: 'STOP_LOSS_HIT',
          pnlPercent
        };
      }
      
      if (currentPrice <= takeProfit) {
        const pnlPercent = ((takeProfit - currentPrice) / currentPrice) * 100;
        return {
          shouldExit: true,
          reason: 'TAKE_PROFIT_HIT',
          pnlPercent
        };
      }
    }

    return {
      shouldExit: false,
      reason: null,
      pnlPercent: 0
    };
  }

  /**
   * Adjust exit levels based on market conditions
   */
  adjustForVolatility(
    exitLevels: ExitLevels,
    currentVolatility: number,
    averageVolatility: number
  ): ExitLevels {
    // If volatility is higher than average, widen stops
    const volatilityRatio = currentVolatility / averageVolatility;
    
    if (volatilityRatio > 1.5) {
      logger.info({
        event: 'exit_levels_adjusted',
        reason: 'high_volatility',
        volatilityRatio,
        adjustment: 'widening_stops'
      });
      
      // Widen stops by 50% in high volatility
      const adjustment = 1.5;
      return {
        ...exitLevels,
        stopLoss: exitLevels.stopLoss * adjustment,
        takeProfit: exitLevels.takeProfit * adjustment
      };
    }
    
    return exitLevels;
  }
}

// Export singleton instance
export const dynamicExitStrategy = new DynamicExitStrategy();
