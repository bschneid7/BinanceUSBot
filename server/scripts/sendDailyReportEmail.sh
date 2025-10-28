#!/bin/bash
# Daily P&L Report Email Sender
# Uses SendGrid API directly (no dependencies needed)

set -e

# Get bot status data
echo "[DailyReport] Fetching bot status..."
STATUS_JSON=$(curl -s https://binance-us-bot.duckdns.org/api/bot/status)

# Extract values
EQUITY=$(echo "$STATUS_JSON" | jq -r '.equity // 0')
STARTING_CAPITAL=$(echo "$STATUS_JSON" | jq -r '.startingCapital // 0')
TOTAL_PNL=$(echo "$STATUS_JSON" | jq -r '.totalPnl // 0')
TOTAL_PNL_PCT=$(echo "scale=2; ($TOTAL_PNL / $STARTING_CAPITAL) * 100" | bc)
OPEN_POSITIONS=$(echo "$STATUS_JSON" | jq -r '.openPositions // 0')
BOT_STATUS=$(echo "$STATUS_JSON" | jq -r '.status // "UNKNOWN"')

# Get positions
POSITIONS_JSON=$(curl -s 'https://binance-us-bot.duckdns.org/api/positions?status=OPEN')

# Format date
DATE=$(date '+%A, %B %d, %Y')
TIMESTAMP=$(date '+%B %d, %Y at %I:%M %p %Z')

# Determine P&L color and emoji
if (( $(echo "$TOTAL_PNL >= 0" | bc -l) )); then
  PNL_COLOR="#10b981"
  PNL_EMOJI="📈"
  PNL_SIGN="+"
else
  PNL_COLOR="#ef4444"
  PNL_EMOJI="📉"
  PNL_SIGN=""
fi

# Generate email subject
SUBJECT="${PNL_EMOJI} Trading Bot Daily Report - ${DATE} | P&L: ${PNL_SIGN}\$${TOTAL_PNL} (${PNL_SIGN}${TOTAL_PNL_PCT}%)"

# Generate HTML email body
HTML_BODY="<!DOCTYPE html>
<html>
<head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\"></head>
<body style=\"margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;background-color:#f3f4f6;\">
<table width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"background-color:#f3f4f6;padding:20px;\">
<tr><td align=\"center\">
<table width=\"600\" cellpadding=\"0\" cellspacing=\"0\" style=\"background-color:#ffffff;border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,0.1);\">

<!-- Header -->
<tr><td style=\"background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);padding:30px;border-radius:8px 8px 0 0;\">
<h1 style=\"margin:0;color:#ffffff;font-size:24px;font-weight:600;\">📊 Daily Trading Report</h1>
<p style=\"margin:5px 0 0 0;color:#e0e7ff;font-size:14px;\">${DATE}</p>
</td></tr>

<!-- Bot Status -->
<tr><td style=\"padding:20px 30px;\">
<h2 style=\"margin:0 0 10px 0;font-size:18px;color:#1f2937;\">Bot Status: <span style=\"color:${PNL_COLOR}\">${BOT_STATUS}</span></h2>
</td></tr>

<!-- Key Metrics -->
<tr><td style=\"padding:0 30px 20px 30px;\">
<table width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"background-color:#f9fafb;border-radius:6px;padding:15px;\">
<tr>
<td width=\"50%\" style=\"padding:10px;\">
<div style=\"font-size:12px;color:#6b7280;margin-bottom:4px;\">Current Equity</div>
<div style=\"font-size:24px;font-weight:700;color:#1f2937;\">\$${EQUITY}</div>
</td>
<td width=\"50%\" style=\"padding:10px;text-align:right;\">
<div style=\"font-size:12px;color:#6b7280;margin-bottom:4px;\">Starting Capital</div>
<div style=\"font-size:24px;font-weight:700;color:#1f2937;\">\$${STARTING_CAPITAL}</div>
</td>
</tr>
</table>
</td></tr>

<!-- Total P&L -->
<tr><td style=\"padding:0 30px 20px 30px;\">
<table width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"background:linear-gradient(135deg,${PNL_COLOR}15 0%,${PNL_COLOR}05 100%);border-radius:6px;padding:20px;border:2px solid ${PNL_COLOR};\">
<tr><td>
<div style=\"font-size:14px;color:#6b7280;margin-bottom:8px;\">Total P&L (All-Time)</div>
<div style=\"font-size:32px;font-weight:700;color:${PNL_COLOR};\">${PNL_SIGN}\$${TOTAL_PNL}</div>
<div style=\"font-size:18px;font-weight:600;color:${PNL_COLOR};margin-top:4px;\">${PNL_SIGN}${TOTAL_PNL_PCT}%</div>
</td></tr>
</table>
</td></tr>

<!-- Open Positions -->
<tr><td style=\"padding:0 30px 20px 30px;\">
<h3 style=\"margin:0 0 15px 0;font-size:16px;color:#1f2937;\">Open Positions: ${OPEN_POSITIONS}</h3>
</td></tr>

<!-- Footer -->
<tr><td style=\"padding:20px 30px;background-color:#f9fafb;border-radius:0 0 8px 8px;text-align:center;\">
<p style=\"margin:0;font-size:12px;color:#6b7280;\">This is an automated daily report from your Binance US Trading Bot.</p>
<p style=\"margin:8px 0 0 0;font-size:12px;color:#9ca3af;\">Report generated at ${TIMESTAMP}</p>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>"

# Send via SendGrid API
echo "[DailyReport] Sending email to ${EMAIL_TO}..."

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST https://api.sendgrid.com/v3/mail/send \
  -H "Authorization: Bearer ${SENDGRID_API_KEY}" \
  -H "Content-Type: application/json" \
  -d "{
    \"personalizations\": [{
      \"to\": [{\"email\": \"${EMAIL_TO}\"}]
    }],
    \"from\": {\"email\": \"${EMAIL_FROM}\"},
    \"subject\": \"${SUBJECT}\",
    \"content\": [{
      \"type\": \"text/html\",
      \"value\": $(echo "$HTML_BODY" | jq -Rs .)
    }]
  }")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "202" ]; then
  echo "[DailyReport] ✅ Email sent successfully!"
  exit 0
else
  echo "[DailyReport] ❌ Failed to send email. HTTP $HTTP_CODE"
  echo "$BODY"
  exit 1
fi

