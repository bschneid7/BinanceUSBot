/**
 * Shadow Mode Tracker
 * 
 * Tracks PPO agent predictions vs. actual strategy decisions
 * Compares performance to validate PPO before live deployment
 */

import logger from '../../utils/logger';
import { metricsService } from '../metricsService';
import { slackNotifier } from '../slackNotifier';
import { PPOPrediction, TradingAction } from './ppoAgent';
import { Types } from 'mongoose';

export interface ShadowComparison {
  timestamp: Date;
  symbol: string;
  
  // PPO prediction
  ppoAction: TradingAction;
  ppoExpectedReward: number;
  
  // Actual strategy decision
  actualAction: 'BUY' | 'SELL' | 'HOLD' | 'CLOSE';
  actualReward?: number;
  
  // Comparison
  agreement: boolean;
  ppoBetter?: boolean; // Set after outcome is known
}

export interface ShadowModeStats {
  totalComparisons: number;
  agreementRate: number;
  ppoWins: number;
  actualWins: number;
  ppoAvgReward: number;
  actualAvgReward: number;
  ppoSharpe: number;
  actualSharpe: number;
}

class ShadowModeTracker {
  private static instance: ShadowModeTracker;
  private comparisons: ShadowComparison[] = [];
  private maxComparisons: number = 10000;
  
  // Performance tracking
  private ppoRewards: number[] = [];
  private actualRewards: number[] = [];

  private constructor() {
    logger.info('[ShadowModeTracker] Initialized');
    
    // Generate daily report
    setInterval(() => {
      this.generateDailyReport().catch(error => {
        logger.error('[ShadowModeTracker] Error generating daily report:', error);
      });
    }, 24 * 60 * 60 * 1000); // Every 24 hours
  }

  static getInstance(): ShadowModeTracker {
    if (!ShadowModeTracker.instance) {
      ShadowModeTracker.instance = new ShadowModeTracker();
    }
    return ShadowModeTracker.instance;
  }

  /**
   * Record a comparison between PPO and actual strategy
   */
  recordComparison(
    symbol: string,
    ppoPrediction: PPOPrediction,
    actualAction: 'BUY' | 'SELL' | 'HOLD' | 'CLOSE'
  ): void {
    const comparison: ShadowComparison = {
      timestamp: new Date(),
      symbol,
      ppoAction: ppoPrediction.action,
      ppoExpectedReward: ppoPrediction.expectedReward,
      actualAction,
      agreement: ppoPrediction.action.action === actualAction
    };

    this.comparisons.push(comparison);

    // Trim old comparisons
    if (this.comparisons.length > this.maxComparisons) {
      this.comparisons.shift();
    }

    // Update metrics
    const stats = this.calculateStats();
    metricsService.setGauge('shadow_agreement_rate', stats.agreementRate);
    metricsService.setGauge('shadow_comparisons_total', stats.totalComparisons);

    // Log disagreements for analysis
    if (!comparison.agreement) {
      logger.info('[ShadowModeTracker] PPO disagrees with strategy', {
        symbol,
        ppo: ppoPrediction.action.action,
        actual: actualAction,
        confidence: ppoPrediction.action.confidence
      });
    }
  }

  /**
   * Record outcome for a comparison
   */
  recordOutcome(
    symbol: string,
    timestamp: Date,
    ppoReward: number,
    actualReward: number
  ): void {
    // Find the comparison
    const comparison = this.comparisons.find(
      c => c.symbol === symbol && 
      Math.abs(c.timestamp.getTime() - timestamp.getTime()) < 60000 // Within 1 minute
    );

    if (!comparison) {
      logger.warn('[ShadowModeTracker] Comparison not found for outcome');
      return;
    }

    // Update comparison
    comparison.actualReward = actualReward;
    comparison.ppoBetter = ppoReward > actualReward;

    // Track rewards
    this.ppoRewards.push(ppoReward);
    this.actualRewards.push(actualReward);

    // Keep only last 1000 rewards
    if (this.ppoRewards.length > 1000) {
      this.ppoRewards.shift();
      this.actualRewards.shift();
    }

    // Update metrics
    const stats = this.calculateStats();
    metricsService.setGauge('shadow_ppo_avg_reward', stats.ppoAvgReward);
    metricsService.setGauge('shadow_actual_avg_reward', stats.actualAvgReward);
    metricsService.setGauge('shadow_ppo_wins', stats.ppoWins);
    metricsService.setGauge('shadow_actual_wins', stats.actualWins);

    logger.info('[ShadowModeTracker] Outcome recorded', {
      symbol,
      ppoReward: ppoReward.toFixed(4),
      actualReward: actualReward.toFixed(4),
      ppoBetter: comparison.ppoBetter
    });
  }

  /**
   * Calculate shadow mode statistics
   */
  calculateStats(): ShadowModeStats {
    if (this.comparisons.length === 0) {
      return {
        totalComparisons: 0,
        agreementRate: 0,
        ppoWins: 0,
        actualWins: 0,
        ppoAvgReward: 0,
        actualAvgReward: 0,
        ppoSharpe: 0,
        actualSharpe: 0
      };
    }

    const totalComparisons = this.comparisons.length;
    const agreements = this.comparisons.filter(c => c.agreement).length;
    const agreementRate = agreements / totalComparisons;

    const comparisonsWithOutcome = this.comparisons.filter(c => c.ppoBetter !== undefined);
    const ppoWins = comparisonsWithOutcome.filter(c => c.ppoBetter === true).length;
    const actualWins = comparisonsWithOutcome.filter(c => c.ppoBetter === false).length;

    const ppoAvgReward = this.ppoRewards.length > 0
      ? this.ppoRewards.reduce((sum, r) => sum + r, 0) / this.ppoRewards.length
      : 0;

    const actualAvgReward = this.actualRewards.length > 0
      ? this.actualRewards.reduce((sum, r) => sum + r, 0) / this.actualRewards.length
      : 0;

    const ppoSharpe = this.calculateSharpe(this.ppoRewards);
    const actualSharpe = this.calculateSharpe(this.actualRewards);

    return {
      totalComparisons,
      agreementRate,
      ppoWins,
      actualWins,
      ppoAvgReward,
      actualAvgReward,
      ppoSharpe,
      actualSharpe
    };
  }

  /**
   * Calculate Sharpe ratio
   */
  private calculateSharpe(rewards: number[]): number {
    if (rewards.length < 2) return 0;

    const mean = rewards.reduce((sum, r) => sum + r, 0) / rewards.length;
    const variance = rewards.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / rewards.length;
    const stdDev = Math.sqrt(variance);

    return stdDev > 0 ? mean / stdDev : 0;
  }

  /**
   * Get recent comparisons
   */
  getRecentComparisons(limit: number = 100): ShadowComparison[] {
    return this.comparisons.slice(-limit);
  }

  /**
   * Generate daily report
   */
  private async generateDailyReport(): Promise<void> {
    const stats = this.calculateStats();

    if (stats.totalComparisons === 0) {
      logger.info('[ShadowModeTracker] No comparisons to report');
      return;
    }

    let message = `📊 *Shadow Mode Daily Report*\n\n`;
    message += `*Comparisons:* ${stats.totalComparisons}\n`;
    message += `*Agreement Rate:* ${(stats.agreementRate * 100).toFixed(2)}%\n\n`;

    message += `*Performance Comparison:*\n`;
    message += `PPO Wins: ${stats.ppoWins}\n`;
    message += `Actual Wins: ${stats.actualWins}\n`;
    message += `PPO Avg Reward: ${stats.ppoAvgReward.toFixed(4)}\n`;
    message += `Actual Avg Reward: ${stats.actualAvgReward.toFixed(4)}\n`;
    message += `PPO Sharpe: ${stats.ppoSharpe.toFixed(2)}\n`;
    message += `Actual Sharpe: ${stats.actualSharpe.toFixed(2)}\n\n`;

    if (stats.ppoAvgReward > stats.actualAvgReward * 1.1) {
      message += `✅ *PPO is outperforming by ${((stats.ppoAvgReward / stats.actualAvgReward - 1) * 100).toFixed(1)}%*\n`;
      message += `Consider enabling PPO for live trading.`;
    } else if (stats.actualAvgReward > stats.ppoAvgReward * 1.1) {
      message += `⚠️ *Current strategy is outperforming PPO by ${((stats.actualAvgReward / stats.ppoAvgReward - 1) * 100).toFixed(1)}%*\n`;
      message += `PPO needs more training or tuning.`;
    } else {
      message += `📊 *Performance is similar*\n`;
      message += `Continue monitoring for more data.`;
    }

    await slackNotifier.sendNotification(message, 'info');
    logger.info('[ShadowModeTracker] Daily report sent');
  }

  /**
   * Check if PPO should be promoted to live trading
   */
  shouldPromotePPO(): {
    shouldPromote: boolean;
    reason: string;
    confidence: number;
  } {
    const stats = this.calculateStats();

    // Need at least 100 comparisons
    if (stats.totalComparisons < 100) {
      return {
        shouldPromote: false,
        reason: 'Insufficient data (need 100+ comparisons)',
        confidence: 0
      };
    }

    // PPO must outperform by at least 10%
    if (stats.ppoAvgReward <= stats.actualAvgReward * 1.1) {
      return {
        shouldPromote: false,
        reason: 'PPO not outperforming by required margin (10%)',
        confidence: 0
      };
    }

    // PPO must have better Sharpe ratio
    if (stats.ppoSharpe <= stats.actualSharpe) {
      return {
        shouldPromote: false,
        reason: 'PPO Sharpe ratio not better than current strategy',
        confidence: 0
      };
    }

    // PPO must win more often
    if (stats.ppoWins <= stats.actualWins) {
      return {
        shouldPromote: false,
        reason: 'PPO not winning more trades than current strategy',
        confidence: 0
      };
    }

    // All criteria met
    const outperformance = (stats.ppoAvgReward / stats.actualAvgReward - 1) * 100;
    return {
      shouldPromote: true,
      reason: `PPO outperforming by ${outperformance.toFixed(1)}% with better Sharpe ratio`,
      confidence: Math.min(outperformance / 20, 1) // Max confidence at 20% outperformance
    };
  }
}

export const shadowModeTracker = ShadowModeTracker.getInstance();
