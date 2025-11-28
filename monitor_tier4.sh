#!/bin/bash
#
# TIER_4 Performance Monitor
#
# Monitors TIER_4_ULTRA_AGGRESSIVE performance every 2 hours
# Checks average win rate and alerts if below 0.35%
#
# Usage: ./monitor_tier4.sh
# Cron: 0 */2 * * * /opt/binance-bot/monitor_tier4.sh
#

set -e

# Configuration
PROJECT_DIR="/opt/binance-bot"
LOG_DIR="/opt/binance-bot/tier4_monitoring"
LOG_FILE="${LOG_DIR}/tier4_performance.log"
ALERT_FILE="${LOG_DIR}/tier4_alerts.log"
THRESHOLD=0.35
SAMPLE_SIZE=10

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Create log directory if it doesn't exist
mkdir -p "$LOG_DIR"

# Timestamp
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

echo "=========================================" | tee -a "$LOG_FILE"
echo "TIER_4 Performance Check - $TIMESTAMP" | tee -a "$LOG_FILE"
echo "=========================================" | tee -a "$LOG_FILE"

# Check if bot is running
if ! docker compose -f "$PROJECT_DIR/docker-compose.yml" ps | grep -q "binance-bot-app.*Up"; then
    echo -e "${RED}ERROR: Bot is not running!${NC}" | tee -a "$LOG_FILE" "$ALERT_FILE"
    exit 1
fi

# Get recent logs with Tier4Monitor performance data
RECENT_LOGS=$(docker compose -f "$PROJECT_DIR/docker-compose.yml" logs --tail=500 app 2>/dev/null | grep "Tier4Monitor" | tail -20)

if [ -z "$RECENT_LOGS" ]; then
    echo -e "${YELLOW}WARNING: No Tier4Monitor logs found${NC}" | tee -a "$LOG_FILE"
    echo "This could mean:" | tee -a "$LOG_FILE"
    echo "  - TIER_4 is not active" | tee -a "$LOG_FILE"
    echo "  - Monitor hasn't run yet (waits for $SAMPLE_SIZE trades)" | tee -a "$LOG_FILE"
    echo "  - Bot just restarted" | tee -a "$LOG_FILE"
    exit 0
fi

# Extract latest performance check
LATEST_CHECK=$(echo "$RECENT_LOGS" | grep "Performance check" | tail -1)

if [ -z "$LATEST_CHECK" ]; then
    echo -e "${YELLOW}No performance data available yet${NC}" | tee -a "$LOG_FILE"
    echo "Waiting for $SAMPLE_SIZE closed trades..." | tee -a "$LOG_FILE"
    exit 0
fi

# Parse performance data
TRADES=$(echo "$LATEST_CHECK" | grep -oP "trades: \K\d+" || echo "0")
WINS=$(echo "$LATEST_CHECK" | grep -oP "wins: \K\d+" || echo "0")
LOSSES=$(echo "$LATEST_CHECK" | grep -oP "losses: \K\d+" || echo "0")
WIN_RATE=$(echo "$LATEST_CHECK" | grep -oP "winRate: '\K[0-9.]+")
AVG_WIN_PCT=$(echo "$LATEST_CHECK" | grep -oP "avgWinPct: '\K[0-9.]+")
AVG_LOSS_PCT=$(echo "$LATEST_CHECK" | grep -oP "avgLossPct: '\K[0-9.]+")
TOTAL_PNL_PCT=$(echo "$LATEST_CHECK" | grep -oP "totalPnlPct: '\K[-0-9.]+")

# Display results
echo "" | tee -a "$LOG_FILE"
echo "Performance Summary:" | tee -a "$LOG_FILE"
echo "  Total Trades: $TRADES" | tee -a "$LOG_FILE"
echo "  Wins: $WINS" | tee -a "$LOG_FILE"
echo "  Losses: $LOSSES" | tee -a "$LOG_FILE"
echo "  Win Rate: ${WIN_RATE}%" | tee -a "$LOG_FILE"
echo "  Avg Win: ${AVG_WIN_PCT}%" | tee -a "$LOG_FILE"
echo "  Avg Loss: ${AVG_LOSS_PCT}%" | tee -a "$LOG_FILE"
echo "  Total PnL: ${TOTAL_PNL_PCT}%" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

# Check if avg win is below threshold
if [ -n "$AVG_WIN_PCT" ]; then
    # Use bc for floating point comparison
    BELOW_THRESHOLD=$(echo "$AVG_WIN_PCT < $THRESHOLD" | bc -l)
    
    if [ "$BELOW_THRESHOLD" -eq 1 ]; then
        echo -e "${RED}⚠️  ALERT: Average win (${AVG_WIN_PCT}%) is BELOW threshold (${THRESHOLD}%)${NC}" | tee -a "$LOG_FILE" "$ALERT_FILE"
        echo "" | tee -a "$LOG_FILE" "$ALERT_FILE"
        echo "RECOMMENDATION: Switch to TIER_3_AGGRESSIVE" | tee -a "$LOG_FILE" "$ALERT_FILE"
        echo "" | tee -a "$LOG_FILE" "$ALERT_FILE"
        echo "To switch tiers:" | tee -a "$LOG_FILE" "$ALERT_FILE"
        echo "  1. Edit .env: nano /opt/binance-bot/.env" | tee -a "$LOG_FILE" "$ALERT_FILE"
        echo "  2. Change: SIGNAL_TIER=TIER_3_AGGRESSIVE" | tee -a "$LOG_FILE" "$ALERT_FILE"
        echo "  3. Restart: docker compose restart app" | tee -a "$LOG_FILE" "$ALERT_FILE"
        echo "" | tee -a "$LOG_FILE" "$ALERT_FILE"
        
        # Check for recent alerts
        RECENT_ALERTS=$(grep "ALERT" "$ALERT_FILE" 2>/dev/null | tail -5 | wc -l)
        
        if [ "$RECENT_ALERTS" -ge 3 ]; then
            echo -e "${RED}⚠️  CRITICAL: Multiple consecutive alerts detected!${NC}" | tee -a "$LOG_FILE" "$ALERT_FILE"
            echo "Consider switching to TIER_3 immediately." | tee -a "$LOG_FILE" "$ALERT_FILE"
        fi
    else
        echo -e "${GREEN}✓ Performance acceptable (${AVG_WIN_PCT}% >= ${THRESHOLD}%)${NC}" | tee -a "$LOG_FILE"
        echo "TIER_4 is performing well. Continue monitoring." | tee -a "$LOG_FILE"
    fi
else
    echo -e "${YELLOW}Unable to parse average win percentage${NC}" | tee -a "$LOG_FILE"
fi

# Check for warning messages
WARNINGS=$(echo "$RECENT_LOGS" | grep -i "warning\|error" | tail -5)
if [ -n "$WARNINGS" ]; then
    echo "" | tee -a "$LOG_FILE"
    echo "Recent Warnings/Errors:" | tee -a "$LOG_FILE"
    echo "$WARNINGS" | tee -a "$LOG_FILE"
fi

echo "" | tee -a "$LOG_FILE"
echo "=========================================" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

# Cleanup old logs (keep last 7 days)
find "$LOG_DIR" -name "*.log" -mtime +7 -delete 2>/dev/null || true

exit 0
