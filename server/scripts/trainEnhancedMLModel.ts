#!/usr/bin/env ts-node

/**
 * Train Enhanced ML Model Script
 * Trains a PPO agent with CDD features on historical data
 */

import dotenv from 'dotenv';
import { connectDB } from '../config/database';
import User from '../models/User';
import mlModelService from '../services/mlModelService';
import { EnhancedPPOTrainingEnvironment } from '../services/tradingEngine/ppoTrainingEnv_enhanced';
import PPOAgent from '../services/tradingEngine/PPOAgent';
import { Types } from 'mongoose';
import logger from '../utils/logger';

dotenv.config();

interface TrainingConfig {
  episodes: number;
  stateDim: number; // 17 with CDD features
  actionDim: number; // 4 actions: HOLD, BUY, SELL, CLOSE
  learningRate: number;
  gamma: number;
  epsilon: number;
  symbol: string;
  startDate: Date;
  endDate: Date;
  interval: string;
}

/**
 * Train enhanced ML model with CDD features
 */
async function trainEnhancedModel(
  userId: Types.ObjectId,
  config: TrainingConfig
): Promise<void> {
  logger.info('[TrainEnhanced] Starting enhanced model training...');
  logger.info('[TrainEnhanced] Config:', config);

  try {
    // Generate version string
    const version = `v${Date.now()}-enhanced-e${config.episodes}`;

    // Create model record
    const modelRecord = await mlModelService.createModel(userId, {
      modelType: 'PPO-Enhanced',
      version,
      episodes: config.episodes,
      avgReward: 0,
      episodeRewards: [],
      config: {
        stateDim: config.stateDim,
        actionDim: config.actionDim,
        learningRate: config.learningRate,
        gamma: config.gamma,
        epsilon: config.epsilon,
        symbol: config.symbol,
        cddFeatures: [
          'fundingRate',
          'fundingRateTrend',
          'vwapDeviation',
          'orderFlowImbalance',
          'correlationScore',
        ],
      },
      notes: 'Enhanced training with CDD features started',
    });

    logger.info(`[TrainEnhanced] Created model record: ${modelRecord._id}`);

    // Create enhanced training environment
    const env = new EnhancedPPOTrainingEnvironment();
    
    // Load historical data with CDD features
    logger.info(`[TrainEnhanced] Loading historical data for ${config.symbol}...`);
    await env.loadHistoricalData(
      config.symbol,
      config.startDate,
      config.endDate,
      config.interval
    );

    // Create PPO agent
    const agent = new PPOAgent(config.stateDim, config.actionDim, {
      learningRate: config.learningRate,
      gamma: config.gamma,
      epsilon: config.epsilon,
    });

    // Training loop
    const episodeRewards: number[] = [];
    const startTime = Date.now();
    
    logger.info(`[TrainEnhanced] Starting training for ${config.episodes} episodes...`);
    
    for (let episode = 0; episode < config.episodes; episode++) {
      let state = env.reset();
      let episodeReward = 0;
      let done = false;
      let steps = 0;
      
      const stateArray = convertStateToArray(state);
      
      while (!done) {
        // Get action from agent
        const action = await agent.act(stateArray);
        
        // Take step in environment
        const { state: nextState, reward, done: isDone, info } = env.step(action);
        const nextStateArray = convertStateToArray(nextState);
        
        // Store experience
        await agent.remember(stateArray, action, reward, nextStateArray, isDone);
        
        // Update state
        state = nextState;
        episodeReward += reward;
        done = isDone;
        steps++;
      }
      
      episodeRewards.push(episodeReward);
      
      // Log progress every 50 episodes
      if ((episode + 1) % 50 === 0) {
        const avgReward = episodeRewards.slice(-50).reduce((a, b) => a + b, 0) / 50;
        const elapsed = (Date.now() - startTime) / 1000;
        const eta = (elapsed / (episode + 1)) * (config.episodes - episode - 1);
        
        logger.info(
          `[TrainEnhanced] Episode ${episode + 1}/${config.episodes} | ` +
          `Avg Reward (last 50): ${avgReward.toFixed(2)} | ` +
          `ETA: ${Math.floor(eta / 60)}m ${Math.floor(eta % 60)}s`
        );
      }
    }

    const trainingDuration = Date.now() - startTime;
    const avgReward = episodeRewards.reduce((a, b) => a + b, 0) / episodeRewards.length;

    // Get agent stats
    const stats = agent.getStats();

    // Update model record
    await mlModelService.completeTraining(modelRecord._id, {
      avgReward,
      episodeRewards,
      trainingDuration,
      actorParams: stats.actorParams,
      criticParams: stats.criticParams,
    });

    logger.info('[TrainEnhanced] ===== Training Complete =====');
    logger.info(`[TrainEnhanced] Model ID: ${modelRecord._id}`);
    logger.info(`[TrainEnhanced] Version: ${version}`);
    logger.info(`[TrainEnhanced] Episodes: ${config.episodes}`);
    logger.info(`[TrainEnhanced] Average Reward: ${avgReward.toFixed(2)}`);
    logger.info(`[TrainEnhanced] Training Duration: ${(trainingDuration / 1000 / 60).toFixed(1)}m`);
    logger.info(`[TrainEnhanced] Actor Parameters: ${stats.actorParams}`);
    logger.info(`[TrainEnhanced] Critic Parameters: ${stats.criticParams}`);
    logger.info(`[TrainEnhanced] Total Parameters: ${stats.actorParams + stats.criticParams}`);
    logger.info('[TrainEnhanced] ==================================');

    // Save model weights to database
    logger.info('[TrainEnhanced] Saving model weights to database...');
    const modelWeights = await agent.getModelWeights();
    await mlModelService.saveModelWeights(modelRecord._id, modelWeights);
    logger.info('[TrainEnhanced] Model weights saved successfully');

  } catch (error) {
    logger.error('[TrainEnhanced] Training failed:', error);
    throw error;
  }
}

/**
 * Convert training state object to array for PPO agent
 */
function convertStateToArray(state: any): number[] {
  return [
    ...state.prices,
    ...state.returns,
    ...state.volumes,
    state.rsi,
    state.macd,
    state.macdSignal,
    state.fundingRate,
    state.fundingRateTrend,
    state.vwapDeviation,
    state.orderFlowImbalance,
    state.correlationScore,
    state.hasPosition,
    state.positionSide,
    state.positionPnL,
    state.positionDuration,
    state.equity,
    state.drawdown,
  ];
}

/**
 * Main execution
 */
async function main() {
  try {
    logger.info('[TrainEnhanced] ===== Enhanced ML Model Training Script =====');

    // Connect to database
    await connectDB();

    // Get user
    const userEmail = process.argv[2] || 'bschneid7@gmail.com';
    const user = await User.findOne({ email: userEmail });

    if (!user) {
      logger.error(`[TrainEnhanced] User not found: ${userEmail}`);
      process.exit(1);
    }

    logger.info(`[TrainEnhanced] Training model for user: ${user.email}`);

    // Parse command line arguments
    const episodes = parseInt(process.argv[3]) || 1000;
    const symbol = process.argv[4] || 'BTCUSDT';
    const daysBack = parseInt(process.argv[5]) || 90;

    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);

    // Training configuration
    const config: TrainingConfig = {
      episodes,
      stateDim: 17, // Enhanced with 5 CDD features
      actionDim: 4, // HOLD, BUY, SELL, CLOSE
      learningRate: 0.0003,
      gamma: 0.99,
      epsilon: 0.2,
      symbol,
      startDate,
      endDate,
      interval: '1h',
    };

    logger.info(`[TrainEnhanced] Training on ${daysBack} days of ${symbol} data`);
    logger.info(`[TrainEnhanced] Date range: ${startDate.toISOString()} to ${endDate.toISOString()}`);

    // Train the model
    await trainEnhancedModel(user._id, config);

    logger.info('[TrainEnhanced] ===== Training Complete =====');
    process.exit(0);
  } catch (error) {
    logger.error('[TrainEnhanced] Fatal error:', error);
    process.exit(1);
  }
}

// Execute if run directly
if (require.main === module) {
  main();
}

export { trainEnhancedModel };

