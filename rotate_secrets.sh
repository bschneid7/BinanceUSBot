#!/bin/bash
#
# Secret Rotation Script for BinanceUSBot
#
# This script helps you securely rotate production secrets.
# Run this on your VPS to update .env with new secure values.
#

set -e

echo "========================================="
echo " BinanceUSBot Secret Rotation"
echo "========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
  echo -e "${RED}Please run as root${NC}"
  exit 1
fi

# Navigate to project directory
cd /opt/binance-bot

# Backup current .env
echo -e "${YELLOW}[1/5] Backing up current .env...${NC}"
if [ -f .env ]; then
  cp .env .env.backup.$(date +%Y%m%d_%H%M%S)
  echo -e "${GREEN}✓ Backup created${NC}"
else
  echo -e "${YELLOW}! No existing .env found${NC}"
fi

# Generate new JWT secret
echo -e "${YELLOW}[2/5] Generating new JWT secret...${NC}"
NEW_JWT_SECRET=$(openssl rand -hex 64)
echo -e "${GREEN}✓ JWT secret generated (128 characters)${NC}"

# Generate new session secret
echo -e "${YELLOW}[3/5] Generating new session secret...${NC}"
NEW_SESSION_SECRET=$(openssl rand -hex 32)
echo -e "${GREEN}✓ Session secret generated (64 characters)${NC}"

# Update .env file
echo -e "${YELLOW}[4/5] Updating .env file...${NC}"

# Check if .env exists
if [ ! -f .env ]; then
  echo -e "${RED}Error: .env file not found${NC}"
  echo "Please create .env from .env.example first"
  exit 1
fi

# Update JWT_SECRET
if grep -q "^JWT_SECRET=" .env; then
  sed -i "s|^JWT_SECRET=.*|JWT_SECRET=${NEW_JWT_SECRET}|" .env
  echo -e "${GREEN}✓ JWT_SECRET updated${NC}"
else
  echo "JWT_SECRET=${NEW_JWT_SECRET}" >> .env
  echo -e "${GREEN}✓ JWT_SECRET added${NC}"
fi

# Update SESSION_SECRET
if grep -q "^SESSION_SECRET=" .env; then
  sed -i "s|^SESSION_SECRET=.*|SESSION_SECRET=${NEW_SESSION_SECRET}|" .env
  echo -e "${GREEN}✓ SESSION_SECRET updated${NC}"
else
  echo "SESSION_SECRET=${NEW_SESSION_SECRET}" >> .env
  echo -e "${GREEN}✓ SESSION_SECRET added${NC}"
fi

# Verify critical secrets are present
echo -e "${YELLOW}[5/5] Verifying configuration...${NC}"

MISSING_SECRETS=()

if ! grep -q "^BINANCE_API_KEY=" .env || grep -q "^BINANCE_API_KEY=$" .env; then
  MISSING_SECRETS+=("BINANCE_API_KEY")
fi

if ! grep -q "^BINANCE_API_SECRET=" .env || grep -q "^BINANCE_API_SECRET=$" .env; then
  MISSING_SECRETS+=("BINANCE_API_SECRET")
fi

if ! grep -q "^MONGODB_URI=" .env || grep -q "^MONGODB_URI=$" .env; then
  MISSING_SECRETS+=("MONGODB_URI")
fi

if [ ${#MISSING_SECRETS[@]} -gt 0 ]; then
  echo -e "${RED}⚠ Warning: The following secrets are missing or empty:${NC}"
  for secret in "${MISSING_SECRETS[@]}"; do
    echo -e "${RED}  - $secret${NC}"
  done
  echo ""
  echo "Please add these to .env manually"
else
  echo -e "${GREEN}✓ All critical secrets are present${NC}"
fi

# Set secure permissions
chmod 600 .env
echo -e "${GREEN}✓ Set .env permissions to 600 (owner read/write only)${NC}"

echo ""
echo "========================================="
echo -e "${GREEN}Secret rotation complete!${NC}"
echo "========================================="
echo ""
echo "Next steps:"
echo "1. Restart the bot: docker compose restart app"
echo "2. Verify the bot starts successfully"
echo "3. Delete old backups after confirming everything works"
echo ""
echo "Backup location: .env.backup.*"
echo ""
