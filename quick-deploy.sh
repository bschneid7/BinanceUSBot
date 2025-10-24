#!/bin/bash

# BinanceUSBot Quick Deployment Script
# This script helps you deploy the bot quickly with minimal configuration

set -e

echo "========================================="
echo "BinanceUSBot Quick Deployment"
echo "========================================="
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first:"
    echo "   curl -fsSL https://get.docker.com -o get-docker.sh"
    echo "   sudo sh get-docker.sh"
    exit 1
fi

# Check if Docker Compose is installed
if ! docker compose version &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install it first:"
    echo "   sudo apt-get install docker-compose-plugin"
    exit 1
fi

echo "✓ Docker and Docker Compose are installed"
echo ""

# Check if .env.production exists
if [ ! -f .env.production ]; then
    echo "📝 Creating .env.production from template..."
    cp .env.deploy .env.production
    echo "✓ .env.production created"
    echo ""
    echo "⚠️  IMPORTANT: You must edit .env.production before deploying!"
    echo "   Please update the following:"
    echo "   - MONGO_ROOT_PASSWORD"
    echo "   - JWT_SECRET"
    echo "   - JWT_REFRESH_SECRET"
    echo "   - BINANCE_API_KEY"
    echo "   - BINANCE_API_SECRET"
    echo ""
    echo "   Generate JWT secrets with: openssl rand -base64 32"
    echo ""
    read -p "Press Enter after you've edited .env.production..."
fi

# Validate critical environment variables
echo "🔍 Validating configuration..."

if grep -q "CHANGE_THIS" .env.production; then
    echo "❌ Error: .env.production still contains placeholder values!"
    echo "   Please edit .env.production and replace all CHANGE_THIS values"
    exit 1
fi

if grep -q "your_binance_api_key_here" .env.production; then
    echo "❌ Error: Binance API credentials not configured!"
    echo "   Please edit .env.production and add your Binance API key and secret"
    exit 1
fi

echo "✓ Configuration validated"
echo ""

# Build and deploy
echo "🚀 Building and deploying..."
echo "   This may take 5-10 minutes..."
echo ""

docker compose up -d --build

echo ""
echo "⏳ Waiting for services to start..."
sleep 10

# Check if services are running
if docker compose ps | grep -q "Up"; then
    echo "✓ Services are running"
else
    echo "❌ Services failed to start. Check logs with: docker compose logs"
    exit 1
fi

echo ""
echo "========================================="
echo "✅ Deployment Complete!"
echo "========================================="
echo ""
echo "Next steps:"
echo ""
echo "1. Create admin user:"
echo "   docker compose exec app sh -c 'cd server && node dist/scripts/db-seed-admin.js'"
echo ""
echo "2. Access the application:"
echo "   Frontend: http://$(hostname -I | awk '{print $1}'):3000"
echo "   API: http://$(hostname -I | awk '{print $1}'):3000/api"
echo ""
echo "3. Default login credentials:"
echo "   Email: admin@binancebot.com"
echo "   Password: Admin123!@#"
echo "   ⚠️  Change the password immediately after login!"
echo ""
echo "4. View logs:"
echo "   docker compose logs -f app"
echo ""
echo "5. Monitor services:"
echo "   docker compose ps"
echo ""
echo "========================================="
echo ""
echo "⚠️  IMPORTANT SECURITY REMINDERS:"
echo "   - Change default admin password immediately"
echo "   - Never share your Binance API keys"
echo "   - This bot trades real money - test thoroughly"
echo "   - Monitor the bot's activity regularly"
echo ""
echo "For detailed documentation, see:"
echo "   - DEPLOYMENT_INSTRUCTIONS.md"
echo "   - README.md"
echo "   - DEPLOYMENT.md"
echo ""

