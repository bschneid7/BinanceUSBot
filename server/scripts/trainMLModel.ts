#!/usr/bin/env ts-node

/**
 * Train ML Model Script
 * Trains a PPO agent on historical trade data and saves the model
 */

import dotenv from 'dotenv';
import { connectDB } from '../config/database';
import User from '../models/User';
import Trade from '../models/Trade';
import PPOAgent from '../services/tradingEngine/PPOAgent';
import mlModelService from '../services/mlModelService';
import { Types } from 'mongoose';

dotenv.config();

interface TrainingConfig {
  episodes: number;
  stateDim: number;
  actionDim: number;
  learningRate: number;
  gamma: number;
  epsilon: number;
  useHistoricalData: boolean;
}

/**
 * Prepare historical training data from trades
 */
async function prepareHistoricalData(userId: Types.ObjectId): Promise<
  Array<{
    price: number;
    volume: number;
    volatility: number;
  }>
> {
  console.log('[TrainMLModel] Preparing historical data from trades...');

  const trades = await Trade.find({ userId })
    .sort({ openedAt: 1 })
    .limit(1000); // Use last 1000 trades

  if (trades.length === 0) {
    console.log('[TrainMLModel] No historical trades found, using synthetic data');
    return [];
  }

  const historicalData = trades.map(trade => {
    // Extract features from trade
    const price = trade.entry_price;
    const quantity = trade.quantity;
    const volume = price * quantity; // Approximate volume

    // Calculate volatility from price movement
    const priceChange = Math.abs(trade.exit_price - trade.entry_price);
    const volatility = priceChange / trade.entry_price;

    return {
      price,
      volume,
      volatility,
    };
  });

  console.log(`[TrainMLModel] Prepared ${historicalData.length} data points from trades`);
  return historicalData;
}

/**
 * Train ML model
 */
async function trainModel(
  userId: Types.ObjectId,
  config: TrainingConfig
): Promise<void> {
  console.log('[TrainMLModel] Starting model training...');
  console.log('[TrainMLModel] Config:', config);

  try {
    // Generate version string
    const version = `v${Date.now()}-e${config.episodes}`;

    // Create model record
    const modelRecord = await mlModelService.createModel(userId, {
      modelType: 'PPO',
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
      },
      notes: 'Training started',
    });

    console.log(`[TrainMLModel] Created model record: ${modelRecord._id}`);

    // Prepare training data
    let historicalData: Array<{ price: number; volume: number; volatility: number }> | undefined;
    if (config.useHistoricalData) {
      historicalData = await prepareHistoricalData(userId);
      if (historicalData.length === 0) {
        historicalData = undefined; // Fall back to synthetic
      }
    }

    // Create PPO agent
    const agent = new PPOAgent(config.stateDim, config.actionDim, {
      learningRate: config.learningRate,
      gamma: config.gamma,
      epsilon: config.epsilon,
    });

    // Train the agent
    const startTime = Date.now();
    const result = await agent.train(config.episodes, historicalData);
    const trainingDuration = Date.now() - startTime;

    // Get agent stats
    const stats = agent.getStats();

    // Update model record
    await mlModelService.completeTraining(modelRecord._id, {
      avgReward: result.avgReward,
      episodeRewards: result.episodeRewards,
      trainingDuration,
      actorParams: stats.actorParams,
      criticParams: stats.criticParams,
    });

    console.log('[TrainMLModel] ===== Training Complete =====');
    console.log(`[TrainMLModel] Model ID: ${modelRecord._id}`);
    console.log(`[TrainMLModel] Version: ${version}`);
    console.log(`[TrainMLModel] Episodes: ${config.episodes}`);
    console.log(`[TrainMLModel] Average Reward: ${result.avgReward.toFixed(2)}`);
    console.log(`[TrainMLModel] Training Duration: ${(trainingDuration / 1000).toFixed(1)}s`);
    console.log(`[TrainMLModel] Actor Parameters: ${stats.actorParams}`);
    console.log(`[TrainMLModel] Critic Parameters: ${stats.criticParams}`);
    console.log(`[TrainMLModel] Total Parameters: ${stats.actorParams + stats.criticParams}`);
    console.log('[TrainMLModel] ==================================');

    // Optionally save model to disk (commented out for MVP)
    // const modelPath = `./ml_models/${userId}/${version}`;
    // await agent.saveModel(modelPath);
    // console.log(`[TrainMLModel] Model saved to ${modelPath}`);
  } catch (error) {
    console.error('[TrainMLModel] Training failed:', error);
    throw error;
  }
}

/**
 * Main execution
 */
async function main() {
  try {
    console.log('[TrainMLModel] ===== ML Model Training Script =====');

    // Connect to database
    await connectDB();

    // Get user (use first user or specify email)
    const userEmail = process.argv[2] || 'admin@binancebot.com';
    const user = await User.findOne({ email: userEmail });

    if (!user) {
      console.error(`[TrainMLModel] User not found: ${userEmail}`);
      process.exit(1);
    }

    console.log(`[TrainMLModel] Training model for user: ${user.email}`);

    // Training configuration
    const config: TrainingConfig = {
      episodes: parseInt(process.argv[3]) || 1000, // Default 1000 episodes
      stateDim: 5, // [price, volume, volatility, sentiment, position]
      actionDim: 3, // [hold, buy, sell]
      learningRate: 0.0003,
      gamma: 0.99,
      epsilon: 0.2,
      useHistoricalData: process.argv[4] === 'historical', // Use 'historical' arg to use real data
    };

    // Train the model
    await trainModel(user._id, config);

    console.log('[TrainMLModel] ===== Training Complete =====');
    process.exit(0);
  } catch (error) {
    console.error('[TrainMLModel] Fatal error:', error);
    process.exit(1);
  }
}

// Execute if run directly
if (require.main === module) {
  main();
}

export { trainModel, prepareHistoricalData };
