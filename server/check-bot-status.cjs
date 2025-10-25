const mongoose = require('mongoose');

const MONGO_URI = 'mongodb+srv://bschneid72:lYliCp9qOw2PQdMv@cluster0.ixowin.mongodb.net/binance_bot?retryWrites=true&w=majority&appName=Cluster0';

async function checkStatus() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    // Get user
    const User = mongoose.model('User', new mongoose.Schema({ email: String }));
    const user = await User.findOne({ email: 'bschneid7@gmail.com' });
    
    if (!user) {
      console.error('❌ User not found!');
      process.exit(1);
    }

    // Get bot state
    const BotState = mongoose.model('BotState', new mongoose.Schema({
      userId: mongoose.Schema.Types.ObjectId,
      status: String,
      equity: Number,
      currentR: Number,
      dailyPnl: Number,
      weeklyPnl: Number,
      dailyPnlR: Number,
      weeklyPnlR: Number,
      sessionStartDate: Date,
      weekStartDate: Date
    }, { timestamps: true }));

    const state = await BotState.findOne({ userId: user._id });

    // Get positions
    const Position = mongoose.model('Position', new mongoose.Schema({
      userId: mongoose.Schema.Types.ObjectId,
      symbol: String,
      side: String,
      status: String,
      entry_price: Number,
      quantity: Number,
      stop_price: Number,
      unrealized_pnl: Number,
      realized_pnl: Number,
      playbook: String
    }, { timestamps: true }));

    const openPositions = await Position.find({ userId: user._id, status: 'OPEN' });
    const recentTrades = await Position.find({ userId: user._id }).sort({ createdAt: -1 }).limit(10);

    // Display status
    console.log('═══════════════════════════════════════════════════════');
    console.log('🤖 BINANCEUS BOT - REAL-TIME STATUS');
    console.log('═══════════════════════════════════════════════════════\n');

    if (state) {
      console.log('📊 BOT STATE:');
      console.log(`   Status: ${state.status || 'UNKNOWN'}`);
      console.log(`   Equity: $${(state.equity || 0).toFixed(2)}`);
      console.log(`   Current R: $${(state.currentR || 0).toFixed(2)}`);
      console.log(`   Daily PnL: $${(state.dailyPnl || 0).toFixed(2)} (${(state.dailyPnlR || 0).toFixed(2)}R)`);
      console.log(`   Weekly PnL: $${(state.weeklyPnl || 0).toFixed(2)} (${(state.weeklyPnlR || 0).toFixed(2)}R)`);
      console.log(`   Session Start: ${state.sessionStartDate ? state.sessionStartDate.toLocaleString() : 'N/A'}`);
      console.log(`   Week Start: ${state.weekStartDate ? state.weekStartDate.toLocaleString() : 'N/A'}`);
    } else {
      console.log('⚠️  BOT STATE: Not initialized');
      console.log('   The trading engine may not have started yet.');
    }

    console.log('\n───────────────────────────────────────────────────────\n');

    console.log(`📈 OPEN POSITIONS: ${openPositions.length}`);
    if (openPositions.length > 0) {
      console.log('');
      openPositions.forEach((pos, i) => {
        console.log(`   ${i + 1}. ${pos.symbol} ${pos.side}`);
        console.log(`      Playbook: ${pos.playbook || 'N/A'}`);
        console.log(`      Entry: $${(pos.entry_price || 0).toFixed(2)}`);
        console.log(`      Quantity: ${(pos.quantity || 0).toFixed(4)}`);
        console.log(`      Stop: $${(pos.stop_price || 0).toFixed(2)}`);
        console.log(`      Unrealized PnL: $${(pos.unrealized_pnl || 0).toFixed(2)}`);
        console.log(`      Status: ${pos.status}`);
        console.log('');
      });
    } else {
      console.log('   No open positions');
    }

    console.log('───────────────────────────────────────────────────────\n');

    console.log(`📜 RECENT TRADES: ${Math.min(recentTrades.length, 10)}`);
    if (recentTrades.length > 0) {
      console.log('');
      recentTrades.slice(0, 10).forEach((trade, i) => {
        console.log(`   ${i + 1}. ${trade.symbol} ${trade.side} - ${trade.status}`);
        console.log(`      Playbook: ${trade.playbook || 'N/A'}`);
        console.log(`      Entry: $${(trade.entry_price || 0).toFixed(2)}`);
        console.log(`      PnL: $${(trade.realized_pnl || trade.unrealized_pnl || 0).toFixed(2)}`);
        console.log(`      Time: ${trade.createdAt ? trade.createdAt.toLocaleString() : 'N/A'}`);
        console.log('');
      });
    } else {
      console.log('   No trades yet');
    }

    console.log('═══════════════════════════════════════════════════════\n');

    // Check if trading engine needs to be started
    if (!state || state.status !== 'ACTIVE') {
      console.log('⚠️  WARNING: Trading engine appears to be STOPPED');
      console.log('   The bot needs to be started from the dashboard or via API');
      console.log('   Login to http://159.65.77.109 and click "Start Bot"');
    } else if (openPositions.length === 0 && recentTrades.length === 0) {
      console.log('ℹ️  INFO: Bot is running but no trades yet');
      console.log('   This is normal - the bot is scanning for opportunities');
      console.log('   Trades will appear when signals are detected');
    }

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkStatus();

