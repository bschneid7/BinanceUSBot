#!/usr/bin/env tsx

/**
 * Cron job to stake idle assets
 *
 * Run schedule: Hourly (0 * * * *)
 *
 * This script:
 * 1. Identifies idle USDT reserves above target (30%)
 * 2. Stakes excess reserves to earn yield
 * 3. Logs staking transactions for tax purposes
 */

import '../server/config/database';
import BotState from '../server/models/BotState';
import BotConfig from '../server/models/BotConfig';
import Alert from '../server/models/Alert';
import { connectDB } from '../server/config/database';

interface StakingResult {
  userId: string;
  stakedAmount: number;
  asset: string;
  apr: number;
  success: boolean;
}

/**
 * Mock staking function (replace with actual Binance staking API)
 */
async function stakeAsset(asset: string, amount: number): Promise<{
  success: boolean;
  transactionId: string;
  apr: number;
}> {
  console.log(`[StakeIdle] Staking ${amount} ${asset}...`);

  // In production, call Binance staking API here
  // Example: binance.staking.subscribe({ asset, amount, type: 'FLEXIBLE' })

  // Mock successful staking
  return {
    success: true,
    transactionId: `STAKE-${Date.now()}`,
    apr: 0.05, // 5% APR mock
  };
}

/**
 * Calculate stakeable amount for a user
 */
async function calculateStakeableAmount(
  userId: string,
  equity: number,
  reserveTarget: number
): Promise<number> {
  try {
    // Get current USDT balance
    // In production, fetch from Binance API
    const usdtBalance = equity * 0.35; // Mock: 35% in USDT

    // Calculate reserve requirement
    const reserveRequired = equity * reserveTarget;

    // Stakeable amount = excess above reserve target
    const stakeableAmount = Math.max(0, usdtBalance - reserveRequired);

    console.log(`[StakeIdle] User ${userId}: Equity=$${equity}, USDT=$${usdtBalance.toFixed(2)}, Reserve Required=$${reserveRequired.toFixed(2)}, Stakeable=$${stakeableAmount.toFixed(2)}`);

    return stakeableAmount;
  } catch (error) {
    console.error('[StakeIdle] Error calculating stakeable amount:', error);
    return 0;
  }
}

/**
 * Stake idle assets for a single user
 */
async function stakeIdleForUser(userId: string): Promise<StakingResult | null> {
  try {
    // Get bot state and config
    const botState = await BotState.findOne({ userId });
    const botConfig = await BotConfig.findOne({ userId });

    if (!botState || !botConfig) {
      console.log(`[StakeIdle] No bot state/config found for user ${userId}`);
      return null;
    }

    // Check if staking is enabled
    if (!process.env.STAKING_ENABLED || process.env.STAKING_ENABLED !== 'true') {
      console.log('[StakeIdle] Staking is disabled');
      return null;
    }

    // Calculate stakeable amount
    const stakeableAmount = await calculateStakeableAmount(
      userId,
      botState.equity,
      botConfig.reserve.target_pct
    );

    // Only stake if amount is significant (> $50)
    if (stakeableAmount < 50) {
      console.log(`[StakeIdle] Stakeable amount too small: $${stakeableAmount.toFixed(2)}`);
      return null;
    }

    // Stake the asset
    const result = await stakeAsset('USDT', stakeableAmount);

    if (result.success) {
      // Create alert for successful staking
      await Alert.create({
        userId,
        level: 'INFO',
        type: 'STAKING',
        message: `Staked ${stakeableAmount.toFixed(2)} USDT at ${(result.apr * 100).toFixed(2)}% APR`,
        timestamp: new Date(),
      });

      console.log(`[StakeIdle] Successfully staked ${stakeableAmount.toFixed(2)} USDT for user ${userId}`);

      return {
        userId,
        stakedAmount: stakeableAmount,
        asset: 'USDT',
        apr: result.apr,
        success: true,
      };
    }

    return null;
  } catch (error) {
    console.error(`[StakeIdle] Error staking for user ${userId}:`, error);

    // Create error alert
    await Alert.create({
      userId,
      level: 'ERROR',
      type: 'SYSTEM',
      message: `Failed to stake idle assets: ${error}`,
      timestamp: new Date(),
    }).catch((err) => console.error('[StakeIdle] Error creating alert:', err));

    return null;
  }
}

/**
 * Main function
 */
async function main() {
  console.log('========================================');
  console.log('Stake Idle Assets Cron Job');
  console.log(`Started at: ${new Date().toISOString()}`);
  console.log('========================================\n');

  try {
    // Connect to database
    await connectDB();
    console.log('[StakeIdle] Connected to database\n');

    // Get all active bot states
    const botStates = await BotState.find({ isRunning: true });
    console.log(`[StakeIdle] Found ${botStates.length} active bots\n`);

    const results: StakingResult[] = [];

    // Process each user
    for (const state of botStates) {
      const result = await stakeIdleForUser(state.userId.toString());
      if (result) {
        results.push(result);
      }
    }

    // Summary
    console.log('\n========================================');
    console.log('Staking Summary');
    console.log('========================================');
    console.log(`Total users processed: ${botStates.length}`);
    console.log(`Successful stakes: ${results.length}`);

    if (results.length > 0) {
      const totalStaked = results.reduce((sum, r) => sum + r.stakedAmount, 0);
      console.log(`Total amount staked: $${totalStaked.toFixed(2)}`);

      results.forEach((r, i) => {
        console.log(`  ${i + 1}. User ${r.userId}: $${r.stakedAmount.toFixed(2)} ${r.asset} @ ${(r.apr * 100).toFixed(2)}% APR`);
      });
    }

    console.log(`\nCompleted at: ${new Date().toISOString()}`);
    console.log('========================================\n');

    process.exit(0);
  } catch (error) {
    console.error('\n[StakeIdle] Fatal error:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

export { stakeIdleForUser, calculateStakeableAmount };
