#!/bin/bash
# Custom Bot Reset Script for Binance.US Account
# Based on actual account balances as of Nov 15, 2025
# Total Account Value: $14,225.42

set -e

echo "=========================================="
echo "  Binance Bot Reset & Sync Script"
echo "  Account Value: $14,225.42"
echo "=========================================="
echo ""

# Account breakdown from screenshots:
# - Total Balance: $14,225.42
# - Crypto Holdings: $3,489.77 (24.5%)
# - USD/USDT: $10,735.63 (75.5%)

echo "📊 Your Current Binance.US Holdings:"
echo "  • USD: $10,534.88 (74%)"
echo "  • USDT: $200.75 (1%)"
echo "  • BNB: $2,682.67 (19%)"
echo "  • ZEC: $643.51 (5%)"
echo "  • APE: $91.65 (1%)"
echo "  • MAGIC: $69.26 (0%)"
echo "  • Dust: BTC, ETH, SOL, ADA, XRP, DOGE (<$1 each)"
echo ""
echo "=========================================="
echo ""

read -p "⚠️  This will CLEAR all positions from the bot database. Continue? (yes/no): " confirm
if [ "$confirm" != "yes" ]; then
    echo "Aborted."
    exit 1
fi

echo ""
echo "🛑 Step 1: Stopping bot..."
cd /opt/binance-bot
docker compose down app

echo ""
echo "🗑️  Step 2: Clearing database..."
docker exec -i binance-bot-mongo mongosh \
  -u admin \
  -p changeThisPassword \
  --authenticationDatabase admin \
  binance_bot << 'MONGO'

print("Clearing positions...");
db.positions.deleteMany({});

print("Clearing orders...");
db.orders.deleteMany({});

print("Clearing tax lots...");
db.lots.deleteMany({});

print("Resetting bot state...");
db.botstates.updateOne({}, {
  $set: {
    currentEquity: 0,
    openPositions: 0,
    totalPnL: 0,
    lastUpdated: new Date()
  }
});

print("✅ Database cleared");
exit
MONGO

echo ""
echo "💰 Step 3: Setting account equity..."
echo ""
echo "Choose your reset strategy:"
echo ""
echo "  Option 1: Start with USD only ($10,735.63)"
echo "            - Sell all crypto manually on Binance.US first"
echo "            - Bot starts fresh with clean USD balance"
echo "            - Recommended for clean slate"
echo ""
echo "  Option 2: Track existing crypto holdings"
echo "            - Import BNB, ZEC, APE, MAGIC as positions"
echo "            - Bot will manage existing holdings"
echo "            - More complex setup"
echo ""
read -p "Enter choice (1 or 2): " choice

if [ "$choice" == "1" ]; then
    echo ""
    echo "⚠️  MANUAL STEP REQUIRED:"
    echo "1. Go to Binance.US and sell all crypto to USD:"
    echo "   - Sell 2.87 BNB → USD"
    echo "   - Sell 1.005 ZEC → USD"
    echo "   - Sell 260.75 APE → USD"
    echo "   - Sell 541.57 MAGIC → USD"
    echo ""
    echo "2. After selling, your USD balance should be ~$14,225"
    echo ""
    read -p "Press Enter after you've sold all crypto..."
    
    echo ""
    read -p "Enter your final USD balance: " usd_balance
    
    docker exec -i binance-bot-mongo mongosh \
      -u admin \
      -p changeThisPassword \
      --authenticationDatabase admin \
      binance_bot << MONGO
db.botstates.updateOne({}, {
  \$set: {
    startingEquity: $usd_balance,
    currentEquity: $usd_balance,
    equity: $usd_balance,
    openPositions: 0,
    totalPnL: 0,
    lastUpdated: new Date()
  }
});
print("✅ Set equity to \$$usd_balance");
db.botstates.findOne({}, {startingEquity: 1, currentEquity: 1, equity: 1});
exit
MONGO

elif [ "$choice" == "2" ]; then
    echo ""
    echo "Setting total equity to $14,225.42..."
    
    docker exec -i binance-bot-mongo mongosh \
      -u admin \
      -p changeThisPassword \
      --authenticationDatabase admin \
      binance_bot << 'MONGO'

// Set total equity
db.botstates.updateOne({}, {
  $set: {
    startingEquity: 14225.42,
    currentEquity: 14225.42,
    equity: 14225.42,
    openPositions: 4,
    totalPnL: 0,
    lastUpdated: new Date()
  }
});

// Get userId for position imports
const botState = db.botstates.findOne({});
const userId = botState.userId;

print("Importing existing positions...");

// Import BNB position
db.positions.insertOne({
  userId: userId,
  symbol: "BNBUSD",
  side: "LONG",
  entryPrice: 936.00,  // Approximate current price
  currentPrice: 936.00,
  quantity: 2.8696931,
  stopPrice: 890.00,  // 5% stop loss
  targetPrice: 1030.00,  // 10% target
  status: "OPEN",
  playbook: "IMPORTED",
  reason: "Existing holding from manual import",
  openedAt: new Date(),
  riskR: 0.5,
  notionalValue: 2682.67,
  unrealizedPnL: 0,
  realizedPnL: 0
});

// Import ZEC position
db.positions.insertOne({
  userId: userId,
  symbol: "ZECUSD",
  side: "LONG",
  entryPrice: 640.00,
  currentPrice: 640.00,
  quantity: 1.005,
  stopPrice: 608.00,
  targetPrice: 704.00,
  status: "OPEN",
  playbook: "IMPORTED",
  reason: "Existing holding from manual import",
  openedAt: new Date(),
  riskR: 0.3,
  notionalValue: 643.51,
  unrealizedPnL: 0,
  realizedPnL: 0
});

// Import APE position (only available balance)
db.positions.insertOne({
  userId: userId,
  symbol: "APEUSD",
  side: "LONG",
  entryPrice: 0.35,
  currentPrice: 0.35,
  quantity: 15.64593274,  // Available balance only
  stopPrice: 0.33,
  targetPrice: 0.39,
  status: "OPEN",
  playbook: "IMPORTED",
  reason: "Existing holding from manual import (available balance only)",
  openedAt: new Date(),
  riskR: 0.1,
  notionalValue: 5.47,
  unrealizedPnL: 0,
  realizedPnL: 0
});

// Import MAGIC position
db.positions.insertOne({
  userId: userId,
  symbol: "MAGICUSD",
  side: "LONG",
  entryPrice: 0.128,
  currentPrice: 0.128,
  quantity: 541.57373953,
  stopPrice: 0.122,
  targetPrice: 0.141,
  status: "OPEN",
  playbook: "IMPORTED",
  reason: "Existing holding from manual import",
  openedAt: new Date(),
  riskR: 0.1,
  notionalValue: 69.26,
  unrealizedPnL: 0,
  realizedPnL: 0
});

print("✅ Imported 4 positions");
print("");
print("Summary:");
db.botstates.findOne({}, {startingEquity: 1, currentEquity: 1, openPositions: 1});
print("");
print("Positions:");
db.positions.find({}, {symbol: 1, quantity: 1, entryPrice: 1, notionalValue: 1}).pretty();

exit
MONGO

else
    echo "Invalid choice. Aborted."
    exit 1
fi

echo ""
echo "✅ Step 4: Restoring normal risk limits..."
docker exec -i binance-bot-mongo mongosh \
  -u admin \
  -p changeThisPassword \
  --authenticationDatabase admin \
  binance_bot << 'MONGO'
db.botconfigs.updateOne({}, {
  $set: {
    "risk.max_r_per_trade": 1.5,
    "risk.max_open_R": 4
  }
});
print("✅ Risk limits restored");
exit
MONGO

echo ""
echo "🚀 Step 5: Starting bot..."
cd /opt/binance-bot
docker compose up -d app

echo ""
echo "⏳ Waiting for bot to initialize..."
sleep 15

echo ""
echo "=========================================="
echo "  ✅ Bot Reset Complete!"
echo "=========================================="
echo ""
echo "📊 Next Steps:"
echo "  1. Check dashboard: http://159.65.77.109:3001"
echo "  2. Monitor logs: docker compose logs app -f"
echo "  3. Verify equity matches your account"
echo ""
echo "🔍 Quick Health Check:"
docker compose logs app --tail=20 | grep -E "(Trading engine|equity|position)" || echo "  Bot is starting up..."
echo ""
echo "=========================================="
