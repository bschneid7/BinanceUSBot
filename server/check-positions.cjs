const mongoose = require('mongoose');

const MONGODB_URI = 'mongodb+srv://bschneid72:lYliCp9qOw2PQdMv@cluster0.ixowin.mongodb.net/binance_bot?retryWrites=true&w=majority&appName=Cluster0';

async function checkPositions() {
  try {
    await mongoose.connect(MONGODB_URI);
    const db = mongoose.connection.db;
    
    const positions = await db.collection('positions').find({ status: 'OPEN' }).toArray();
    
    console.log(`Found ${positions.length} open positions:\n`);
    for (const pos of positions) {
      console.log(`Symbol: "${pos.symbol}" | Quantity: ${pos.quantity} | Entry: $${pos.entryPrice}`);
    }

    // Check if any symbols are missing USD suffix
    const invalidSymbols = positions.filter(p => !p.symbol.endsWith('USD'));
    if (invalidSymbols.length > 0) {
      console.log(`\n⚠️  Found ${invalidSymbols.length} positions with invalid symbols (missing USD):`);
      for (const pos of invalidSymbols) {
        console.log(`  - ${pos.symbol} should be ${pos.symbol}USD`);
      }
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await mongoose.disconnect();
  }
}

checkPositions();

