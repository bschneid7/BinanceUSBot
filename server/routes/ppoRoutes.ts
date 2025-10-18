import express from 'express';
import { requireUser } from './middlewares/auth';
import PPOAgent from '../services/tradingEngine/PPOAgent';

const router = express.Router();

// Store PPO agents per user (in-memory for MVP; could be persisted)
const ppoAgents = new Map<string, PPOAgent>();

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

// Description: Train PPO agent
// Endpoint: POST /api/ppo/train
// Request: { episodes: number, historicalData?: Array<{price: number, volume: number, volatility: number}> }
// Response: { success: boolean, avgReward: number, episodeRewards: number[], stats: object }
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

    // Get or create agent
    const agent = getPPOAgent(userId);

    // Train agent
    const startTime = Date.now();
    const result = await agent.train(episodes, historicalData);
    const duration = Date.now() - startTime;

    const stats = agent.getStats();

    console.log(`[PPORoutes] Training completed in ${duration}ms, avg reward: ${result.avgReward.toFixed(2)}`);

    res.status(200).json({
      success: true,
      avgReward: result.avgReward,
      episodeRewards: result.episodeRewards,
      stats,
      duration,
    });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('[PPORoutes] Error training PPO agent:', err);
    res.status(500).json({
      error: err.message || 'Failed to train PPO agent',
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
