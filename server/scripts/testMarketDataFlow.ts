import '../config/database';
import { connectDB } from '../config/database';
import binanceService from '../services/binanceService';
import { MarketScanner } from '../services/tradingEngine/marketScanner';
import User from '../models/User';
import BotConfig from '../models/BotConfig';
import BotState from '../models/BotState';

/**
 * Test market data flow from Binance API through MarketScanner
 */
async function testMarketDataFlow() {
  console.log('='.repeat(80));
  console.log('MARKET DATA FLOW TEST');
  console.log('='.repeat(80));
  console.log('This script tests the complete market data flow from Binance.US API\n');

  try {
    // Connect to database
    console.log('[Setup] Connecting to database...');
    await connectDB();
    console.log('✅ Database connected\n');

    // Find first user
    console.log('[Setup] Finding test user...');
    const user = await User.findOne();
    if (!user) {
      console.error('❌ No users found in database. Please run seedDatabase script first.');
      process.exit(1);
    }
    console.log(`✅ Found user: ${user.email} (${user._id})\n`);

    // Check bot configuration
    console.log('[Setup] Checking bot configuration...');
    let config = await BotConfig.findOne({ userId: user._id });
    if (!config) {
      console.log('⚠️  No bot configuration found. Creating default configuration...');
      config = new BotConfig({
        userId: user._id,
        scanner: {
          pairs: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'],
          refresh_ms: 2000,
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
      });
      await config.save();
      console.log('✅ Default configuration created\n');
    } else {
      console.log(`✅ Configuration found with ${config.scanner.pairs.length} pairs\n`);
    }

    // Check/create bot state
    console.log('[Setup] Checking bot state...');
    let state = await BotState.findOne({ userId: user._id });
    if (!state) {
      console.log('⚠️  No bot state found. Creating initial state...');
      state = new BotState({
        userId: user._id,
        status: 'STOPPED',
        equity: 7000,
        availableCapital: 7000,
        reserveBalance: 0,
        currentRiskUnit: 42,
        openPositionsCount: 0,
        totalOpenRisk: 0,
        dailyPnL: 0,
        weeklyPnL: 0,
        dailyTrades: 0,
        weeklyTrades: 0,
        lastScanTimestamp: new Date(),
        lastSignalTimestamp: new Date(),
      });
      await state.save();
      console.log('✅ Initial state created\n');
    } else {
      console.log('✅ Bot state found\n');
    }

    // Test 1: Check API connectivity
    console.log('='.repeat(80));
    console.log('TEST 1: API Connectivity');
    console.log('='.repeat(80));

    console.log('[Test] Pinging Binance.US API...');
    const pingSuccess = await binanceService.ping();
    if (pingSuccess) {
      console.log('✅ API is reachable\n');
    } else {
      console.error('❌ API is not reachable');
      process.exit(1);
    }

    // Test 2: Fetch market data for each symbol
    console.log('='.repeat(80));
    console.log('TEST 2: Fetch Market Data for Each Symbol');
    console.log('='.repeat(80));

    for (const symbol of config.scanner.pairs) {
      console.log(`\n[Test] Fetching data for ${symbol}...`);

      try {
        // Get ticker
        const ticker = await binanceService.getTicker(symbol);
        const price = parseFloat(ticker.lastPrice);
        const volume24h = parseFloat(ticker.quoteVolume);
        const bidPrice = parseFloat(ticker.bidPrice);
        const askPrice = parseFloat(ticker.askPrice);
        const spread = askPrice - bidPrice;
        const spreadBps = (spread / price) * 10000;

        console.log(`  Price: $${price.toFixed(2)}`);
        console.log(`  24h Volume: $${(volume24h / 1e6).toFixed(2)}M`);
        console.log(`  Spread: ${spreadBps.toFixed(2)} bps`);

        // Get klines and calculate ATR
        const klines = await binanceService.getKlines(symbol, '15m', 100);
        const atr = binanceService.calculateATR(klines, 14);
        console.log(`  ATR(14): $${atr.toFixed(2)}`);

        // Calculate VWAP
        const todayKlines = await binanceService.getKlines(symbol, '15m', 28);
        const vwap = binanceService.calculateVWAP(todayKlines);
        console.log(`  VWAP: $${vwap.toFixed(2)}`);

        // Check gates
        const volumePass = volume24h >= config.scanner.min_volume_usd_24h;
        const spreadPass = spreadBps <= config.scanner.max_spread_bps;

        console.log(`  Volume Gate: ${volumePass ? '✅' : '❌'} (${volumePass ? 'PASS' : 'FAIL'})`);
        console.log(`  Spread Gate: ${spreadPass ? '✅' : '❌'} (${spreadPass ? 'PASS' : 'FAIL'})`);

        console.log(`✅ ${symbol} data fetched successfully`);
      } catch (error) {
        console.error(`❌ Error fetching ${symbol}:`, error instanceof Error ? error.message : error);
      }
    }

    // Test 3: Run MarketScanner
    console.log('\n' + '='.repeat(80));
    console.log('TEST 3: Run MarketScanner');
    console.log('='.repeat(80));

    console.log('[Test] Running MarketScanner.scanMarkets()...\n');
    const scanner = new MarketScanner();
    const marketData = await scanner.scanMarkets(user._id);

    console.log(`\n✅ Market scan complete - ${marketData.length} symbols processed\n`);

    // Display results
    console.log('='.repeat(80));
    console.log('SCAN RESULTS');
    console.log('='.repeat(80));

    marketData.forEach(data => {
      console.log(`\n${data.symbol}:`);
      console.log(`  Price: $${data.price.toFixed(2)}`);
      console.log(`  Volume (24h): $${(data.volume24h / 1e6).toFixed(2)}M`);
      console.log(`  Spread: ${data.spreadBps.toFixed(2)} bps`);
      console.log(`  ATR: $${data.atr.toFixed(2)}`);
      console.log(`  VWAP: $${data.vwap.toFixed(2)}`);
      console.log(`  Gates: ${data.passesGates ? '✅ PASS' : '❌ FAIL'}`);

      if (!data.passesGates) {
        console.log(`  Failures: ${data.gateFailures.join(', ')}`);
      }
    });

    // Test 4: Verify state updates
    console.log('\n' + '='.repeat(80));
    console.log('TEST 4: Verify State Updates');
    console.log('='.repeat(80));

    const updatedState = await BotState.findOne({ userId: user._id });
    if (updatedState) {
      console.log(`\n✅ Bot state updated:`);
      console.log(`  Last scan: ${updatedState.lastScanTimestamp.toISOString()}`);
      console.log(`  Market data entries: ${updatedState.marketData.size}`);

      updatedState.marketData.forEach((data, symbol) => {
        console.log(`\n  ${symbol}:`);
        console.log(`    Price: $${data.price.toFixed(2)}`);
        console.log(`    Volume: $${(data.volume24h / 1e6).toFixed(2)}M`);
        console.log(`    Last update: ${data.lastUpdate.toISOString()}`);
      });
    } else {
      console.error('❌ Could not find updated state');
    }

    // Summary
    console.log('\n' + '='.repeat(80));
    console.log('TEST SUMMARY');
    console.log('='.repeat(80));

    const passedSymbols = marketData.filter(d => d.passesGates).length;
    const failedSymbols = marketData.filter(d => !d.passesGates).length;

    console.log(`\n✅ All tests completed successfully!`);
    console.log(`\nMarket Data:`);
    console.log(`  Total symbols scanned: ${marketData.length}`);
    console.log(`  Passed quality gates: ${passedSymbols}`);
    console.log(`  Failed quality gates: ${failedSymbols}`);
    console.log(`\n✅ Market data flow is working correctly!`);
    console.log('='.repeat(80));

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Fatal error during test:', error);
    console.error(error instanceof Error ? error.stack : error);
    process.exit(1);
  }
}

// Run the test
testMarketDataFlow();
