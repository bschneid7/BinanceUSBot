import binanceService from './services/binanceService';
import Position from './models/Position';
import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://admin:changeThisPassword@binance-bot-mongo:27017/binance_bot?authSource=admin';

async function checkBalances() {
  try {
    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Get all open positions from database
    const dbPositions = await Position.find({ status: 'OPEN' }).lean();
    console.log(`\n📊 Database Open Positions: ${dbPositions.length}`);
    
    const positionsByAsset: Record<string, number> = {};
    for (const pos of dbPositions) {
      const asset = pos.symbol.replace('USD', '').replace('USDT', '');
      positionsByAsset[asset] = (positionsByAsset[asset] || 0) + pos.quantity;
      console.log(`  ${pos.symbol}: ${pos.quantity} ${asset} (entry: $${pos.entry_price})`);
    }

    // Get actual Binance balances
    console.log('\n💰 Actual Binance Balances:');
    const account = await binanceService.getAccountInfo();
    const balances = account.balances.filter((b: any) => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0);
    
    for (const bal of balances) {
      const free = parseFloat(bal.free);
      const locked = parseFloat(bal.locked);
      const total = free + locked;
      console.log(`  ${bal.asset}: ${total.toFixed(8)} (free: ${free.toFixed(8)}, locked: ${locked.toFixed(8)})`);
    }

    // Compare
    console.log('\n🔍 Comparison:');
    for (const [asset, dbQty] of Object.entries(positionsByAsset)) {
      const binanceBal = balances.find((b: any) => b.asset === asset);
      const actualQty = binanceBal ? parseFloat(binanceBal.free) + parseFloat(binanceBal.locked) : 0;
      
      const match = Math.abs(actualQty - dbQty) < 0.001;
      const icon = match ? '✅' : '❌';
      console.log(`  ${icon} ${asset}: DB=${dbQty.toFixed(8)}, Binance=${actualQty.toFixed(8)}`);
    }

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkBalances();
