# Database Seeding Scripts

This directory contains utility scripts for seeding the database with initial configuration and test data for the Binance.US Trading Bot.

## Available Scripts

### 1. `seedDatabase.ts` - Complete Database Seed (Recommended)

**Purpose:** Comprehensive seeding script that sets up everything needed for a complete testing environment.

**What it creates:**
- ✅ **Admin User** (`admin@tradingbot.com` / `admin123`)
- ✅ **Test User** (`test@example.com` / `password123`)
- ✅ **Bot Configuration** - Default configuration based on specification
- ✅ **Sample Positions** - 5 positions (3 open, 2 closed)
- ✅ **Historical Trades** - 8 trades with various outcomes (5W / 2L / 1BE)
- ✅ **Trading Signals** - 8 signals (3 executed, 5 skipped)
- ✅ **System Alerts** - 10 alerts across all severity levels

**Usage:**
```bash
# From project root
npm run seed

# From server directory
npm run seed

# Direct execution
cd server && tsx scripts/seedDatabase.ts
```

**Features:**
- Idempotent: Safe to run multiple times
- Clears existing data before seeding
- Creates realistic test data with proper timestamps
- Provides detailed console output with emojis for easy reading

---

### 2. `seedPositions.ts` - Positions Only

**Purpose:** Seeds only trading positions for quick testing of position-related features.

**What it creates:**
- 5 sample positions (3 open, 2 closed)
- Requires at least one user to exist in database

**Usage:**
```bash
# From project root
npm run seed:positions

# From server directory
npm run seed:positions

# Direct execution
cd server && tsx scripts/seedPositions.ts
```

---

### 3. `createTestUser.ts` - Test User Only

**Purpose:** Creates a single test user for development.

**What it creates:**
- Test user: `test@example.com` / `password123`

**Usage:**
```bash
# From project root
npm run seed:user

# From server directory
npm run seed:user

# Direct execution
cd server && tsx scripts/createTestUser.ts
```

---

## Database Models Created

### Users
- **Admin User**: Full administrative access
  - Email: `admin@tradingbot.com`
  - Password: `admin123`
  - Role: `admin`

- **Test User**: Standard trading user
  - Email: `test@example.com`
  - Password: `password123`
  - Role: `user`

### Bot Configuration
Default configuration based on the trading bot specification:
- **Scanner Settings**: BTCUSDT, ETHUSDT, SOLUSDT pairs
- **Risk Parameters**: 0.60% R, -2.0R daily stop, -6.0R weekly stop
- **Reserve Policy**: 30% target, 20% floor
- **Playbooks**: All 4 playbooks (A/B/C/D) enabled with default parameters

### Positions
- **3 Open Positions**: BTCUSDT, ETHUSDT, SOLUSDT with unrealized P&L
- **2 Closed Positions**: Historical positions with realized P&L

### Trades
- **8 Historical Trades**: Mix of wins, losses, and breakeven
- Realistic P&L values and hold times
- Detailed notes for each trade

### Signals
- **3 Executed Signals**: Matches open positions
- **5 Skipped Signals**: Various skip reasons (max positions, reserve breach, cooldown, correlation guard, spread)

### Alerts
- **10 System Alerts**: INFO, WARNING, ERROR, and CRITICAL levels
- Realistic alert messages and timestamps

---

## Workflow Recommendations

### Initial Setup
```bash
# 1. Start with fresh database
npm run seed
```

### Reset Test Data
```bash
# Clear and reseed everything
npm run seed
```

### Add More Positions
```bash
# Add positions without affecting users or config
npm run seed:positions
```

### Just Create Test User
```bash
# For minimal setup
npm run seed:user
```

---

## Environment Requirements

- MongoDB connection string in `.env` file (`MONGODB_URI`)
- Database must be accessible
- Node.js environment with TypeScript support

---

## Script Output

All scripts provide detailed console output:
- ✅ Success indicators
- ℹ️ Information messages
- ⚠️ Warnings
- ❌ Error messages
- 📊 Summary statistics

---

## Troubleshooting

### "No users found in database"
**Solution:** Run `npm run seed:user` or `npm run seed` first to create users.

### "Connection error"
**Solution:** Check MongoDB connection string in `.env` file and ensure database is running.

### "User already exists"
**Solution:** Scripts are idempotent. Existing users will be preserved and script will continue.

---

## Data Cleanup

To clean up test data:

```bash
# Option 1: Drop entire database (requires manual operation)
# mongosh
# use <database_name>
# db.dropDatabase()

# Option 2: Run seed script again (clears and recreates)
npm run seed
```

---

## Notes

- All timestamps are relative to current time for realistic data
- Position P&L values are calculated realistically
- Trade history spans last 7 days
- Signals and alerts are recent (last 2 hours)
- Scripts handle existing data gracefully
- Safe to run in development and staging environments
- **DO NOT** run in production without proper backup!

---

## Development

To modify seed data:
1. Edit the relevant script in `server/scripts/`
2. Adjust sample data arrays
3. Run the script to test
4. Commit changes

For questions or issues, refer to the main project documentation.
