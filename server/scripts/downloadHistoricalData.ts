#!/usr/bin/env tsx

/**
 * CLI tool for downloading historical market data from Binance.US
 * 
 * Usage:
 *   npm run download-data -- --symbol BTCUSD --start 2024-01-01 --end 2024-12-31
 *   npm run download-data -- --symbol ETHUSD --start 2024-06-01 --end 2024-12-31 --interval 1h
 */

import dotenv from 'dotenv';
import mongoose from 'mongoose';
import historicalDataService from '../services/historicalDataService';
import logger from '../utils/logger';

// Load environment variables from parent directory
dotenv.config({ path: '../.env.production' });

interface DownloadArgs {
  symbol: string;
  start: string;
  end: string;
  interval?: string;
}

function parseArgs(): DownloadArgs {
  const args = process.argv.slice(2);
  const result: any = {};

  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace('--', '');
    const value = args[i + 1];
    result[key] = value;
  }

  if (!result.symbol || !result.start || !result.end) {
    console.error('Usage: npm run download-data -- --symbol BTCUSD --start 2024-01-01 --end 2024-12-31 [--interval 1h]');
    process.exit(1);
  }

  return {
    symbol: result.symbol,
    start: result.start,
    end: result.end,
    interval: result.interval || '1h',
  };
}

async function main() {
  const args = parseArgs();

  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║         HISTORICAL DATA DOWNLOAD TOOL                      ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(`Symbol:    ${args.symbol}`);
  console.log(`Period:    ${args.start} to ${args.end}`);
  console.log(`Interval:  ${args.interval}`);
  console.log('');

  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGO_URI || process.env.DATABASE_URL || 'mongodb://localhost:27017/binance-bot';
    await mongoose.connect(mongoUri);
    logger.info('[Download CLI] Connected to MongoDB');

    const startDate = new Date(args.start);
    const endDate = new Date(args.end);

    console.log('Downloading historical data from Binance.US...');
    console.log('This may take several minutes depending on the date range.');
    console.log('');

    const startTime = Date.now();

    const candles = await historicalDataService.downloadDailyRange({
      symbol: args.symbol,
      interval: args.interval,
      startDate,
      endDate,
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('                    DOWNLOAD COMPLETE');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`Downloaded:  ${candles.length} candles`);
    console.log(`Duration:    ${duration} seconds`);
    console.log(`Storage:     MongoDB (cached for future use)`);
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');
    console.log('✅ Historical data is now available for backtesting and ML training!');
    console.log('');

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('');
    console.error('❌ Error downloading historical data:', error);
    console.error('');
    await mongoose.disconnect();
    process.exit(1);
  }
}

main();

