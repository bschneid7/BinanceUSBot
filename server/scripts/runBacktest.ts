#!/usr/bin/env tsx
/**
 * CLI script to run backtests
 * 
 * Usage:
 *   npm run backtest -- --symbol BTCUSD --start 2024-01-01 --end 2024-12-31 --equity 10000
 */

import dotenv from 'dotenv';
import { Types } from 'mongoose';

// Load environment variables
dotenv.config({ path: '/opt/binance-bot/.env.production' });
dotenv.config(); // Also try local .env
import mongoose from 'mongoose';
import backtestService from '../services/backtestService';
import { generateReport, exportToJSON, exportToCSV, exportEquityCurve } from '../utils/backtestReporter';
import logger from '../utils/logger';

// Parse command line arguments
function parseArgs(): any {
  const args: any = {
    symbol: 'BTCUSD',
    start: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 90 days ago
    end: new Date().toISOString().split('T')[0], // Today
    equity: 10000,
    export: false,
  };

  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    const nextArg = process.argv[i + 1];

    switch (arg) {
      case '--symbol':
      case '-s':
        args.symbol = nextArg;
        i++;
        break;

      case '--start':
        args.start = nextArg;
        i++;
        break;

      case '--end':
        args.end = nextArg;
        i++;
        break;

      case '--equity':
      case '-e':
        args.equity = parseFloat(nextArg);
        i++;
        break;

      case '--export':
      case '-x':
        args.export = true;
        break;

      case '--help':
      case '-h':
        console.log(`
Backtest CLI

Usage:
  npm run backtest -- [options]

Options:
  --symbol, -s    Trading symbol (default: BTCUSD)
  --start         Start date (YYYY-MM-DD) (default: 90 days ago)
  --end           End date (YYYY-MM-DD) (default: today)
  --equity, -e    Initial equity (default: 10000)
  --export, -x    Export results to files
  --help, -h      Show this help message

Examples:
  npm run backtest -- --symbol ETHUSD --start 2024-01-01 --end 2024-12-31
  npm run backtest -- -s BNBUSD -e 5000 --export
        `);
        process.exit(0);
    }
  }

  return args;
}

async function main() {
  try {
    const args = parseArgs();

    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║                   BACKTEST STARTING                        ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log('');
    console.log(`Symbol:         ${args.symbol}`);
    console.log(`Period:         ${args.start} to ${args.end}`);
    console.log(`Initial Equity: $${args.equity}`);
    console.log('');

    // Connect to MongoDB
    const mongoUri = process.env.MONGO_URI || process.env.DATABASE_URL || process.env.MONGODB_URI || 'mongodb://localhost:27017/binance-bot';
    await mongoose.connect(mongoUri);
    logger.info('[Backtest CLI] Connected to MongoDB');

    // Run backtest
    const userId = new Types.ObjectId('000000000000000000000000'); // Default user
    const startDate = new Date(args.start);
    const endDate = new Date(args.end);

    console.log('Running backtest...');
    console.log('');

    const result = await backtestService.runBacktest(
      userId,
      args.symbol,
      startDate,
      endDate,
      args.equity
    );

    // Generate and display report
    const report = generateReport(result);
    console.log(report);

    // Export if requested
    if (args.export) {
      const timestamp = Date.now();
      const jsonPath = `./backtest_${args.symbol}_${timestamp}.json`;
      const csvPath = `./backtest_${args.symbol}_${timestamp}_trades.csv`;
      const equityPath = `./backtest_${args.symbol}_${timestamp}_equity.csv`;

      exportToJSON(result, jsonPath);
      exportToCSV(result, csvPath);
      exportEquityCurve(result, equityPath);

      console.log('');
      console.log('📁 EXPORTED FILES:');
      console.log(`   ${jsonPath}`);
      console.log(`   ${csvPath}`);
      console.log(`   ${equityPath}`);
      console.log('');
    }

    // Disconnect
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Error running backtest:', error);
    process.exit(1);
  }
}

main();

