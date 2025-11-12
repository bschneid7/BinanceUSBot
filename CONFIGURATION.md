# BinanceUSBot - Current Configuration

**Last Updated:** November 11, 2025  
**Version:** 2.0.0  
**Status:** Production - Active Trading

---

## 📋 Table of Contents

- [Overview](#overview)
- [Signal Tier Configuration](#signal-tier-configuration)
- [Trading Parameters](#trading-parameters)
- [Risk Management](#risk-management)
- [Dashboard & UI](#dashboard--ui)
- [Equity Calculation](#equity-calculation)
- [Environment Variables](#environment-variables)
- [Deployment](#deployment)

---

## Overview

BinanceUSBot is currently configured for **aggressive spot trading** with TIER_3_AGGRESSIVE signal generation to maximize trading opportunities in ranging market conditions.

**Key Characteristics:**
- **Signal Tier:** TIER_3_AGGRESSIVE (1.5% impulse threshold)
- **Position Sizing:** 1.0% per trade (conservative for higher frequency)
- **Max Positions:** 15 concurrent (high diversification)
- **ML Confidence:** 30% minimum (captures more opportunities)
- **Dashboard:** Mobile-responsive with landscape support
- **Equity:** Dynamically calculated from Binance API

---

## Signal Tier Configuration

### Current Tier: TIER_3_AGGRESSIVE

**File:** `server/config/signalTierConfig.ts`

```typescript
enabledTiers: string[] = ['TIER_3_AGGRESSIVE']
```

### Tier Specifications

| Parameter | TIER_3_AGGRESSIVE | Notes |
|-----------|-------------------|-------|
| **Impulse Threshold** | 1.5% | Captures smaller market moves |
| **Position Size** | 1.0% per trade | Conservative for higher frequency |
| **Max Positions** | 15 | High diversification |
| **ML Confidence** | 30% minimum | Lower barrier = more signals |
| **Use Case** | Ranging markets | Optimized for 1-2% daily moves |

### Why TIER_3_AGGRESSIVE?

**Problem Solved:**
- Bot was generating 0 signals for 8 days with TIER_2_MODERATE (2.0% threshold)
- Market was showing 1-2% moves, below the 2.0% threshold
- Bot was healthy but rejecting all opportunities as "too small"

**Solution:**
- Lowered threshold from 2.0% to 1.5% (25% reduction)
- Reduced position size from 1.5% to 1.0% (more conservative)
- Increased max positions from 10 to 15 (better diversification)

**Result:**
- Bot now catches 1.5%+ market moves
- More frequent trading activity
- Better suited for current market conditions

### Hardcoded Threshold in PlaybookC

**File:** `server/services/tradingEngine/signalGenerator.ts`  
**Line:** ~508

```typescript
if (largestMove < 1.5) {  // Tier 3: Aggressive
  console.log(`[PlaybookC] ${symbol} - No impulse: ${largestMove.toFixed(2)}% < 1.5% (Tier 3)`);
  return null;
}
```

**Note:** The 1.5% threshold is currently hardcoded in PlaybookC strategy. Future improvement: make this dynamic based on `signalTierConfig.ts`.

---

## Trading Parameters

### Position Sizing

| Parameter | Value | Description |
|-----------|-------|-------------|
| **Base Position Size** | 1.0% | Percentage of equity per trade |
| **Max Positions** | 15 | Maximum concurrent positions |
| **Max Per Symbol** | 6 | Prevents over-concentration |
| **Position Rotation** | Enabled | Closes worst position for better opportunities |

### Risk Limits

| Parameter | Value | Description |
|-----------|-------|-------------|
| **Daily Loss Limit** | -2R | Kill-switch at -2% daily loss |
| **Weekly Loss Limit** | -6R | Kill-switch at -6% weekly loss |
| **Max Drawdown** | 30% | Hard cap on portfolio drawdown |
| **Reserve Requirement** | 20-30% | Maintains cash for opportunities |

### Execution Parameters

| Parameter | Value | Description |
|-----------|-------|-------------|
| **Order Type** | Maker-first | Prefers limit orders for fee savings |
| **Slippage Tolerance** | 0.5% | Maximum acceptable slippage |
| **Trailing Stop** | 0.5% | Trailing stop-buy for entries |
| **Stop Loss** | Dynamic | Based on ATR and volatility |

---

## Risk Management

### Kill-Switches

**Daily Kill-Switch:**
- Triggers at -2R (-2% of equity) daily loss
- Halts all trading for remainder of day
- Auto-recovers at midnight UTC

**Weekly Kill-Switch:**
- Triggers at -6R (-6% of equity) weekly loss
- Halts all trading for remainder of week
- Auto-recovers on Monday 00:00 UTC

### Position Management

**Smart Rotation:**
- Monitors all open positions
- Identifies worst-performing position
- Closes worst position when better opportunity arises
- Logs rotation decisions (not auto-executed yet)

**Auto-Close Stale Positions:**
- Positions held >72 hours are reviewed
- Closes if P&L < -1R (losing)
- Keeps if P&L > 0 (profitable)

---

## Dashboard & UI

### Mobile Optimization

**Status:** ✅ Fully Responsive (Deployed Nov 11, 2025)

**Features:**
- **Landscape Support:** Rotates smoothly with optimized layouts
- **Responsive Breakpoints:**
  - ≤480px: Extra small phones (portrait)
  - 481-768px: Large phones
  - 769-1024px: Tablets
  - Landscape mode: Special optimizations for rotated devices
- **Touch-Friendly:** 44px minimum tap targets (WCAG AAA)
- **Adaptive Typography:** Scales from 14px (mobile) to 16px (desktop)
- **Flexible Grids:** Auto-fit columns with 200px minimum

**Files:**
- `client/index.html` - Enhanced viewport meta tag
- `client/src/main.tsx` - Mobile CSS import
- `client/src/cleanmymac-mobile.css` - Responsive styles

### Desktop Dashboard

**URL:** http://binance-us-bot.duckdns.org

**Features:**
- Real-time account equity
- Daily P&L tracking
- Reserve level monitoring
- Open positions table
- Recent signals feed
- Performance metrics

---

## Equity Calculation

### Dynamic Calculation

**Status:** ✅ Fully Dynamic (Fixed Nov 11, 2025)

**Process (Every Scan Cycle):**

1. **Get Open Positions** from database
2. **Calculate Unrealized P&L**
   - Exclude positions with unreasonable prices (≤$0 or >$1M)
   - Sum remaining positions' unrealized_pnl
3. **Sync from Binance API** (if configured)
   - Query account balances
   - Calculate total portfolio value in USD
   - Trust API if 80%+ of assets priced
4. **Update Equity:** `equity = baseEquity + totalUnrealizedPnl`
5. **Save to Database**

### Unreasonable Price Handling

**File:** `server/services/tradingEngine/index.ts`  
**Lines:** 520-532

```typescript
openPositions?.forEach(position => {
  // Skip positions with $0 or missing current_price (likely delisted)
  if (!position.current_price || position.current_price <= 0 || position.current_price > 1000000) {
    logger.warn(`[TradingEngine] Excluding ${position.symbol} from equity calculation`);
    excludedPositions++;
    return;
  }
  totalUnrealizedPnl += position.unrealized_pnl ?? 0;
});
```

**Why This Matters:**
- Delisted tokens (APEUSD, ZECUSD) return $0 prices
- Without exclusion, they corrupt equity calculation
- Exclusion prevents negative equity issues

### Binance API Sync

**File:** `server/services/tradingEngine/index.ts`  
**Lines:** 542-625

**Sync Conditions:**
- ✅ API credentials configured
- ✅ Account info query succeeds
- ✅ At least 80% of assets successfully priced

**Improvements (Nov 11, 2025):**
- Lowered threshold from 90% to 80% pricing success
- Removed overly conservative safety check
- Added equity change logging (>10% changes)
- More responsive to actual account balance

---

## Environment Variables

### Required Variables

```env
# Server
PORT=3000
NODE_ENV=production

# Database
MONGO_URI=mongodb://admin:changeThisPassword@mongo:27017/binance_bot?authSource=admin

# Binance API
BINANCE_US_API_KEY=your_api_key_here
BINANCE_US_API_SECRET=your_api_secret_here

# Authentication
JWT_SECRET=your_jwt_secret_here
JWT_REFRESH_SECRET=your_jwt_refresh_secret_here
```

### Optional Variables

```env
# PPO Reinforcement Learning
PPO_EPISODES=1000
BUY_ALLOCATION=0.01          # 1% position size (TIER_3_AGGRESSIVE)
TRAILING_STOP=0.005          # 0.5% trailing stop
DRAWDOWN_CAP=0.3             # 30% max drawdown

# Features
STAKING_ENABLED=true
TAX_METHOD=HIFO

# Logging
LOG_LEVEL=info
```

---

## Deployment

### Current Deployment

**Platform:** Digital Ocean Droplet  
**Server:** 159.65.77.109  
**Domain:** binance-us-bot.duckdns.org  
**Container:** Docker Compose

### Docker Services

```yaml
services:
  mongo:
    image: mongo:7.0
    ports: ["27017:27017"]
    volumes: ["./data/mongodb:/data/db"]
    
  app:
    build: .
    ports: ["3000:3000"]
    depends_on: ["mongo"]
    environment:
      - MONGO_URI
      - BINANCE_US_API_KEY
      - BINANCE_US_API_SECRET
```

### Deployment Commands

```bash
# SSH to server
ssh root@159.65.77.109

# Navigate to project
cd /opt/binance-bot

# Pull latest changes
git pull origin main

# Rebuild and restart
docker compose down
docker compose up -d --build

# Check logs
docker logs binance-bot-app --follow

# Check status
docker compose ps
```

### Health Checks

```bash
# API Health
curl http://binance-us-bot.duckdns.org/api/ping

# Dashboard
curl -I http://binance-us-bot.duckdns.org

# Container Status
docker ps | grep binance-bot
```

---

## Recent Changes

### November 11, 2025

**1. TIER_3_AGGRESSIVE Enabled (Commit: 55d74d7)**
- Changed from TIER_2_MODERATE (2.0%) to TIER_3_AGGRESSIVE (1.5%)
- Updated PlaybookC impulse threshold to 1.5%
- Increased signal generation for ranging markets

**2. Mobile UX Optimization (Commit: d5c1ec0)**
- Added landscape orientation support
- Implemented responsive breakpoints
- Touch-friendly 44px tap targets
- Adaptive typography and grids

**3. Equity Calculation Fix (Commit: 7e7527f)**
- Exclude delisted tokens from equity calculation
- Improved Binance API sync (90% → 80% threshold)
- Removed overly conservative safety checks
- Added equity change logging

---

## Configuration Files

### Key Configuration Files

| File | Purpose | Current Settings |
|------|---------|-----------------|
| `server/config/signalTierConfig.ts` | Signal tier selection | TIER_3_AGGRESSIVE only |
| `server/services/tradingEngine/signalGenerator.ts` | Playbook strategies | 1.5% impulse threshold |
| `server/services/tradingEngine/index.ts` | Trading engine core | Dynamic equity, position limits |
| `client/src/cleanmymac-mobile.css` | Mobile responsive styles | Landscape + breakpoints |
| `docker-compose.yml` | Container orchestration | Mongo + App services |

### Configuration Hierarchy

1. **Environment Variables** (highest priority)
   - `BINANCE_US_API_KEY`, `MONGO_URI`, etc.
   
2. **Config Files**
   - `signalTierConfig.ts` - Tier selection
   - `tradingEngine/index.ts` - Risk limits
   
3. **Database (BotConfig)**
   - User-specific settings
   - API credentials
   - Feature flags
   
4. **Hardcoded Defaults** (lowest priority)
   - Fallback values in code

---

## Monitoring & Logs

### Key Logs to Watch

**Signal Generation:**
```
[PlaybookC] LINKUSDT - Impulse detected: 1.73% >= 1.5% (Tier 3)
[SignalGenerator] Generated 1 signals
```

**Equity Calculation:**
```
[TradingEngine] Excluding APEUSD from equity calculation (unreasonable price: $undefined)
[TradingEngine] Excluded 2 position(s) with unreasonable prices
[TradingEngine] ✅ Synced base equity from Binance API: $14429.94 (pricing success: 100.0%)
```

**Risk Management:**
```
[RiskEngine] Checking risk limits for ETHUSD - Risk: 1R, Notional: $3418
[RiskEngine] Found 10 open positions
[RiskEngine] Current open risk: 0.00R, Current exposure: $13912.03
```

**Kill-Switch:**
```
[TradingEngine] Daily loss limit reached: -2.05R
[TradingEngine] Kill-switch activated - trading halted
```

### Log Locations

**Docker Logs:**
```bash
docker logs binance-bot-app --follow
docker logs binance-bot-app --tail 100
```

**Log Files:**
```
/opt/binance-bot/logs/app.log
/opt/binance-bot/logs/error.log
```

---

## Troubleshooting

### Common Issues

**1. No Signals Generated**
- Check impulse threshold (should be 1.5%)
- Verify market moves are ≥1.5%
- Check ML confidence scores
- Review signal generation logs

**2. Negative Equity**
- Check for delisted tokens with $0 prices
- Verify Binance API sync is running
- Run manual equity reset script if needed

**3. Mobile Dashboard Not Responsive**
- Clear browser cache
- Verify `cleanmymac-mobile.css` is loaded
- Check viewport meta tag in `index.html`

**4. Trading Halted**
- Check for kill-switch activation
- Verify daily/weekly loss limits not exceeded
- Review error logs for exceptions

---

## Future Improvements

### Planned Enhancements

1. **Dynamic Tier Selection**
   - Auto-switch tiers based on market volatility
   - Use TIER_3_AGGRESSIVE in ranging markets
   - Use TIER_2_MODERATE in trending markets

2. **Automatic Position Cleanup**
   - Auto-close delisted positions after 7 days
   - Mark positions as "DELISTED" status

3. **Enhanced Mobile Table**
   - Card-based layout for positions table
   - Swipe actions for quick management

4. **Equity Change Alerts**
   - Send alerts when equity changes >20%
   - Daily equity summary emails

5. **Historical Equity Tracking**
   - Store equity snapshots for charting
   - Equity curve visualization

---

## Support & Resources

### Documentation
- **README.md** - Project overview and quick start
- **DEPLOYMENT.md** - Complete deployment guide
- **CONFIGURATION.md** - This file (current configuration)
- **EQUITY_FIX_SUMMARY.md** - Equity calculation fix details
- **TIER_3_AGGRESSIVE_DEPLOYMENT_SUMMARY.md** - Signal tier deployment
- **MOBILE_UX_OPTIMIZATION_SUMMARY.md** - Mobile optimization details

### GitHub Repository
- **URL:** https://github.com/bschneid7/BinanceUSBot
- **Branch:** main
- **Latest Commit:** 7e7527f (Equity calculation fix)

### Live Dashboard
- **URL:** http://binance-us-bot.duckdns.org
- **Status:** Active
- **Last Deployed:** November 11, 2025

---

**Configuration maintained by:** Manus AI Agent  
**Last reviewed:** November 11, 2025  
**Next review:** As needed for configuration changes
