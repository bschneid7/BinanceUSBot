# System monitoring script
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

# Check disk space
DISK_USAGE=$(df -h / | awk 'NR==2 {print $5}' | sed 's/%//')
if [ $DISK_USAGE -gt 80 ]; then
    echo "[$TIMESTAMP] WARNING: Disk usage at ${DISK_USAGE}%"
fi

# Check memory
MEM_USAGE=$(free | awk 'NR==2 {printf "%.0f", $3/$2*100}')
if [ $MEM_USAGE -gt 85 ]; then
    echo "[$TIMESTAMP] WARNING: Memory usage at ${MEM_USAGE}%"
fi

# Check Docker containers
CONTAINERS_DOWN=$(docker ps --format '{{.Names}}: {{.Status}}' | grep -v 'Up' | wc -l)
if [ $CONTAINERS_DOWN -gt 0 ]; then
    echo "[$TIMESTAMP] WARNING: $CONTAINERS_DOWN container(s) not running"
    docker ps -a --format '{{.Names}}: {{.Status}}'
fi

# Check bot status
BOT_STATUS=$(curl -s http://localhost:3000/api/bot/status 2>/dev/null | jq -r '.status' 2>/dev/null)
if [ "$BOT_STATUS" != "ACTIVE" ]; then
    echo "[$TIMESTAMP] WARNING: Bot status is $BOT_STATUS (expected ACTIVE)"
fi

# Log healthy status every hour (on the hour)
MINUTE=$(date +%M)
if [ "$MINUTE" == "00" ]; then
    echo "[$TIMESTAMP] INFO: System healthy - Disk: ${DISK_USAGE}%, Memory: ${MEM_USAGE}%, Bot: $BOT_STATUS"
fi
