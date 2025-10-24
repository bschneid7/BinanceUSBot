# BinanceUSBot - Deployment Instructions

## Overview

This trading bot requires a VPS or cloud server for 24/7 operation. It cannot be deployed to serverless platforms like Vercel due to its stateful nature and need for persistent connections.

## Prerequisites

### Server Requirements
- **VPS or Cloud Server** (DigitalOcean, AWS EC2, Azure VM, etc.)
- **OS**: Ubuntu 22.04 LTS (recommended)
- **Minimum Resources**: 
  - 2 vCPU
  - 4GB RAM
  - 50GB SSD
- **Docker and Docker Compose** installed

### Required Credentials
- **Binance.US API Key and Secret** (with trading permissions)
- **MongoDB credentials** (auto-generated or custom)
- **JWT secrets** (for authentication)

## Deployment Steps

### 1. Prepare Your Server

SSH into your server:
```bash
ssh root@your-server-ip
```

Install Docker and Docker Compose:
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

### 2. Clone the Repository

```bash
cd /opt
git clone https://github.com/bschneid7/BinanceUSBot.git
cd BinanceUSBot
```

### 3. Configure Environment Variables

Copy the deployment environment template:
```bash
cp .env.deploy .env.production
```

Edit the configuration file:
```bash
nano .env.production
```

**IMPORTANT**: Update the following values:

1. **MongoDB Password**:
   ```env
   MONGO_ROOT_PASSWORD=YourSecurePasswordHere123!
   MONGO_URI=mongodb://admin:YourSecurePasswordHere123!@mongo:27017/binance_bot?authSource=admin
   ```

2. **JWT Secrets** (generate using `openssl rand -base64 32`):
   ```env
   JWT_SECRET=<generated-secret-here>
   JWT_REFRESH_SECRET=<generated-secret-here>
   ```

3. **Binance API Credentials**:
   ```env
   BINANCE_API_KEY=your_actual_binance_api_key
   BINANCE_API_SECRET=your_actual_binance_api_secret
   ```

### 4. Build and Deploy with Docker

**Note**: The build process may show TypeScript warnings. These are non-critical and the application will still function correctly.

```bash
# Build and start all services
docker compose up -d --build

# This will:
# - Build the application (may take 5-10 minutes)
# - Start MongoDB database
# - Start the trading bot application
# - Set up networking between services
```

### 5. Monitor the Deployment

Check service status:
```bash
docker compose ps
```

View logs:
```bash
# All services
docker compose logs -f

# Just the app
docker compose logs -f app

# Last 100 lines
docker compose logs --tail=100 app
```

### 6. Create Admin User

Once the application is running, create an admin user:

```bash
# Enter the app container
docker compose exec app sh

# Run the seed script
cd server
node dist/scripts/db-seed-admin.js

# Exit the container
exit
```

Default credentials will be:
- **Email**: admin@binancebot.com
- **Password**: Admin123!@#

⚠️ **Change the password immediately after first login!**

### 7. Access the Application

The application will be available at:
- **Frontend**: http://your-server-ip:3000
- **API**: http://your-server-ip:3000/api

To test the API:
```bash
curl http://your-server-ip:3000/api/ping
```

Expected response:
```json
{"message":"pong"}
```

## Post-Deployment Configuration

### Set Up Firewall

```bash
# Allow SSH, HTTP, and application port
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 3000/tcp
sudo ufw enable
```

### Set Up Nginx Reverse Proxy (Optional)

If you want to use a domain name and SSL:

1. Install Nginx:
```bash
sudo apt-get install nginx certbot python3-certbot-nginx
```

2. Configure Nginx (create `/etc/nginx/sites-available/binancebot`):
```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

3. Enable the site:
```bash
sudo ln -s /etc/nginx/sites-available/binancebot /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

4. Get SSL certificate:
```bash
sudo certbot --nginx -d yourdomain.com
```

## Maintenance

### View Logs
```bash
docker compose logs -f app
```

### Restart Services
```bash
docker compose restart
```

### Update Application
```bash
git pull origin main
docker compose up -d --build
```

### Backup Database
```bash
docker compose exec mongo mongodump --out=/data/backup
docker cp binance-bot-mongo:/data/backup ./backup-$(date +%Y%m%d)
```

### Stop Services
```bash
docker compose down
```

## Troubleshooting

### Container Won't Start
```bash
# Check logs
docker compose logs app

# Check if port is in use
sudo netstat -tulpn | grep 3000
```

### MongoDB Connection Issues
```bash
# Check MongoDB status
docker compose ps mongo

# View MongoDB logs
docker compose logs mongo
```

### Build Errors
The application may show TypeScript compilation warnings during build. These are non-critical. As long as the build completes and the container starts, the application will function correctly.

If you encounter persistent issues:
```bash
# Clean Docker cache
docker system prune -a

# Rebuild from scratch
docker compose down
docker compose build --no-cache
docker compose up -d
```

## Security Recommendations

1. **Change default passwords** immediately after deployment
2. **Use strong JWT secrets** (minimum 32 characters)
3. **Enable firewall** (UFW or cloud provider security groups)
4. **Use SSH keys** instead of password authentication
5. **Keep Binance API keys secure** - never commit them to version control
6. **Regularly update** the server and application
7. **Monitor logs** for suspicious activity
8. **Use SSL/TLS** for production deployments

## Important Notes

- This bot trades real money on Binance.US - **test thoroughly before enabling live trading**
- Monitor the bot's performance regularly
- Understand the risk management settings before deployment
- Keep your API keys secure and never share them
- The bot operates 24/7 - ensure your server has adequate resources
- Consider setting up monitoring and alerting for production use

## Support

For issues related to the bot's code or functionality, refer to:
- [README.md](./README.md) - Full documentation
- [DEPLOYMENT.md](./DEPLOYMENT.md) - Detailed deployment guide
- [GitHub Issues](https://github.com/bschneid7/BinanceUSBot/issues) - Report bugs

## Disclaimer

This trading bot is provided as-is. Trading cryptocurrencies involves significant risk. Only trade with money you can afford to lose. The developers are not responsible for any financial losses incurred through the use of this software.

