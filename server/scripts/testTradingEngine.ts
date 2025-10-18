import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDB } from '../config/database';
import tradingEngine from '../services/tradingEngine';
import User from '../models/User';
import BotConfig from '../models/BotConfig';
import BotState from '../models/BotState';

dotenv.config();

async function testTradingEngine() {
  try {
    console.log('===== Trading Engine Test =====\n');

    // Connect to database
    await connectDB();
    console.log('✅ Connected to database\n');

    // Find a test user
    const user = await User.findOne({ email: 'test@test.com' });
    if (!user) {
      console.error('❌ Test user not found. Run seedDatabase script first.');
      process.exit(1);
    }

    console.log(`✅ Found test user: ${user.email} (${user._id})\n`);

    // Ensure bot config exists
    let config = await BotConfig.findOne({ userId: user._id });
    if (!config) {
      console.log('Creating bot configuration...');
      config = await BotConfig.create({
        userId: user._id,
        botStatus: 'ACTIVE',
        scanner: {
          pairs: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'],
          refresh_ms: 5000, // 5 seconds for testing
          min_volume_usd_24h: 2000000,
          max_spread_bps: 5,
          max_spread_bps_event: 10,
          tob_min_depth_usd: 50000,
          pair_signal_cooldown_min: 15,
        },
        risk: {
          R_pct: 0.006,
          daily_stop_R: -2.0,
          weekly_stop_R: -6.0,
          max_open_R: 2.0,
          max_exposure_pct: 0.60,
          max_positions: 4,
          correlation_guard: true,
          slippage_guard_bps: 5,
          slippage_guard_bps_event: 10,
        },
        reserve: {
          target_pct: 0.30,
          floor_pct: 0.20,
          refill_from_profits_pct: 0.30,
        },
        playbook_A: {
          enable: true,
          volume_mult: 1.5,
          stop_atr_mult: 1.2,
          breakeven_R: 1.0,
          scale_R: 1.5,
          scale_pct: 0.5,
          trail_atr_mult: 1.0,
        },
        playbook_B: {
          enable: true,
          deviation_atr_mult: 2.0,
          stop_atr_mult: 0.8,
          time_stop_min: 90,
          target_R: 1.2,
          max_trades_per_session: 2,
        },
        playbook_C: {
          enable: true,
          event_window_min: 30,
          stop_atr_mult: 1.8,
          scale_1_R: 1.0,
          scale_1_pct: 0.33,
          scale_2_R: 2.0,
          scale_2_pct: 0.33,
          trail_atr_mult: 1.0,
        },
        playbook_D: {
          enable: true,
        },
      });
      console.log('✅ Created bot configuration\n');
    } else {
      console.log('✅ Bot configuration found\n');
    }

    // Ensure bot state exists
    let state = await BotState.findOne({ userId: user._id });
    if (!state) {
      console.log('Creating bot state...');
      state = await BotState.create({
        userId: user._id,
        isRunning: false,
        equity: 7000,
        currentR: 42,
        dailyPnl: 0,
        dailyPnlR: 0,
        weeklyPnl: 0,
        weeklyPnlR: 0,
      });
      console.log('✅ Created bot state\n');
    } else {
      console.log('✅ Bot state found\n');
    }

    // Test 1: Start engine
    console.log('Test 1: Starting trading engine...');
    await tradingEngine.start(user._id);
    let status = await tradingEngine.getStatus(user._id);
    console.log('✅ Engine started:', status);
    console.log('');

    // Wait for a few scans
    console.log('Waiting for 20 seconds to observe scan cycles...');
    await new Promise(resolve => setTimeout(resolve, 20000));

    // Test 2: Get status
    console.log('\nTest 2: Getting engine status...');
    status = await tradingEngine.getStatus(user._id);
    console.log('✅ Engine status:', status);
    console.log('');

    // Test 3: Stop engine
    console.log('Test 3: Stopping trading engine...');
    await tradingEngine.stop(user._id);
    status = await tradingEngine.getStatus(user._id);
    console.log('✅ Engine stopped:', status);
    console.log('');

    console.log('===== Test Complete =====');
    console.log('\nNOTE: If Binance API credentials are not configured, orders will be simulated.');
    console.log('To use real Binance.US API, set environment variables:');
    console.log('  - BINANCE_US_API_KEY');
    console.log('  - BINANCE_US_API_SECRET');
    console.log('  - BINANCE_US_BASE_URL (optional, defaults to https://api.binance.us)');

    process.exit(0);
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

testTradingEngine();
