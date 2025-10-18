import express from 'express';
import { requireUser } from './middlewares/auth';
import PPOAgent from '../services/tradingEngine/PPOAgent';
import mlModelService from '../services/mlModelService';
import { Types } from 'mongoose';

const router = express.Router();

// Store PPO agents per user (in-memory for MVP; could be persisted)
const ppoAgents = new Map<string, PPOAgent>();

// Store training jobs per user
interface TrainingJob {
  status: 'TRAINING' | 'COMPLETED' | 'FAILED';
  progress: number;
  avgReward?: number;
  episodeRewards?: number[];
  stats?: Record<string, unknown>;
  duration?: number;
  error?: string;
  modelId?: string;
  startTime: number;
}

const trainingJobs = new Map<string, TrainingJob>();

/**
 * Get or create PPO agent for user
 */
function getPPOAgent(userId: string): PPOAgent {
  if (!ppoAgents.has(userId)) {
    const agent = new PPOAgent(5, 3); // 5-dim state, 3 actions
    ppoAgents.set(userId, agent);
    console.log(`[PPORoutes] Created new PPO agent for user ${userId}`);
  }
  return ppoAgents.get(userId)!;
}

// Description: Train PPO agent (async background job)
// Endpoint: POST /api/ppo/train
// Request: { episodes: number, historicalData?: Array<{price: number, volume: number, volatility: number}> }
// Response: { success: boolean, message: string, jobStatus: string }
router.post('/train', requireUser(), async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const { episodes = 1000, historicalData } = req.body;

    console.log(`[PPORoutes] Training request for user ${userId}, episodes: ${episodes}`);

    // Validate episodes
    if (typeof episodes !== 'number' || episodes < 1 || episodes > 10000) {
      return res.status(400).json({
        error: 'Invalid episodes parameter. Must be between 1 and 10000',
      });
    }

    // Check if training already in progress
    const existingJob = trainingJobs.get(userId);
    if (existingJob && existingJob.status === 'TRAINING') {
      return res.status(409).json({
        error: 'Training already in progress',
        jobStatus: 'TRAINING',
        progress: existingJob.progress,
      });
    }

    // Initialize training job
    trainingJobs.set(userId, {
      status: 'TRAINING',
      progress: 0,
      startTime: Date.now(),
    });

    // Create ML model record
    const version = `v${Date.now()}-e${episodes}`;
    const modelRecord = await mlModelService.createModel(new Types.ObjectId(req.user._id), {
      modelType: 'PPO',
      version,
      episodes,
      avgReward: 0,
      episodeRewards: [],
      config: {
        stateDim: 5,
        actionDim: 3,
        learningRate: 0.0003,
        gamma: 0.99,
        epsilon: 0.2,
      },
      notes: 'Training started via API',
    });

    // Update job with model ID
    const job = trainingJobs.get(userId)!;
    job.modelId = modelRecord._id.toString();
    trainingJobs.set(userId, job);

    console.log(`[PPORoutes] Created model record ${modelRecord._id}, starting background training`);

    // Start training in background (non-blocking)
    setImmediate(async () => {
      try {
        console.log(`[PPORoutes] Background training started for user ${userId}`);

        const agent = getPPOAgent(userId);
        const startTime = Date.now();

        // Train agent
        const result = await agent.train(episodes, historicalData);
        const duration = Date.now() - startTime;

        const stats = agent.getStats();

        console.log(`[PPORoutes] Training completed in ${duration}ms, avg reward: ${result.avgReward.toFixed(2)}`);

        // Update ML model record
        await mlModelService.completeTraining(modelRecord._id, {
          avgReward: result.avgReward,
          episodeRewards: result.episodeRewards,
          trainingDuration: duration,
          actorParams: stats.actorParams,
          criticParams: stats.criticParams,
        });

        // Update job status
        trainingJobs.set(userId, {
          status: 'COMPLETED',
          progress: 100,
          avgReward: result.avgReward,
          episodeRewards: result.episodeRewards,
          stats,
          duration,
          modelId: modelRecord._id.toString(),
          startTime,
        });

        console.log(`[PPORoutes] Training job completed for user ${userId}`);
      } catch (error: unknown) {
        const err = error as Error;
        console.error('[PPORoutes] Background training failed:', err);

        // Mark model as failed
        try {
          await mlModelService.failTraining(modelRecord._id, err.message);
        } catch (dbError) {
          console.error('[PPORoutes] Failed to update model status:', dbError);
        }

        // Update job status
        trainingJobs.set(userId, {
          status: 'FAILED',
          progress: 0,
          error: err.message,
          modelId: modelRecord._id.toString(),
          startTime,
        });
      }
    });

    // Return 202 Accepted immediately
    res.status(202).json({
      success: true,
      message: 'Training started in background',
      jobStatus: 'TRAINING',
      modelId: modelRecord._id.toString(),
    });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('[PPORoutes] Error starting training:', err);
    res.status(500).json({
      error: err.message || 'Failed to start training',
    });
  }
});

// Description: Get training job status
// Endpoint: GET /api/ppo/training-status
// Request: {}
// Response: { status: string, progress: number, avgReward?: number, stats?: object, duration?: number, error?: string, modelId?: string }
router.get('/training-status', requireUser(), async (req, res) => {
  try {
    const userId = req.user._id.toString();

    const job = trainingJobs.get(userId);

    if (!job) {
      return res.status(200).json({
        status: 'NONE',
        progress: 0,
        message: 'No training job found',
      });
    }

    console.log(`[PPORoutes] Training status for user ${userId}: ${job.status} (${job.progress}%)`);

    res.status(200).json({
      status: job.status,
      progress: job.progress,
      avgReward: job.avgReward,
      episodeRewards: job.episodeRewards,
      stats: job.stats,
      duration: job.duration,
      error: job.error,
      modelId: job.modelId,
      elapsedTime: Date.now() - job.startTime,
    });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('[PPORoutes] Error getting training status:', err);
    res.status(500).json({
      error: err.message || 'Failed to get training status',
    });
  }
});

// Description: Get action from PPO agent
// Endpoint: POST /api/ppo/action
// Request: { state: number[] } (e.g., [price, volume, volatility, sentiment, position])
// Response: { action: number, actionName: string } (0=hold, 1=buy, 2=sell)
router.post('/action', requireUser(), async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const { state } = req.body;

    // Validate state
    if (!Array.isArray(state) || state.length !== 5) {
      return res.status(400).json({
        error: 'Invalid state parameter. Must be array of 5 numbers',
      });
    }

    // Get agent
    const agent = getPPOAgent(userId);

    // Get action
    const action = await agent.getAction(state);

    const actionNames = ['hold', 'buy', 'sell'];
    const actionName = actionNames[action] || 'unknown';

    console.log(`[PPORoutes] Action for user ${userId}: ${actionName} (${action})`);

    res.status(200).json({
      action,
      actionName,
    });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('[PPORoutes] Error getting action:', err);
    res.status(500).json({
      error: err.message || 'Failed to get action',
    });
  }
});

// Description: Get PPO agent stats
// Endpoint: GET /api/ppo/stats
// Request: {}
// Response: { stats: { memorySize: number, actorParams: number, criticParams: number }, exists: boolean }
router.get('/stats', requireUser(), async (req, res) => {
  try {
    const userId = req.user._id.toString();

    const exists = ppoAgents.has(userId);

    if (!exists) {
      return res.status(200).json({
        exists: false,
        stats: {
          memorySize: 0,
          actorParams: 0,
          criticParams: 0,
        },
      });
    }

    const agent = ppoAgents.get(userId)!;
    const stats = agent.getStats();

    console.log(`[PPORoutes] Stats for user ${userId}:`, stats);

    res.status(200).json({
      exists: true,
      stats,
    });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('[PPORoutes] Error getting stats:', err);
    res.status(500).json({
      error: err.message || 'Failed to get stats',
    });
  }
});

// Description: Reset PPO agent
// Endpoint: POST /api/ppo/reset
// Request: {}
// Response: { success: boolean, message: string }
router.post('/reset', requireUser(), async (req, res) => {
  try {
    const userId = req.user._id.toString();

    if (ppoAgents.has(userId)) {
      ppoAgents.delete(userId);
      console.log(`[PPORoutes] Reset PPO agent for user ${userId}`);
    }

    res.status(200).json({
      success: true,
      message: 'PPO agent reset successfully',
    });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('[PPORoutes] Error resetting agent:', err);
    res.status(500).json({
      error: err.message || 'Failed to reset agent',
    });
  }
});

export default router;
