#!/usr/bin/env ts-node

/**
 * Train ML Model Script
 * Trains a PPO agent on historical market data and saves the model
 */

import dotenv from 'dotenv';
import mongoose from 'mongoose'; // Import mongoose
import { connectDB } from '../config/database';
import User from '../models/User';
import PPOAgent from '../services/tradingEngine/PPOAgent';
import mlModelService from '../services/mlModelService';
import historicalDataService from '../services/historicalDataService'; // Import historical data service
import { Types } from 'mongoose';

dotenv.config();

interface TrainingConfig {
  symbol: string; // Add symbol to train on
  startDate: string; // Add start date for historical data
  endDate: string; // Add end date for historical data
  interval: string; // Add interval for historical data
  episodes: number;
  stateDim: number;
  actionDim: number;
  learningRate: number;
  gamma: number;
  epsilon: number;
}

/**
 * Prepare historical training data using historicalDataService
 */
async function prepareHistoricalData(
  symbol: string,
  startDate: Date,
  endDate: Date,
  interval: string
): Promise<Array<{ price: number; volume: number; volatility: number }> | undefined> {
  console.log(`[TrainMLModel] Preparing historical data for ${symbol} from ${startDate.toISOString()} to ${endDate.toISOString()} (${interval})`);

  try {
    const candles = await historicalDataService.getCandles(symbol, interval, startDate, endDate);

    if (candles.length < 100) { // Need sufficient data
      console.warn(`[TrainMLModel] Insufficient historical data found (${candles.length} candles), falling back to synthetic data.`);
      return undefined; // Fall back to synthetic data if not enough candles
    }

    // Convert candle data to the format expected by PPOAgent.train
    // Calculate volatility (e.g., simple range percent)
    const historicalData = candles.map((candle, index, arr) => {
      let volatility = 0;
      if (candle.high > 0 && candle.low > 0 && candle.close > 0) {
           // Use high-low range as a simple volatility measure
           volatility = (candle.high - candle.low) / candle.close;
      } else if (index > 0) {
          // Fallback: use price change percentage if H/L/C are zero
          const prevClose = arr[index-1].close;
          if (prevClose > 0) {
              volatility = Math.abs(candle.close - prevClose) / prevClose;
          }
      }

      return {
        price: candle.close,
        volume: candle.volume,
        // Ensure volatility is non-negative and finite
        volatility: Math.max(0, Math.min(isFinite(volatility) ? volatility : 0, 1.0)), // Cap volatility at 100%
      };
    }).filter(data => isFinite(data.price) && isFinite(data.volume) && isFinite(data.volatility)); // Filter out any NaN/Infinity

    console.log(`[TrainMLModel] Prepared ${historicalData.length} data points from ${candles.length} candles.`);
    return historicalData;
  } catch (error) {
    console.error('[TrainMLModel] Error preparing historical data:', error);
    return undefined; // Fall back to synthetic data on error
  }
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
    const version = `v${Date.now()}-e${config.episodes}-${config.symbol}`;

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
      notes: `Training started for ${config.symbol} from ${config.startDate} to ${config.endDate}`,
    });

    console.log(`[TrainMLModel] Created model record: ${modelRecord._id}`);

    // Prepare training data using historical service
    let historicalData = await prepareHistoricalData(
      config.symbol,
      new Date(config.startDate),
      new Date(config.endDate),
      config.interval
    );

    if (!historicalData) {
      console.log('[TrainMLModel] Using synthetic data for training.');
    }

    // Create PPO agent
    const agent = new PPOAgent(config.stateDim, config.actionDim, {
      learningRate: config.learningRate, // Use config LR 
      gamma: config.gamma,
      epsilon: config.epsilon,
    });

    // Train the agent
    const startTime = Date.now();
    // PPOAgent.train expects specific data format or undefined for synthetic
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
    console.log(`[TrainMLModel] Symbol: ${config.symbol}`);
    console.log(`[TrainMLModel] Episodes: ${config.episodes}`);
    console.log(`[TrainMLModel] Average Reward: ${result.avgReward.toFixed(2)}`);
    console.log(`[TrainMLModel] Training Duration: ${(trainingDuration / 1000).toFixed(1)}s`);
    console.log(`[TrainMLModel] Actor Parameters: ${stats.actorParams}`);
    console.log(`[TrainMLModel] Critic Parameters: ${stats.criticParams}`);
    console.log(`[TrainMLModel] Total Parameters: ${stats.actorParams + stats.criticParams}`);
    console.log('[TrainMLModel] ==================================');

    // Optionally save model to disk (Ensure directory exists)
    // import fs from 'fs';
    // const modelPath = `./ml_models/${userId}/${version}`;
    // if (!fs.existsSync(modelPath)) {
    //   fs.mkdirSync(modelPath, { recursive: true });
    // }
    // await agent.saveModel(modelPath);
    // console.log(`[TrainMLModel] Model saved to ${modelPath}`);

  } catch (error) {
    console.error('[TrainMLModel] Training failed:', error);
    // Attempt to mark the model as failed in the database
     const modelRecordId = trainingJobs.get(userId.toString())?.modelId; // Assuming you have trainingJobs map
     if (modelRecordId) {
       try {
         await mlModelService.failTraining(new Types.ObjectId(modelRecordId), (error as Error).message);
       } catch (dbError) {
         console.error('[TrainMLModel] Failed to update model status after training error:', dbError);
       }
     }
    throw error; // Re-throw the error after attempting to mark as failed
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

    // Get user (use first user or specify email via command line)
    const userEmail = process.argv[2] || 'admin@tradingbot.com'; // Default user
    const user = await User.findOne({ email: userEmail });

    if (!user) {
      console.error(`[TrainMLModel] User not found: ${userEmail}`);
      process.exit(1);
    }

    console.log(`[TrainMLModel] Training model for user: ${user.email} (${user._id})`);

    // Training configuration from command line or defaults
    const config: TrainingConfig = {
      symbol: process.argv[3] || 'BTCUSDT', // e.g., BTCUSDT
      startDate: process.argv[4] || new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Default: 1 year ago
      endDate: process.argv[5] || new Date().toISOString().split('T')[0], // Default: Today
      interval: process.argv[6] || '1h', // Default: 1 hour candles
      episodes: parseInt(process.argv[7]) || 1000, // Default 1000 episodes
      stateDim: 5, // [price, volume, volatility, sentiment, position]
      actionDim: 3, // [hold, buy, sell]
      learningRate: 0.0003, // As per document 
      gamma: 0.99,
      epsilon: 0.2,
    };

    // Train the model
    await trainModel(user._id, config);

    console.log('[TrainMLModel] ===== Training Run Finished =====');
    await mongoose.disconnect(); // Disconnect mongoose
    process.exit(0);
  } catch (error) {
    console.error('[TrainMLModel] Fatal error:', error);
     await mongoose.disconnect().catch(err => console.error("Error disconnecting mongoose:", err)); // Ensure disconnect even on error
    process.exit(1);
  }
}

// Global map to track training jobs (similar to ppoRoutes.ts) - needed for failTraining call
const trainingJobs = new Map<string, { modelId?: string }>();

// Execute if run directly
if (require.main === module) {
  main();
}

export { trainModel, prepareHistoricalData }; // Keep exports if needed elsewhere
