import { Types } from 'mongoose';
// Bypass auto-start by connecting directly to MongoDB
import mongoose from 'mongoose';
import Deposit from '../models/Deposit';

/**
 * Import historical deposit records
 */
async function importDeposits() {
  try {
    console.log('[ImportDeposits] Connecting to database...');
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://mongo:27017/binance_bot';
    await mongoose.connect(mongoUri);
    console.log('[ImportDeposits] MongoDB connected');
    
    const userId = new Types.ObjectId('68fac3bbd5f133b16fce5f47');
    
    // Historical deposits from Binance
    const deposits = [
      // BTC Deposit
      {
        userId,
        type: 'DEPOSIT' as const,
        asset: 'BTC',
        amount: 0.01701066,
        usdValue: 2006.08, // 0.01701066 × $117,920.97
        date: new Date('2025-07-30T17:16:15-07:00'), // PDT
        source: 'BINANCE',
        notes: 'BTC deposit at $117,920.97 per BTC',
      },
      // USD Deposits
      {
        userId,
        type: 'DEPOSIT' as const,
        asset: 'USD',
        amount: 100,
        usdValue: 100,
        date: new Date('2025-08-14T00:09:00-07:00'),
        source: 'BINANCE',
      },
      {
        userId,
        type: 'DEPOSIT' as const,
        asset: 'USD',
        amount: 50,
        usdValue: 50,
        date: new Date('2025-08-14T00:16:00-07:00'),
        source: 'BINANCE',
      },
      {
        userId,
        type: 'DEPOSIT' as const,
        asset: 'USD',
        amount: 1000,
        usdValue: 1000,
        date: new Date('2025-08-31T23:44:00-07:00'),
        source: 'BINANCE',
      },
      {
        userId,
        type: 'DEPOSIT' as const,
        asset: 'USD',
        amount: 500,
        usdValue: 500,
        date: new Date('2025-10-11T08:22:00-07:00'),
        source: 'BINANCE',
      },
      {
        userId,
        type: 'DEPOSIT' as const,
        asset: 'USD',
        amount: 1000,
        usdValue: 1000,
        date: new Date('2025-10-15T07:44:00-07:00'),
        source: 'BINANCE',
      },
      {
        userId,
        type: 'DEPOSIT' as const,
        asset: 'USD',
        amount: 100,
        usdValue: 100,
        date: new Date('2025-10-16T13:58:00-07:00'),
        source: 'BINANCE',
      },
      {
        userId,
        type: 'DEPOSIT' as const,
        asset: 'USD',
        amount: 500,
        usdValue: 500,
        date: new Date('2025-10-16T19:31:00-07:00'),
        source: 'BINANCE',
      },
      {
        userId,
        type: 'DEPOSIT' as const,
        asset: 'USD',
        amount: 1000,
        usdValue: 1000,
        date: new Date('2025-10-24T08:39:00-07:00'),
        source: 'BINANCE',
      },
      {
        userId,
        type: 'DEPOSIT' as const,
        asset: 'USD',
        amount: 2000,
        usdValue: 2000,
        date: new Date('2025-10-24T10:06:00-07:00'),
        source: 'BINANCE',
      },
      {
        userId,
        type: 'DEPOSIT' as const,
        asset: 'USD',
        amount: 1500,
        usdValue: 1500,
        date: new Date('2025-10-24T11:49:00-07:00'),
        source: 'BINANCE',
      },
      {
        userId,
        type: 'DEPOSIT' as const,
        asset: 'USD',
        amount: 3000,
        usdValue: 3000,
        date: new Date('2025-10-24T18:49:00-07:00'),
        source: 'BINANCE',
      },
    ];
    
    // Clear existing deposits for this user
    await Deposit.deleteMany({ userId });
    console.log('[ImportDeposits] Cleared existing deposits');
    
    // Insert all deposits
    await Deposit.insertMany(deposits);
    
    // Calculate totals
    const totalDeposits = deposits.reduce((sum, d) => sum + d.usdValue, 0);
    
    console.log('[ImportDeposits] ✅ Import complete!');
    console.log(`  - Total deposits: ${deposits.length}`);
    console.log(`  - Total USD value: $${totalDeposits.toFixed(2)}`);
    console.log(`  - BTC deposits: ${deposits.filter(d => d.asset === 'BTC').length}`);
    console.log(`  - USD deposits: ${deposits.filter(d => d.asset === 'USD').length}`);
    
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('[ImportDeposits] ❌ Error:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

importDeposits();

