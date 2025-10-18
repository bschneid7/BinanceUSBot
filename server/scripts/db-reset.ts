/**
 * Database Reset Script
 *
 * WARNING: This script will DELETE ALL DATA from the database!
 * Use this only in development or when you need to start fresh.
 *
 * Options:
 * - Reset all data
 * - Reset specific collections
 * - Preserve admin user
 *
 * Usage:
 *   npm run db:reset              # Reset all data
 *   npm run db:reset -- --keep-admin  # Reset all but keep admin
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import User from '../models/User.js';
import Position from '../models/Position.js';
import Alert from '../models/Alert.js';
import Signal from '../models/Signal.js';
import Trade from '../models/Trade.js';
import Order from '../models/Order.js';
import Lot from '../models/Lot.js';
import TaxReport from '../models/TaxReport.js';
import BotConfig from '../models/BotConfig.js';
import BotState from '../models/BotState.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const KEEP_ADMIN = process.argv.includes('--keep-admin');
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@binancebot.com';

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

async function confirmReset(): Promise<boolean> {
  return new Promise((resolve) => {
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    console.log('\n⚠️  WARNING: This will DELETE ALL DATA from the database!\n');
    if (KEEP_ADMIN) {
      console.log('ℹ️  Admin user will be preserved.\n');
    }

    readline.question('Are you sure you want to continue? (yes/no): ', (answer: string) => {
      readline.close();
      resolve(answer.toLowerCase() === 'yes');
    });
  });
}

async function resetDatabase() {
  try {
    console.log('\n🗑️  Starting database reset...\n');

    let adminUser = null;
    let adminConfig = null;

    // Save admin user if needed
    if (KEEP_ADMIN) {
      console.log(`💾 Preserving admin user: ${ADMIN_EMAIL}`);
      adminUser = await User.findOne({ email: ADMIN_EMAIL });
      if (adminUser) {
        adminConfig = await BotConfig.findOne({ userId: adminUser._id });
        console.log('✅ Admin user data backed up');
      } else {
        console.log('⚠️  Admin user not found, will be skipped');
      }
    }

    // Delete all collections
    const collections = [
      { name: 'Positions', model: Position },
      { name: 'Alerts', model: Alert },
      { name: 'Signals', model: Signal },
      { name: 'Trades', model: Trade },
      { name: 'Orders', model: Order },
      { name: 'Lots', model: Lot },
      { name: 'TaxReports', model: TaxReport },
      { name: 'BotConfigs', model: BotConfig },
      { name: 'BotStates', model: BotState },
    ];

    for (const collection of collections) {
      try {
        const result = await collection.model.deleteMany({});
        console.log(`🗑️  Deleted ${result.deletedCount} documents from ${collection.name}`);
      } catch (error) {
        console.error(`❌ Error deleting ${collection.name}:`, error);
      }
    }

    // Delete users (except admin if KEEP_ADMIN)
    if (KEEP_ADMIN && adminUser) {
      const result = await User.deleteMany({ email: { $ne: ADMIN_EMAIL } });
      console.log(`🗑️  Deleted ${result.deletedCount} users (admin preserved)`);
    } else {
      const result = await User.deleteMany({});
      console.log(`🗑️  Deleted ${result.deletedCount} users`);
    }

    // Restore admin user if needed
    if (KEEP_ADMIN && adminUser) {
      console.log('\n♻️  Restoring admin user...');

      await User.create({
        _id: adminUser._id,
        email: adminUser.email,
        password: adminUser.password,
        role: adminUser.role,
        isActive: adminUser.isActive,
      });

      if (adminConfig) {
        await BotConfig.create({
          _id: adminConfig._id,
          userId: adminConfig.userId,
          ...adminConfig.toObject(),
        });
      }

      console.log('✅ Admin user restored');
    }

    console.log('\n✨ Database reset completed successfully!\n');
  } catch (error) {
    console.error('❌ Error resetting database:', error);
    throw error;
  }
}

async function getCollectionStats() {
  try {
    console.log('\n📊 Current Database Statistics:');

    const stats = await Promise.all([
      User.countDocuments(),
      Position.countDocuments(),
      Alert.countDocuments(),
      Signal.countDocuments(),
      Trade.countDocuments(),
      Order.countDocuments(),
      Lot.countDocuments(),
      TaxReport.countDocuments(),
      BotConfig.countDocuments(),
      BotState.countDocuments(),
    ]);

    console.log(`   Users: ${stats[0]} documents`);
    console.log(`   Positions: ${stats[1]} documents`);
    console.log(`   Alerts: ${stats[2]} documents`);
    console.log(`   Signals: ${stats[3]} documents`);
    console.log(`   Trades: ${stats[4]} documents`);
    console.log(`   Orders: ${stats[5]} documents`);
    console.log(`   Lots: ${stats[6]} documents`);
    console.log(`   TaxReports: ${stats[7]} documents`);
    console.log(`   BotConfigs: ${stats[8]} documents`);
    console.log(`   BotStates: ${stats[9]} documents`);
  } catch (error) {
    console.error('❌ Error getting collection stats:', error);
  }
}

async function main() {
  try {
    console.log('🗑️  Database Reset Utility\n');

    await connectDatabase();

    // Show current stats
    await getCollectionStats();

    // Confirm reset
    const confirmed = await confirmReset();

    if (!confirmed) {
      console.log('\n❌ Reset cancelled by user\n');
      process.exit(0);
    }

    // Perform reset
    await resetDatabase();

    // Show final stats
    await getCollectionStats();

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Reset failed:', error);
    process.exit(1);
  }
}

main();
