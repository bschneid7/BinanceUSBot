# Binance.US API Integration

This document describes the Binance.US API integration for the BinanceUSBot trading system.

## Overview

The Binance.US API integration provides:
- **Real-time market data** (ticker, klines, order book depth)
- **Order execution** (place, cancel, query orders)
- **Account management** (balances, positions, trade history)
- **Technical indicators** (ATR, VWAP calculations)
- **Symbol precision management** (lot size, price filters, min notional)

## Configuration

### Environment Variables

Add the following to your `server/.env` file:

```env
BINANCE_US_API_KEY=your_api_key_here
BINANCE_US_API_SECRET=your_api_secret_here
BINANCE_US_BASE_URL=https://api.binance.us
```

### Getting API Keys

1. Create a Binance.US account at https://www.binance.us
2. Complete KYC verification
3. Navigate to API Management
4. Create a new API key with the following permissions:
   - **Enable Reading** ✓
   - **Enable Spot & Margin Trading** ✓
   - **Enable Withdrawals** ✗ (DO NOT enable for security)
5. Save your API Key and Secret Key securely
6. (Optional) Set IP restrictions for added security

### Security Best Practices

- **Never commit API keys to version control**
- **Use IP allowlisting** if your server has a static IP
- **Enable 2FA** on your Binance.US account
- **Regularly rotate API keys** (quarterly recommended)
- **Monitor API key usage** via Binance.US dashboard
- **DO NOT enable withdrawal permissions** on trading bot API keys

## Service Architecture

### BinanceService (`server/services/binanceService.ts`)

The core service that wraps the Binance.US REST API.

#### Key Methods

##### Public Endpoints (No Authentication Required)

```typescript
// Test connectivity
await binanceService.ping();

// Get server time (for clock sync)
const serverTime = await binanceService.getServerTime();

// Get ticker data
const ticker = await binanceService.getTicker('BTCUSDT');
// Returns: { lastPrice, volume, bidPrice, askPrice, ... }

// Get klines/candlestick data
const klines = await binanceService.getKlines('BTCUSDT', '15m', 100);
// Returns: Array of { openTime, open, high, low, close, volume, closeTime }

// Get order book depth
const depth = await binanceService.getOrderBookDepth('BTCUSDT', 20);
// Returns: { bids: [[price, qty], ...], asks: [[price, qty], ...] }

// Get exchange info and symbol rules
const exchangeInfo = await binanceService.getExchangeInfo();
// Returns: { symbols: [{ symbol, status, filters, ... }] }

// Get symbol precision and trading rules
const precision = await binanceService.getSymbolPrecision('BTCUSDT');
// Returns: { pricePrecision, quantityPrecision, minNotional, minQty, maxQty, stepSize }
```

##### Authenticated Endpoints (Require API Keys)

```typescript
// Get account information
const account = await binanceService.getAccountInfo();
// Returns: { balances: [{ asset, free, locked }] }

// Place a new order
const order = await binanceService.placeOrder({
  symbol: 'BTCUSDT',
  side: 'BUY',
  type: 'LIMIT',
  quantity: 0.001,
  price: 43000,
  timeInForce: 'GTC',
  newClientOrderId: 'myorder123' // optional
});
// Returns: { orderId, status, executedQty, fills, ... }

// Cancel an order
await binanceService.cancelOrder('BTCUSDT', orderId);

// Get order status
const orderStatus = await binanceService.getOrder('BTCUSDT', orderId);

// Get all open orders
const openOrders = await binanceService.getOpenOrders('BTCUSDT');

// Get my trades
const trades = await binanceService.getMyTrades('BTCUSDT', 500);
```

##### Technical Indicators

```typescript
// Calculate ATR (Average True Range)
const klines = await binanceService.getKlines('BTCUSDT', '15m', 100);
const atr = binanceService.calculateATR(klines, 14);
// Returns: ATR value in USD

// Calculate VWAP (Volume-Weighted Average Price)
const vwap = binanceService.calculateVWAP(klines);
// Returns: VWAP value in USD
```

##### Symbol Precision Management

```typescript
// Get symbol precision
const precision = await binanceService.getSymbolPrecision('BTCUSDT');

// Adjust quantity to meet exchange requirements
const adjustedQty = binanceService.adjustQuantity(0.0123456, precision);
// Returns: 0.01234 (rounded to stepSize)

// Adjust price to meet exchange requirements
const adjustedPrice = binanceService.adjustPrice(43256.789, precision);
// Returns: 43256.78 (rounded to pricePrecision)

// Validate order parameters
const validation = binanceService.validateOrder({
  symbol: 'BTCUSDT',
  quantity: 0.001,
  price: 43000,
  precision
});
// Returns: { valid: true } or { valid: false, reason: 'error message' }
```

## Market Scanner Integration

The `MarketScanner` service uses `binanceService` to scan all configured trading pairs:

```typescript
import { MarketScanner } from './services/tradingEngine/marketScanner';

const scanner = new MarketScanner();
const marketData = await scanner.scanMarkets(userId);

// Returns array of:
// {
//   symbol: 'BTCUSDT',
//   price: 43250.50,
//   volume24h: 15400000000,
//   spreadBps: 2.5,
//   bidPrice: 43249.00,
//   askPrice: 43251.00,
//   atr: 450.25,
//   vwap: 43200.00,
//   passesGates: true,
//   gateFailures: []
// }
```

The scanner applies quality gates:
- ✅ 24h volume ≥ $2M
- ✅ Spread ≤ 5 bps (normal) or 10 bps (events)
- ✅ Top-of-book depth ≥ $50k

## Testing

### Test 1: Binance API Integration Test

Tests all Binance service methods without placing real orders:

```bash
cd server
npm run test:binance
```

This will test:
- API credentials configuration
- Connectivity (ping)
- Server time sync
- Ticker data retrieval
- Klines/candlestick data
- ATR and VWAP calculations
- Order book depth
- Exchange info and symbol precision
- Quantity/price adjustment
- Order validation
- Authenticated endpoints (if keys configured)

### Test 2: Market Data Flow Test

Tests the complete flow from Binance API → MarketScanner → BotState:

```bash
cd server
npm run test:market-data
```

This will:
1. Connect to database
2. Find/create test user and bot configuration
3. Fetch market data for all configured symbols
4. Run the MarketScanner
5. Verify quality gates
6. Check BotState updates

## Error Handling

### Common Errors

#### 1. API Key Not Configured

```
Error: Binance API credentials not configured
```

**Solution:** Set `BINANCE_US_API_KEY` and `BINANCE_US_API_SECRET` in `.env`

#### 2. Invalid Signature

```
Error: Signature for this request is not valid.
```

**Causes:**
- Incorrect API secret
- System clock out of sync (>1 second difference)

**Solutions:**
- Verify API secret is correct
- Sync system clock: `sudo ntpdate -s time.nist.gov` (Linux/Mac)
- Check server time: `npm run test:binance` (shows time diff)

#### 3. API Key Permissions

```
Error: This request is not allowed with current API permissions.
```

**Solution:** Verify API key has "Spot & Margin Trading" enabled

#### 4. Rate Limiting

```
Error: Too many requests
```

**Solution:** Implement exponential backoff or reduce request frequency

#### 5. Invalid Symbol

```
Error: Invalid symbol.
```

**Solution:** Verify symbol format (e.g., `BTCUSDT`, not `BTC-USDT` or `BTC/USDT`)

#### 6. Insufficient Balance

```
Error: Account has insufficient balance for requested action.
```

**Solution:** Deposit funds or reduce order size

### Error Logging

All errors are logged with context:

```typescript
console.error('[BinanceService] Error fetching ticker for BTCUSDT:', error.response?.data || error.message);
```

Check server logs for detailed error information.

## Rate Limits

Binance.US enforces rate limits:
- **Weight-based limits:** 1200 request weight per minute
- **Order limits:** 50 orders per 10 seconds
- **Raw request limits:** 6100 requests per 5 minutes

The service automatically handles rate limiting by:
- Using batch requests where possible
- Caching exchange info and symbol precision
- Implementing request retry logic

## Production Checklist

Before running the bot in production:

- [ ] API keys configured in `.env`
- [ ] API key permissions verified (Reading + Trading only)
- [ ] IP allowlisting enabled (if applicable)
- [ ] 2FA enabled on Binance.US account
- [ ] System clock synchronized (NTP)
- [ ] Test scripts pass successfully
- [ ] Rate limiting configured appropriately
- [ ] Error monitoring and alerts set up
- [ ] Backup API keys stored securely
- [ ] API key rotation schedule established

## Monitoring

### Health Checks

```typescript
// Check if service is configured
const isConfigured = binanceService.isConfigured();

// Test connectivity
const isOnline = await binanceService.ping();

// Check server time sync
const serverTime = await binanceService.getServerTime();
const localTime = Date.now();
const timeDiff = Math.abs(serverTime - localTime);
// timeDiff should be < 1000ms
```

### Metrics to Monitor

- API response times
- API error rates
- Rate limit usage
- Order success/failure rates
- Slippage on executions
- Fill rates (maker vs taker)

## Support

For Binance.US API documentation:
- Official Docs: https://docs.binance.us/
- API Reference: https://github.com/binance-us/binance-official-api-docs

For bot-specific issues:
- Check server logs in `server/logs/`
- Run diagnostic tests: `npm run test:binance`
- Review this documentation

## Changelog

### v1.0.0 (2025-01-15)
- Initial Binance.US API integration
- Market data retrieval (ticker, klines, depth)
- Order execution (place, cancel, query)
- Technical indicators (ATR, VWAP)
- Symbol precision management
- Comprehensive test suite
