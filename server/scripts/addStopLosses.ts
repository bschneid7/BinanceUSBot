/**
 * Add ATR-based stop-losses to positions without protection
 * This script calculates appropriate stop-loss levels based on each asset's volatility
 */

import mongoose from 'mongoose';
import Position from '../models/Position';
import binanceService from '../services/binanceService';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/binance-bot';

async function calculateATRStopLoss(symbol: string, entryPrice: number, side: string): Promise<number> {
  try {
    // Get recent klines to calculate ATR
    const klines = await binanceService.getKlines(symbol, '1h', 24);
    
    if (!klines || klines.length < 14) {
      console.log(`  Not enough data for ${symbol}, using 2% stop-loss`);
      return side === 'LONG' ? entryPrice * 0.98 : entryPrice * 1.02;
    }

    // Calculate True Range for each period
    const trueRanges: number[] = [];
    for (let i = 1; i < klines.length; i++) {
      const high = parseFloat(klines[i][2]);
      const low = parseFloat(klines[i][3]);
      const prevClose = parseFloat(klines[i-1][4]);
      
      // Validate numbers
      if (isNaN(high) || isNaN(low) || isNaN(prevClose)) {
        console.log(`  Invalid kline data for ${symbol}, using 2% stop-loss`);
        return side === 'LONG' ? entryPrice * 0.98 : entryPrice * 1.02;
      }
      
      const tr = Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
      );
      trueRanges.push(tr);
    }

    // Calculate ATR (14-period average)
    const atr = trueRanges.slice(-14).reduce((a, b) => a + b, 0) / 14;
    
    // Validate ATR
    if (isNaN(atr) || atr === 0) {
      console.log(`  Invalid ATR for ${symbol}, using 2% stop-loss`);
      return side === 'LONG' ? entryPrice * 0.98 : entryPrice * 1.02;
    }
    
    // Set stop-loss at 1.5 ATR from entry (more conservative than 2 ATR)
    const stopDistance = atr * 1.5;
    const stopLoss = side === 'LONG' 
      ? entryPrice - stopDistance 
      : entryPrice + stopDistance;

    // Validate final stop-loss
    if (isNaN(stopLoss) || stopLoss <= 0) {
      console.log(`  Invalid stop-loss calculated for ${symbol}, using 2% stop-loss`);
      return side === 'LONG' ? entryPrice * 0.98 : entryPrice * 1.02;
    }

    console.log(`  ATR=${atr.toFixed(6)}, Stop Distance=${stopDistance.toFixed(6)}, Stop=${stopLoss.toFixed(6)}`);
    
    return stopLoss;
  } catch (error) {
    console.error(`  Error calculating ATR for ${symbol}:`, error);
    // Fallback to 2% stop-loss
    return side === 'LONG' ? entryPrice * 0.98 : entryPrice * 1.02;
  }
}

async function addStopLosses() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    // Find all positions without stop-loss
    const positions = await Position.find({
      $or: [
        { stop_price: { $exists: false } },
        { stop_price: 0 },
        { stop_price: null }
      ]
    });

    console.log(`\nFound ${positions.length} positions without stop-loss protection\n`);

    if (positions.length === 0) {
      console.log('All positions have stop-loss protection!');
      await mongoose.disconnect();
      return;
    }

    for (const position of positions) {
      // Skip APEUSD if it's a special case
      if (position.symbol === 'APEUSD') {
        console.log(`Skipping ${position.symbol} (excluded from auto-stop-loss)`);
        continue;
      }

      console.log(`\nProcessing ${position.symbol}:`);
      console.log(`  Entry: ${position.entry_price}`);
      console.log(`  Side: ${position.side}`);

      const stopLoss = await calculateATRStopLoss(
        position.symbol,
        position.entry_price,
        position.side
      );

      // Update position with stop-loss
      position.stop_price = stopLoss;
      await position.save();

      console.log(`  ✅ Stop-loss set to: ${stopLoss.toFixed(6)}`);
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log(`\n✅ Successfully added stop-losses to ${positions.length} positions!`);
    
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  } catch (error) {
    console.error('Error adding stop-losses:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

// Run the script
addStopLosses();
