import '../config/database';
import binanceService from '../services/binanceService';
import { connectDB } from '../config/database';

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
  data?: unknown;
}

const results: TestResult[] = [];

/**
 * Add test result
 */
function addResult(name: string, passed: boolean, message: string, data?: unknown) {
  results.push({ name, passed, message, data });
  const icon = passed ? '✅' : '❌';
  console.log(`${icon} ${name}: ${message}`);
  if (data) {
    console.log('   Data:', JSON.stringify(data, null, 2));
  }
}

/**
 * Test 1: Check if API credentials are configured
 */
async function testCredentialsConfigured() {
  try {
    const isConfigured = binanceService.isConfigured();
    if (isConfigured) {
      addResult(
        'API Credentials',
        true,
        'Binance.US API credentials are configured'
      );
    } else {
      addResult(
        'API Credentials',
        false,
        'Binance.US API credentials are NOT configured. Please set BINANCE_US_API_KEY and BINANCE_US_API_SECRET in .env file'
      );
    }
  } catch (error) {
    addResult('API Credentials', false, `Error: ${error}`);
  }
}

/**
 * Test 2: Test API connectivity (ping)
 */
async function testPing() {
  try {
    console.log('\n[Test] Testing API connectivity...');
    const success = await binanceService.ping();
    if (success) {
      addResult('API Ping', true, 'Successfully connected to Binance.US API');
    } else {
      addResult('API Ping', false, 'Failed to connect to Binance.US API');
    }
  } catch (error) {
    addResult('API Ping', false, `Error: ${error}`);
  }
}

/**
 * Test 3: Get server time
 */
async function testServerTime() {
  try {
    console.log('\n[Test] Fetching server time...');
    const serverTime = await binanceService.getServerTime();
    const localTime = Date.now();
    const timeDiff = Math.abs(serverTime - localTime);

    addResult(
      'Server Time',
      true,
      `Server time: ${new Date(serverTime).toISOString()}, Time diff: ${timeDiff}ms`,
      { serverTime, localTime, timeDiff }
    );

    if (timeDiff > 1000) {
      console.warn('⚠️  Warning: Time difference > 1 second. This may cause signature errors.');
    }
  } catch (error) {
    addResult('Server Time', false, `Error: ${error}`);
  }
}

/**
 * Test 4: Get ticker data for BTCUSDT
 */
async function testGetTicker() {
  try {
    console.log('\n[Test] Fetching ticker data for BTCUSDT...');
    const ticker = await binanceService.getTicker('BTCUSDT');

    addResult(
      'Get Ticker',
      true,
      `BTCUSDT - Price: $${parseFloat(ticker.lastPrice).toFixed(2)}, Volume: $${(parseFloat(ticker.quoteVolume) / 1e6).toFixed(2)}M`,
      {
        lastPrice: ticker.lastPrice,
        volume: ticker.volume,
        quoteVolume: ticker.quoteVolume,
        bidPrice: ticker.bidPrice,
        askPrice: ticker.askPrice,
      }
    );
  } catch (error) {
    addResult('Get Ticker', false, `Error: ${error}`);
  }
}

/**
 * Test 5: Get klines data
 */
async function testGetKlines() {
  try {
    console.log('\n[Test] Fetching klines data for BTCUSDT (15m, 100 bars)...');
    const klines = await binanceService.getKlines('BTCUSDT', '15m', 100);

    if (klines.length > 0) {
      const latestKline = klines[klines.length - 1];
      addResult(
        'Get Klines',
        true,
        `Fetched ${klines.length} klines. Latest close: $${parseFloat(latestKline.close).toFixed(2)}`,
        {
          count: klines.length,
          latestClose: latestKline.close,
          latestVolume: latestKline.volume,
        }
      );
    } else {
      addResult('Get Klines', false, 'No klines data returned');
    }
  } catch (error) {
    addResult('Get Klines', false, `Error: ${error}`);
  }
}

/**
 * Test 6: Calculate ATR
 */
async function testCalculateATR() {
  try {
    console.log('\n[Test] Calculating ATR for BTCUSDT...');
    const klines = await binanceService.getKlines('BTCUSDT', '15m', 100);
    const atr = binanceService.calculateATR(klines, 14);

    addResult(
      'Calculate ATR',
      true,
      `ATR(14) for BTCUSDT: $${atr.toFixed(2)}`,
      { atr: atr.toFixed(2) }
    );
  } catch (error) {
    addResult('Calculate ATR', false, `Error: ${error}`);
  }
}

/**
 * Test 7: Calculate VWAP
 */
async function testCalculateVWAP() {
  try {
    console.log('\n[Test] Calculating VWAP for BTCUSDT...');
    const klines = await binanceService.getKlines('BTCUSDT', '15m', 28);
    const vwap = binanceService.calculateVWAP(klines);

    addResult(
      'Calculate VWAP',
      true,
      `VWAP for BTCUSDT: $${vwap.toFixed(2)}`,
      { vwap: vwap.toFixed(2) }
    );
  } catch (error) {
    addResult('Calculate VWAP', false, `Error: ${error}`);
  }
}

/**
 * Test 8: Get order book depth
 */
async function testGetOrderBookDepth() {
  try {
    console.log('\n[Test] Fetching order book depth for BTCUSDT...');
    const depth = await binanceService.getOrderBookDepth('BTCUSDT', 5);

    if (depth.bids.length > 0 && depth.asks.length > 0) {
      const bestBid = parseFloat(depth.bids[0][0]);
      const bestAsk = parseFloat(depth.asks[0][0]);
      const spread = bestAsk - bestBid;
      const spreadBps = (spread / bestBid) * 10000;

      addResult(
        'Get Order Book',
        true,
        `Best Bid: $${bestBid.toFixed(2)}, Best Ask: $${bestAsk.toFixed(2)}, Spread: ${spreadBps.toFixed(2)} bps`,
        {
          bestBid,
          bestAsk,
          spread: spread.toFixed(2),
          spreadBps: spreadBps.toFixed(2),
        }
      );
    } else {
      addResult('Get Order Book', false, 'No order book data returned');
    }
  } catch (error) {
    addResult('Get Order Book', false, `Error: ${error}`);
  }
}

/**
 * Test 9: Get exchange info and symbol precision
 */
async function testGetExchangeInfo() {
  try {
    console.log('\n[Test] Fetching exchange info...');
    const exchangeInfo = await binanceService.getExchangeInfo();

    if (exchangeInfo.symbols && exchangeInfo.symbols.length > 0) {
      const symbolCount = exchangeInfo.symbols.length;
      const tradingSymbols = exchangeInfo.symbols.filter(s => s.status === 'TRADING').length;

      addResult(
        'Get Exchange Info',
        true,
        `Found ${symbolCount} symbols (${tradingSymbols} trading)`,
        { totalSymbols: symbolCount, tradingSymbols }
      );
    } else {
      addResult('Get Exchange Info', false, 'No symbols returned');
    }
  } catch (error) {
    addResult('Get Exchange Info', false, `Error: ${error}`);
  }
}

/**
 * Test 10: Get symbol precision for BTCUSDT
 */
async function testGetSymbolPrecision() {
  try {
    console.log('\n[Test] Getting symbol precision for BTCUSDT...');
    const precision = await binanceService.getSymbolPrecision('BTCUSDT');

    if (precision) {
      addResult(
        'Get Symbol Precision',
        true,
        `BTCUSDT - Price: ${precision.pricePrecision} decimals, Qty: ${precision.quantityPrecision} decimals, Min Notional: $${precision.minNotional}`,
        precision
      );
    } else {
      addResult('Get Symbol Precision', false, 'Symbol not found');
    }
  } catch (error) {
    addResult('Get Symbol Precision', false, `Error: ${error}`);
  }
}

/**
 * Test 11: Test quantity adjustment
 */
async function testQuantityAdjustment() {
  try {
    console.log('\n[Test] Testing quantity adjustment...');
    const precision = await binanceService.getSymbolPrecision('BTCUSDT');

    if (!precision) {
      addResult('Quantity Adjustment', false, 'Could not get precision');
      return;
    }

    const testQty = 0.0123456789;
    const adjusted = binanceService.adjustQuantity(testQty, precision);

    addResult(
      'Quantity Adjustment',
      true,
      `Adjusted ${testQty} to ${adjusted} (step: ${precision.stepSize})`,
      { original: testQty, adjusted, stepSize: precision.stepSize }
    );
  } catch (error) {
    addResult('Quantity Adjustment', false, `Error: ${error}`);
  }
}

/**
 * Test 12: Test price adjustment
 */
async function testPriceAdjustment() {
  try {
    console.log('\n[Test] Testing price adjustment...');
    const precision = await binanceService.getSymbolPrecision('BTCUSDT');

    if (!precision) {
      addResult('Price Adjustment', false, 'Could not get precision');
      return;
    }

    const testPrice = 43256.789123;
    const adjusted = binanceService.adjustPrice(testPrice, precision);

    addResult(
      'Price Adjustment',
      true,
      `Adjusted $${testPrice} to $${adjusted} (precision: ${precision.pricePrecision} decimals)`,
      { original: testPrice, adjusted, pricePrecision: precision.pricePrecision }
    );
  } catch (error) {
    addResult('Price Adjustment', false, `Error: ${error}`);
  }
}

/**
 * Test 13: Test order validation
 */
async function testOrderValidation() {
  try {
    console.log('\n[Test] Testing order validation...');
    const precision = await binanceService.getSymbolPrecision('BTCUSDT');

    if (!precision) {
      addResult('Order Validation', false, 'Could not get precision');
      return;
    }

    // Test valid order
    const validOrder = {
      symbol: 'BTCUSDT',
      quantity: 0.001,
      price: 43000,
      precision,
    };

    const validResult = binanceService.validateOrder(validOrder);

    // Test invalid order (too small notional)
    const invalidOrder = {
      symbol: 'BTCUSDT',
      quantity: 0.0001,
      price: 43000,
      precision,
    };

    const invalidResult = binanceService.validateOrder(invalidOrder);

    addResult(
      'Order Validation',
      validResult.valid && !invalidResult.valid,
      `Valid order: ${validResult.valid}, Invalid order: ${!invalidResult.valid} (${invalidResult.reason})`,
      { validResult, invalidResult }
    );
  } catch (error) {
    addResult('Order Validation', false, `Error: ${error}`);
  }
}

/**
 * Test 14: Get average price
 */
async function testGetAveragePrice() {
  try {
    console.log('\n[Test] Getting average price for BTCUSDT...');
    const avgPrice = await binanceService.getAveragePrice('BTCUSDT');

    addResult(
      'Get Average Price',
      true,
      `BTCUSDT average price: $${parseFloat(avgPrice.price).toFixed(2)}`,
      { price: avgPrice.price }
    );
  } catch (error) {
    addResult('Get Average Price', false, `Error: ${error}`);
  }
}

/**
 * Test 15: Test authenticated endpoints (requires API keys)
 */
async function testAuthenticatedEndpoints() {
  if (!binanceService.isConfigured()) {
    addResult(
      'Authenticated Endpoints',
      false,
      'Skipped - API credentials not configured'
    );
    return;
  }

  try {
    console.log('\n[Test] Testing authenticated endpoints...');

    // Test getting account info
    const accountInfo = await binanceService.getAccountInfo();

    if (accountInfo.balances) {
      const nonZeroBalances = accountInfo.balances.filter(
        b => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0
      );

      addResult(
        'Get Account Info',
        true,
        `Account has ${nonZeroBalances.length} assets with balance`,
        {
          totalBalances: accountInfo.balances.length,
          nonZeroBalances: nonZeroBalances.length,
          sampleBalances: nonZeroBalances.slice(0, 3).map(b => ({
            asset: b.asset,
            free: b.free,
            locked: b.locked,
          })),
        }
      );
    } else {
      addResult('Get Account Info', false, 'No balances returned');
    }

    // Test getting open orders
    const openOrders = await binanceService.getOpenOrders();
    addResult(
      'Get Open Orders',
      true,
      `Found ${openOrders.length} open orders`,
      { count: openOrders.length }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('API-key') || errorMessage.includes('Signature')) {
      addResult(
        'Authenticated Endpoints',
        false,
        `Authentication failed: ${errorMessage}. Please verify your API credentials.`
      );
    } else {
      addResult('Authenticated Endpoints', false, `Error: ${errorMessage}`);
    }
  }
}

/**
 * Print summary
 */
function printSummary() {
  console.log('\n' + '='.repeat(80));
  console.log('TEST SUMMARY');
  console.log('='.repeat(80));

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total = results.length;

  console.log(`Total Tests: ${total}`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`Success Rate: ${((passed / total) * 100).toFixed(1)}%`);

  if (failed > 0) {
    console.log('\nFailed Tests:');
    results
      .filter(r => !r.passed)
      .forEach(r => {
        console.log(`  ❌ ${r.name}: ${r.message}`);
      });
  }

  console.log('='.repeat(80));
}

/**
 * Main test runner
 */
async function runAllTests() {
  console.log('='.repeat(80));
  console.log('BINANCE.US API INTEGRATION TEST SUITE');
  console.log('='.repeat(80));
  console.log('This script tests the Binance.US API integration without placing real orders.\n');

  try {
    // Connect to database
    console.log('[Setup] Connecting to database...');
    await connectDB();
    console.log('✅ Database connected\n');

    // Run tests
    await testCredentialsConfigured();
    await testPing();
    await testServerTime();
    await testGetTicker();
    await testGetKlines();
    await testCalculateATR();
    await testCalculateVWAP();
    await testGetOrderBookDepth();
    await testGetExchangeInfo();
    await testGetSymbolPrecision();
    await testQuantityAdjustment();
    await testPriceAdjustment();
    await testOrderValidation();
    await testGetAveragePrice();
    await testAuthenticatedEndpoints();

    // Print summary
    printSummary();

    process.exit(results.every(r => r.passed) ? 0 : 1);
  } catch (error) {
    console.error('Fatal error during test execution:', error);
    process.exit(1);
  }
}

// Run tests
runAllTests();
