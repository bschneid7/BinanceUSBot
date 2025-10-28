#!/bin/bash
# Daily P&L Report Cron Job
# Runs at 6:00 PM EST (11:00 PM UTC) every day

# Load environment variables
set -a
source /opt/binance-bot/.env
set +a

cd /opt/binance-bot
docker exec -e EMAIL_FROM="${EMAIL_FROM}" -e EMAIL_TO="${EMAIL_TO}" -e SENDGRID_API_KEY="${SENDGRID_API_KEY}" binance-bot-app bash /app/server/scripts/sendDailyReportEmail.sh >> /var/log/daily-report.log 2>&1

