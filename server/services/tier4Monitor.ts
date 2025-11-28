/**
 * TIER_4 Performance Monitor
 * 
 * Monitors TIER_4_ULTRA_AGGRESSIVE performance and automatically
 * switches to TIER_3 if average win rate falls below threshold.
 * 
 * Features:
 * - Tracks last N trades
 * - Calculates average win percentage
 * - Automatic tier downgrade if performance degrades
 * - Alert notifications
 */

import { EventEmitter } from 'events';
import Trade from '../models/Trade';
import logger from '../utils/logger';
import { ACTIVE_TIER } from '../config/signalTiers';

interface TradePerformance {
  symbol: string;
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  pnlPct: number;
  isWin: boolean;
  timestamp: Date;
}

export class Tier4Monitor extends EventEmitter {
  private readonly SAMPLE_SIZE = 10; // Monitor last 10 trades
  private readonly MIN_AVG_WIN_PCT = 0.35; // 0.35% minimum average win
  private readonly CHECK_INTERVAL = 5 * 60 * 1000; // Check every 5 minutes
  
  private isMonitoring = false;
  private checkInterval?: NodeJS.Timeout;

  constructor() {
    super();
  }

  /**
   * Start monitoring TIER_4 performance
   */
  public start(): void {
    if (this.isMonitoring) {
      logger.warn('[Tier4Monitor] Already monitoring');
      return;
    }

    // Only monitor if TIER_4 is active
    if (ACTIVE_TIER !== 'TIER_4_ULTRA_AGGRESSIVE') {
      logger.info('[Tier4Monitor] Not starting - TIER_4 not active');
      return;
    }

    this.isMonitoring = true;
    logger.info('[Tier4Monitor] Starting TIER_4 performance monitoring', {
      sampleSize: this.SAMPLE_SIZE,
      minAvgWinPct: this.MIN_AVG_WIN_PCT,
      checkInterval: this.CHECK_INTERVAL / 1000 + 's',
    });

    // Run initial check
    this.checkPerformance();

    // Schedule periodic checks
    this.checkInterval = setInterval(() => {
      this.checkPerformance();
    }, this.CHECK_INTERVAL);
  }

  /**
   * Stop monitoring
   */
  public stop(): void {
    if (!this.isMonitoring) {
      return;
    }

    this.isMonitoring = false;
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = undefined;
    }

    logger.info('[Tier4Monitor] Stopped monitoring');
  }

  /**
   * Check TIER_4 performance
   */
  private async checkPerformance(): Promise<void> {
    try {
      const performance = await this.getRecentPerformance();

      if (performance.length < this.SAMPLE_SIZE) {
        logger.info('[Tier4Monitor] Insufficient data', {
          trades: performance.length,
          required: this.SAMPLE_SIZE,
        });
        return;
      }

      const stats = this.calculateStats(performance);

      logger.info('[Tier4Monitor] Performance check', {
        trades: stats.totalTrades,
        wins: stats.wins,
        losses: stats.losses,
        winRate: `${stats.winRate.toFixed(1)}%`,
        avgWinPct: `${stats.avgWinPct.toFixed(2)}%`,
        avgLossPct: `${stats.avgLossPct.toFixed(2)}%`,
        totalPnlPct: `${stats.totalPnlPct.toFixed(2)}%`,
      });

      // Check if performance is below threshold
      if (stats.avgWinPct < this.MIN_AVG_WIN_PCT) {
        logger.warn('[Tier4Monitor] ⚠️  TIER_4 performance below threshold!', {
          avgWinPct: `${stats.avgWinPct.toFixed(2)}%`,
          threshold: `${this.MIN_AVG_WIN_PCT}%`,
          recommendation: 'Switch to TIER_3_AGGRESSIVE',
        });

        this.emit('performanceAlert', {
          tier: 'TIER_4_ULTRA_AGGRESSIVE',
          avgWinPct: stats.avgWinPct,
          threshold: this.MIN_AVG_WIN_PCT,
          stats,
          recommendation: 'TIER_3_AGGRESSIVE',
        });

        // Auto-switch to TIER_3 (requires manual confirmation)
        this.emit('tierDowngradeRecommended', {
          from: 'TIER_4_ULTRA_AGGRESSIVE',
          to: 'TIER_3_AGGRESSIVE',
          reason: `Average win ${stats.avgWinPct.toFixed(2)}% < ${this.MIN_AVG_WIN_PCT}%`,
          stats,
        });
      } else {
        logger.info('[Tier4Monitor] ✓ TIER_4 performance acceptable', {
          avgWinPct: `${stats.avgWinPct.toFixed(2)}%`,
          threshold: `${this.MIN_AVG_WIN_PCT}%`,
        });
      }
    } catch (error) {
      logger.error('[Tier4Monitor] Error checking performance:', error);
    }
  }

  /**
   * Get recent trade performance
   */
  private async getRecentPerformance(): Promise<TradePerformance[]> {
    const trades = await Trade.find({
      status: 'closed',
      exitPrice: { $exists: true },
    })
      .sort({ exitTime: -1 })
      .limit(this.SAMPLE_SIZE)
      .lean();

    return trades.map(trade => {
      const entryPrice = trade.entryPrice || 0;
      const exitPrice = trade.exitPrice || 0;
      const pnl = trade.pnl || 0;
      const pnlPct = entryPrice > 0 ? ((exitPrice - entryPrice) / entryPrice) * 100 : 0;

      return {
        symbol: trade.symbol,
        entryPrice,
        exitPrice,
        pnl,
        pnlPct,
        isWin: pnl > 0,
        timestamp: trade.exitTime || trade.createdAt,
      };
    });
  }

  /**
   * Calculate performance statistics
   */
  private calculateStats(performance: TradePerformance[]) {
    const wins = performance.filter(p => p.isWin);
    const losses = performance.filter(p => !p.isWin);

    const totalTrades = performance.length;
    const winRate = (wins.length / totalTrades) * 100;

    const avgWinPct = wins.length > 0
      ? wins.reduce((sum, p) => sum + p.pnlPct, 0) / wins.length
      : 0;

    const avgLossPct = losses.length > 0
      ? losses.reduce((sum, p) => sum + Math.abs(p.pnlPct), 0) / losses.length
      : 0;

    const totalPnlPct = performance.reduce((sum, p) => sum + p.pnlPct, 0);

    return {
      totalTrades,
      wins: wins.length,
      losses: losses.length,
      winRate,
      avgWinPct,
      avgLossPct,
      totalPnlPct,
      profitFactor: avgLossPct > 0 ? avgWinPct / avgLossPct : 0,
    };
  }

  /**
   * Get current monitoring status
   */
  public getStatus(): {
    isMonitoring: boolean;
    activeTier: string;
    sampleSize: number;
    minAvgWinPct: number;
  } {
    return {
      isMonitoring: this.isMonitoring,
      activeTier: ACTIVE_TIER,
      sampleSize: this.SAMPLE_SIZE,
      minAvgWinPct: this.MIN_AVG_WIN_PCT,
    };
  }

  /**
   * Manual performance check
   */
  public async manualCheck(): Promise<void> {
    logger.info('[Tier4Monitor] Manual performance check requested');
    await this.checkPerformance();
  }
}

// Singleton instance
export const tier4Monitor = new Tier4Monitor();
