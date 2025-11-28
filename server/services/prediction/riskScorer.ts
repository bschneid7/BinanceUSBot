import logger from '../../utils/logger';
import { circuitBreakerManager } from '../circuitBreaker';
import metricsCollector from '../monitoring/metricsCollector';

/**
 * Risk Scorer Service
 * Scores operations based on risk factors to predict potential issues
 */

export interface RiskScore {
  score: number; // 0-100 (0 = no risk, 100 = maximum risk)
  level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  factors: RiskFactor[];
  recommendations: string[];
}

export interface RiskFactor {
  name: string;
  weight: number;
  value: number;
  contribution: number; // How much this factor contributes to total score
  description: string;
}

export interface OperationContext {
  type: 'ORDER_PLACEMENT' | 'POSITION_CLOSE' | 'BALANCE_UPDATE' | 'RECONCILIATION';
  pair?: string;
  userId?: string;
  metadata?: any;
}

class RiskScorer {
  /**
   * Calculate risk score for an operation
   */
  calculateRiskScore(context: OperationContext): RiskScore {
    const factors: RiskFactor[] = [];

    // Factor 1: Circuit breaker state
    factors.push(this.evaluateCircuitBreakers());

    // Factor 2: Recent error rate
    factors.push(this.evaluateErrorRate());

    // Factor 3: API latency
    factors.push(this.evaluateApiLatency());

    // Factor 4: Queue depth
    factors.push(this.evaluateQueueDepth());

    // Factor 5: Historical discrepancies for this pair
    if (context.pair) {
      factors.push(this.evaluatePairHistory(context.pair));
    }

    // Factor 6: Operation type risk
    factors.push(this.evaluateOperationType(context.type));

    // Calculate total score
    const totalScore = this.calculateTotalScore(factors);
    const level = this.determineRiskLevel(totalScore);
    const recommendations = this.generateRecommendations(factors, level);

    return {
      score: totalScore,
      level,
      factors,
      recommendations,
    };
  }

  /**
   * Evaluate circuit breaker state
   */
  private evaluateCircuitBreakers(): RiskFactor {
    const breakers = circuitBreakerManager.getHealthStatus();
    let openCount = 0;

    for (const [name, stats] of Object.entries(breakers)) {
      if ((stats as any).state === 'OPEN') {
        openCount++;
      }
    }

    const value = openCount * 33.33; // Each open breaker = 33.33% risk
    
    return {
      name: 'Circuit Breakers',
      weight: 0.25,
      value: Math.min(value, 100),
      contribution: 0,
      description: openCount > 0 
        ? `${openCount} circuit breaker(s) open - external services degraded`
        : 'All circuit breakers closed - services healthy',
    };
  }

  /**
   * Evaluate recent error rate
   */
  private evaluateErrorRate(): RiskFactor {
    const metrics = metricsCollector.getCurrentMetrics();
    if (!metrics) {
      return {
        name: 'Error Rate',
        weight: 0.20,
        value: 0,
        contribution: 0,
        description: 'No recent metrics available',
      };
    }

    const apiErrors = metrics.system.errorRates.apiErrors;
    const dbErrors = metrics.system.errorRates.databaseErrors;
    const totalErrors = apiErrors + dbErrors;

    // More than 10 errors in 10 seconds = 100% risk
    const value = Math.min((totalErrors / 10) * 100, 100);

    return {
      name: 'Error Rate',
      weight: 0.20,
      value,
      contribution: 0,
      description: totalErrors > 0
        ? `${totalErrors} errors in last 10 seconds`
        : 'No recent errors',
    };
  }

  /**
   * Evaluate API latency
   */
  private evaluateApiLatency(): RiskFactor {
    const metrics = metricsCollector.getCurrentMetrics();
    if (!metrics) {
      return {
        name: 'API Latency',
        weight: 0.15,
        value: 0,
        contribution: 0,
        description: 'No recent metrics available',
      };
    }

    const latency = metrics.system.apiLatency.binance;

    // > 1000ms = 100% risk
    const value = Math.min((latency / 1000) * 100, 100);

    return {
      name: 'API Latency',
      weight: 0.15,
      value,
      contribution: 0,
      description: latency > 500
        ? `High API latency: ${latency}ms`
        : `Normal API latency: ${latency}ms`,
    };
  }

  /**
   * Evaluate queue depth
   */
  private evaluateQueueDepth(): RiskFactor {
    const metrics = metricsCollector.getCurrentMetrics();
    if (!metrics) {
      return {
        name: 'Queue Depth',
        weight: 0.15,
        value: 0,
        contribution: 0,
        description: 'No recent metrics available',
      };
    }

    const totalDepth = 
      metrics.system.queueDepths.orderPlacement +
      metrics.system.queueDepths.positionManagement +
      metrics.system.queueDepths.reconciliation +
      metrics.system.queueDepths.analytics;

    // > 100 jobs = 100% risk
    const value = Math.min((totalDepth / 100) * 100, 100);

    return {
      name: 'Queue Depth',
      weight: 0.15,
      value,
      contribution: 0,
      description: totalDepth > 50
        ? `Queues backing up: ${totalDepth} jobs waiting`
        : `Normal queue depth: ${totalDepth} jobs`,
    };
  }

  /**
   * Evaluate historical discrepancies for trading pair
   */
  private evaluatePairHistory(pair: string): RiskFactor {
    // TODO: Query event store for historical discrepancies for this pair
    // For now, return low risk
    return {
      name: 'Pair History',
      weight: 0.10,
      value: 0,
      contribution: 0,
      description: `No known issues with ${pair}`,
    };
  }

  /**
   * Evaluate operation type risk
   */
  private evaluateOperationType(type: OperationContext['type']): RiskFactor {
    const riskByType: Record<OperationContext['type'], number> = {
      'ORDER_PLACEMENT': 30, // Medium risk
      'POSITION_CLOSE': 20, // Lower risk
      'BALANCE_UPDATE': 10, // Low risk
      'RECONCILIATION': 5, // Very low risk
    };

    const value = riskByType[type];

    return {
      name: 'Operation Type',
      weight: 0.15,
      value,
      contribution: 0,
      description: `${type} operation has inherent ${value > 20 ? 'medium' : 'low'} risk`,
    };
  }

  /**
   * Calculate total weighted score
   */
  private calculateTotalScore(factors: RiskFactor[]): number {
    let totalScore = 0;

    for (const factor of factors) {
      const contribution = factor.value * factor.weight;
      factor.contribution = contribution;
      totalScore += contribution;
    }

    return Math.round(totalScore);
  }

  /**
   * Determine risk level from score
   */
  private determineRiskLevel(score: number): RiskScore['level'] {
    if (score >= 75) return 'CRITICAL';
    if (score >= 50) return 'HIGH';
    if (score >= 25) return 'MEDIUM';
    return 'LOW';
  }

  /**
   * Generate recommendations based on risk factors
   */
  private generateRecommendations(factors: RiskFactor[], level: RiskScore['level']): string[] {
    const recommendations: string[] = [];

    // High-contribution factors
    const highRiskFactors = factors
      .filter(f => f.contribution > 15)
      .sort((a, b) => b.contribution - a.contribution);

    for (const factor of highRiskFactors) {
      if (factor.name === 'Circuit Breakers') {
        recommendations.push('Wait for circuit breakers to close before retrying');
      } else if (factor.name === 'Error Rate') {
        recommendations.push('Increase retry attempts and delays');
      } else if (factor.name === 'API Latency') {
        recommendations.push('Use longer timeouts for API calls');
      } else if (factor.name === 'Queue Depth') {
        recommendations.push('Consider throttling new operations');
      }
    }

    // General recommendations by level
    if (level === 'CRITICAL') {
      recommendations.push('Consider pausing non-critical operations');
      recommendations.push('Trigger immediate reconciliation after operation');
    } else if (level === 'HIGH') {
      recommendations.push('Add extra verification steps');
      recommendations.push('Record detailed events for audit');
    } else if (level === 'MEDIUM') {
      recommendations.push('Monitor operation closely');
    }

    return recommendations;
  }

  /**
   * Should trigger predictive reconciliation?
   */
  shouldTriggerReconciliation(score: number): boolean {
    return score >= 50; // HIGH or CRITICAL risk
  }

  /**
   * Should increase retry attempts?
   */
  shouldIncreaseRetries(score: number): boolean {
    return score >= 25; // MEDIUM or higher risk
  }

  /**
   * Get recommended retry count
   */
  getRecommendedRetries(score: number): number {
    if (score >= 75) return 7; // CRITICAL
    if (score >= 50) return 5; // HIGH
    if (score >= 25) return 3; // MEDIUM
    return 1; // LOW
  }
}

export const riskScorer = new RiskScorer();
export default riskScorer;
