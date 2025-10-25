const mongoose = require('mongoose');

const MONGO_URI = 'mongodb+srv://bschneid72:lYliCp9qOw2PQdMv@cluster0.ixowin.mongodb.net/binance_bot?retryWrites=true&w=majority&appName=Cluster0';

async function startEngine() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected\n');

    // Get user
    const User = mongoose.model('User', new mongoose.Schema({ email: String }));
    const user = await User.findOne({ email: 'bschneid7@gmail.com' });
    
    if (!user) {
      console.error('❌ User not found!');
      process.exit(1);
    }

    console.log(`✅ Found user: ${user.email}`);
    console.log(`   User ID: ${user._id}\n`);

    // Check/create BotState
    const BotState = mongoose.model('BotState', new mongoose.Schema({
      userId: mongoose.Schema.Types.ObjectId,
      isRunning: Boolean,
      equity: Number,
      currentR: Number,
      dailyPnl: Number,
      dailyPnlR: Number,
      weeklyPnl: Number,
      weeklyPnlR: Number,
      sessionStartDate: Date,
      weekStartDate: Date,
      status: String
    }, { timestamps: true }));

    let botState = await BotState.findOne({ userId: user._id });
    
    if (!botState) {
      console.log('📝 Creating new bot state...');
      botState = await BotState.create({
        userId: user._id,
        isRunning: true,
        status: 'ACTIVE',
        equity: 7500,  // Your actual account balance
        currentR: 45,  // 0.6% of 7500
        dailyPnl: 0,
        dailyPnlR: 0,
        weeklyPnl: 0,
        weeklyPnlR: 0,
        sessionStartDate: new Date(),
        weekStartDate: new Date()
      });
      console.log('✅ Bot state created');
    } else {
      console.log('📝 Updating existing bot state...');
      botState.isRunning = true;
      botState.status = 'ACTIVE';
      botState.equity = 7500;
      botState.currentR = 45;
      await botState.save();
      console.log('✅ Bot state updated');
    }

    console.log('\n═══════════════════════════════════════');
    console.log('🚀 TRADING ENGINE ACTIVATED');
    console.log('═══════════════════════════════════════');
    console.log(`Status: ${botState.status}`);
    console.log(`Running: ${botState.isRunning}`);
    console.log(`Equity: $${botState.equity}`);
    console.log(`Current R: $${botState.currentR}`);
    console.log('═══════════════════════════════════════\n');

    console.log('⚠️  NOTE: The trading engine scan loop will start');
    console.log('   when the server processes this state change.');
    console.log('   Check server logs to confirm scanning started.\n');

    console.log('📊 To verify, check:');
    console.log('   1. Server logs: journalctl -u binance-bot -f');
    console.log('   2. Dashboard: http://159.65.77.109');
    console.log('   3. Look for "[TradingEngine] Scanning..." messages\n');

    await mongoose.disconnect();
    console.log('✅ Done!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

startEngine();

