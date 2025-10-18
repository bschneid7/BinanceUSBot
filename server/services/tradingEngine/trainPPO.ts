#!/usr/bin/env tsx

/**
 * Standalone PPO Training Script
 *
 * Trains the PPO agent offline using historical data or synthetic data
 * Run via: npm run train:ppo
 */

import dotenv from 'dotenv';
import PPOAgent from './PPOAgent';

// Load environment variables
dotenv.config();

const EPISODES = parseInt(process.env.PPO_EPISODES || '1000', 10);

async function main() {
  console.log('========================================');
  console.log('PPO Agent Training');
  console.log(`Episodes: ${EPISODES}`);
  console.log(`Started at: ${new Date().toISOString()}`);
  console.log('========================================\n');

  try {
    // Create PPO agent
    const agent = new PPOAgent(5, 3, {
      learningRate: 0.0003,
      gamma: 0.99,
      epsilon: 0.2,
      epochs: EPISODES,
    });

    console.log('[TrainPPO] Agent initialized');
    console.log(`[TrainPPO] State dimension: 5 (price, volume, volatility, sentiment, position)`);
    console.log(`[TrainPPO] Action dimension: 3 (hold, buy, sell)\n`);

    // Train agent
    console.log(`[TrainPPO] Starting training for ${EPISODES} episodes...\n`);

    const result = await agent.train(EPISODES);

    // Display results
    console.log('\n========================================');
    console.log('Training Complete');
    console.log('========================================');
    console.log(`Average Reward: ${result.avgReward.toFixed(4)}`);
    console.log(`Total Episodes: ${result.episodeRewards.length}`);
    console.log(`Best Episode: ${Math.max(...result.episodeRewards).toFixed(4)}`);
    console.log(`Worst Episode: ${Math.min(...result.episodeRewards).toFixed(4)}`);

    // Calculate statistics
    const sortedRewards = [...result.episodeRewards].sort((a, b) => a - b);
    const median = sortedRewards[Math.floor(sortedRewards.length / 2)];
    const stdDev = Math.sqrt(
      result.episodeRewards.reduce((sum, r) => sum + Math.pow(r - result.avgReward, 2), 0) / result.episodeRewards.length
    );

    console.log(`Median Reward: ${median.toFixed(4)}`);
    console.log(`Std Deviation: ${stdDev.toFixed(4)}`);

    // Show agent stats
    const stats = agent.getStats();
    console.log(`\nAgent Statistics:`);
    console.log(`  Actor Parameters: ${stats.actorParams.toLocaleString()}`);
    console.log(`  Critic Parameters: ${stats.criticParams.toLocaleString()}`);

    // Save model (optional)
    // Uncomment to save trained model
    // await agent.saveModel('./models/ppo');
    // console.log('\n[TrainPPO] Model saved to ./models/ppo/');

    console.log(`\nCompleted at: ${new Date().toISOString()}`);
    console.log('========================================\n');

    process.exit(0);
  } catch (error) {
    console.error('\n[TrainPPO] Fatal error:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

export default main;
