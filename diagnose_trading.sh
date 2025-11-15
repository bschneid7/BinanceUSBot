#!/bin/bash
echo "=========================================="
echo "BINANCE BOT TRADING DIAGNOSTIC"
echo "=========================================="
echo ""

echo "1. BOT STATUS:"
docker exec binance-bot-mongo mongosh -u admin -p changeThisPassword --authenticationDatabase admin binance_bot --quiet --eval "db.botstates.findOne({}, {isRunning: 1, status: 1, equity: 1, dailyPnl: 1})"
echo ""

echo "2. OPEN POSITIONS:"
docker exec binance-bot-mongo mongosh -u admin -p changeThisPassword --authenticationDatabase admin binance_bot --quiet --eval "db.positions.countDocuments({status: 'OPEN'})"
echo ""

echo "3. RECENT SIGNALS:"
docker exec binance-bot-mongo mongosh -u admin -p changeThisPassword --authenticationDatabase admin binance_bot --quiet --eval "db.signals.countDocuments({})"
echo ""

echo "4. TRADING SCHEDULER CODE:"
grep -A 5 "startTradingSchedule\|class TradingScheduler" server/services/tradingScheduler.ts | head -20
echo ""

echo "5. BOT CONTROL SERVICE - START FUNCTION:"
grep -A 30 "async startBot" server/services/botControlService.ts | head -35
echo ""

echo "6. SERVER.TS - TRADING INITIALIZATION:"
grep -n "tradingScheduler\|signalGenerator\|TradingScheduler" server/server.ts
echo ""

echo "7. RECENT LOGS (TRADING RELATED):"
docker compose logs app --tail=200 2>&1 | grep -i "trading\|signal\|scheduler" | tail -10
echo ""

echo "=========================================="
echo "DIAGNOSIS COMPLETE"
echo "=========================================="
