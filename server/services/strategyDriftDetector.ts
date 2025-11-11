/**
 * Strategy Drift Detection Service
 * 
 * Monitors live strategy performance vs backtest expectations.
 * Alerts when strategies deviate significantly from historical performance.
 * 
 * Key Metrics Monitored:
 * - Win rate
 * - Average R (profit/risk ratio)
 * - Profit factor
 * - Max drawdown
 * - Trade frequency
 * 
 * Drift Detection:
 * - Win rate drift > 15% → Alert
 * - Avg R drift > 30% → Alert
 * - Profit factor drift > 40% → Alert
 * - 3+ consecutive losses beyond backtest → Alert
 */

import Position from '../models/Position';
import alertService from './alertService';
import logger from '../utils/logger';

interface StrategyMetrics {
  strategy: string;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  avgR: number;
  profitFactor: number;
  maxDrawdown: number;
  avgHoldTime: number;
  totalPnl: number;
  consecutiveLosses: number;
}

interface DriftAnalysis {
  strategy: string;
  metric: string;
  backtestValue: number;
  liveValue: number;
  drift: number;
  driftPercent: number;
  threshold: number;
  isAlert: boolean;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Backtest baseline metrics for each strategy
 * These should be updated with actual backtest results
 */
const BACKTEST_BASELINES: Record<string, Partial<StrategyMetrics>> = {
  A: {
    winRate: 0.55, // 55% win rate
    avgR: 1.8, // Average 1.8R per trade
    profitFactor: 2.1, // $2.10 profit per $1 loss
    maxDrawdown: 0.08, // 8% max drawdown
    consecutiveLosses: 4, // Max 4 consecutive losses
  },
  B: {
    winRate: 0.48,
    avgR: 2.2,
    profitFactor: 1.9,
    maxDrawdown: 0.12,
    consecutiveLosses: 5,
  },
  C: {
    winRate: 0.52,
    avgR: 1.6,
    profitFactor: 1.8,
    maxDrawdown: 0.10,
    consecutiveLosses: 4,
  },
  D: {
    winRate: 0.50,
    avgR: 2.0,
    profitFactor: 2.0,
    maxDrawdown: 0.09,
    consecutiveLosses: 4,
  },
  GRID: {
    winRate: 0.65, // Grid has higher win rate, lower R
    avgR: 0.8,
    profitFactor: 2.5,
    maxDrawdown: 0.05,
    consecutiveLosses: 3,
  },
};

/**
 * Drift thresholds for alerting
 */
const DRIFT_THRESHOLDS = {
  winRate: 0.15, // 15% drift in win rate
  avgR: 0.30, // 30% drift in avg R
  profitFactor: 0.40, // 40% drift in profit factor
  maxDrawdown: 0.50, // 50% increase in drawdown
  consecutiveLosses: 2, // 2 more consecutive losses than backtest
};

class StrategyDriftDetector {
  /**
   * Calculate live metrics for a strategy
   */
  async calculateLiveMetrics(
    strategy: string,
    minTrades: number = 30
  ): Promise<StrategyMetrics | null> {
    try {
      // Get recent closed positions for this strategy
      const positions = await Position.find({
        playbook: strategy,
        status: 'CLOSED',
      })
        .sort({ closed_at: -1 })
        .limit(minTrades * 2) // Get more to ensure we have enough
        .lean();

      if (positions.length < minTrades) {
        logger.warn(
          `[DriftDetector] Not enough trades for ${strategy}: ${positions.length} < ${minTrades}`
        );
        return null;
      }

      // Take only the most recent minTrades
      const recentPositions = positions.slice(0, minTrades);

      // Calculate metrics
      const winningTrades = recentPositions.filter((p) => (p.realized_pnl || 0) > 0).length;
      const losingTrades = recentPositions.filter((p) => (p.realized_pnl || 0) <= 0).length;
      const winRate = winningTrades / recentPositions.length;

      // Calculate average R
      const totalR = recentPositions.reduce((sum, p) => sum + (p.realized_r || 0), 0);
      const avgR = totalR / recentPositions.length;

      // Calculate profit factor
      const totalProfit = recentPositions
        .filter((p) => (p.realized_pnl || 0) > 0)
        .reduce((sum, p) => sum + (p.realized_pnl || 0), 0);
      const totalLoss = Math.abs(
        recentPositions
          .filter((p) => (p.realized_pnl || 0) < 0)
          .reduce((sum, p) => sum + (p.realized_pnl || 0), 0)
      );
      const profitFactor = totalLoss > 0 ? totalProfit / totalLoss : 0;

      // Calculate max drawdown
      let peak = 0;
      let maxDrawdown = 0;
      let runningPnl = 0;
      for (const position of recentPositions.reverse()) {
        runningPnl += position.realized_pnl || 0;
        if (runningPnl > peak) {
          peak = runningPnl;
        }
        const drawdown = peak > 0 ? (peak - runningPnl) / peak : 0;
        if (drawdown > maxDrawdown) {
          maxDrawdown = drawdown;
        }
      }

      // Calculate consecutive losses
      let consecutiveLosses = 0;
      let maxConsecutiveLosses = 0;
      for (const position of positions) {
        // Use all positions for this calculation
        if ((position.realized_pnl || 0) <= 0) {
          consecutiveLosses++;
          if (consecutiveLosses > maxConsecutiveLosses) {
            maxConsecutiveLosses = consecutiveLosses;
          }
        } else {
          consecutiveLosses = 0;
        }
      }

      // Calculate average hold time
      const totalHoldTime = recentPositions.reduce((sum, p) => {
        if (p.closed_at && p.opened_at) {
          return sum + (p.closed_at.getTime() - p.opened_at.getTime());
        }
        return sum;
      }, 0);
      const avgHoldTime = totalHoldTime / recentPositions.length / (1000 * 60 * 60); // Convert to hours

      const totalPnl = recentPositions.reduce((sum, p) => sum + (p.realized_pnl || 0), 0);

      return {
        strategy,
        totalTrades: recentPositions.length,
        winningTrades,
        losingTrades,
        winRate,
        avgR,
        profitFactor,
        maxDrawdown,
        avgHoldTime,
        totalPnl,
        consecutiveLosses: maxConsecutiveLosses,
      };
    } catch (error) {
      logger.error(`[DriftDetector] Error calculating metrics for ${strategy}:`, error);
      return null;
    }
  }

  /**
   * Detect drift between backtest and live metrics
   */
  detectDrift(strategy: string, liveMetrics: StrategyMetrics): DriftAnalysis[] {
    const baseline = BACKTEST_BASELINES[strategy];
    if (!baseline) {
      logger.warn(`[DriftDetector] No baseline found for strategy ${strategy}`);
      return [];
    }

    const drifts: DriftAnalysis[] = [];

    // Check win rate drift
    if (baseline.winRate !== undefined) {
      const drift = Math.abs(liveMetrics.winRate - baseline.winRate);
      const driftPercent = (drift / baseline.winRate) * 100;
      const isAlert = drift > DRIFT_THRESHOLDS.winRate;

      drifts.push({
        strategy,
        metric: 'Win Rate',
        backtestValue: baseline.winRate,
        liveValue: liveMetrics.winRate,
        drift,
        driftPercent,
        threshold: DRIFT_THRESHOLDS.winRate,
        isAlert,
        severity: this.calculateSeverity(drift, DRIFT_THRESHOLDS.winRate),
      });
    }

    // Check avg R drift
    if (baseline.avgR !== undefined) {
      const drift = Math.abs(liveMetrics.avgR - baseline.avgR);
      const driftPercent = (drift / baseline.avgR) * 100;
      const isAlert = driftPercent / 100 > DRIFT_THRESHOLDS.avgR;

      drifts.push({
        strategy,
        metric: 'Average R',
        backtestValue: baseline.avgR,
        liveValue: liveMetrics.avgR,
        drift,
        driftPercent,
        threshold: DRIFT_THRESHOLDS.avgR,
        isAlert,
        severity: this.calculateSeverity(driftPercent / 100, DRIFT_THRESHOLDS.avgR),
      });
    }

    // Check profit factor drift
    if (baseline.profitFactor !== undefined) {
      const drift = Math.abs(liveMetrics.profitFactor - baseline.profitFactor);
      const driftPercent = (drift / baseline.profitFactor) * 100;
      const isAlert = driftPercent / 100 > DRIFT_THRESHOLDS.profitFactor;

      drifts.push({
        strategy,
        metric: 'Profit Factor',
        backtestValue: baseline.profitFactor,
        liveValue: liveMetrics.profitFactor,
        drift,
        driftPercent,
        threshold: DRIFT_THRESHOLDS.profitFactor,
        isAlert,
        severity: this.calculateSeverity(driftPercent / 100, DRIFT_THRESHOLDS.profitFactor),
      });
    }

    // Check max drawdown drift
    if (baseline.maxDrawdown !== undefined) {
      const drift = liveMetrics.maxDrawdown - baseline.maxDrawdown; // Only alert if worse
      const driftPercent = (drift / baseline.maxDrawdown) * 100;
      const isAlert = drift > 0 && driftPercent / 100 > DRIFT_THRESHOLDS.maxDrawdown;

      drifts.push({
        strategy,
        metric: 'Max Drawdown',
        backtestValue: baseline.maxDrawdown,
        liveValue: liveMetrics.maxDrawdown,
        drift,
        driftPercent,
        threshold: DRIFT_THRESHOLDS.maxDrawdown,
        isAlert,
        severity: this.calculateSeverity(
          Math.abs(driftPercent) / 100,
          DRIFT_THRESHOLDS.maxDrawdown
        ),
      });
    }

    // Check consecutive losses
    if (baseline.consecutiveLosses !== undefined) {
      const drift = liveMetrics.consecutiveLosses - baseline.consecutiveLosses;
      const isAlert = drift > DRIFT_THRESHOLDS.consecutiveLosses;

      drifts.push({
        strategy,
        metric: 'Consecutive Losses',
        backtestValue: baseline.consecutiveLosses,
        liveValue: liveMetrics.consecutiveLosses,
        drift,
        driftPercent: (drift / baseline.consecutiveLosses) * 100,
        threshold: DRIFT_THRESHOLDS.consecutiveLosses,
        isAlert,
        severity: drift > 3 ? 'critical' : drift > 2 ? 'high' : 'medium',
      });
    }

    return drifts;
  }

  /**
   * Calculate severity based on drift magnitude
   */
  private calculateSeverity(
    drift: number,
    threshold: number
  ): 'low' | 'medium' | 'high' | 'critical' {
    const ratio = drift / threshold;
    if (ratio >= 2.0) return 'critical';
    if (ratio >= 1.5) return 'high';
    if (ratio >= 1.0) return 'medium';
    return 'low';
  }

  /**
   * Check all strategies for drift
   */
  async checkAllStrategies(minTrades: number = 30): Promise<void> {
    logger.info('[DriftDetector] Starting drift detection for all strategies');

    const strategies = ['A', 'B', 'C', 'D', 'GRID'];
    const alerts: DriftAnalysis[] = [];

    for (const strategy of strategies) {
      try {
        const liveMetrics = await this.calculateLiveMetrics(strategy, minTrades);
        if (!liveMetrics) {
          continue;
        }

        logger.info(`[DriftDetector] ${strategy} live metrics:`, {
          trades: liveMetrics.totalTrades,
          winRate: (liveMetrics.winRate * 100).toFixed(1) + '%',
          avgR: liveMetrics.avgR.toFixed(2),
          profitFactor: liveMetrics.profitFactor.toFixed(2),
          maxDrawdown: (liveMetrics.maxDrawdown * 100).toFixed(1) + '%',
          consecutiveLosses: liveMetrics.consecutiveLosses,
        });

        const drifts = this.detectDrift(strategy, liveMetrics);
        const significantDrifts = drifts.filter((d) => d.isAlert);

        if (significantDrifts.length > 0) {
          alerts.push(...significantDrifts);
          logger.warn(`[DriftDetector] ${strategy} has ${significantDrifts.length} drift alerts`);
        }
      } catch (error) {
        logger.error(`[DriftDetector] Error checking strategy ${strategy}:`, error);
      }
    }

    // Send alerts if any significant drifts detected
    if (alerts.length > 0) {
      await this.sendDriftAlerts(alerts);
    } else {
      logger.info('[DriftDetector] No significant drift detected across all strategies');
    }
  }

  /**
   * Send drift alerts
   */
  private async sendDriftAlerts(drifts: DriftAnalysis[]): Promise<void> {
    // Group by strategy
    const byStrategy = drifts.reduce((acc, drift) => {
      if (!acc[drift.strategy]) {
        acc[drift.strategy] = [];
      }
      acc[drift.strategy].push(drift);
      return acc;
    }, {} as Record<string, DriftAnalysis[]>);

    for (const [strategy, strategyDrifts] of Object.entries(byStrategy)) {
      const criticalDrifts = strategyDrifts.filter((d) => d.severity === 'critical');
      const highDrifts = strategyDrifts.filter((d) => d.severity === 'high');

      let message = `Strategy ${strategy} Drift Alert:\n\n`;
      for (const drift of strategyDrifts) {
        message += `${drift.metric}:\n`;
        message += `  Backtest: ${drift.backtestValue.toFixed(2)}\n`;
        message += `  Live: ${drift.liveValue.toFixed(2)}\n`;
        message += `  Drift: ${drift.driftPercent.toFixed(1)}% (${drift.severity})\n\n`;
      }

      const severity = criticalDrifts.length > 0 ? 'critical' : highDrifts.length > 0 ? 'high' : 'warning';

      await alertService.sendAlert({
        severity: severity === 'critical' || severity === 'high' ? 'critical' : 'warning',
        title: `Strategy ${strategy} Performance Drift Detected`,
        message,
      });

      logger.warn(`[DriftDetector] Sent ${severity} alert for strategy ${strategy}`);
    }
  }

  /**
   * Start automatic drift detection
   */
  startAutoDriftDetection(intervalHours: number = 24): void {
    logger.info(`[DriftDetector] Starting automatic drift detection every ${intervalHours} hours`);

    // Run immediately on startup (after 5 minutes to allow data to load)
    setTimeout(() => {
      this.checkAllStrategies().catch((error) => {
        logger.error('[DriftDetector] Initial drift check failed:', error);
      });
    }, 5 * 60 * 1000);

    // Run on interval
    setInterval(
      async () => {
        try {
          await this.checkAllStrategies();
        } catch (error) {
          logger.error('[DriftDetector] Auto drift detection failed:', error);
        }
      },
      intervalHours * 60 * 60 * 1000
    );
  }

  /**
   * Get drift status for dashboard
   */
  async getDriftStatus(): Promise<{
    strategies: Record<string, { metrics: StrategyMetrics; drifts: DriftAnalysis[] }>;
    lastCheck: Date;
  }> {
    const strategies: Record<string, { metrics: StrategyMetrics; drifts: DriftAnalysis[] }> = {};

    for (const strategy of ['A', 'B', 'C', 'D', 'GRID']) {
      const metrics = await this.calculateLiveMetrics(strategy, 30);
      if (metrics) {
        const drifts = this.detectDrift(strategy, metrics);
        strategies[strategy] = { metrics, drifts };
      }
    }

    return {
      strategies,
      lastCheck: new Date(),
    };
  }
}

// Export singleton instance
const strategyDriftDetector = new StrategyDriftDetector();
export default strategyDriftDetector;
