DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/opt/binance-bot/backups/mongodb"
echo "[$DATE] Starting MongoDB backup..."
docker exec binance-bot-mongo mongodump --username admin --password changeThisPassword --authenticationDatabase admin --out /tmp/backup_$DATE
docker cp binance-bot-mongo:/tmp/backup_$DATE $BACKUP_DIR/
docker exec binance-bot-mongo rm -rf /tmp/backup_$DATE
find $BACKUP_DIR -type d -mtime +7 -exec rm -rf {} + 2>/dev/null
echo "[$DATE] Backup completed: $BACKUP_DIR/backup_$DATE"
