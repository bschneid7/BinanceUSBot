import mongoose from 'mongoose';

const MONGO_URI = 'mongodb+srv://bschneid72:lYliCp9qOw2PQdMv@cluster0.ixowin.mongodb.net/binance_bot?retryWrites=true&w=majority&appName=Cluster0';

async function updateEquity() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✓ Connected\n');

    // Use the actual collection name
    const BotState = mongoose.connection.collection('botstates');
    
    // Find the document
    const state = await BotState.findOne({});
    console.log('Current equity:', state?.equity);
    
    // Update with correct equity
    const result = await BotState.updateOne(
      {},
      { 
        $set: { 
          equity: 7188.22,
          currentR: 43.13
        } 
      }
    );
    
    console.log('Update result:', result);
    
    // Verify the update
    const updated = await BotState.findOne({});
    console.log('\n✓ Updated equity:', updated.equity);
    console.log('✓ Updated currentR:', updated.currentR);

    await mongoose.disconnect();
    console.log('\n✓ Done!');
    process.exit(0);

  } catch (error) {
    console.error('ERROR:', error.message);
    process.exit(1);
  }
}

updateEquity();

