# BinanceUSBot - Deployment Guide

Complete guide for deploying BinanceUSBot on a Digital Ocean Ubuntu server with Docker containerization.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Server Setup](#server-setup)
- [Application Deployment](#application-deployment)
- [Database Management](#database-management)
- [Monitoring & Maintenance](#monitoring--maintenance)
- [Troubleshooting](#troubleshooting)
- [Security Best Practices](#security-best-practices)

---

## Prerequisites

### Local Requirements
- Git installed
- SSH client
- Text editor (for configuration files)

### Server Requirements
- Digital Ocean Droplet (or similar VPS)
- Ubuntu 22.04 LTS (recommended)
- Minimum: 2 vCPU, 4GB RAM, 50GB SSD
- Root or sudo access

### Required Credentials
- Binance.US API Key and Secret
- MongoDB credentials (auto-generated or custom)
- JWT secrets (for authentication)

---

## Server Setup

### Option 1: Automated Setup (Recommended)

Run the automated setup script on your fresh Ubuntu server:

```bash
# Connect to your server
ssh root@your-server-ip

# Download and run setup script
curl -sSL https://raw.githubusercontent.com/your-repo/main/scripts/setup-server.sh | sudo bash

# Or if you have the repo cloned
cd /opt
git clone https://github.com/your-repo/binance-bot.git
cd binance-bot
sudo bash scripts/setup-server.sh
```

This script will:
- Update system packages
- Install Docker and Docker Compose
- Configure firewall (UFW)
- Set up Fail2Ban for security
- Create application user
- Install Node.js
- Configure timezone to UTC

### Option 2: Manual Setup

If you prefer manual setup, follow these steps:

#### 1. Update System
```bash
sudo apt-get update
sudo apt-get upgrade -y
```

#### 2. Install Docker
```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Install Docker Compose
sudo apt-get install docker-compose-plugin

# Verify installation
docker --version
docker compose version
```

#### 3. Configure Firewall
```bash
# Allow SSH, HTTP, HTTPS
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

#### 4. Create Application User
```bash
sudo useradd -m -s /bin/bash botuser
sudo usermod -aG docker botuser
```

#### 5. Create Application Directory
```bash
sudo mkdir -p /opt/binance-bot
sudo chown -R botuser:botuser /opt/binance-bot
```

---

## Application Deployment

### Step 1: Clone Repository

```bash
# Switch to application user
sudo su - botuser

# Navigate to application directory
cd /opt/binance-bot

# Clone repository
git clone https://github.com/your-repo/binance-bot.git .
```

### Step 2: Configure Environment

```bash
# Create production environment file
cp .env.production.example .env.production

# Edit with your credentials
nano .env.production
```

**Required environment variables:**

```bash
# Application
NODE_ENV=production
PORT=3000
APP_PORT=3000

# MongoDB (will be auto-generated if using Docker)
MONGO_ROOT_USERNAME=admin
MONGO_ROOT_PASSWORD=your-secure-password-here
MONGO_DB_NAME=binance_bot
MONGO_URI=mongodb://admin:your-secure-password-here@mongo:27017/binance_bot?authSource=admin

# JWT Secrets (generate using: openssl rand -base64 32)
JWT_SECRET=your-jwt-secret-minimum-32-characters
JWT_REFRESH_SECRET=your-jwt-refresh-secret-minimum-32-characters

# Binance API
BINANCE_API_KEY=your-binance-api-key
BINANCE_API_SECRET=your-binance-api-secret
```

### Step 3: Deploy with Docker

#### Option A: Using Deployment Script (Recommended)

```bash
# Make scripts executable
chmod +x deploy.sh
chmod +x scripts/*.sh

# Run deployment
./deploy.sh production
```

The deployment script will:
1. Create backup of existing deployment
2. Pull latest code (if Git configured)
3. Install dependencies
4. Build application
5. Run database seeds
6. Deploy with Docker
7. Verify deployment

#### Option B: Manual Docker Deployment

```bash
# Build and start services
docker compose up -d --build

# Check status
docker compose ps

# View logs
docker compose logs -f
```

### Step 4: Seed Initial Data

```bash
# Create admin user
npm run seed:admin

# Or use Docker exec
docker compose exec app npm run seed:admin
```

### Step 5: Verify Deployment

```bash
# Test API endpoints
npm run api:test

# Or manually test
curl http://localhost:3000/api/ping
```

Expected response:
```json
{"message":"pong"}
```

---

## Database Management

### Seeding Scripts

#### 1. Seed Admin User

Creates an admin user for accessing the application.

```bash
npm run seed:admin

# Environment variables (optional):
# ADMIN_EMAIL=admin@example.com
# ADMIN_PASSWORD=SecurePassword123!
```

**Default credentials:**
- Email: `admin@binancebot.com`
- Password: `Admin123!@#`

⚠️ **Change the password after first login!**

#### 2. Database Cleanup

Removes old data to keep database lean.

```bash
npm run db:cleanup
```

This will:
- Delete closed positions older than 90 days
- Delete alerts older than 30 days
- Delete signals older than 60 days
- Archive old trade history (preserving tax data)

#### 3. Database Reset

**⚠️ WARNING: This will delete ALL data!**

```bash
# Reset all data
npm run db:reset

# Reset all data but keep admin user
npm run db:reset -- --keep-admin
```

### Manual Database Access

```bash
# Connect to MongoDB container
docker compose exec mongo mongosh

# Connect with authentication
docker compose exec mongo mongosh -u admin -p your-password --authenticationDatabase admin

# Show databases
show dbs

# Use binance_bot database
use binance_bot

# Show collections
show collections

# Query examples
db.users.find()
db.positions.find({status: "OPEN"})
db.trades.countDocuments()
```

---

## Monitoring & Maintenance

### View Logs

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f app
docker compose logs -f mongo

# Last 100 lines
docker compose logs --tail=100 app
```

### Check Service Status

```bash
# Container status
docker compose ps

# Resource usage
docker stats

# Disk usage
docker system df
```

### Restart Services

```bash
# Restart all services
docker compose restart

# Restart specific service
docker compose restart app

# Full restart (rebuild)
docker compose down
docker compose up -d --build
```

### Update Application

```bash
# Pull latest code
git pull origin main

# Rebuild and restart
docker compose up -d --build

# Or use deployment script
./deploy.sh production
```

### Backup & Restore

#### Create Backup

```bash
# Backup MongoDB data
docker compose exec mongo mongodump --out=/data/backup

# Copy backup to host
docker cp binance-bot-mongo:/data/backup ./backup-$(date +%Y%m%d)

# Backup application files
tar -czf app-backup-$(date +%Y%m%d).tar.gz \
    --exclude='node_modules' \
    --exclude='dist' \
    .
```

#### Restore Backup

```bash
# Copy backup to container
docker cp ./backup-20250115 binance-bot-mongo:/data/backup

# Restore MongoDB
docker compose exec mongo mongorestore /data/backup
```

---

## Troubleshooting

### Common Issues

#### 1. Container Won't Start

```bash
# Check logs
docker compose logs app

# Check if port is already in use
sudo netstat -tulpn | grep 3000

# Kill process using port
sudo kill -9 $(sudo lsof -t -i:3000)
```

#### 2. MongoDB Connection Error

```bash
# Check MongoDB status
docker compose ps mongo

# View MongoDB logs
docker compose logs mongo

# Verify credentials in .env.production
cat .env.production | grep MONGO
```

#### 3. Out of Memory

```bash
# Check memory usage
free -h
docker stats

# Restart services
docker compose restart

# Consider upgrading server resources
```

#### 4. Build Failures

```bash
# Clear Docker cache
docker system prune -a

# Rebuild from scratch
docker compose down
docker compose build --no-cache
docker compose up -d
```

### Debug Mode

```bash
# Run with verbose logging
NODE_ENV=development docker compose up

# Execute commands in container
docker compose exec app bash

# Check Node.js version
docker compose exec app node --version

# Check environment variables
docker compose exec app env
```

---

## Security Best Practices

### 1. Server Hardening

```bash
# Change SSH port (edit /etc/ssh/sshd_config)
sudo nano /etc/ssh/sshd_config
# Set: Port 2222

# Disable password authentication (use SSH keys only)
# Set: PasswordAuthentication no

# Restart SSH
sudo systemctl restart sshd
```

### 2. Firewall Configuration

```bash
# If you changed SSH port
sudo ufw allow 2222/tcp
sudo ufw delete allow 22/tcp

# Check firewall status
sudo ufw status
```

### 3. Automatic Security Updates

```bash
# Install unattended-upgrades
sudo apt-get install unattended-upgrades

# Configure
sudo dpkg-reconfigure -plow unattended-upgrades
```

### 4. SSL/TLS Setup (with Nginx)

```bash
# Install Certbot
sudo apt-get install certbot python3-certbot-nginx

# Get SSL certificate
sudo certbot --nginx -d yourdomain.com

# Auto-renewal is configured automatically
```

### 5. Secrets Management

- Never commit `.env.production` to Git
- Use environment variables for sensitive data
- Rotate API keys quarterly
- Use strong, unique passwords (minimum 32 characters)

### 6. Access Control

```bash
# Limit SSH access to specific IPs (if possible)
sudo ufw allow from YOUR_IP to any port 22

# Monitor failed login attempts
sudo fail2ban-client status sshd
```

### 7. Regular Maintenance

- Update system packages weekly
- Review logs daily
- Monitor disk space
- Check for security vulnerabilities
- Backup database weekly

---

## Testing Scripts

### API Testing

Test all API endpoints to ensure proper functionality:

```bash
npm run api:test
```

This will test:
- Health check
- User authentication
- Bot status and dashboard
- Positions and trades
- Signals and alerts
- Configuration
- Analytics
- Tax reports

### Custom API Base URL

```bash
API_BASE_URL=http://your-server-ip:3000 npm run api:test
```

---

## PPO Reinforcement Learning Setup

### Prerequisites for PPO

- TensorFlow.js and Python/PyTorch installed (handled by Docker)
- Historical market data for training
- Sufficient compute resources (GPU recommended for large-scale training)

### Offline PPO Training

Train the PPO agent before deploying to production:

```bash
# Method 1: Using npm script
PPO_EPISODES=1000 npm run train:ppo

# Method 2: Using Docker service
docker-compose run ppo-trainer

# Method 3: Manual training
cd server && tsx services/tradingEngine/trainPPO.ts
```

### PPO Configuration

Add to `.env.production`:

```env
# PPO Configuration
PPO_EPISODES=1000
BUY_ALLOCATION=0.05        # 5% capital per trade
TRAILING_STOP=0.005        # 0.5% trailing stop
DRAWDOWN_CAP=0.3           # 30% max drawdown

# ML Sentiment (optional)
ML_MODEL_PATH=/path/to/torch_model

# Features
STAKING_ENABLED=true
TAX_METHOD=HIFO
```

### Automated Tasks (Cron Jobs)

Setup cron jobs for automated operations:

```bash
# Edit crontab
crontab -e

# Add these lines:
# Stake idle assets hourly
0 * * * * cd /opt/binance-bot && npm run stake:idle

# Generate tax reports weekly (Sunday midnight)
0 0 * * 0 cd /opt/binance-bot && npm run tax:generate

# Retrain PPO monthly (1st of month, 2 AM)
0 2 1 * * cd /opt/binance-bot && docker-compose run ppo-trainer
```

### PPO Model Management

**Save trained model:**
```bash
# Models are saved automatically to ./models/ppo/
ls -la models/ppo/actor/
ls -la models/ppo/critic/
```

**Load existing model:**
```bash
# Place model files in ./models/ppo/
# Agent will automatically load on startup if present
```

### Monitoring PPO Performance

**Check PPO stats:**
```bash
curl -X GET http://localhost:3000/api/ppo/stats \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**View training logs:**
```bash
docker-compose logs ppo-trainer
```

## Production Checklist

Before going live, ensure:

- [ ] Server is properly secured (firewall, SSH keys, Fail2Ban)
- [ ] Environment variables are set correctly (including PPO config)
- [ ] Admin user is created and password changed
- [ ] Binance API keys are configured with correct permissions
- [ ] PPO agent is trained (if using RL features)
- [ ] Cron jobs are configured (staking, tax, retraining)
- [ ] Database backups are scheduled
- [ ] Monitoring is set up
- [ ] SSL certificate is installed (if using domain)
- [ ] Logs are being collected and rotated
- [ ] Resource limits are configured
- [ ] Automatic updates are enabled
- [ ] Emergency contacts are configured
- [ ] Documentation is updated

---

## Support & Resources

### Useful Commands Reference

```bash
# Deployment
./deploy.sh production              # Full deployment
./scripts/docker-deploy.sh --build  # Docker only

# Database
npm run seed:admin                  # Create admin user
npm run db:cleanup                  # Clean old data
npm run db:reset                    # Reset database

# Testing
npm run api:test                    # Test API endpoints

# Docker
docker compose up -d                # Start services
docker compose down                 # Stop services
docker compose logs -f              # View logs
docker compose ps                   # Check status
docker compose restart              # Restart all

# Monitoring
docker stats                        # Resource usage
docker system df                    # Disk usage
htop                                # System monitor
```

### Getting Help

- Check logs: `docker compose logs -f app`
- Review this documentation
- Check GitHub issues
- Contact system administrator

---

## License

See LICENSE file for details.

---

**Last Updated:** January 2025
