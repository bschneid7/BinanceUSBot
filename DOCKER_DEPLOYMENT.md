# BinanceUSBot - Docker Deployment Guide

## Overview

This guide covers deploying the BinanceUSBot application using Docker and Docker Compose. The application includes:
- Full-stack trading bot with React frontend
- Node.js/Express backend
- MongoDB database
- Nginx reverse proxy (optional)

## Prerequisites

- Docker Engine 20.10+
- Docker Compose 2.0+
- Git
- Domain name (optional, for SSL)

## Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/bschneid7/BinanceUSBot.git
cd BinanceUSBot
```

### 2. Configure Environment Variables

Create a `.env` file from the example:

```bash
cp .env.example .env
```

Edit `.env` and configure the following **required** variables:

```env
# MongoDB Connection (choose one)
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/binance_bot

# JWT Secrets (generate strong random strings)
JWT_SECRET=your-strong-secret-here
JWT_REFRESH_SECRET=your-strong-refresh-secret-here

# Binance.US API Credentials
BINANCE_API_KEY=your-binance-us-api-key
BINANCE_API_SECRET=your-binance-us-api-secret
```

**Important:** 
- Generate strong JWT secrets using: `openssl rand -base64 32`
- Get Binance.US API keys from: https://www.binance.us/en/usercenter/settings/api-management
- Ensure your VPS IP is whitelisted in Binance.US API settings

### 3. Build and Start Services

#### Option A: Using Docker Compose (Recommended)

```bash
# Build and start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Check service status
docker-compose ps
```

#### Option B: Using Docker Compose with Nginx

```bash
# Start with Nginx reverse proxy
docker-compose --profile with-nginx up -d
```

### 4. Access the Application

- **Without Nginx:** http://your-server-ip:3000
- **With Nginx:** http://your-server-ip

Default login credentials:
- Email: `bschneid7@gmail.com`
- Password: `Rodrigo1102`

**⚠️ Change the password immediately after first login!**

## Deployment Options

### Option 1: Docker Compose with External MongoDB (Recommended for Production)

Use MongoDB Atlas or external MongoDB instance:

```yaml
# docker-compose.yml - Remove mongo service, use external MONGO_URI
services:
  app:
    # ... existing config
    environment:
      MONGO_URI: mongodb+srv://user:pass@cluster.mongodb.net/binance_bot
```

### Option 2: Docker Compose with Local MongoDB

Use the included MongoDB container (default configuration):

```bash
docker-compose up -d
```

### Option 3: Standalone Docker Container

```bash
# Build the image
docker build -t binance-bot .

# Run the container
docker run -d \
  --name binance-bot \
  -p 3000:3000 \
  -e MONGO_URI="your-mongo-uri" \
  -e JWT_SECRET="your-jwt-secret" \
  -e JWT_REFRESH_SECRET="your-refresh-secret" \
  -e BINANCE_API_KEY="your-api-key" \
  -e BINANCE_API_SECRET="your-api-secret" \
  -e DOCKER_ENV=true \
  binance-bot
```

## Management Commands

### View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f app
```

### Restart Services

```bash
# Restart all
docker-compose restart

# Restart specific service
docker-compose restart app
```

### Stop Services

```bash
# Stop all services
docker-compose down

# Stop and remove volumes (⚠️ deletes data)
docker-compose down -v
```

### Update Application

```bash
# Pull latest changes
git pull origin main

# Rebuild and restart
docker-compose up -d --build
```

## Database Management

### Backup MongoDB Data

```bash
# Create backup
docker exec binance-bot-mongo mongodump \
  --uri="mongodb://admin:password@localhost:27017/binance_bot?authSource=admin" \
  --out=/data/backup

# Copy backup to host
docker cp binance-bot-mongo:/data/backup ./backup-$(date +%Y%m%d)
```

### Restore MongoDB Data

```bash
# Copy backup to container
docker cp ./backup binance-bot-mongo:/data/restore

# Restore data
docker exec binance-bot-mongo mongorestore \
  --uri="mongodb://admin:password@localhost:27017/binance_bot?authSource=admin" \
  /data/restore
```

### Reset User Password

```bash
# SSH into your server
ssh root@your-server-ip

# Navigate to app directory
cd /path/to/BinanceUSBot

# Run password reset script
docker exec -it binance-bot-app node scripts/reset-password.js \
  bschneid7@gmail.com NewPassword123
```

## Troubleshooting

### Container Won't Start

```bash
# Check logs
docker-compose logs app

# Common issues:
# 1. Missing environment variables - check .env file
# 2. Port already in use - change APP_PORT in .env
# 3. MongoDB connection failed - verify MONGO_URI
```

### Cannot Connect to MongoDB

```bash
# Test MongoDB connection
docker exec -it binance-bot-mongo mongosh \
  "mongodb://admin:password@localhost:27017/binance_bot?authSource=admin"

# Check MongoDB logs
docker-compose logs mongo
```

### Application Returns 502 Bad Gateway

```bash
# Check if app is running
docker-compose ps

# Restart app service
docker-compose restart app

# Check app logs for errors
docker-compose logs app
```

### Health Check Failing

```bash
# Test health endpoint manually
curl http://localhost:3000/api/health/ping

# Should return: {"status":"ok","timestamp":"..."}
```

## Security Best Practices

1. **Change Default Credentials:** Immediately change the default password after deployment
2. **Use Strong Secrets:** Generate cryptographically secure JWT secrets
3. **Enable Firewall:** Only expose necessary ports (80, 443, 22)
4. **IP Whitelisting:** Whitelist your VPS IP in Binance.US API settings
5. **Regular Updates:** Keep Docker images and dependencies updated
6. **SSL/TLS:** Use Nginx with Let's Encrypt for HTTPS in production
7. **Backup Regularly:** Schedule automatic database backups

## SSL/TLS Configuration (Production)

### Using Let's Encrypt with Nginx

1. Install Certbot:
```bash
apt-get update
apt-get install certbot python3-certbot-nginx
```

2. Obtain SSL certificate:
```bash
certbot --nginx -d yourdomain.com
```

3. Update `nginx/nginx.conf` with SSL configuration

4. Restart Nginx:
```bash
docker-compose restart nginx
```

## Monitoring and Maintenance

### Check Service Health

```bash
# Check all containers
docker-compose ps

# Check resource usage
docker stats

# Check disk usage
docker system df
```

### Clean Up Unused Resources

```bash
# Remove unused images
docker image prune -a

# Remove unused volumes
docker volume prune

# Remove unused networks
docker network prune
```

## Support

For issues or questions:
- GitHub Issues: https://github.com/bschneid7/BinanceUSBot/issues
- Documentation: See README.md and other docs in the repository

## License

See LICENSE file in the repository.

