#!/bin/bash

###############################################################################
# Server Setup Script for Digital Ocean Ubuntu Server
#
# This script sets up a fresh Ubuntu server for running BinanceUSBot
# Run as root or with sudo
#
# Usage: curl -sSL https://your-repo/scripts/setup-server.sh | sudo bash
#        or
#        sudo bash setup-server.sh
###############################################################################


# Exit on error and undefined variables
set -u

set -e  # Exit on error

echo "============================================"
echo "BinanceUSBot - Server Setup Script"
echo "============================================"
echo ""

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   echo "❌ This script must be run as root or with sudo"
   exit 1
fi

echo "📦 Updating system packages..."
apt-get update -qq
apt-get upgrade -y -qq

echo ""
echo "🔧 Installing required packages..."
apt-get install -y -qq \
    curl \
    wget \
    git \
    ufw \
    fail2ban \
    htop \
    vim \
    unzip \
    software-properties-common \
    apt-transport-https \
    ca-certificates \
    gnupg \
    lsb-release

echo ""
echo "🐳 Installing Docker..."
# Remove old Docker versions if any
apt-get remove -y docker docker-engine docker.io containerd runc 2>/dev/null || true

# Add Docker's official GPG key
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

# Add Docker repository
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker Engine
apt-get update -qq
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Start and enable Docker
systemctl start docker
systemctl enable docker

echo ""
echo "✅ Docker installed successfully"
docker --version
docker compose version

echo ""
echo "🔥 Configuring firewall (UFW)..."
# Allow SSH
ufw allow 22/tcp
# Allow HTTP
ufw allow 80/tcp
# Allow HTTPS
ufw allow 443/tcp
# Enable firewall (non-interactive)
ufw --force enable
ufw status

echo ""
echo "🛡️  Configuring Fail2Ban..."
systemctl start fail2ban
systemctl enable fail2ban

echo ""
echo "👤 Creating application user..."
if ! id -u botuser > /dev/null 2>&1; then
    useradd -m -s /bin/bash botuser
    usermod -aG docker botuser
    echo "✅ User 'botuser' created and added to docker group"
else
    echo "ℹ️  User 'botuser' already exists"
fi

echo ""
echo "📁 Creating application directories..."
mkdir -p /opt/binance-bot
mkdir -p /opt/binance-bot/logs
mkdir -p /opt/binance-bot/backups
chown -R botuser:botuser /opt/binance-bot

echo ""
echo "⏰ Setting up timezone (UTC)..."
timedatectl set-timezone UTC

echo ""
echo "🔄 Installing Node.js (for local scripts)..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
echo "✅ Node.js installed:"
node --version
npm --version

echo ""
echo "🐍 Installing Python and ML dependencies (for PPO)..."
apt-get install -y python3 python3-pip python3-venv build-essential
echo "✅ Python installed:"
python3 --version
pip3 --version

echo ""
echo "📊 System Information:"
echo "-------------------------------------------"
echo "OS: $(lsb_release -d | cut -f2)"
echo "Kernel: $(uname -r)"
echo "Memory: $(free -h | awk '/^Mem:/ {print $2}')"
echo "Disk: $(df -h / | awk 'NR==2 {print $2}')"
echo "Docker: $(docker --version)"
echo "Docker Compose: $(docker compose version)"
echo "-------------------------------------------"

echo ""
echo "✨ Server setup completed successfully!"
echo ""
echo "📝 Next steps:"
echo "   1. Clone your repository to /opt/binance-bot"
echo "   2. Create .env.production file with your configuration (including PPO params)"
echo "   3. Run: cd /opt/binance-bot && sudo -u botuser docker compose up -d"
echo "   4. (Optional) Train PPO: docker-compose run --rm ppo-trainer"
echo "   5. Setup cron jobs for staking and tax generation"
echo ""
echo "⚙️  PPO Environment Variables:"
echo "   Add to .env.production:"
echo "   - PPO_EPISODES=1000"
echo "   - BUY_ALLOCATION=0.05"
echo "   - TRAILING_STOP=0.005"
echo "   - DRAWDOWN_CAP=0.3"
echo "   - STAKING_ENABLED=true"
echo "   - TAX_METHOD=HIFO"
echo ""
echo "🔐 Security recommendations:"
echo "   - Change SSH port from default 22"
echo "   - Set up SSH key authentication and disable password auth"
echo "   - Configure automatic security updates"
echo "   - Set up monitoring and alerts"
echo ""
