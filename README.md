# BinanceUSBot

**Autonomous 24/7 Cryptocurrency Trading Bot for Binance.US**

A fully autonomous, headless trading bot designed for aggressive spot cryptocurrency trading on Binance.US with strict risk management, automatic execution, and CPA-ready tax compliance.

## 📋 Table of Contents

- [Features](#features)
- [Quick Start](#quick-start)
- [Deployment](#deployment)
- [Database Management](#database-management)
- [Testing](#testing)
- [Documentation](#documentation)
- [Project Structure](#project-structure)
- [Contributing](#contributing)

## ✨ Features

### Trading Engine
- **24/7 Autonomous Operation** - No manual intervention required
- **Multiple Trading Playbooks** - Breakout, VWAP mean-reversion, event-driven, and dip-buying strategies
- **PPO Reinforcement Learning** - Optimizes buy/sell decisions via TensorFlow.js (state: OHLCV/sentiment; actions: buy/sell/hold; rewards: profit - drawdown)
- **Advanced Risk Management** - Position sizing, correlation guards, kill-switches, 30% max drawdown cap
- **Smart Execution** - Maker-first orders, slippage protection, OCO brackets, 0.5% trailing stop-buy
- **Aggressive Trading** - 5% buy allocation per signal with ML sentiment integration

### Tax Compliance
- **Lot-Level Tracking** - HIFO (Highest-In-First-Out) cost basis calculation
- **Automated Reconciliation** - Monthly balance and PnL verification
- **Form 8949 Generation** - Ready for tax filing
- **1099-DA Support** - Reconciliation with broker statements

### Monitoring & Safety
- **Kill-Switches** - Daily (-2R) and weekly (-6R) loss limits with auto-recovery
- **Real-Time Alerts** - System health, trading events, errors
- **Performance Analytics** - Win rate, profit factor, equity curves, drawdown tracking
- **Reserve Management** - Maintains 20-30% cash reserve for opportunistic trading
- **Staking for Idle Assets** - Automatically stakes excess reserves to earn yield
- **Tax Automation** - Weekly HIFO reconciliation and Form 8949 generation

## 🚀 Quick Start

### Prerequisites

- Node.js 20+ and npm
- MongoDB 7.0+
- Binance.US API keys (trading permissions only)

### Local Development

1. **Clone the repository**
```bash
git clone https://github.com/your-username/binance-bot.git
cd binance-bot
```

2. **Install dependencies**
```bash
npm install
```

3. **Configure environment**
```bash
# Copy environment example
cp server/.env.example server/.env

# Edit server/.env with your configuration
nano server/.env
```

Required environment variables:
```env
PORT=3000
MONGO_URI=mongodb://localhost:27017/binance_bot
JWT_SECRET=your-jwt-secret-here
JWT_REFRESH_SECRET=your-jwt-refresh-secret-here
BINANCE_API_KEY=your-binance-api-key
BINANCE_API_SECRET=your-binance-api-secret

# PPO RL Configuration
PPO_EPISODES=1000
BUY_ALLOCATION=0.05
TRAILING_STOP=0.005
DRAWDOWN_CAP=0.3

# Optional features
STAKING_ENABLED=true
TAX_METHOD=HIFO
```

4. **Seed initial data**
```bash
# Create admin user (default: admin@binancebot.com / Admin123!@#)
npm run seed:admin
```

5. **(Optional) Train PPO Agent**
```bash
# Train reinforcement learning agent offline
npm run train:ppo
```

6. **Start development servers**
```bash
npm run dev
```

The application will be available at:
- **Frontend:** http://localhost:5173
- **Backend API:** http://localhost:3000/api

### Default Login Credentials

After seeding, use these credentials:
- **Email:** `admin@binancebot.com`
- **Password:** `Admin123!@#`

⚠️ **Change the password immediately after first login!**

## 🐳 Deployment

### Docker Deployment (Recommended)

Full deployment guide available in [DEPLOYMENT.md](./DEPLOYMENT.md)

#### Quick Docker Start

1. **Create production environment file**
```bash
cp .env.production.example .env.production
# Edit with your production credentials
```

2. **Deploy with Docker Compose**
```bash
# Build and start all services
npm run deploy:docker

# Or manually
docker compose up -d --build
```

3. **Verify deployment**
```bash
# Check service status
docker compose ps

# View logs
docker compose logs -f app

# Test API
curl http://localhost:3000/api/ping
```

### Digital Ocean Deployment

1. **Set up server**
```bash
# On your Digital Ocean droplet
curl -sSL https://raw.githubusercontent.com/your-repo/main/scripts/setup-server.sh | sudo bash
```

2. **Deploy application**
```bash
# Clone repository
git clone https://github.com/your-repo/binance-bot.git /opt/binance-bot
cd /opt/binance-bot

# Configure environment
cp .env.production.example .env.production
nano .env.production

# Run deployment script
./deploy.sh production
```

See [DEPLOYMENT.md](./DEPLOYMENT.md) for complete instructions.

## 🗄️ Database Management

### Seed Admin User

Creates an admin user with default bot configuration:

```bash
npm run seed:admin
```

Environment variables (optional):
- `ADMIN_EMAIL` - Admin email address (default: admin@binancebot.com)
- `ADMIN_PASSWORD` - Admin password (default: Admin123!@#)

### Database Cleanup

Removes old data to keep database lean:

```bash
npm run db:cleanup
```

This removes:
- Closed positions older than 90 days
- Alerts older than 30 days
- Signals older than 60 days
- (Preserves trade history for tax compliance)

### Database Reset

**⚠️ WARNING: Deletes ALL data!**

```bash
# Reset all data
npm run db:reset

# Reset but keep admin user
npm run db:reset -- --keep-admin
```

## 🤖 PPO Reinforcement Learning Integration

### Overview

The bot integrates PPO (Proximal Policy Optimization) reinforcement learning to optimize trading decisions. The PPO agent learns from historical data and adapts trading strategies based on market conditions.

**State Space (5 dimensions):**
- Normalized price
- Volume
- Volatility (ATR)
- Sentiment (ML-based)
- Current position

**Action Space:**
- 0 = Hold
- 1 = Buy
- 2 = Sell

**Reward Function:**
```
reward = profit - (drawdown_penalty if drawdown > 30%)
```

### Training the PPO Agent

**Offline Training (Recommended):**
```bash
# Train with default 1000 episodes
npm run train:ppo

# Train with custom episodes
PPO_EPISODES=5000 npm run train:ppo
```

**Training via API:**
```bash
curl -X POST http://localhost:3000/api/ppo/train \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"episodes": 1000}'
```

### Using PPO in Live Trading

The PPO agent can be queried during live trading to override static playbook rules during high volatility periods:

```typescript
// Get action from trained agent
const state = [
  normalizedPrice,
  normalizedVolume,
  volatility,
  sentimentScore,
  currentPosition
];

const action = await getPPOAction(state);
// Returns: { action: 1, actionName: 'buy' }
```

### PPO Configuration

Environment variables:
```env
PPO_EPISODES=1000          # Training episodes
BUY_ALLOCATION=0.05        # 5% of capital per trade
TRAILING_STOP=0.005        # 0.5% trailing stop
DRAWDOWN_CAP=0.3           # 30% max drawdown
```

### Deployment with PPO

The Docker setup includes a dedicated PPO training service:
```bash
# Train PPO offline before deployment
docker-compose run ppo-trainer

# Deploy with trained model
docker-compose up -d
```

## 🧪 Testing

### API Testing

Test all API endpoints:

```bash
npm run api:test
```

This tests:
- Authentication (login, register, logout)
- Bot status and dashboard
- Positions and trades
- Signals and alerts
- Configuration management
- Analytics and performance
- Tax reports

### Custom API Base URL

```bash
API_BASE_URL=http://your-server:3000 npm run api:test
```

### Manual Testing

1. **Health Check**
```bash
curl http://localhost:3000/api/ping
# Expected: {"message":"pong"}
```

2. **User Registration**
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test123!@#"}'
```

3. **Login**
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test123!@#"}'
```

## 📚 Documentation

- **[DEPLOYMENT.md](./DEPLOYMENT.md)** - Complete deployment guide for Digital Ocean with Docker
- **[QUICK_START_BINANCE.md](./QUICK_START_BINANCE.md)** - Binance.US API integration guide
- **[BINANCE_INTEGRATION_SUMMARY.md](./BINANCE_INTEGRATION_SUMMARY.md)** - Detailed integration documentation
- **[server/docs/BINANCE_INTEGRATION.md](./server/docs/BINANCE_INTEGRATION.md)** - Technical integration details

## 📁 Project Structure

```
binance-bot/
├── client/                 # React frontend (Vite + TypeScript)
│   ├── src/
│   │   ├── api/           # API client functions
│   │   ├── components/    # React components
│   │   ├── pages/         # Page components
│   │   └── types/         # TypeScript types
│   └── dist/              # Production build
│
├── server/                # Express backend (TypeScript)
│   ├── config/            # Configuration
│   ├── models/            # Mongoose models
│   ├── routes/            # API routes
│   ├── services/          # Business logic
│   │   └── tradingEngine/ # Trading bot core
│   ├── scripts/           # Database & testing scripts
│   └── dist/              # Compiled JavaScript
│
├── shared/                # Shared types & config
│   └── config/            # Role definitions
│
├── scripts/               # Management scripts
│   ├── setup-server.sh    # Server setup
│   ├── docker-deploy.sh   # Docker deployment
│   └── api-test.ts        # API testing
│
├── nginx/                 # Nginx configuration (optional)
├── docker-compose.yml     # Docker orchestration
├── Dockerfile             # Application container
└── deploy.sh              # Main deployment script
```

## 🛠️ Development

### Available Scripts

```bash
# Development
npm run dev                # Start all dev servers
npm run client             # Start frontend only
npm run server             # Start backend only

# Building
npm run build              # Build all packages
npm run build:docker       # Build Docker image

# Database
npm run seed:admin         # Create admin user
npm run db:cleanup         # Clean old data
npm run db:reset           # Reset database

# Testing
npm run api:test           # Test API endpoints
npm run lint               # Run linters

# Deployment
npm run deploy             # Full deployment
npm run deploy:docker      # Docker deployment only
```

### Technology Stack

**Frontend:**
- React 18 with TypeScript
- Vite (build tool)
- Tailwind CSS + shadcn/ui components
- React Router for routing
- Recharts for analytics visualization

**Backend:**
- Node.js + Express
- TypeScript
- MongoDB + Mongoose
- JWT authentication
- Binance.US API integration

**DevOps:**
- Docker + Docker Compose
- Nginx (optional reverse proxy)
- GitHub Actions (CI/CD - to be configured)

## 🔒 Security

- **API Keys:** Never commit .env files; use scoped API keys with trading-only permissions
- **Authentication:** JWT-based with access and refresh tokens
- **Withdrawal Protection:** Enable Binance withdrawal allowlist
- **Firewall:** UFW configured to allow only necessary ports
- **Rate Limiting:** Implemented in Nginx configuration
- **Regular Updates:** Keep dependencies and system packages up to date

## 📊 Monitoring

### Key Metrics

- **Performance:** Win rate, profit factor, Sharpe ratio
- **Risk:** Current drawdown, daily/weekly PnL (R multiples)
- **Execution:** Slippage, maker/taker ratio, order fill rate
- **System:** API latency, error rate, uptime

### Alerts

Configured alerts for:
- Kill-switch triggers (daily/weekly loss limits)
- Reserve breaches (below 20% floor)
- API connection issues
- Slippage spikes (>20 bps)
- Health check failures

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the ISC License - see the LICENSE file for details.

## ⚠️ Disclaimer

This software is for educational and research purposes only. Cryptocurrency trading carries significant risk. Past performance does not guarantee future results. Use at your own risk. The authors are not responsible for any financial losses incurred while using this software.

## 📞 Support

- **Documentation:** See [DEPLOYMENT.md](./DEPLOYMENT.md) and other docs
- **Issues:** https://github.com/your-username/binance-bot/issues
- **Discussions:** https://github.com/your-username/binance-bot/discussions

---

**Built with ❤️ by the BinanceUSBot Team**

*Last Updated: January 2025*
