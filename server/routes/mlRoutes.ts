import express from 'express';
import { requireUser } from './middlewares/auth';
import mlModelService from '../services/mlModelService';
import { Types } from 'mongoose';

const router = express.Router();

// Description: Get all ML models for user
// Endpoint: GET /api/ml/models
// Request: { status?: 'TRAINING' | 'ACTIVE' | 'ARCHIVED' | 'FAILED', isDeployed?: boolean }
// Response: { models: Array<MLModel> }
router.get('/models', requireUser(), async (req, res) => {
  try {
    const userId = req.user._id;
    const { status, isDeployed } = req.query;

    console.log(`[MLRoutes] Getting models for user ${userId}`);

    const filters: {
      status?: 'TRAINING' | 'ACTIVE' | 'ARCHIVED' | 'FAILED';
      isDeployed?: boolean;
    } = {};

    if (status) {
      filters.status = status as 'TRAINING' | 'ACTIVE' | 'ARCHIVED' | 'FAILED';
    }

    if (isDeployed !== undefined) {
      filters.isDeployed = isDeployed === 'true';
    }

    const models = await mlModelService.getUserModels(userId, filters);

    res.status(200).json({ models });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('[MLRoutes] Error getting models:', err);
    res.status(500).json({
      error: err.message || 'Failed to get models',
    });
  }
});

// Description: Get deployed ML model for user
// Endpoint: GET /api/ml/deployed
// Request: {}
// Response: { model: MLModel | null }
router.get('/deployed', requireUser(), async (req, res) => {
  try {
    const userId = req.user._id;

    console.log(`[MLRoutes] Getting deployed model for user ${userId}`);

    const model = await mlModelService.getDeployedModel(userId);

    res.status(200).json({ model });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('[MLRoutes] Error getting deployed model:', err);
    res.status(500).json({
      error: err.message || 'Failed to get deployed model',
    });
  }
});

// Description: Get ML model by ID
// Endpoint: GET /api/ml/models/:id
// Request: {}
// Response: { model: MLModel }
router.get('/models/:id', requireUser(), async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;

    console.log(`[MLRoutes] Getting model ${id} for user ${userId}`);

    const model = await mlModelService.getModelById(new Types.ObjectId(id));

    if (!model) {
      return res.status(404).json({ error: 'Model not found' });
    }

    // Verify user owns the model
    if (model.userId.toString() !== userId.toString()) {
      return res.status(403).json({ error: 'Not authorized to access this model' });
    }

    res.status(200).json({ model });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('[MLRoutes] Error getting model:', err);
    res.status(500).json({
      error: err.message || 'Failed to get model',
    });
  }
});

// Description: Deploy an ML model
// Endpoint: POST /api/ml/models/:id/deploy
// Request: {}
// Response: { success: boolean, model: MLModel }
router.post('/models/:id/deploy', requireUser(), async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;

    console.log(`[MLRoutes] Deploying model ${id} for user ${userId}`);

    const model = await mlModelService.getModelById(new Types.ObjectId(id));

    if (!model) {
      return res.status(404).json({ error: 'Model not found' });
    }

    // Verify user owns the model
    if (model.userId.toString() !== userId.toString()) {
      return res.status(403).json({ error: 'Not authorized to deploy this model' });
    }

    // Deploy the model
    const deployedModel = await mlModelService.deployModel(new Types.ObjectId(id));

    res.status(200).json({
      success: true,
      model: deployedModel,
    });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('[MLRoutes] Error deploying model:', err);
    res.status(500).json({
      error: err.message || 'Failed to deploy model',
    });
  }
});

// Description: Archive an ML model
// Endpoint: POST /api/ml/models/:id/archive
// Request: {}
// Response: { success: boolean, model: MLModel }
router.post('/models/:id/archive', requireUser(), async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;

    console.log(`[MLRoutes] Archiving model ${id} for user ${userId}`);

    const model = await mlModelService.getModelById(new Types.ObjectId(id));

    if (!model) {
      return res.status(404).json({ error: 'Model not found' });
    }

    // Verify user owns the model
    if (model.userId.toString() !== userId.toString()) {
      return res.status(403).json({ error: 'Not authorized to archive this model' });
    }

    // Archive the model
    const archivedModel = await mlModelService.archiveModel(new Types.ObjectId(id));

    res.status(200).json({
      success: true,
      model: archivedModel,
    });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('[MLRoutes] Error archiving model:', err);
    res.status(500).json({
      error: err.message || 'Failed to archive model',
    });
  }
});

// Description: Update model backtest performance
// Endpoint: PUT /api/ml/models/:id/backtest
// Request: { backtestWinRate: number, backtestProfitFactor: number, backtestSharpeRatio: number, backtestMaxDrawdown: number, backtestTotalTrades: number }
// Response: { success: boolean, model: MLModel }
router.put('/models/:id/backtest', requireUser(), async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;
    const {
      backtestWinRate,
      backtestProfitFactor,
      backtestSharpeRatio,
      backtestMaxDrawdown,
      backtestTotalTrades,
    } = req.body;

    console.log(`[MLRoutes] Updating backtest performance for model ${id}`);

    const model = await mlModelService.getModelById(new Types.ObjectId(id));

    if (!model) {
      return res.status(404).json({ error: 'Model not found' });
    }

    // Verify user owns the model
    if (model.userId.toString() !== userId.toString()) {
      return res.status(403).json({ error: 'Not authorized to update this model' });
    }

    // Validate inputs
    if (
      typeof backtestWinRate !== 'number' ||
      typeof backtestProfitFactor !== 'number' ||
      typeof backtestSharpeRatio !== 'number' ||
      typeof backtestMaxDrawdown !== 'number' ||
      typeof backtestTotalTrades !== 'number'
    ) {
      return res.status(400).json({ error: 'Invalid backtest performance data' });
    }

    // Update backtest performance
    const updatedModel = await mlModelService.updateBacktestPerformance(new Types.ObjectId(id), {
      backtestWinRate,
      backtestProfitFactor,
      backtestSharpeRatio,
      backtestMaxDrawdown,
      backtestTotalTrades,
    });

    res.status(200).json({
      success: true,
      model: updatedModel,
    });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('[MLRoutes] Error updating backtest performance:', err);
    res.status(500).json({
      error: err.message || 'Failed to update backtest performance',
    });
  }
});

// Description: Get ML model statistics
// Endpoint: GET /api/ml/stats
// Request: {}
// Response: { stats: { totalModels, activeModels, deployedModels, trainingModels, archivedModels, failedModels, bestModel } }
router.get('/stats', requireUser(), async (req, res) => {
  try {
    const userId = req.user._id;

    console.log(`[MLRoutes] Getting model stats for user ${userId}`);

    const stats = await mlModelService.getModelStats(userId);

    res.status(200).json({ stats });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('[MLRoutes] Error getting model stats:', err);
    res.status(500).json({
      error: err.message || 'Failed to get model stats',
    });
  }
});

// Description: Update live performance for deployed model
// Endpoint: POST /api/ml/update-live-performance
// Request: {}
// Response: { success: boolean }
router.post('/update-live-performance', requireUser(), async (req, res) => {
  try {
    const userId = req.user._id;

    console.log(`[MLRoutes] Updating live performance for user ${userId}`);

    await mlModelService.updateLivePerformance(userId);

    res.status(200).json({ success: true });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('[MLRoutes] Error updating live performance:', err);
    res.status(500).json({
      error: err.message || 'Failed to update live performance',
    });
  }
});

export default router;
