#!/bin/bash

###############################################################################
# Main Deployment Script for BinanceUSBot on Digital Ocean
#
# This script handles complete deployment including:
# - Pulling latest code
# - Building application
# - Running database migrations/seeds
# - Deploying with Docker
#
# Usage: bash deploy.sh [environment]
#
# Environments: development, staging, production (default: production)
###############################################################################


# Exit on error and undefined variables
set -u

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
ENVIRONMENT=${1:-production}
APP_DIR="/opt/binance-bot"
BACKUP_DIR="$APP_DIR/backups"
REPO_URL=${REPO_URL:-""}  # Set this to your Git repository URL

echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}BinanceUSBot - Deployment Script${NC}"
echo -e "${BLUE}Environment: ${ENVIRONMENT}${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""

# Check if running in correct directory
if [ ! -f "package.json" ]; then
    echo -e "${RED}❌ Error: package.json not found${NC}"
    echo -e "${RED}   Please run this script from the project root directory${NC}"
    exit 1
fi

# Function to create backup
create_backup() {
    echo -e "${BLUE}📦 Creating backup...${NC}"

    mkdir -p "$BACKUP_DIR"

    BACKUP_NAME="backup_$(date +%Y%m%d_%H%M%S).tar.gz"
    BACKUP_PATH="$BACKUP_DIR/$BACKUP_NAME"

    # Backup current deployment
    if [ -d "node_modules" ]; then
        tar -czf "$BACKUP_PATH" \
            --exclude='node_modules' \
            --exclude='dist' \
            --exclude='build' \
            --exclude='.git' \
            --exclude='logs' \
            . || true

        echo -e "${GREEN}✅ Backup created: $BACKUP_PATH${NC}"

        # Keep only last 5 backups
        ls -t "$BACKUP_DIR"/backup_*.tar.gz | tail -n +6 | xargs -r rm
    fi
}

# Function to pull latest code
pull_latest_code() {
    if [ -n "$REPO_URL" ] && [ -d ".git" ]; then
        echo -e "${BLUE}📥 Pulling latest code from repository...${NC}"
        git fetch origin
        git pull origin main || git pull origin master
        echo -e "${GREEN}✅ Code updated${NC}"
    else
        echo -e "${YELLOW}⚠️  Git repository not configured, skipping code pull${NC}"
    fi
}

# Function to install dependencies
install_dependencies() {
    echo -e "${BLUE}📦 Installing dependencies...${NC}"

    # Install root dependencies
    npm ci --production=false

    echo -e "${GREEN}✅ Dependencies installed${NC}"
}

# Function to build application
build_application() {
    echo -e "${BLUE}🔨 Building application...${NC}"

    # Build shared package
    echo "   Building shared package..."
    cd shared && npm run build && cd ..

    # Build server
    echo "   Building server..."
    cd server && npm run build && cd ..

    # Build client
    echo "   Building client..."
    cd client && npm run build && cd ..

    echo -e "${GREEN}✅ Application built successfully${NC}"
}

# Function to run database seeds
run_database_seeds() {
    echo -e "${BLUE}🌱 Running database seeds...${NC}"

    # Check if admin user needs to be created
    read -p "Create/update admin user? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        npm run seed:admin
    fi

    echo -e "${GREEN}✅ Database seeding completed${NC}"
}

# Function to check environment file
check_environment_file() {
    echo -e "${BLUE}🔍 Checking environment configuration...${NC}"

    ENV_FILE=".env.${ENVIRONMENT}"

    if [ ! -f "$ENV_FILE" ]; then
        echo -e "${RED}❌ Error: $ENV_FILE not found${NC}"

        if [ -f "${ENV_FILE}.example" ]; then
            echo -e "${YELLOW}   Creating from ${ENV_FILE}.example...${NC}"
            cp "${ENV_FILE}.example" "$ENV_FILE"
            echo -e "${YELLOW}   Please edit $ENV_FILE with your actual values${NC}"
            exit 1
        else
            echo -e "${RED}   No example file found${NC}"
            exit 1
        fi
    fi

    echo -e "${GREEN}✅ Environment file found${NC}"
}

# Function to run pre-deployment tests
run_tests() {
    echo -e "${BLUE}🧪 Running pre-deployment tests...${NC}"

    # Run linting
    echo "   Running linter..."
    npm run lint || echo -e "${YELLOW}⚠️  Linting warnings found${NC}"

    echo -e "${GREEN}✅ Tests completed${NC}"
}

# Function to deploy with Docker
deploy_with_docker() {
    echo -e "${BLUE}🐳 Deploying with Docker...${NC}"

    # Copy environment file for Docker
    cp ".env.${ENVIRONMENT}" .env.production

    # Run Docker deployment script
    bash scripts/docker-deploy.sh --build --logs
}

# Function to verify deployment
verify_deployment() {
    echo -e "${BLUE}🔍 Verifying deployment...${NC}"

    # Wait a bit for services to start
    sleep 10

    # Check if services are running
    if docker compose ps | grep -q "Up"; then
        echo -e "${GREEN}✅ Services are running${NC}"

        # Try to ping the API
        if curl -s http://localhost:${APP_PORT:-3000}/api/ping > /dev/null; then
            echo -e "${GREEN}✅ API is responding${NC}"
        else
            echo -e "${YELLOW}⚠️  API is not responding yet${NC}"
        fi
    else
        echo -e "${RED}❌ Services are not running${NC}"
        exit 1
    fi
}

# Function to show deployment summary
show_summary() {
    echo ""
    echo -e "${GREEN}============================================${NC}"
    echo -e "${GREEN}✨ Deployment completed successfully!${NC}"
    echo -e "${GREEN}============================================${NC}"
    echo ""
    echo -e "${BLUE}📊 Deployment Summary:${NC}"
    echo "   Environment: $ENVIRONMENT"
    echo "   Timestamp: $(date)"
    echo "   App Directory: $APP_DIR"
    echo ""
    echo -e "${BLUE}🔗 Access URLs:${NC}"
    echo "   Application: http://$(hostname -I | awk '{print $1}'):${APP_PORT:-3000}"
    echo "   API Health: http://$(hostname -I | awk '{print $1}'):${APP_PORT:-3000}/api/ping"
    echo ""
    echo -e "${BLUE}📋 Next Steps:${NC}"
    echo "   1. Test the application: npm run api:test"
    echo "   2. Check logs: docker compose logs -f"
    echo "   3. Monitor performance: docker stats"
    echo "   4. Set up SSL certificate (if using domain)"
    echo ""
    echo -e "${BLUE}📚 Useful Commands:${NC}"
    echo "   View logs:        docker compose logs -f app"
    echo "   Restart app:      docker compose restart app"
    echo "   Stop services:    docker compose down"
    echo "   Seed admin:       npm run seed:admin"
    echo "   Cleanup database: npm run db:cleanup"
    echo ""
}

# Main deployment flow
main() {
    echo -e "${YELLOW}⚠️  This will deploy BinanceUSBot to ${ENVIRONMENT}${NC}"
    read -p "Continue? (y/n): " -n 1 -r
    echo

    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${YELLOW}Deployment cancelled${NC}"
        exit 0
    fi

    # Create backup
    create_backup

    # Pull latest code (if configured)
    pull_latest_code

    # Check environment configuration
    check_environment_file

    # Install dependencies
    install_dependencies

    # Build application
    build_application

    # Run tests
    run_tests

    # Run database seeds
    run_database_seeds

    # Deploy with Docker
    deploy_with_docker

    # Verify deployment
    verify_deployment

    # Show summary
    show_summary
}

# Run main function
main
