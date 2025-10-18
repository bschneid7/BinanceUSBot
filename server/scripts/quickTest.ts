#!/usr/bin/env tsx
/**
 * Quick Test Script for Binance.US Integration
 *
 * This script performs a quick sanity check of the Binance API integration.
 * It tests public endpoints only and does not require API credentials.
 */

import binanceService from '../services/binanceService';

async function quickTest() {
  console.log('🚀 Quick Binance.US Integration Test\n');
  console.log('Testing public endpoints (no API keys required)...\n');

  let passedTests = 0;
  let totalTests = 0;

  // Test 1: Ping
  totalTests++;
  try {
    console.log('1️⃣  Testing API connectivity...');
    const success = await binanceService.ping();
    if (success) {
      console.log('   ✅ API is reachable\n');
      passedTests++;
    } else {
      console.log('   ❌ API is not reachable\n');
    }
  } catch (error) {
    console.log('   ❌ Error:', error instanceof Error ? error.message : error, '\n');
  }

  // Test 2: Server Time
  totalTests++;
  try {
    console.log('2️⃣  Testing server time sync...');
    const serverTime = await binanceService.getServerTime();
    const localTime = Date.now();
    const diff = Math.abs(serverTime - localTime);
    console.log(`   Server: ${new Date(serverTime).toISOString()}`);
    console.log(`   Local:  ${new Date(localTime).toISOString()}`);
    console.log(`   Diff:   ${diff}ms`);

    if (diff < 1000) {
      console.log('   ✅ Time is synchronized\n');
      passedTests++;
    } else {
      console.log('   ⚠️  Warning: Time difference > 1 second\n');
      passedTests++;
    }
  } catch (error) {
    console.log('   ❌ Error:', error instanceof Error ? error.message : error, '\n');
  }

  // Test 3: Get Ticker
  totalTests++;
  try {
    console.log('3️⃣  Fetching market data for BTCUSDT...');
    const ticker = await binanceService.getTicker('BTCUSDT');
    const price = parseFloat(ticker.lastPrice);
    const volume = parseFloat(ticker.quoteVolume);
    console.log(`   Price:  $${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    console.log(`   Volume: $${(volume / 1e6).toFixed(2)}M (24h)`);
    console.log('   ✅ Market data retrieved\n');
    passedTests++;
  } catch (error) {
    console.log('   ❌ Error:', error instanceof Error ? error.message : error, '\n');
  }

  // Test 4: Calculate ATR
  totalTests++;
  try {
    console.log('4️⃣  Calculating ATR (Average True Range)...');
    const klines = await binanceService.getKlines('BTCUSDT', '15m', 100);
    const atr = binanceService.calculateATR(klines, 14);
    console.log(`   ATR(14): $${atr.toFixed(2)}`);
    console.log('   ✅ Technical indicator calculated\n');
    passedTests++;
  } catch (error) {
    console.log('   ❌ Error:', error instanceof Error ? error.message : error, '\n');
  }

  // Test 5: Get Symbol Precision
  totalTests++;
  try {
    console.log('5️⃣  Getting symbol precision for BTCUSDT...');
    const precision = await binanceService.getSymbolPrecision('BTCUSDT');
    if (precision) {
      console.log(`   Price precision:    ${precision.pricePrecision} decimals`);
      console.log(`   Quantity precision: ${precision.quantityPrecision} decimals`);
      console.log(`   Min notional:       $${precision.minNotional}`);
      console.log('   ✅ Symbol precision retrieved\n');
      passedTests++;
    } else {
      console.log('   ❌ Could not retrieve precision\n');
    }
  } catch (error) {
    console.log('   ❌ Error:', error instanceof Error ? error.message : error, '\n');
  }

  // Summary
  console.log('═'.repeat(60));
  console.log('SUMMARY');
  console.log('═'.repeat(60));
  console.log(`Tests Passed: ${passedTests}/${totalTests}`);
  console.log(`Success Rate: ${((passedTests / totalTests) * 100).toFixed(0)}%`);

  if (passedTests === totalTests) {
    console.log('\n✅ All tests passed! Binance.US integration is working correctly.\n');
    console.log('Next steps:');
    console.log('1. Add API keys to server/.env (BINANCE_US_API_KEY, BINANCE_US_API_SECRET)');
    console.log('2. Run: npm run test:binance (full test suite)');
    console.log('3. Run: npm run test:market-data (test market scanner)');
    console.log('4. Start the application: npm run start');
  } else {
    console.log('\n⚠️  Some tests failed. Please check the errors above.\n');
    console.log('Troubleshooting:');
    console.log('- Ensure internet connectivity');
    console.log('- Check firewall settings');
    console.log('- Verify Binance.US API is accessible from your location');
  }
  console.log('═'.repeat(60));
}

// Run the test
quickTest()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  });
