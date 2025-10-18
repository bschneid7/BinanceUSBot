/**
 * Database Cleanup Script
 *
 * This script cleans up old data from the database:
 * - Remove closed positions older than X days
 * - Remove old alerts
 * - Remove old signals
 * - Archive old trade history
 *
 * Usage: npm run db:cleanup
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import Position from '../models/Position.js';
import Alert from '../models/Alert.js';
import Signal from '../models/Signal.js';
import Trade from '../models/Trade.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

// Configuration
const DAYS_TO_KEEP_CLOSED_POSITIONS = 90; // Keep closed positions for 90 days
const DAYS_TO_KEEP_ALERTS = 30; // Keep alerts for 30 days
const DAYS_TO_KEEP_SIGNALS = 60; // Keep signals for 60 days
const DAYS_TO_KEEP_TRADES = 365; // Keep trades for 1 year (for tax purposes)

async function connectDatabase() {
  try {
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/binance_bot';
    console.log('📦 Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB successfully');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    throw error;
  }
}

async function cleanupPositions() {
  try {
    console.log('\n🧹 Cleaning up old closed positions...');

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - DAYS_TO_KEEP_CLOSED_POSITIONS);

    const result = await Position.deleteMany({
      status: 'CLOSED',
      closed_at: { $lt: cutoffDate },
    });

    console.log(`✅ Deleted ${result.deletedCount} closed positions older than ${DAYS_TO_KEEP_CLOSED_POSITIONS} days`);
  } catch (error) {
    console.error('❌ Error cleaning up positions:', error);
    throw error;
  }
}

async function cleanupAlerts() {
  try {
    console.log('\n🧹 Cleaning up old alerts...');

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - DAYS_TO_KEEP_ALERTS);

    const result = await Alert.deleteMany({
      timestamp: { $lt: cutoffDate },
    });

    console.log(`✅ Deleted ${result.deletedCount} alerts older than ${DAYS_TO_KEEP_ALERTS} days`);
  } catch (error) {
    console.error('❌ Error cleaning up alerts:', error);
    throw error;
  }
}

async function cleanupSignals() {
  try {
    console.log('\n🧹 Cleaning up old signals...');

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - DAYS_TO_KEEP_SIGNALS);

    const result = await Signal.deleteMany({
      timestamp: { $lt: cutoffDate },
    });

    console.log(`✅ Deleted ${result.deletedCount} signals older than ${DAYS_TO_KEEP_SIGNALS} days`);
  } catch (error) {
    console.error('❌ Error cleaning up signals:', error);
    throw error;
  }
}

async function archiveOldTrades() {
  try {
    console.log('\n📦 Archiving old trades...');

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - DAYS_TO_KEEP_TRADES);

    // Count trades that would be archived
    const count = await Trade.countDocuments({
      closed_at: { $lt: cutoffDate },
    });

    if (count === 0) {
      console.log('ℹ️  No old trades to archive');
      return;
    }

    console.log(`ℹ️  Found ${count} trades older than ${DAYS_TO_KEEP_TRADES} days`);
    console.log('⚠️  Trade archival skipped (implement backup strategy first)');
    console.log('   Trades are kept for tax compliance purposes');
  } catch (error) {
    console.error('❌ Error archiving trades:', error);
    throw error;
  }
}

async function getStorageStats() {
  try {
    console.log('\n📊 Database Storage Statistics:');

    const stats = await Promise.all([
      Position.countDocuments(),
      Alert.countDocuments(),
      Signal.countDocuments(),
      Trade.countDocuments(),
    ]);

    console.log(`   Positions: ${stats[0]} documents`);
    console.log(`   Alerts: ${stats[1]} documents`);
    console.log(`   Signals: ${stats[2]} documents`);
    console.log(`   Trades: ${stats[3]} documents`);
  } catch (error) {
    console.error('❌ Error getting storage stats:', error);
  }
}

async function main() {
  try {
    console.log('🧹 Starting database cleanup...\n');

    await connectDatabase();

    // Show stats before cleanup
    console.log('📊 Before cleanup:');
    await getStorageStats();

    // Perform cleanup operations
    await cleanupPositions();
    await cleanupAlerts();
    await cleanupSignals();
    await archiveOldTrades();

    // Show stats after cleanup
    console.log('\n📊 After cleanup:');
    await getStorageStats();

    console.log('\n✨ Database cleanup completed successfully!\n');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Cleanup failed:', error);
    process.exit(1);
  }
}

main();
