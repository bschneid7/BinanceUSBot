const mongoose = require('mongoose');

const MONGO_URI = 'mongodb+srv://bschneid72:lYliCp9qOw2PQdMv@cluster0.ixowin.mongodb.net/binance_bot?retryWrites=true&w=majority&appName=Cluster0';

async function updateEquity() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✓ Connected\n');

    const User = mongoose.model('User', new mongoose.Schema({}));
    const BotState = mongoose.model('BotState', new mongoose.Schema({}));

    const user = await User.findOne({});
    if (!user) {
      console.error('ERROR: No user found!');
      process.exit(1);
    }

    console.log(`User ID: ${user._id}\n`);

    // Find BotState
    let state = await BotState.findOne({ userId: user._id });

    if (!state) {
      console.log('No BotState found, creating new one with correct equity...');
      state = new BotState({
        userId: user._id,
        isRunning: true,
        status: 'ACTIVE',
        equity: 7188.22,
        currentR: 43.13,
        dailyPnl: 0,
        dailyPnlR: 0,
        weeklyPnl: 0,
        weeklyPnlR: 0,
        lastScanTimestamp: new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
      });
      await state.save();
      console.log('✓ BotState created with equity: $7,188.22\n');
    } else {
      console.log('Current BotState:');
      console.log(`  Equity: $${state.equity}`);
      console.log(`  Current R: $${state.currentR}`);
      console.log('');

      // Update to correct values
      state.equity = 7188.22;
      state.currentR = 43.13; // 0.6% of 7188.22
      state.updatedAt = new Date();
      await state.save();
      console.log('✓ BotState updated!\n');
    }

    console.log('Final BotState:');
    console.log(`  Equity: $${state.equity}`);
    console.log(`  Current R: $${state.currentR}`);
    console.log(`  Status: ${state.status}`);
    console.log(`  Is Running: ${state.isRunning}`);
    console.log('');

    await mongoose.disconnect();
    console.log('✓ Done!');
    process.exit(0);

  } catch (error) {
    console.error('ERROR:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

updateEquity();

