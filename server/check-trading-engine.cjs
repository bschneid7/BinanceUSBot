const mongoose = require('mongoose');

const MONGO_URI = 'mongodb+srv://bschneid72:lYliCp9qOw2PQdMv@cluster0.ixowin.mongodb.net/binance_bot?retryWrites=true&w=majority&appName=Cluster0';

async function checkEngine() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✓ Connected\n');

    const BotState = mongoose.model('BotState', new mongoose.Schema({}));
    const User = mongoose.model('User', new mongoose.Schema({}));
    
    const user = await User.findOne({});
    const state = await BotState.findOne({ userId: user._id });

    console.log('Bot State:');
    console.log(`  Is Running: ${state?.isRunning}`);
    console.log(`  Status: ${state?.status}`);
    console.log(`  Last Scan: ${state?.lastScan}`);
    console.log('');

    if (!state?.isRunning) {
      console.log('Trading engine is NOT running.');
      console.log('Setting isRunning to true...');
      
      await BotState.updateOne(
        { userId: user._id },
        { $set: { isRunning: true, status: 'ACTIVE' } }
      );
      
      console.log('✓ Trading engine enabled');
    } else {
      console.log('✓ Trading engine is already running');
    }

    await mongoose.disconnect();
    console.log('\n✓ Done!');
    process.exit(0);

  } catch (error) {
    console.error('ERROR:', error.message);
    process.exit(1);
  }
}

checkEngine();

