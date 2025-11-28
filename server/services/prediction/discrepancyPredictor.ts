import logger from '../../utils/logger';
import riskScorer, { OperationContext, RiskScore } from './riskScorer';
import continuousReconciliationService from '../continuousReconciliationService';
import alertManager from '../monitoring/alertManager';

/**
 * Discrepancy Predictor Service
 * Predicts potential discrepancies and triggers preventive actions
 */

export interface PredictionConfig {
  enabled: boolean;
  riskThreshold: number; // Trigger actions if risk score exceeds this
  predictiveReconciliation: boolean;
  adaptiveRetries: boolean;
}

export interface Prediction {
  timestamp: Date;
  operation: OperationContext;
  riskScore: RiskScore;
  actionsTaken: string[];
}

class DiscrepancyPredictor {
  private config: PredictionConfig = {
    enabled: true,
    riskThreshold: 50, // HIGH or CRITICAL risk
    predictiveReconciliation: true,
    adaptiveRetries: true,
  };

  private predictions: Prediction[] = [];
  private maxPredictionHistory: number = 1000;

  /**
   * Evaluate operation and take preventive actions
   */
  async evaluateOperation(context: OperationContext): Promise<Prediction> {
    if (!this.config.enabled) {
      return this.createNoPrediction(context);
    }

    try {
      // Calculate risk score
      const riskScore = riskScorer.calculateRiskScore(context);

      // Take preventive actions
      const actionsTaken = await this.takePreventiveActions(context, riskScore);

      // Create prediction record
      const prediction: Prediction = {
        timestamp: new Date(),
        operation: context,
        riskScore,
        actionsTaken,
      };

      // Store prediction
      this.predictions.push(prediction);
      if (this.predictions.length > this.maxPredictionHistory) {
        this.predictions.shift();
      }

      // Log if high risk
      if (riskScore.score >= this.config.riskThreshold) {
        logger.warn(
          `[DiscrepancyPredictor] High risk operation detected: ${context.type} ` +
          `(score: ${riskScore.score}, level: ${riskScore.level})`
        );
      }

      return prediction;
    } catch (error: any) {
      logger.error('[DiscrepancyPredictor] Error evaluating operation:', error);
      return this.createNoPrediction(context);
    }
  }

  /**
   * Take preventive actions based on risk score
   */
  private async takePreventiveActions(
    context: OperationContext,
    riskScore: RiskScore
  ): Promise<string[]> {
    const actions: string[] = [];

    // Action 1: Trigger predictive reconciliation
    if (
      this.config.predictiveReconciliation &&
      riskScorer.shouldTriggerReconciliation(riskScore.score)
    ) {
      logger.info('[DiscrepancyPredictor] Triggering predictive reconciliation');
      
      // Don't await - let it run in background
      continuousReconciliationService.triggerManualReconciliation().catch(err => {
        logger.error('[DiscrepancyPredictor] Predictive reconciliation failed:', err);
      });
      
      actions.push('Triggered predictive reconciliation');
    }

    // Action 2: Send alert for critical risk
    if (riskScore.level === 'CRITICAL') {
      await alertManager.sendAlert({
        level: 'ERROR',
        title: 'Critical Risk Operation',
        message: `Operation ${context.type} has critical risk score: ${riskScore.score}`,
        details: {
          operation: context,
          riskScore,
        },
        timestamp: new Date(),
      });
      
      actions.push('Sent critical risk alert');
    }

    // Action 3: Log recommendations
    if (riskScore.recommendations.length > 0) {
      logger.info(
        `[DiscrepancyPredictor] Recommendations for ${context.type}:`,
        riskScore.recommendations
      );
      actions.push(`Logged ${riskScore.recommendations.length} recommendations`);
    }

    return actions;
  }

  /**
   * Create no-prediction record
   */
  private createNoPrediction(context: OperationContext): Prediction {
    return {
      timestamp: new Date(),
      operation: context,
      riskScore: {
        score: 0,
        level: 'LOW',
        factors: [],
        recommendations: [],
      },
      actionsTaken: [],
    };
  }

  /**
   * Get recommended retry count for operation
   */
  getRecommendedRetries(context: OperationContext): number {
    if (!this.config.adaptiveRetries) {
      return 3; // Default
    }

    const riskScore = riskScorer.calculateRiskScore(context);
    return riskScorer.getRecommendedRetries(riskScore.score);
  }

  /**
   * Get current risk score for operation type
   */
  getCurrentRisk(context: OperationContext): RiskScore {
    return riskScorer.calculateRiskScore(context);
  }

  /**
   * Get prediction history
   */
  getPredictionHistory(minutes: number = 60): Prediction[] {
    const cutoff = new Date(Date.now() - minutes * 60 * 1000);
    return this.predictions.filter(p => p.timestamp >= cutoff);
  }

  /**
   * Get prediction statistics
   */
  getPredictionStats(): any {
    const recent = this.getPredictionHistory(60);
    
    if (recent.length === 0) {
      return {
        total: 0,
        avgRiskScore: 0,
        riskDistribution: { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 },
        actionsTriggered: 0,
      };
    }

    const avgRiskScore = recent.reduce((sum, p) => sum + p.riskScore.score, 0) / recent.length;
    
    const riskDistribution = {
      LOW: recent.filter(p => p.riskScore.level === 'LOW').length,
      MEDIUM: recent.filter(p => p.riskScore.level === 'MEDIUM').length,
      HIGH: recent.filter(p => p.riskScore.level === 'HIGH').length,
      CRITICAL: recent.filter(p => p.riskScore.level === 'CRITICAL').length,
    };

    const actionsTriggered = recent.reduce((sum, p) => sum + p.actionsTaken.length, 0);

    return {
      total: recent.length,
      avgRiskScore: Math.round(avgRiskScore),
      riskDistribution,
      actionsTriggered,
    };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<PredictionConfig>): void {
    this.config = { ...this.config, ...config };
    logger.info('[DiscrepancyPredictor] Configuration updated:', this.config);
  }

  /**
   * Get configuration
   */
  getConfig(): PredictionConfig {
    return { ...this.config };
  }
}

export const discrepancyPredictor = new DiscrepancyPredictor();
export default discrepancyPredictor;
