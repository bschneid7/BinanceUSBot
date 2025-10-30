# Binance Trading Bot - System Information

## Server Details
- IP: 159.65.77.109
- Hostname: cryptobot
- OS: Ubuntu 22.04
- CPU: 2 vCPUs
- RAM: 4GB
- Disk: 77GB SSD
- Swap: 2GB

## Docker Containers
- binance-bot-app (port 3000)
- binance-bot-mongo (port 27017)

## Monitoring
- Uptime check: Active (DigitalOcean)
- Daily email report: 6:00 PM EST to bschneid7@gmail.com
- fail2ban: Active

## Backups
- MongoDB: Daily at 3:00 AM (local, keeps 7 days)
- DigitalOcean: To be enabled
- Location: /opt/binance-bot/backups/mongodb/

## Security
- UFW firewall: Active
- Allowed ports: 22 (SSH), 80 (HTTP), 443 (HTTPS), 3000 (Bot API)
- fail2ban: Active (SSH brute force protection)
- SSH: Key-based authentication only
- Cloud Firewall: Active (DigitalOcean)

## Log Management
- Log rotation: Configured
- Docker logs: Daily rotation, 7 days retention, 100MB max
- Backup logs: /var/log/mongodb-backup.log

## ML Models
- GridPPOAgent: 20 states, 5 actions (~3,500 parameters)
- PPOAgent: 17 states, 4 actions (~21,000 parameters)
- Framework: TensorFlow.js (GridPPOAgent), TensorFlow Python (PPOAgent)

## Database
- MongoDB: 5.0 (Docker container)
- Authentication: Enabled
- Data size: ~180KB (as of last backup)
- Collections: positions, orders, deposits, transactions, equitysnapshots, etc.

## Last Updated
Tue Oct 28 18:30:57 EDT 2025

## System Status
 18:30:57 up  8:15,  1 user,  load average: 0.01, 0.05, 0.02
Mem:           3.8Gi       771Mi       1.7Gi        41Mi       1.4Gi       2.8Gi
Swap:          127Mi          0B       127Mi
/dev/root        40G  8.2G   32G  21% /
