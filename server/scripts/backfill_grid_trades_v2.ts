/**
 * Backfill Grid Transactions Script (v2)
 * 
 * This script creates Transaction records for filled grid orders by fetching
 * actual execution details from Binance API (quantity, fees, timestamp).
 */

import mongoose from 'mongoose';
import GridOrder from '../models/GridOrder';
import Transaction from '../models/Transaction';
import BotConfig from '../models/BotConfig';
import binanceService from '../services/binanceService';

async function backfillGridTransactions() {
  try {
    console.log('=== Backfilling Grid Transactions for Tax Reporting (v2) ===\n');

    // Connect to MongoDB
    const mongoUri = process.env.MONGO_URI || 'mongodb://admin:changeThisPassword@localhost:27017/binance_bot?authSource=admin';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    // Get bot config
    const botConfig = await BotConfig.findOne();
    if (!botConfig) {
      console.error('❌ No bot config found');
      process.exit(1);
    }
    console.log(`✅ Found bot config for user: ${botConfig.userId}`);

    // Get all filled grid orders
    const filledGridOrders = await GridOrder.find({ status: 'FILLED' });
    console.log(`\nFound ${filledGridOrders.length} filled grid orders\n`);

    let created = 0;
    let skipped = 0;
    let failed = 0;

    for (const gridOrder of filledGridOrders) {
      try {
        // Check if transaction already exists for this order
        const existingTransaction = await Transaction.findOne({ orderId: gridOrder.orderId });
        
        if (existingTransaction) {
          console.log(`⏭️  Skipped ${gridOrder.symbol} ${gridOrder.side} - already has transaction record`);
          skipped++;
          continue;
        }

        // Fetch order details from Binance
        console.log(`🔍 Fetching order details from Binance for ${gridOrder.symbol} order ${gridOrder.orderId}...`);
        
        const orderDetails = await binanceService.getOrder(gridOrder.symbol, gridOrder.orderId);
        
        if (!orderDetails) {
          console.log(`⚠️  Failed to fetch order details for ${gridOrder.symbol} order ${gridOrder.orderId}`);
          failed++;
          continue;
        }

        // Extract execution details
        const executedQty = parseFloat(orderDetails.executedQty || '0');
        const cummulativeQuoteQty = parseFloat(orderDetails.cummulativeQuoteQty || '0');
        const avgPrice = executedQty > 0 ? cummulativeQuoteQty / executedQty : parseFloat(orderDetails.price || '0');
        
        // Calculate fees (0.1% for Binance spot trading)
        const tradeValue = cummulativeQuoteQty || (executedQty * avgPrice);
        const fees = tradeValue * 0.001; // 0.1% fee
        
        // Get execution timestamp
        const timestamp = orderDetails.updateTime 
          ? new Date(orderDetails.updateTime)
          : (gridOrder.createdAt || new Date());

        // Create transaction record
        await Transaction.create({
          userId: botConfig.userId,
          symbol: gridOrder.symbol,
          side: gridOrder.side,
          quantity: executedQty,
          price: avgPrice,
          total: tradeValue,
          fees,
          type: 'GRID',
          orderId: gridOrder.orderId,
          timestamp
        });

        console.log(`✅ Created transaction: ${gridOrder.symbol} ${gridOrder.side} ${executedQty.toFixed(4)} @ $${avgPrice.toFixed(2)} (fees: $${fees.toFixed(2)})`);
        created++;

        // Rate limiting - wait 100ms between API calls
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error: any) {
        console.error(`❌ Error processing order ${gridOrder.orderId}:`, error.message);
        failed++;
      }
    }

    console.log(`\n=== Backfill Complete ===`);
    console.log(`✅ Created: ${created} transaction records`);
    console.log(`⏭️  Skipped: ${skipped} (already existed)`);
    console.log(`❌ Failed: ${failed}`);
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
    console.error('Fatal error:', error);
    process.exit(1);
  });

