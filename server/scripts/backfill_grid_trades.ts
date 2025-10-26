/**
 * Backfill Script: Convert existing filled grid orders to trade records
 * 
 * This script creates Trade records for the 10 filled grid orders that were
 * executed but not recorded for tax reporting purposes.
 */

import mongoose from 'mongoose';
import GridOrder from '../models/GridOrder';
import Transaction from '../models/Transaction';
import BotConfig from '../models/BotConfig';

async function backfillGridTransactions() {
  try {
    console.log('=== Backfilling Grid Transactions for Tax Reporting ===\n');

    // Connect to MongoDB
    const mongoUri = process.env.MONGO_URI || 'mongodb://admin:changeThisPassword@localhost:27017/binance_bot?authSource=admin';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB\n');

    // Get user ID from bot config
    const botConfig = await BotConfig.findOne();
    if (!botConfig) {
      throw new Error('No bot config found');
    }
    console.log(`✅ Found bot config for user: ${botConfig.userId}\n`);

    // Find all filled grid orders
    const filledGridOrders = await GridOrder.find({ status: 'FILLED' }).sort({ filledAt: 1 });
    console.log(`Found ${filledGridOrders.length} filled grid orders\n`);

    if (filledGridOrders.length === 0) {
      console.log('No filled grid orders to backfill');
      return;
    }

    let created = 0;
    let skipped = 0;

    for (const gridOrder of filledGridOrders) {
      // Check if transaction already exists for this order
      const existingTransaction = await Transaction.findOne({ orderId: gridOrder.orderId });
      
      if (existingTransaction) {
        console.log(`⏭️  Skipped ${gridOrder.symbol} ${gridOrder.side} - already has transaction record`);
        skipped++;
        continue;
      }

      // Calculate trade details
      const quantity = gridOrder.quantity || 0;
      const price = gridOrder.price || 0;
      const tradeValue = quantity * price;
      const fees = tradeValue * 0.001; // 0.1% Binance spot fee

      // Create transaction record
      await Transaction.create({
        userId: botConfig.userId,
        symbol: gridOrder.symbol,
        side: gridOrder.side,
        quantity,
        price,
        total: tradeValue,
        fees,
        type: 'GRID',
        orderId: gridOrder.orderId,
        timestamp: gridOrder.filledAt || gridOrder.createdAt || new Date()
      });

      console.log(`✅ Created transaction: ${gridOrder.symbol} ${gridOrder.side} ${quantity} @ $${price} (fees: $${fees.toFixed(2)})`);
      created++;
    }

    console.log(`\n=== Backfill Complete ===`);
    console.log(`✅ Created: ${created} transaction records`);
    console.log(`⏭️  Skipped: ${skipped} (already existed)`);
    console.log(`📊 Total: ${filledGridOrders.length} filled grid orders processed`);

    // Verify transactions were created
    const totalTransactions = await Transaction.countDocuments();
    console.log(`\n📈 Total transactions in database: ${totalTransactions}`);

    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');

  } catch (error) {
    console.error('❌ Error during backfill:', error);
    process.exit(1);
  }
}

// Run the backfill
backfillGridTransactions()
  .then(() => {
    console.log('\n🎉 Backfill completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Backfill failed:', error);
    process.exit(1);
  });

