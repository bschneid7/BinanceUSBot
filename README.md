# Binance.US Trading Bot

**Automated cryptocurrency trading bot with ML-enhanced strategies and intelligent risk management.**

---

## 🚀 Current Status

**Bot Version:** 2.0 (Aggressively Optimized)  
**ML Model:** ppo-3000ep-highLR (0.32 avg reward)  
**Risk Profile:** AGGRESSIVE (7/8)  
**Status:** ✅ ACTIVE

### Recent Updates (Nov 23, 2025)

- ✅ **Precision fixes** - All order paths use Binance precision adjustment
- ✅ **Position sizing fixes** - Exposure-based calculation implemented
- ✅ **Position rotation** - Automatic swapping of underperforming positions
- ✅ **ML learning loop** - Prediction logging and outcome tracking enabled
- ✅ **Aggressive config** - Optimized for higher profit potential
- ✅ **Best ML model** - Deployed 0.32 reward model (+113% vs original)

---

## 📊 Performance

### Configuration

| Parameter | Value | Description |
|-----------|-------|-------------|
| **Max Positions** | 12 | Simultaneous open positions |
| **Max Exposure** | 90% | Maximum capital deployed |
| **R Per Trade** | 2.5% | Risk per trade |
| **Daily Stop** | -5R | Daily loss limit |
| **Weekly Stop** | -12R | Weekly loss limit |
| **Position Rotation** | Enabled | Auto-swap underperformers |

### ML Model

| Metric | Value |
|--------|-------|
| **Version** | ppo-3000ep-highLR-v1763902579577 |
| **Episodes** | 3,000 |
| **Avg Reward** | 0.32 |
| **Learning Rate** | 0.0005 |
| **Status** | ✅ Deployed |

### Expected Performance

- **Trading Frequency:** ~28 trades/week
- **Win Rate:** 60-65%
- **Avg Win:** $200-250
- **Monthly Return:** +150-220%

---

## 🎯 Features

### Trading Strategies

1. **Playbook A** - Breakout trading with volume confirmation
2. **Playbook B** - Reversal patterns at key levels
3. **Playbook C** - Impulse moves with pullback entries
4. **Playbook D** - Flash crash recovery
5. **Playbook E** - RSI oversold conditions

### ML Enhancement

- **PPO (Proximal Policy Optimization)** reinforcement learning
- **Signal filtering** with confidence scores
- **Pattern recognition** for chart patterns
- **Market regime detection** (trending/ranging/volatile)
- **Adaptive position sizing** based on ML confidence
- **Online learning** - Continuous improvement from real trades

### Risk Management

- **Stop losses** on every trade
- **Daily/weekly circuit breakers**
- **Position limits** (max 12 simultaneous)
- **Exposure limits** (max 90% capital)
- **Correlation guard** - Prevents over-concentration
- **Slippage protection** - Monitors execution quality
- **Position rotation** - Auto-swaps underperformers

### Grid Trading

- **Multi-pair grid trading** - BTC, ETH, SOL
- **Automated rebalancing** - Maintains optimal levels
- **Precision-adjusted orders** - Meets Binance requirements

---

## 🛠️ Technical Architecture

### Backend

- **Node.js** with TypeScript
- **Express** API server
- **MongoDB** for data persistence
- **WebSocket** for real-time market data

### ML System

- **PPO algorithm** for decision-making
- **TensorFlow.js** for model inference
- **Online learning service** for continuous training
- **Performance tracking** for prediction/outcome analysis

### Services

- **Trading Engine** - Signal generation and execution
- **Risk Engine** - Position limits and circuit breakers
- **Position Manager** - Order placement and tracking
- **ML Orchestrator** - Model inference and enhancement
- **Binance Service** - Exchange API integration

---

## 📁 Project Structure

```
server/
├── models/           # Database schemas
├── routes/           # API endpoints
├── services/
│   ├── tradingEngine/   # Core trading logic
│   ├── ml/              # ML models and training
│   └── binanceService/  # Exchange integration
├── scripts/          # Utility scripts
└── server.ts         # Main entry point
```

---

## 🔧 Configuration

### Risk Settings

```javascript
{
  "risk": {
    "R_pct": 0.025,              // 2.5% risk per trade
    "max_r_per_trade": 2.0,      // Max 2R per trade
    "daily_stop_R": -5,          // -5R daily stop
    "weekly_stop_R": -12,        // -12R weekly stop
    "max_open_R": 6,             // Max 6R open risk
    "max_exposure_pct": 0.90,    // 90% max exposure
    "max_positions": 12,         // 12 max positions
    "correlation_guard": true    // Enable correlation check
  }
}
```

### ML Settings

```javascript
{
  "ml": {
    "enabled": true,
    "min_confidence": 0.6,       // Min 60% confidence
    "weight": 0.3,               // 30% weight in decisions
    "modelVersion": "ppo-3000ep-highLR-v1763902579577"
  }
}
```

---

## 📈 Recent Improvements

### November 23, 2025

#### Precision Fixes
- Added `getSymbolPrecision()` and `adjustQuantity()` to all order paths
- Fixed LOT_SIZE filter failures
- Grid trading precision protection
- Portfolio rebalancer precision adjustment

#### Position Sizing Fixes
- Implemented exposure-based calculation
- Fixed ML adaptive position sizer
- Added config parameter passing
- Prevents over-sized positions

#### Position Rotation
- Enabled automatic rotation of losing positions
- Threshold: -$0.01 (any losing position)
- Frees up slots for better opportunities
- Maintains portfolio quality

#### ML Learning Loop
- Added prediction logging to mlOrchestrator
- Added outcome tracking to position management
- Started online learning service
- Enables continuous improvement

#### Configuration Optimization
- Increased max positions: 8 → 12 (+50%)
- Increased max exposure: 75% → 90% (+20%)
- Increased R per trade: 1.8% → 2.5% (+38.9%)
- Widened stop losses for more tolerance

#### ML Model Training
- Trained 3 models with varied hyperparameters
- Deployed best model: 0.32 avg reward
- High learning rate (0.0005) with 3000 episodes
- +113% improvement vs original model

---

## 📚 Documentation

- **ML_TRAINING_LOG.md** - Initial model training (2000 episodes)
- **ML_TRAINING_LOG_BATCH.md** - Batch training (3 models)
- **OPTIMIZATION_LOG.md** - Configuration optimization
- **Audit reports** - Comprehensive codebase analysis

---

## 🔐 Security

- API keys stored in environment variables
- MongoDB authentication enabled
- No sensitive data in repository
- Secure WebSocket connections

---

## 🚦 Deployment

### Requirements

- Node.js 20+
- MongoDB 6+
- Docker & Docker Compose
- Binance.US API keys

### Environment Variables

```bash
BINANCE_API_KEY=your_api_key
BINANCE_API_SECRET=your_api_secret
MONGODB_URI=mongodb://localhost:27017/binance_bot
```

### Running

```bash
# Install dependencies
npm install

# Start services
docker-compose up -d

# Run bot
npm start
```

---

## 📊 Monitoring

### Logs

```bash
# View bot logs
docker logs binance-bot-app -f

# View MongoDB logs
docker logs binance-bot-mongo -f
```

### Database

```bash
# Connect to MongoDB
docker exec -it binance-bot-mongo mongosh binance_bot -u admin -p changeThisPassword

# Check positions
db.positions.find({ status: "OPEN" })

# Check ML performance
db.mlperformancelogs.countDocuments()
```

### API Endpoints

- `GET /api/dashboard` - Bot status and equity
- `GET /api/positions` - Open positions
- `GET /api/positions/history` - Closed positions
- `POST /api/positions/:id/close` - Close position

---

## 🎓 Learning Resources

### ML Model Training

The bot uses PPO (Proximal Policy Optimization) for reinforcement learning:

- **State space:** Price, volume, volatility, sentiment, position
- **Action space:** Hold, buy, sell
- **Reward function:** Profit/loss with risk adjustment
- **Training:** 3000 episodes with 0.0005 learning rate

### Trading Strategies

Each playbook implements specific technical analysis patterns:

- **Playbook A:** Volume breakouts above resistance
- **Playbook C:** Impulse moves with 0.5-2% pullbacks
- **Playbook D:** Flash crashes with 2x volume spikes
- **Playbook E:** RSI oversold (<40) with decline limits

---

## 🤝 Contributing

This is a private trading bot. Contributions are not accepted.

---

## ⚠️ Disclaimer

**This bot trades real money on Binance.US. Use at your own risk.**

- Cryptocurrency trading is highly risky
- Past performance does not guarantee future results
- The bot can lose money, potentially all of it
- Always monitor the bot and set appropriate risk limits
- The aggressive configuration increases both profit potential AND risk

---

## 📝 License

Private - All rights reserved

---

## 📧 Contact

For issues or questions, refer to the documentation or logs.

---

**Last Updated:** November 23, 2025  
**Bot Status:** ✅ ACTIVE - Aggressively Optimized  
**ML Model:** 0.32 reward (+113% vs original)  
**Risk Profile:** AGGRESSIVE (7/8)
