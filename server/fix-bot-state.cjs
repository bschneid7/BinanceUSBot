const mongoose = require('mongoose');

const MONGO_URI = 'mongodb+srv://bschneid72:lYliCp9qOw2PQdMv@cluster0.ixowin.mongodb.net/binance_bot?retryWrites=true&w=majority&appName=Cluster0';

async function fixBotState() {
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

    // Find or create BotState
    let state = await BotState.findOne({ userId: user._id });

    if (!state) {
      console.log('No BotState found, creating new one...');
      state = new BotState({
        userId: user._id,
        isRunning: true,
        status: 'ACTIVE',
        equity: 7188.22,
        lastScanTimestamp: new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
      });
      await state.save();
      console.log('✓ BotState created\n');
    } else {
      console.log('Current BotState:');
      console.log(`  Is Running: ${state.isRunning}`);
      console.log(`  Status: ${state.status}`);
      console.log(`  Last Scan: ${state.lastScanTimestamp}`);
      console.log('');

      // Update to ensure it's running
      state.isRunning = true;
      state.status = 'ACTIVE';
      state.updatedAt = new Date();
      await state.save();
      console.log('✓ BotState updated to ACTIVE\n');
    }

    console.log('Final BotState:');
    console.log(`  Is Running: ${state.isRunning}`);
    console.log(`  Status: ${state.status}`);
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

fixBotState();

