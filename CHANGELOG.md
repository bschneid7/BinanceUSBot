# Changelog

All notable changes to BinanceUSBot will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.0.0] - 2025-11-11

### Added
- **TIER_3_AGGRESSIVE Signal Generation** - New aggressive tier with 1.5% impulse threshold for ranging markets
- **Mobile-Responsive Dashboard** - Full landscape orientation support with touch-friendly controls
- **Dynamic Equity Calculation** - Real-time sync from Binance API with delisted token handling
- **Equity Change Logging** - Tracks and logs equity changes >10% for transparency
- **Position Exclusion Logic** - Automatically excludes positions with unreasonable prices from equity calculation
- **CONFIGURATION.md** - Comprehensive current configuration documentation
- **CHANGELOG.md** - This file to track all changes

### Changed
- **Signal Tier:** TIER_2_MODERATE (2.0%) → TIER_3_AGGRESSIVE (1.5%) for higher signal frequency
- **Position Size:** 1.5% → 1.0% per trade (more conservative for higher frequency)
- **Max Positions:** 10 → 15 concurrent positions (better diversification)
- **ML Confidence:** 50% → 30% minimum (captures more opportunities)
- **Binance API Sync:** 90% → 80% pricing success threshold (more responsive)
- **Equity Safety Check:** Removed overly conservative comparison against old equity value
- **Dashboard Typography:** 16px → 14px base font on mobile for better readability
- **Dashboard Viewport:** Added landscape support and notched device handling

### Fixed
- **Negative Equity Issue** - Fixed calculation corrupted by delisted tokens (APEUSD, ZECUSD) returning $0 prices
- **Mobile Dashboard Rotation** - Dashboard now rotates to landscape view properly
- **Mobile Touch Targets** - Increased to 44px minimum (WCAG AAA compliant)
- **Equity Calculation Recovery** - Bot can now self-correct from corrupted equity states
- **Signal Generation** - Bot now generates signals for 1.5%+ market moves (was rejecting all <2.0%)

### Technical Details

**Commits:**
- `55d74d7` - Enable TIER_3_AGGRESSIVE (1.5% threshold) to increase signal generation
- `d5c1ec0` - Mobile UX optimization: landscape support and responsive design
- `7e7527f` - Improve equity calculation to handle delisted tokens and sync from Binance API

**Files Modified:**
- `server/config/signalTierConfig.ts` - Changed enabled tiers to TIER_3_AGGRESSIVE only
- `server/services/tradingEngine/signalGenerator.ts` - Updated PlaybookC impulse threshold to 1.5%
- `server/services/tradingEngine/index.ts` - Added position exclusion logic and improved Binance API sync
- `client/index.html` - Enhanced viewport meta tag for mobile
- `client/src/main.tsx` - Added mobile CSS import
- `client/src/cleanmymac-mobile.css` - New responsive styles for mobile

**Deployment:**
- Rebuilt Docker image with all changes
- Manual equity reset to $14,429.94 (from corrupted -$390.99)
- Verified signal generation and equity calculation working correctly

---

## [1.0.0] - 2025-11-02

### Initial Release
- **Autonomous 24/7 Trading** - Fully automated spot trading on Binance.US
- **Multiple Trading Playbooks** - Breakout, VWAP mean-reversion, event-driven, dip-buying strategies
- **PPO Reinforcement Learning** - TensorFlow.js-based ML optimization
- **Advanced Risk Management** - Position sizing, correlation guards, kill-switches
- **Tax Compliance** - HIFO lot tracking, Form 8949 generation, 1099-DA reconciliation
- **Real-Time Dashboard** - Account equity, positions, signals, performance metrics
- **Docker Deployment** - Complete containerized deployment with MongoDB
- **Digital Ocean Integration** - Production deployment on cloud infrastructure

**Initial Configuration:**
- Signal Tier: TIER_2_MODERATE (2.0% impulse threshold)
- Position Size: 1.5% per trade
- Max Positions: 10 concurrent
- ML Confidence: 50% minimum
- Dashboard: Desktop-optimized only

---

## Version History

| Version | Date | Description |
|---------|------|-------------|
| **2.0.0** | 2025-11-11 | TIER_3_AGGRESSIVE, mobile UX, dynamic equity |
| **1.0.0** | 2025-11-02 | Initial production release |

---

## Upgrade Guide

### From 1.0.0 to 2.0.0

**Breaking Changes:**
- Signal tier configuration changed - review and adjust if needed
- Position sizing reduced from 1.5% to 1.0%
- Equity calculation now excludes delisted tokens

**Migration Steps:**

1. **Pull Latest Code**
   ```bash
   cd /opt/binance-bot
   git pull origin main
   ```

2. **Review Configuration**
   - Check `server/config/signalTierConfig.ts` for tier settings
   - Verify position sizing in `server/services/tradingEngine/index.ts`

3. **Rebuild and Deploy**
   ```bash
   docker compose down
   docker compose up -d --build
   ```

4. **Verify Equity Calculation**
   - Check dashboard shows positive equity
   - Review logs for "Excluding" messages (delisted tokens)
   - Confirm Binance API sync is working

5. **Monitor Signal Generation**
   - Verify signals are being generated for 1.5%+ moves
   - Check logs for "Generated X signals" messages

**Rollback Plan:**
```bash
# If issues arise, rollback to 1.0.0
git checkout e84fce4  # Last 1.0.0 commit
docker compose up -d --build
```

---

## Future Roadmap

### Planned for 2.1.0
- [ ] Dynamic tier selection based on market volatility
- [ ] Automatic cleanup of delisted positions
- [ ] Enhanced mobile positions table (card-based layout)
- [ ] Equity change alerts (>20% changes)
- [ ] Historical equity tracking and charting

### Planned for 2.2.0
- [ ] Multi-timeframe signal confirmation
- [ ] Advanced ML model deployment
- [ ] Custom playbook builder
- [ ] Backtesting framework
- [ ] Performance attribution analysis

### Under Consideration
- [ ] Multi-exchange support (Coinbase, Kraken)
- [ ] Futures trading integration
- [ ] Social trading features
- [ ] Mobile app (React Native)
- [ ] Telegram bot integration

---

## Contributing

When contributing changes:

1. **Update CHANGELOG.md** with your changes under "Unreleased" section
2. **Update CONFIGURATION.md** if configuration changes
3. **Update README.md** if features are added/changed
4. **Follow commit message format:** `type: description`
   - `feat:` New feature
   - `fix:` Bug fix
   - `docs:` Documentation only
   - `refactor:` Code refactoring
   - `test:` Adding tests
   - `chore:` Maintenance tasks

---

## Support

For questions or issues:
- **GitHub Issues:** https://github.com/bschneid7/BinanceUSBot/issues
- **Documentation:** See [CONFIGURATION.md](./CONFIGURATION.md) for current settings
- **Deployment Help:** See [DEPLOYMENT.md](./DEPLOYMENT.md) for deployment guide

---

**Maintained by:** bschneid7  
**Last Updated:** November 11, 2025
