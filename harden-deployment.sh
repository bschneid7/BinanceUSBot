#!/bin/bash

# Exit on error and undefined variables
set -u

set -euo pipefail

echo "=== BinanceUSBot Deployment Hardening ==="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}Please run as root (sudo)${NC}"
    exit 1
fi

echo -e "${YELLOW}[1/8] Configuring UFW Firewall...${NC}"
# Install UFW if not present
if ! command -v ufw &> /dev/null; then
    apt-get update
    apt-get install -y ufw
fi

# Configure UFW
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'SSH'
ufw allow 80/tcp comment 'HTTP'
ufw allow 443/tcp comment 'HTTPS'
ufw --force enable
echo -e "${GREEN}✓ Firewall configured${NC}"

echo ""
echo -e "${YELLOW}[2/8] Configuring Time Synchronization...${NC}"
# Install and enable time sync
if ! systemctl is-active --quiet systemd-timesyncd; then
    systemctl enable systemd-timesyncd
    systemctl start systemd-timesyncd
fi
timedatectl set-ntp true
echo -e "${GREEN}✓ Time synchronization enabled${NC}"

echo ""
echo -e "${YELLOW}[3/8] Hardening SSH Configuration...${NC}"
# Backup SSH config
cp /etc/ssh/sshd_config /etc/ssh/sshd_config.backup

# Harden SSH
sed -i 's/#PermitRootLogin yes/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/#PubkeyAuthentication yes/PubkeyAuthentication yes/' /etc/ssh/sshd_config
sed -i 's/X11Forwarding yes/X11Forwarding no/' /etc/ssh/sshd_config

# Restart SSH
systemctl restart sshd
echo -e "${GREEN}✓ SSH hardened${NC}"

echo ""
echo -e "${YELLOW}[4/8] Installing Fail2Ban...${NC}"
if ! command -v fail2ban-client &> /dev/null; then
    apt-get install -y fail2ban
fi

# Configure Fail2Ban for SSH
cat > /etc/fail2ban/jail.local << 'EOF'
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5

[sshd]
enabled = true
port = 22
logpath = /var/log/auth.log
EOF

systemctl enable fail2ban
systemctl restart fail2ban
echo -e "${GREEN}✓ Fail2Ban installed and configured${NC}"

echo ""
echo -e "${YELLOW}[5/8] Setting File Permissions...${NC}"
# Ensure .env is not world-readable
if [ -f "/opt/binanceusbot/.env" ]; then
    chmod 600 /opt/binanceusbot/.env
    chown root:root /opt/binanceusbot/.env
    echo -e "${GREEN}✓ .env permissions secured${NC}"
else
    echo -e "${YELLOW}⚠ .env file not found - create it and run this script again${NC}"
fi

echo ""
echo -e "${YELLOW}[6/8] Configuring Automatic Security Updates...${NC}"
apt-get install -y unattended-upgrades
dpkg-reconfigure -plow unattended-upgrades
echo -e "${GREEN}✓ Automatic security updates enabled${NC}"

echo ""
echo -e "${YELLOW}[7/8] Hardening Kernel Parameters...${NC}"
cat > /etc/sysctl.d/99-binanceusbot-hardening.conf << 'EOF'
# IP Forwarding (disable if not needed)
net.ipv4.ip_forward = 0

# Syn flood protection
net.ipv4.tcp_syncookies = 1

# Ignore ICMP redirects
net.ipv4.conf.all.accept_redirects = 0
net.ipv6.conf.all.accept_redirects = 0

# Ignore source-routed packets
net.ipv4.conf.all.accept_source_route = 0
net.ipv6.conf.all.accept_source_route = 0

# Log martian packets
net.ipv4.conf.all.log_martians = 1
EOF

sysctl -p /etc/sysctl.d/99-binanceusbot-hardening.conf
echo -e "${GREEN}✓ Kernel parameters hardened${NC}"

echo ""
echo -e "${YELLOW}[8/8] Setting Up Backup Cron Job...${NC}"
# Create backup script
cat > /opt/binanceusbot/backup.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/opt/binanceusbot/backups"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# Backup MongoDB (if using local MongoDB)
# mongodump --out=$BACKUP_DIR/mongo_$DATE

# Backup .env and docker-compose
cp /opt/binanceusbot/.env $BACKUP_DIR/env_$DATE
cp /opt/binanceusbot/docker-compose.prod.yml $BACKUP_DIR/compose_$DATE.yml

# Keep only last 7 days of backups
find $BACKUP_DIR -type f -mtime +7 -delete

echo "Backup completed: $DATE"
EOF

chmod +x /opt/binanceusbot/backup.sh

# Add to crontab (daily at 2 AM)
(crontab -l 2>/dev/null; echo "0 2 * * * /opt/binanceusbot/backup.sh >> /var/log/binanceusbot-backup.log 2>&1") | crontab -
echo -e "${GREEN}✓ Daily backup cron job configured${NC}"

echo ""
echo -e "${GREEN}=== Hardening Complete ===${NC}"
echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo "1. Restrict Binance.US API key to droplet IP in Binance dashboard"
echo "2. Verify MongoDB is bound to localhost or VPC only"
echo "3. Enable MongoDB authentication if using remote database"
echo "4. Set up DigitalOcean droplet snapshots (weekly recommended)"
echo "5. Configure mongodump to encrypted S3/Spaces (if using MongoDB)"
echo "6. Review and update .env file with production secrets"
echo ""
echo -e "${YELLOW}Security Checklist:${NC}"
echo "✓ UFW firewall: allow 22,80,443 only"
echo "✓ SSH: key-only authentication, no root password"
echo "✓ Fail2Ban: SSH brute-force protection"
echo "✓ Time sync: systemd-timesyncd enabled"
echo "✓ Automatic security updates enabled"
echo "✓ Kernel hardening applied"
echo "✓ Daily backups configured"
echo ""
echo -e "${RED}IMPORTANT:${NC}"
echo "- Never commit .env to git"
echo "- Restrict API key to droplet IP"
echo "- Enable 2FA on Binance account"
echo "- Monitor /var/log/binanceusbot-backup.log"
echo ""

