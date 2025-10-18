#!/usr/bin/env ts-node

/**
 * Seed ML Training Data Script
 * Prepares and seeds training data for ML models from historical trades
 */

import dotenv from 'dotenv';
import { connectDB } from '../config/database';
import User from '../models/User';
import Trade from '../models/Trade';
import { trainModel, prepareHistoricalData } from './trainMLModel';

dotenv.config();

/**
 * Main execution
 */
async function main() {
  try {
    console.log('[SeedMLTrainingData] ===== ML Training Data Preparation =====');

    // Connect to database
    await connectDB();

    // Get all users with trades
    const users = await User.find();

    for (const user of users) {
      console.log(`[SeedMLTrainingData] Processing user: ${user.email}`);

      // Check if user has trades
      const tradeCount = await Trade.countDocuments({ userId: user._id });

      if (tradeCount < 50) {
        console.log(
          `[SeedMLTrainingData] User ${user.email} has only ${tradeCount} trades, skipping ML training`
        );
        continue;
      }

      console.log(`[SeedMLTrainingData] User ${user.email} has ${tradeCount} trades`);

      // Prepare historical data
      const historicalData = await prepareHistoricalData(user._id);

      console.log(
        `[SeedMLTrainingData] Prepared ${historicalData.length} historical data points for ${user.email}`
      );

      // Train a model with smaller episodes for seeding
      const config = {
        episodes: 500, // Smaller for seeding
        stateDim: 5,
        actionDim: 3,
        learningRate: 0.0003,
        gamma: 0.99,
        epsilon: 0.2,
        useHistoricalData: true,
      };

      console.log(`[SeedMLTrainingData] Training model for ${user.email}...`);
      await trainModel(user._id, config);

      console.log(`[SeedMLTrainingData] Model trained and saved for ${user.email}`);
    }

    console.log('[SeedMLTrainingData] ===== Data Preparation Complete =====');
    process.exit(0);
  } catch (error) {
    console.error('[SeedMLTrainingData] Fatal error:', error);
    process.exit(1);
  }
}

// Execute if run directly
if (require.main === module) {
  main();
}

export default main;
