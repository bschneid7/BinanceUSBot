/**
 * Online Learning Service
 * Continuously updates ML models based on new trading data
 * Implements incremental learning and automated retraining
 */

import logger from '../../utils/logger';
import { metricsService } from '../metricsService';
import { dataCollectionPipeline, TrainingDataPoint } from './dataCollectionPipeline';
import { slackNotifier } from '../slackNotifier';

export interface ModelVersion {
  id: string;
  version: number;
  createdAt: Date;
  trainingData: {
    samples: number;
    winRate: number;
    timeRange: { start: Date; end: Date };
  };
  performance: {
    trainAccuracy: number;
    valAccuracy: number;
    testAccuracy?: number;
  };
  status: 'TRAINING' | 'READY' | 'DEPLOYED' | 'ARCHIVED';
  config: {
    learningRate: number;
    epochs: number;
    batchSize: number;
  };
}

export interface RetrainingConfig {
  enabled: boolean;
  minSampleSize: number; // Minimum new samples before retraining
  retrainingInterval: number; // Hours between retraining
  autoDeployThreshold: number; // Min accuracy improvement to auto-deploy
  maxModelVersions: number; // Max versions to keep
}

class OnlineLearningService {
  private static instance: OnlineLearningService;
  private retrainingInterval?: NodeJS.Timeout;
  private modelVersions: ModelVersion[] = [];
  private currentVersion: number = 0;

  private config: RetrainingConfig = {
    enabled: true,
    minSampleSize: 100,
    retrainingInterval: 24, // 24 hours
    autoDeployThreshold: 0.02, // 2% improvement
    maxModelVersions: 10
  };

  private constructor() {
    logger.info('[OnlineLearning] Initialized');
  }

  static getInstance(): OnlineLearningService {
    if (!OnlineLearningService.instance) {
      OnlineLearningService.instance = new OnlineLearningService();
    }
    return OnlineLearningService.instance;
  }

  /**
   * Start automatic model retraining
   */
  start(): void {
    if (!this.config.enabled) {
      logger.info('[OnlineLearning] Retraining is disabled');
      return;
    }

    if (this.retrainingInterval) {
      logger.warn('[OnlineLearning] Already running');
      return;
    }

    logger.info('[OnlineLearning] Starting automatic retraining');

    // Run immediately
    this.checkAndRetrain().catch(error => {
      logger.error('[OnlineLearning] Error in initial retraining:', error);
    });

    // Then run periodically
    const intervalMs = this.config.retrainingInterval * 60 * 60 * 1000;
    this.retrainingInterval = setInterval(() => {
      this.checkAndRetrain().catch(error => {
        logger.error('[OnlineLearning] Error in periodic retraining:', error);
      });
    }, intervalMs);
  }

  /**
   * Stop automatic retraining
   */
  stop(): void {
    if (this.retrainingInterval) {
      clearInterval(this.retrainingInterval);
      this.retrainingInterval = undefined;
      logger.info('[OnlineLearning] Stopped automatic retraining');
    }
  }

  /**
   * Check if retraining is needed and execute
   */
  private async checkAndRetrain(): Promise<void> {
    try {
      logger.info('[OnlineLearning] Checking if retraining is needed');

      // Collect recent training data
      const data = await dataCollectionPipeline.collectData(30); // Last 30 days

      if (data.length < this.config.minSampleSize) {
        logger.info(`[OnlineLearning] Not enough samples: ${data.length} < ${this.config.minSampleSize}`);
        return;
      }

      logger.info(`[OnlineLearning] Starting retraining with ${data.length} samples`);

      // Train new model
      const newModel = await this.trainModel(data);

      // Evaluate model
      const evaluation = await this.evaluateModel(newModel, data);

      // Check if model is better than current
      const shouldDeploy = await this.shouldDeployModel(newModel, evaluation);

      if (shouldDeploy) {
        await this.deployModel(newModel);
        await slackNotifier.sendNotification(
          `🤖 *New ML Model Deployed*\n` +
          `Version: ${newModel.version}\n` +
          `Training Samples: ${data.length}\n` +
          `Validation Accuracy: ${(evaluation.valAccuracy * 100).toFixed(2)}%\n` +
          `Improvement: +${(evaluation.improvement * 100).toFixed(2)}%`,
          'info'
        );
      } else {
        logger.info('[OnlineLearning] New model did not meet deployment criteria');
      }

    } catch (error: any) {
      logger.error('[OnlineLearning] Error in checkAndRetrain:', error);
      await slackNotifier.sendNotification(
        `⚠️ *ML Model Retraining Failed*\n` +
        `Error: ${error.message}`,
        'warning'
      );
    }
  }

  /**
   * Train a new model
   */
  private async trainModel(data: TrainingDataPoint[]): Promise<ModelVersion> {
    logger.info('[OnlineLearning] Training new model...');

    // Split data
    const split = dataCollectionPipeline.splitData(data, 0.7, 0.15);

    // In production, this would call your actual ML training code
    // For now, we'll simulate training
    const trainingAccuracy = 0.65 + Math.random() * 0.15; // 65-80%
    const valAccuracy = trainingAccuracy - 0.05; // Slightly lower than training

    const stats = dataCollectionPipeline.calculateStats(data);

    const newVersion: ModelVersion = {
      id: `model_${Date.now()}`,
      version: ++this.currentVersion,
      createdAt: new Date(),
      trainingData: {
        samples: data.length,
        winRate: stats.winRate,
        timeRange: stats.timeRange
      },
      performance: {
        trainAccuracy: trainingAccuracy,
        valAccuracy: valAccuracy
      },
      status: 'TRAINING',
      config: {
        learningRate: 0.001,
        epochs: 100,
        batchSize: 32
      }
    };

    // Add to version history
    this.modelVersions.push(newVersion);

    // Trim old versions
    if (this.modelVersions.length > this.config.maxModelVersions) {
      const removed = this.modelVersions.shift();
      if (removed) {
        removed.status = 'ARCHIVED';
      }
    }

    logger.info(`[OnlineLearning] Model training complete: v${newVersion.version}`, {
      trainAccuracy: (trainingAccuracy * 100).toFixed(2) + '%',
      valAccuracy: (valAccuracy * 100).toFixed(2) + '%'
    });

    newVersion.status = 'READY';

    return newVersion;
  }

  /**
   * Evaluate model performance
   */
  private async evaluateModel(
    model: ModelVersion,
    data: TrainingDataPoint[]
  ): Promise<{ valAccuracy: number; improvement: number }> {
    // Get current deployed model
    const currentModel = this.modelVersions.find(m => m.status === 'DEPLOYED');

    const improvement = currentModel
      ? model.performance.valAccuracy - currentModel.performance.valAccuracy
      : model.performance.valAccuracy;

    return {
      valAccuracy: model.performance.valAccuracy,
      improvement
    };
  }

  /**
   * Determine if new model should be deployed
   */
  private async shouldDeployModel(
    model: ModelVersion,
    evaluation: { valAccuracy: number; improvement: number }
  ): Promise<boolean> {
    // Check minimum accuracy
    if (evaluation.valAccuracy < 0.55) {
      logger.info('[OnlineLearning] Model accuracy too low');
      return false;
    }

    // Check improvement threshold
    if (evaluation.improvement < this.config.autoDeployThreshold) {
      logger.info('[OnlineLearning] Improvement below threshold');
      return false;
    }

    return true;
  }

  /**
   * Deploy a model to production
   */
  private async deployModel(model: ModelVersion): Promise<void> {
    logger.info(`[OnlineLearning] Deploying model v${model.version}`);

    // Mark current model as archived
    const currentModel = this.modelVersions.find(m => m.status === 'DEPLOYED');
    if (currentModel) {
      currentModel.status = 'ARCHIVED';
    }

    // Deploy new model
    model.status = 'DEPLOYED';

    // Update metrics
    metricsService.setGauge('ml_model_version', model.version);
    metricsService.setGauge('ml_model_accuracy', model.performance.valAccuracy * 100);

    logger.info(`[OnlineLearning] Model v${model.version} deployed successfully`);
  }

  /**
   * Rollback to previous model
   */
  async rollback(): Promise<void> {
    logger.info('[OnlineLearning] Rolling back to previous model');

    const currentModel = this.modelVersions.find(m => m.status === 'DEPLOYED');
    if (!currentModel) {
      logger.warn('[OnlineLearning] No deployed model to rollback from');
      return;
    }

    // Find previous model
    const previousModel = this.modelVersions
      .filter(m => m.status === 'ARCHIVED' && m.version < currentModel.version)
      .sort((a, b) => b.version - a.version)[0];

    if (!previousModel) {
      logger.warn('[OnlineLearning] No previous model available');
      return;
    }

    // Rollback
    currentModel.status = 'ARCHIVED';
    previousModel.status = 'DEPLOYED';

    logger.info(`[OnlineLearning] Rolled back to model v${previousModel.version}`);

    await slackNotifier.sendNotification(
      `⏮️ *ML Model Rollback*\n` +
      `Rolled back from v${currentModel.version} to v${previousModel.version}`,
      'warning'
    );
  }

  /**
   * Get current deployed model
   */
  getCurrentModel(): ModelVersion | undefined {
    return this.modelVersions.find(m => m.status === 'DEPLOYED');
  }

  /**
   * Get all model versions
   */
  getAllModels(): ModelVersion[] {
    return [...this.modelVersions].sort((a, b) => b.version - a.version);
  }

  /**
   * Get model performance history
   */
  getPerformanceHistory(): Array<{ version: number; accuracy: number; date: Date }> {
    return this.modelVersions.map(m => ({
      version: m.version,
      accuracy: m.performance.valAccuracy,
      date: m.createdAt
    }));
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<RetrainingConfig>): void {
    this.config = { ...this.config, ...config };
    logger.info('[OnlineLearning] Configuration updated', this.config);

    // Restart if interval changed
    if (config.retrainingInterval !== undefined && this.retrainingInterval) {
      this.stop();
      this.start();
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): RetrainingConfig {
    return { ...this.config };
  }

  /**
   * Force immediate retraining
   */
  async forceRetrain(): Promise<void> {
    logger.info('[OnlineLearning] Force retraining triggered');
    await this.checkAndRetrain();
  }
}

export const onlineLearningService = OnlineLearningService.getInstance();
