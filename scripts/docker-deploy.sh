#!/bin/bash

###############################################################################
# Docker Deployment Script for BinanceUSBot
#
# This script handles deployment using Docker Compose
#
# Usage: bash scripts/docker-deploy.sh [options]
#
# Options:
#   --build      Force rebuild of images
#   --pull       Pull latest images before starting
#   --restart    Restart services
#   --logs       Show logs after deployment
###############################################################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Parse command line arguments
BUILD_FLAG=""
PULL_FLAG=""
RESTART_FLAG=false
SHOW_LOGS=false

for arg in "$@"; do
    case $arg in
        --build)
            BUILD_FLAG="--build"
            shift
            ;;
        --pull)
            PULL_FLAG="--pull always"
            shift
            ;;
        --restart)
            RESTART_FLAG=true
            shift
            ;;
        --logs)
            SHOW_LOGS=true
            shift
            ;;
    esac
done

echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}BinanceUSBot - Docker Deployment${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker is not installed. Please install Docker first.${NC}"
    exit 1
fi

# Check if Docker Compose is available
if ! docker compose version &> /dev/null; then
    echo -e "${RED}❌ Docker Compose is not available. Please install Docker Compose plugin.${NC}"
    exit 1
fi

# Check if .env.production exists
if [ ! -f .env.production ]; then
    echo -e "${YELLOW}⚠️  Warning: .env.production file not found${NC}"
    echo -e "${YELLOW}   Creating from .env.production.example...${NC}"

    if [ -f .env.production.example ]; then
        cp .env.production.example .env.production
        echo -e "${YELLOW}   Please edit .env.production with your actual values${NC}"
        exit 1
    else
        echo -e "${RED}❌ .env.production.example not found${NC}"
        exit 1
    fi
fi

echo -e "${GREEN}✅ Environment file found${NC}"

# Load environment variables
set -a
source .env.production
set +a

echo ""
echo -e "${BLUE}📊 Deployment Configuration:${NC}"
echo "   Environment: ${NODE_ENV:-production}"
echo "   App Port: ${APP_PORT:-3000}"
echo "   MongoDB Database: ${MONGO_DB_NAME:-binance_bot}"
echo ""

# Check if restart flag is set
if [ "$RESTART_FLAG" = true ]; then
    echo -e "${YELLOW}🔄 Restarting services...${NC}"
    docker compose restart
    echo -e "${GREEN}✅ Services restarted${NC}"

    if [ "$SHOW_LOGS" = true ]; then
        docker compose logs -f
    fi
    exit 0
fi

# Stop existing containers if running
if docker compose ps | grep -q "Up"; then
    echo -e "${YELLOW}🛑 Stopping existing containers...${NC}"
    docker compose down
fi

# Pull or build images
if [ -n "$PULL_FLAG" ]; then
    echo -e "${BLUE}📥 Pulling latest images...${NC}"
    docker compose pull
fi

if [ -n "$BUILD_FLAG" ]; then
    echo -e "${BLUE}🔨 Building images...${NC}"
    docker compose build --no-cache
fi

# Start services
echo ""
echo -e "${BLUE}🚀 Starting services...${NC}"
docker compose up -d $PULL_FLAG $BUILD_FLAG

# Wait for services to be healthy
echo ""
echo -e "${BLUE}⏳ Waiting for services to be healthy...${NC}"
sleep 5

# Check service status
echo ""
echo -e "${BLUE}📊 Service Status:${NC}"
docker compose ps

# Check health of services
MAX_RETRIES=30
RETRY_COUNT=0
HEALTHY=false

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if docker compose ps | grep -q "healthy"; then
        HEALTHY=true
        break
    fi

    RETRY_COUNT=$((RETRY_COUNT + 1))
    echo -e "${YELLOW}   Waiting for services to become healthy... ($RETRY_COUNT/$MAX_RETRIES)${NC}"
    sleep 2
done

if [ "$HEALTHY" = true ]; then
    echo -e "${GREEN}✅ All services are healthy${NC}"
else
    echo -e "${YELLOW}⚠️  Services may still be starting up. Check logs for details.${NC}"
fi

# Show container information
echo ""
echo -e "${BLUE}🐳 Container Information:${NC}"
docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"

# Show resource usage
echo ""
echo -e "${BLUE}💾 Resource Usage:${NC}"
docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}" \
    $(docker compose ps -q)

# Print access information
echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}✨ Deployment completed successfully!${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo -e "${BLUE}📍 Access Information:${NC}"
echo "   Application: http://localhost:${APP_PORT:-3000}"
echo "   API Health: http://localhost:${APP_PORT:-3000}/api/ping"
echo "   MongoDB: localhost:${MONGO_PORT:-27017}"
echo ""
echo -e "${BLUE}🔧 Useful Commands:${NC}"
echo "   View logs:           docker compose logs -f"
echo "   View app logs:       docker compose logs -f app"
echo "   View mongo logs:     docker compose logs -f mongo"
echo "   Stop services:       docker compose down"
echo "   Restart services:    docker compose restart"
echo "   Check status:        docker compose ps"
echo ""

# Show logs if requested
if [ "$SHOW_LOGS" = true ]; then
    echo -e "${BLUE}📋 Showing logs (press Ctrl+C to exit)...${NC}"
    docker compose logs -f
fi
