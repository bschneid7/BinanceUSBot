import { Types } from 'mongoose';
import MLModel, { IMLModel } from '../models/MLModel';
import Trade from '../models/Trade';

/**
 * ML Model Service
 * Manages machine learning models - creation, updates, evaluation, and deployment
 */

class MLModelService {
  /**
   * Create a new ML model record
   */
  async createModel(
    userId: Types.ObjectId,
    modelData: {
      modelType: 'PPO' | 'DQN' | 'A3C' | 'CUSTOM';
      version: string;
      episodes: number;
      avgReward: number;
      episodeRewards: number[];
      config: {
        stateDim: number;
        actionDim: number;
        learningRate: number;
        gamma: number;
        epsilon: number;
      };
      actorParams?: number;
      criticParams?: number;
      notes?: string;
    }
  ): Promise<IMLModel> {
    try {
      console.log(`[MLModelService] Creating new model for user ${userId}, version ${modelData.version}`);

      const model = await MLModel.create({
        userId,
        ...modelData,
        totalParams: (modelData.actorParams || 0) + (modelData.criticParams || 0),
        status: 'TRAINING',
        performance: {}, // Initialize performance object
      });

      console.log(`[MLModelService] Model created: ${model._id}`);
      return model;
    } catch (error) {
      console.error('[MLModelService] Error creating model:', error);
      throw error;
    }
  }

  /**
   * Update model training completion
   */
  async completeTraining(
    modelId: Types.ObjectId,
    trainingData: {
      avgReward: number;
      episodeRewards: number[];
      trainingDuration: number;
      actorParams: number;
      criticParams: number;
    }
  ): Promise<IMLModel> {
    try {
      console.log(`[MLModelService] Completing training for model ${modelId}`);

      const model = await MLModel.findById(modelId);
      if (!model) {
        throw new Error('Model not found');
      }

      model.status = 'ACTIVE';
      model.trainingCompleted = new Date();
      model.trainingDuration = trainingData.trainingDuration;
      model.avgReward = trainingData.avgReward;
      model.episodeRewards = trainingData.episodeRewards;
      model.actorParams = trainingData.actorParams;
      model.criticParams = trainingData.criticParams;
      model.totalParams = trainingData.actorParams + trainingData.criticParams;

      // Initialize performance object if not present
      if (!model.performance) {
        model.performance = {};
      }

      await model.save();

      console.log(`[MLModelService] Training completed for model ${modelId}`);
      return model;
    } catch (error) {
      console.error('[MLModelService] Error completing training:', error);
      throw error;
    }
  }

  /**
   * Mark model training as failed
   */
  async failTraining(modelId: Types.ObjectId, error: string): Promise<IMLModel> {
    try {
      console.log(`[MLModelService] Marking training failed for model ${modelId}: ${error}`);

      const model = await MLModel.findById(modelId);
      if (!model) {
        throw new Error('Model not found');
      }

      model.status = 'FAILED';
      model.notes = `Training failed: ${error}`;
      await model.save();

      return model;
    } catch (err) {
      console.error('[MLModelService] Error marking training failed:', err);
      throw err;
    }
  }

  /**
   * Update model backtest performance
   */
  async updateBacktestPerformance(
    modelId: Types.ObjectId,
    performance: {
      backtestWinRate: number;
      backtestProfitFactor: number;
      backtestSharpeRatio: number;
      backtestMaxDrawdown: number;
      backtestTotalTrades: number;
    }
  ): Promise<IMLModel> {
    try {
      console.log(`[MLModelService] Updating backtest performance for model ${modelId}`);

      const model = await MLModel.findById(modelId);
      if (!model) {
        throw new Error('Model not found');
      }

      model.performance = {
        ...model.performance,
        ...performance,
      };

      await model.save();

      console.log(`[MLModelService] Backtest performance updated for model ${modelId}`);
      return model;
    } catch (error) {
      console.error('[MLModelService] Error updating backtest performance:', error);
      throw error;
    }
  }

  /**
   * Deploy a model for live trading
   */
  async deployModel(modelId: Types.ObjectId): Promise<IMLModel> {
    try {
      console.log(`[MLModelService] Deploying model ${modelId}`);

      // First, undeploy any currently deployed models for this user
      const model = await MLModel.findById(modelId);
      if (!model) {
        throw new Error('Model not found');
      }

      await MLModel.updateMany(
        { userId: model.userId, isDeployed: true },
        { $set: { isDeployed: false } }
      );

      // Deploy the new model
      model.isDeployed = true;
      model.deployedAt = new Date();
      model.status = 'ACTIVE';

      // Initialize performance object if not present
      if (!model.performance) {
        model.performance = {};
      }
      model.performance.liveStartDate = new Date();

      await model.save();

      console.log(`[MLModelService] Model ${modelId} deployed successfully`);
      return model;
    } catch (error) {
      console.error('[MLModelService] Error deploying model:', error);
      throw error;
    }
  }

  /**
   * Archive a model
   */
  async archiveModel(modelId: Types.ObjectId): Promise<IMLModel> {
    try {
      console.log(`[MLModelService] Archiving model ${modelId}`);

      const model = await MLModel.findById(modelId);
      if (!model) {
        throw new Error('Model not found');
      }

      model.status = 'ARCHIVED';
      model.isDeployed = false;

      // Initialize performance object if not present
      if (!model.performance) {
        model.performance = {};
      }

      if (model.performance.liveStartDate && !model.performance.liveEndDate) {
        model.performance.liveEndDate = new Date();
      }

      await model.save();

      console.log(`[MLModelService] Model ${modelId} archived successfully`);
      return model;
    } catch (error) {
      console.error('[MLModelService] Error archiving model:', error);
      throw error;
    }
  }

  /**
   * Get all models for a user
   */
  async getUserModels(
    userId: Types.ObjectId,
    filters?: {
      status?: 'TRAINING' | 'ACTIVE' | 'ARCHIVED' | 'FAILED';
      isDeployed?: boolean;
    }
  ): Promise<IMLModel[]> {
    try {
      const query: Record<string, unknown> = { userId };

      if (filters?.status) {
        query.status = filters.status;
      }

      if (filters?.isDeployed !== undefined) {
        query.isDeployed = filters.isDeployed;
      }

      const models = await MLModel.find(query).sort({ createdAt: -1 });

      console.log(`[MLModelService] Found ${models.length} models for user ${userId}`);
      return models;
    } catch (error) {
      console.error('[MLModelService] Error getting user models:', error);
      throw error;
    }
  }

  /**
   * Get deployed model for a user
   */
  async getDeployedModel(userId: Types.ObjectId): Promise<IMLModel | null> {
    try {
      const model = await MLModel.findOne({ userId, isDeployed: true, status: 'ACTIVE' });

      if (model) {
        console.log(`[MLModelService] Found deployed model ${model._id} for user ${userId}`);
      } else {
        console.log(`[MLModelService] No deployed model for user ${userId}`);
      }

      return model;
    } catch (error) {
      console.error('[MLModelService] Error getting deployed model:', error);
      throw error;
    }
  }

  /**
   * Get model by ID
   */
  async getModelById(modelId: Types.ObjectId): Promise<IMLModel | null> {
    try {
      const model = await MLModel.findById(modelId);
      return model;
    } catch (error) {
      console.error('[MLModelService] Error getting model by ID:', error);
      throw error;
    }
  }

  /**
   * Update live performance metrics based on recent trades
   */
  async updateLivePerformance(userId: Types.ObjectId): Promise<void> {
    try {
      const deployedModel = await this.getDeployedModel(userId);
      if (!deployedModel) {
        return;
      }

      // Initialize performance object if not present
      if (!deployedModel.performance) {
        deployedModel.performance = {};
      }

      if (!deployedModel.performance.liveStartDate) {
        return;
      }

      // Get trades since deployment
      const trades = await Trade.find({
        userId,
        closedAt: { $gte: deployedModel.performance.liveStartDate },
        status: 'CLOSED',
      });

      if (trades.length === 0) {
        return;
      }

      // Calculate live metrics
      const winningTrades = trades.filter(t => (t.realized_pnl || 0) > 0);
      const losingTrades = trades.filter(t => (t.realized_pnl || 0) < 0);

      const totalWins = winningTrades.reduce((sum, t) => sum + (t.realized_pnl || 0), 0);
      const totalLosses = Math.abs(
        losingTrades.reduce((sum, t) => sum + (t.realized_pnl || 0), 0)
      );

      const liveWinRate = trades.length > 0 ? (winningTrades.length / trades.length) * 100 : 0;
      const liveProfitFactor = totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? 999 : 0;

      deployedModel.performance.liveWinRate = liveWinRate;
      deployedModel.performance.liveProfitFactor = liveProfitFactor;
      deployedModel.performance.liveTotalTrades = trades.length;

      await deployedModel.save();

      console.log(
        `[MLModelService] Updated live performance for model ${deployedModel._id}: WR=${liveWinRate.toFixed(1)}%, PF=${liveProfitFactor.toFixed(2)}`
      );
    } catch (error) {
      console.error('[MLModelService] Error updating live performance:', error);
      throw error;
    }
  }

  /**
   * Get model statistics
   */
  async getModelStats(userId: Types.ObjectId): Promise<{
    totalModels: number;
    activeModels: number;
    deployedModels: number;
    trainingModels: number;
    archivedModels: number;
    failedModels: number;
    bestModel?: {
      id: string;
      version: string;
      avgReward: number;
      backtestWinRate?: number;
      liveWinRate?: number;
    };
  }> {
    try {
      const models = await MLModel.find({ userId });

      const stats = {
        totalModels: models.length,
        activeModels: models.filter(m => m.status === 'ACTIVE').length,
        deployedModels: models.filter(m => m.isDeployed).length,
        trainingModels: models.filter(m => m.status === 'TRAINING').length,
        archivedModels: models.filter(m => m.status === 'ARCHIVED').length,
        failedModels: models.filter(m => m.status === 'FAILED').length,
        bestModel: undefined as
          | {
              id: string;
              version: string;
              avgReward: number;
              backtestWinRate?: number;
              liveWinRate?: number;
            }
          | undefined,
      };

      // Find best model by training reward
      const activeModels = models.filter(m => m.status === 'ACTIVE');
      if (activeModels.length > 0) {
        const best = activeModels.reduce((prev, current) =>
          current.avgReward > prev.avgReward ? current : prev
        );

        stats.bestModel = {
          id: best._id.toString(),
          version: best.version,
          avgReward: best.avgReward,
          backtestWinRate: best.performance?.backtestWinRate,
          liveWinRate: best.performance?.liveWinRate,
        };
      }

      return stats;
    } catch (error) {
      console.error('[MLModelService] Error getting model stats:', error);
      throw error;
    }
  }
}

export default new MLModelService();
