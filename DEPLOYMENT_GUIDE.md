# BinanceUSBot Deployment Guide

Complete guide for deploying BinanceUSBot to production with Docker and security hardening.

---

## Prerequisites

- Ubuntu 22.04 LTS server (DigitalOcean droplet or similar)
- Root or sudo access
- Domain name (optional, for HTTPS)
- Binance.US API key and secret

---

## Quick Start

### 1. Initial Server Setup

```bash
# Update system
sudo apt-get update && sudo apt-get upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Install Docker Compose
sudo apt-get install -y docker-compose-plugin

# Verify installation
docker --version
docker compose version
```

### 2. Clone Repository

```bash
# Create application directory
sudo mkdir -p /opt/binanceusbot
cd /opt/binanceusbot

# Clone repository (or upload files)
git clone https://github.com/yourusername/BinanceUSBot.git .

# Or upload files via SCP
# scp -r ./BinanceUSBot/* root@your-server:/opt/binanceusbot/
```

### 3. Configure Environment

```bash
# Copy example environment file
cp .env.example .env

# Edit with your credentials
nano .env
```

**Required environment variables:**

```bash
# Binance API
BINANCE_API_KEY=your_api_key_here
BINANCE_API_SECRET=your_api_secret_here
BINANCE_BASE_URL=https://api.binance.us
BINANCE_RECV_WINDOW=5000

# MongoDB
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/binancebot

# Server
PORT=3000
NODE_ENV=production
LOG_LEVEL=info

# HTTP
HTTP_TIMEOUT_MS=10000
SCAN_CONCURRENCY=6
```

### 4. Build and Start

```bash
# Build Docker image
docker compose -f docker-compose.prod.yml build

# Start services
docker compose -f docker-compose.prod.yml up -d

# Check status
docker compose -f docker-compose.prod.yml ps

# View logs
docker compose -f docker-compose.prod.yml logs -f
```

### 5. Install Systemd Service

```bash
# Copy service file
sudo cp binanceusbot.service /etc/systemd/system/

# Reload systemd
sudo systemctl daemon-reload

# Enable service
sudo systemctl enable binanceusbot

# Start service
sudo systemctl start binanceusbot

# Check status
sudo systemctl status binanceusbot
```

### 6. Run Hardening Script

```bash
# Make executable
chmod +x harden-deployment.sh

# Run as root
sudo ./harden-deployment.sh
```

---

## Security Hardening

### Firewall (UFW)

```bash
# Reset and configure
sudo ufw --force reset
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp comment 'SSH'
sudo ufw allow 80/tcp comment 'HTTP'
sudo ufw allow 443/tcp comment 'HTTPS'
sudo ufw --force enable

# Check status
sudo ufw status verbose
```

### SSH Hardening

```bash
# Edit SSH config
sudo nano /etc/ssh/sshd_config

# Set these values:
PermitRootLogin prohibit-password
PasswordAuthentication no
PubkeyAuthentication yes
X11Forwarding no

# Restart SSH
sudo systemctl restart sshd
```

### Fail2Ban

```bash
# Install
sudo apt-get install -y fail2ban

# Configure
sudo nano /etc/fail2ban/jail.local

# Add:
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5

[sshd]
enabled = true
port = 22

# Start
sudo systemctl enable fail2ban
sudo systemctl start fail2ban

# Check status
sudo fail2ban-client status sshd
```

### Time Synchronization

```bash
# Enable systemd-timesyncd
sudo systemctl enable systemd-timesyncd
sudo systemctl start systemd-timesyncd

# Set NTP
sudo timedatectl set-ntp true

# Verify
timedatectl status
```

### API Key Restrictions

**In Binance.US Dashboard:**

1. Go to API Management
2. Edit your API key
3. Add "Trusted IPs"
4. Enter your droplet's public IP
5. Enable "Enable Trading" only (disable withdrawals)
6. Save changes

### MongoDB Security

**If using MongoDB Atlas:**
- Already secured by default
- Whitelist droplet IP in Network Access
- Use strong password
- Enable 2FA on MongoDB account

**If using local MongoDB:**

```bash
# Bind to localhost only
sudo nano /etc/mongod.conf

# Set:
net:
  bindIp: 127.0.0.1

# Enable authentication
security:
  authorization: enabled

# Restart
sudo systemctl restart mongod
```

---

## Backup Strategy

### Automated Backups

The hardening script sets up daily backups at 2 AM:

```bash
# Backup script location
/opt/binanceusbot/backup.sh

# Backup directory
/opt/binanceusbot/backups/

# Log file
/var/log/binanceusbot-backup.log
```

### Manual Backup

```bash
# Backup .env and docker-compose
cp /opt/binanceusbot/.env ~/backup/env_$(date +%Y%m%d)
cp /opt/binanceusbot/docker-compose.prod.yml ~/backup/

# Backup MongoDB (if local)
mongodump --out=~/backup/mongo_$(date +%Y%m%d)

# Compress
tar -czf ~/backup_$(date +%Y%m%d).tar.gz ~/backup/
```

### DigitalOcean Snapshots

```bash
# Via DigitalOcean CLI
doctl compute droplet-action snapshot <droplet-id> --snapshot-name "binanceusbot-$(date +%Y%m%d)"

# Or use DigitalOcean dashboard:
# Droplets → Your Droplet → Snapshots → Take Snapshot
```

### Encrypted S3/Spaces Backup

```bash
# Install AWS CLI
sudo apt-get install -y awscli

# Configure
aws configure

# Backup to S3 (encrypted)
mongodump --archive | \
  gzip | \
  aws s3 cp - s3://your-bucket/backups/mongo_$(date +%Y%m%d).gz \
  --sse AES256
```

---

## Monitoring

### Health Check

```bash
# Check bot health
curl http://localhost:3000/healthz

# Expected: {"status":"ok","timestamp":"..."}
```

### Metrics

```bash
# View Prometheus metrics
curl http://localhost:3000/metrics
```

### Logs

```bash
# Docker logs
docker compose -f docker-compose.prod.yml logs -f

# Systemd logs
sudo journalctl -u binanceusbot -f

# Application logs (if configured)
tail -f /opt/binanceusbot/logs/app.log
```

### Resource Usage

```bash
# Docker stats
docker stats binanceusbot

# System resources
htop

# Disk usage
df -h
du -sh /opt/binanceusbot/*
```

---

## Maintenance

### Update Bot

```bash
# Pull latest code
cd /opt/binanceusbot
git pull

# Rebuild and restart
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d

# Or via systemd
sudo systemctl restart binanceusbot
```

### Update System

```bash
# Update packages
sudo apt-get update && sudo apt-get upgrade -y

# Reboot if kernel updated
sudo reboot
```

### Clean Up

```bash
# Remove old Docker images
docker image prune -a

# Remove old logs
docker compose -f docker-compose.prod.yml logs --tail=0 -f

# Clean old backups (older than 30 days)
find /opt/binanceusbot/backups -type f -mtime +30 -delete
```

---

## Troubleshooting

### Bot Won't Start

```bash
# Check Docker status
docker compose -f docker-compose.prod.yml ps

# View logs
docker compose -f docker-compose.prod.yml logs

# Check .env file
cat /opt/binanceusbot/.env

# Verify MongoDB connection
docker compose -f docker-compose.prod.yml exec bot \
  node -e "require('mongoose').connect(process.env.MONGODB_URI).then(() => console.log('OK'))"
```

### High Memory Usage

```bash
# Check container limits
docker stats binanceusbot

# Increase memory limit in docker-compose.prod.yml:
deploy:
  resources:
    limits:
      memory: 1G  # Increase from 512M
```

### API Connection Issues

```bash
# Test Binance.US connectivity
curl https://api.binance.us/api/v3/ping

# Check API key restrictions
# Verify droplet IP is whitelisted in Binance dashboard

# Test from container
docker compose -f docker-compose.prod.yml exec bot \
  curl https://api.binance.us/api/v3/time
```

### Database Connection Issues

```bash
# Test MongoDB connection
docker compose -f docker-compose.prod.yml exec bot \
  node -e "require('mongoose').connect(process.env.MONGODB_URI).then(() => console.log('Connected')).catch(e => console.error(e))"

# Check MongoDB Atlas IP whitelist
# Ensure droplet IP is whitelisted
```

---

## Production Checklist

### Pre-Deployment

- [ ] Binance.US API key created with trading permissions only
- [ ] API key IP-restricted to droplet IP
- [ ] 2FA enabled on Binance account
- [ ] MongoDB database created and accessible
- [ ] MongoDB IP whitelist configured
- [ ] .env file created with production credentials
- [ ] .env file permissions set to 600
- [ ] Domain name configured (if using HTTPS)

### Deployment

- [ ] Docker and Docker Compose installed
- [ ] Application files uploaded to /opt/binanceusbot
- [ ] Docker image built successfully
- [ ] Container starts without errors
- [ ] Health check endpoint responding
- [ ] Systemd service installed and enabled
- [ ] Service starts on boot

### Security

- [ ] UFW firewall configured (22, 80, 443 only)
- [ ] SSH hardened (key-only, no root password)
- [ ] Fail2Ban installed and running
- [ ] Time synchronization enabled
- [ ] Automatic security updates enabled
- [ ] Kernel parameters hardened
- [ ] .env file not committed to git
- [ ] API key IP-restricted
- [ ] MongoDB authentication enabled

### Monitoring

- [ ] Health check endpoint tested
- [ ] Metrics endpoint accessible
- [ ] Logs being written correctly
- [ ] Resource usage acceptable
- [ ] Alerts configured (optional)

### Backup

- [ ] Daily backup cron job configured
- [ ] Backup script tested
- [ ] DigitalOcean snapshots scheduled
- [ ] MongoDB backup tested
- [ ] Encrypted S3/Spaces backup configured (optional)

---

## Support

For issues or questions:

1. Check logs: `docker compose logs -f`
2. Review troubleshooting section above
3. Check GitHub issues
4. Contact support

---

## License

See LICENSE file in repository.

