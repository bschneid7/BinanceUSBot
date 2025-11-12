/**
 * A/B Testing Service
 * Compares performance of different ML models or strategies
 * Enables safe testing of new models before full deployment
 */

import logger from '../../utils/logger';
import { metricsService } from '../metricsService';
import { slackNotifier } from '../slackNotifier';

export interface ABTest {
  id: string;
  name: string;
  description: string;
  startDate: Date;
  endDate?: Date;
  status: 'RUNNING' | 'COMPLETED' | 'STOPPED';
  
  // Test configuration
  variants: {
    control: {
      name: string;
      description: string;
      allocation: number; // 0-1, percentage of traffic
    };
    treatment: {
      name: string;
      description: string;
      allocation: number;
    };
  };
  
  // Performance metrics
  results: {
    control: ABTestMetrics;
    treatment: ABTestMetrics;
  };
  
  // Statistical significance
  significance: {
    pValue: number;
    isSignificant: boolean;
    confidenceLevel: number;
  };
}

export interface ABTestMetrics {
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  avgPnl: number;
  totalPnl: number;
  sharpeRatio: number;
  maxDrawdown: number;
}

export interface TradeAssignment {
  testId: string;
  variant: 'control' | 'treatment';
  timestamp: Date;
}

class ABTestingService {
  private static instance: ABTestingService;
  private activeTests: Map<string, ABTest> = new Map();
  private tradeAssignments: Map<string, TradeAssignment> = new Map(); // tradeId -> assignment

  private constructor() {
    logger.info('[ABTesting] Initialized');
  }

  static getInstance(): ABTestingService {
    if (!ABTestingService.instance) {
      ABTestingService.instance = new ABTestingService();
    }
    return ABTestingService.instance;
  }

  /**
   * Create a new A/B test
   */
  createTest(
    name: string,
    description: string,
    controlName: string,
    treatmentName: string,
    treatmentAllocation: number = 0.5
  ): ABTest {
    const test: ABTest = {
      id: `test_${Date.now()}`,
      name,
      description,
      startDate: new Date(),
      status: 'RUNNING',
      variants: {
        control: {
          name: controlName,
          description: 'Current production model',
          allocation: 1 - treatmentAllocation
        },
        treatment: {
          name: treatmentName,
          description: 'New model being tested',
          allocation: treatmentAllocation
        }
      },
      results: {
        control: this.createEmptyMetrics(),
        treatment: this.createEmptyMetrics()
      },
      significance: {
        pValue: 1.0,
        isSignificant: false,
        confidenceLevel: 0.95
      }
    };

    this.activeTests.set(test.id, test);

    logger.info(`[ABTesting] Created test: ${name}`, {
      id: test.id,
      treatmentAllocation: (treatmentAllocation * 100).toFixed(0) + '%'
    });

    metricsService.incrementCounter('ab_tests_created', 1);

    return test;
  }

  /**
   * Assign a trade to a variant
   */
  assignVariant(testId: string, tradeId: string): 'control' | 'treatment' | null {
    const test = this.activeTests.get(testId);
    if (!test || test.status !== 'RUNNING') {
      return null;
    }

    // Random assignment based on allocation
    const random = Math.random();
    const variant = random < test.variants.treatment.allocation ? 'treatment' : 'control';

    // Store assignment
    this.tradeAssignments.set(tradeId, {
      testId,
      variant,
      timestamp: new Date()
    });

    logger.debug(`[ABTesting] Assigned trade ${tradeId} to ${variant}`);

    return variant;
  }

  /**
   * Record trade outcome
   */
  recordOutcome(
    tradeId: string,
    pnl: number,
    pnlPercent: number
  ): void {
    const assignment = this.tradeAssignments.get(tradeId);
    if (!assignment) {
      return;
    }

    const test = this.activeTests.get(assignment.testId);
    if (!test) {
      return;
    }

    const metrics = test.results[assignment.variant];
    
    // Update metrics
    metrics.trades++;
    if (pnl > 0) {
      metrics.wins++;
    } else {
      metrics.losses++;
    }
    metrics.winRate = metrics.wins / metrics.trades;
    metrics.totalPnl += pnl;
    metrics.avgPnl = metrics.totalPnl / metrics.trades;

    // Update test
    this.activeTests.set(assignment.testId, test);

    // Calculate statistical significance
    this.updateSignificance(test);

    logger.debug(`[ABTesting] Recorded outcome for ${assignment.variant}`, {
      testId: assignment.testId,
      pnl: pnl.toFixed(2),
      trades: metrics.trades
    });

    // Update metrics
    metricsService.incrementCounter('ab_test_outcomes', 1, {
      testId: assignment.testId,
      variant: assignment.variant
    });
  }

  /**
   * Update statistical significance
   */
  private updateSignificance(test: ABTest): void {
    const control = test.results.control;
    const treatment = test.results.treatment;

    // Need minimum sample size
    if (control.trades < 30 || treatment.trades < 30) {
      return;
    }

    // Calculate z-score for win rate difference
    const p1 = control.winRate;
    const p2 = treatment.winRate;
    const n1 = control.trades;
    const n2 = treatment.trades;

    const pooledP = (control.wins + treatment.wins) / (n1 + n2);
    const se = Math.sqrt(pooledP * (1 - pooledP) * (1/n1 + 1/n2));
    
    if (se === 0) {
      return;
    }

    const zScore = (p2 - p1) / se;
    
    // Calculate p-value (two-tailed test)
    const pValue = 2 * (1 - this.normalCDF(Math.abs(zScore)));

    test.significance.pValue = pValue;
    test.significance.isSignificant = pValue < (1 - test.significance.confidenceLevel);

    logger.debug(`[ABTesting] Updated significance for ${test.name}`, {
      pValue: pValue.toFixed(4),
      isSignificant: test.significance.isSignificant
    });
  }

  /**
   * Normal CDF approximation
   */
  private normalCDF(x: number): number {
    const t = 1 / (1 + 0.2316419 * Math.abs(x));
    const d = 0.3989423 * Math.exp(-x * x / 2);
    const prob = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return x > 0 ? 1 - prob : prob;
  }

  /**
   * Get test results
   */
  getTestResults(testId: string): ABTest | undefined {
    return this.activeTests.get(testId);
  }

  /**
   * Get all active tests
   */
  getActiveTests(): ABTest[] {
    return Array.from(this.activeTests.values()).filter(t => t.status === 'RUNNING');
  }

  /**
   * Stop a test
   */
  stopTest(testId: string): void {
    const test = this.activeTests.get(testId);
    if (!test) {
      return;
    }

    test.status = 'STOPPED';
    test.endDate = new Date();

    logger.info(`[ABTesting] Stopped test: ${test.name}`);

    // Send summary to Slack
    this.sendTestSummary(test);
  }

  /**
   * Complete a test and declare winner
   */
  async completeTest(testId: string): Promise<'control' | 'treatment' | 'inconclusive'> {
    const test = this.activeTests.get(testId);
    if (!test) {
      throw new Error('Test not found');
    }

    test.status = 'COMPLETED';
    test.endDate = new Date();

    // Determine winner
    let winner: 'control' | 'treatment' | 'inconclusive' = 'inconclusive';

    if (test.significance.isSignificant) {
      winner = test.results.treatment.winRate > test.results.control.winRate
        ? 'treatment'
        : 'control';
    }

    logger.info(`[ABTesting] Completed test: ${test.name}`, { winner });

    // Send summary
    await this.sendTestSummary(test, winner);

    return winner;
  }

  /**
   * Send test summary to Slack
   */
  private async sendTestSummary(test: ABTest, winner?: 'control' | 'treatment' | 'inconclusive'): Promise<void> {
    const control = test.results.control;
    const treatment = test.results.treatment;

    const message = `📊 *A/B Test ${test.status === 'COMPLETED' ? 'Complete' : 'Stopped'}*\n` +
      `\n` +
      `*Test:* ${test.name}\n` +
      `*Duration:* ${this.formatDuration(test.startDate, test.endDate || new Date())}\n` +
      `\n` +
      `*Control (${test.variants.control.name}):*\n` +
      `• Trades: ${control.trades}\n` +
      `• Win Rate: ${(control.winRate * 100).toFixed(2)}%\n` +
      `• Avg P&L: $${control.avgPnl.toFixed(2)}\n` +
      `• Total P&L: $${control.totalPnl.toFixed(2)}\n` +
      `\n` +
      `*Treatment (${test.variants.treatment.name}):*\n` +
      `• Trades: ${treatment.trades}\n` +
      `• Win Rate: ${(treatment.winRate * 100).toFixed(2)}%\n` +
      `• Avg P&L: $${treatment.avgPnl.toFixed(2)}\n` +
      `• Total P&L: $${treatment.totalPnl.toFixed(2)}\n` +
      `\n` +
      `*Statistical Significance:*\n` +
      `• P-value: ${test.significance.pValue.toFixed(4)}\n` +
      `• Significant: ${test.significance.isSignificant ? 'Yes ✅' : 'No ❌'}\n` +
      (winner ? `\n*Winner:* ${winner === 'treatment' ? '🏆 Treatment' : winner === 'control' ? '🏆 Control' : '🤷 Inconclusive'}` : '');

    await slackNotifier.sendNotification(message, 'info');
  }

  /**
   * Format duration
   */
  private formatDuration(start: Date, end: Date): string {
    const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
    if (hours < 24) {
      return `${hours.toFixed(1)} hours`;
    }
    const days = hours / 24;
    return `${days.toFixed(1)} days`;
  }

  /**
   * Create empty metrics object
   */
  private createEmptyMetrics(): ABTestMetrics {
    return {
      trades: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
      avgPnl: 0,
      totalPnl: 0,
      sharpeRatio: 0,
      maxDrawdown: 0
    };
  }

  /**
   * Get test summary
   */
  getTestSummary(): {
    active: number;
    completed: number;
    totalTests: number;
  } {
    const tests = Array.from(this.activeTests.values());
    return {
      active: tests.filter(t => t.status === 'RUNNING').length,
      completed: tests.filter(t => t.status === 'COMPLETED').length,
      totalTests: tests.length
    };
  }
}

export const abTestingService = ABTestingService.getInstance();
