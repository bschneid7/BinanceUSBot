#!/bin/bash

# BinanceUSBot VPS Deployment Script
# This script deploys the bot to a VPS without Docker

set -e

echo "🚀 BinanceUSBot VPS Deployment Script"
echo "======================================"

# Configuration
APP_DIR="/opt/binance-bot"
SERVICE_NAME="binance-bot"
BACKUP_DIR="$APP_DIR/backups/$(date +%Y%m%d_%H%M%S)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Helper functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    log_error "Please run as root (use sudo)"
    exit 1
fi

# Stop the service if running
log_info "Stopping $SERVICE_NAME service..."
systemctl stop $SERVICE_NAME || log_warn "Service not running"

# Create backup directory
log_info "Creating backup directory..."
mkdir -p "$BACKUP_DIR"

# Backup current deployment
if [ -d "$APP_DIR/server" ]; then
    log_info "Backing up current deployment..."
    cp -r "$APP_DIR/server" "$BACKUP_DIR/" || log_warn "Backup failed"
    cp -r "$APP_DIR/client" "$BACKUP_DIR/" || log_warn "Backup failed"
fi

# Pull latest code
log_info "Pulling latest code from GitHub..."
cd "$APP_DIR"
git pull origin main || {
    log_error "Failed to pull latest code"
    exit 1
}

# Install dependencies
log_info "Installing dependencies..."

# Install shared dependencies
cd "$APP_DIR/shared"
npm install --legacy-peer-deps || {
    log_error "Failed to install shared dependencies"
    exit 1
}

# Install server dependencies
cd "$APP_DIR/server"
npm install --legacy-peer-deps || {
    log_error "Failed to install server dependencies"
    exit 1
}

# Install client dependencies
cd "$APP_DIR/client"
npm install --legacy-peer-deps || {
    log_error "Failed to install client dependencies"
    exit 1
}

# Build shared package
log_info "Building shared package..."
cd "$APP_DIR/shared"
npm run build || {
    log_error "Failed to build shared package"
    exit 1
}

# Build server
log_info "Building server..."
cd "$APP_DIR/server"
npm run build || {
    log_error "Failed to build server"
    exit 1
}

# Build client
log_info "Building client..."
cd "$APP_DIR/client"
npm run build || {
    log_error "Failed to build client"
    exit 1
}

# Restart the service
log_info "Starting $SERVICE_NAME service..."
systemctl start $SERVICE_NAME || {
    log_error "Failed to start service"
    exit 1
}

# Wait for service to start
sleep 5

# Check service status
log_info "Checking service status..."
if systemctl is-active --quiet $SERVICE_NAME; then
    log_info "✅ Service is running"
else
    log_error "❌ Service failed to start"
    log_info "Checking logs..."
    journalctl -u $SERVICE_NAME -n 50
    exit 1
fi

# Test health endpoint
log_info "Testing health endpoint..."
sleep 3
HEALTH_CHECK=$(curl -s http://localhost:3000/api/health/ping || echo "failed")
if [[ $HEALTH_CHECK == *"ok"* ]]; then
    log_info "✅ Health check passed"
else
    log_warn "⚠️  Health check failed, but service is running"
fi

echo ""
log_info "======================================"
log_info "🎉 Deployment completed successfully!"
log_info "======================================"
log_info "Service: $SERVICE_NAME"
log_info "Status: $(systemctl is-active $SERVICE_NAME)"
log_info "URL: http://$(hostname -I | awk '{print $1}'):3000"
log_info "Backup: $BACKUP_DIR"
echo ""
log_info "View logs: journalctl -u $SERVICE_NAME -f"
log_info "Check status: systemctl status $SERVICE_NAME"
echo ""

