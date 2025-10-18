/**
 * Database Seeding Script - Admin User
 *
 * This script creates an admin user that cannot be registered through normal flow.
 * Run this script periodically or when setting up a new environment.
 *
 * Usage: npm run seed:admin
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import User from '../models/User.js';
import BotConfig from '../models/BotConfig.js';
import { generatePasswordHash } from '../utils/password.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@binancebot.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin123!@#';

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

async function seedAdminUser() {
  try {
    console.log('\n🌱 Starting admin user seeding...\n');

    // Check if admin user already exists
    const existingAdmin = await User.findOne({ email: ADMIN_EMAIL });

    if (existingAdmin) {
      console.log(`ℹ️  Admin user already exists: ${ADMIN_EMAIL}`);
      console.log(`   User ID: ${existingAdmin._id}`);
      console.log(`   Role: ${existingAdmin.role}`);
      console.log(`   Created: ${existingAdmin.createdAt}`);
      return existingAdmin;
    }

    // Create admin user
    console.log(`🔨 Creating admin user: ${ADMIN_EMAIL}`);
    const hashedPassword = await generatePasswordHash(ADMIN_PASSWORD);

    const adminUser = await User.create({
      email: ADMIN_EMAIL,
      password: hashedPassword,
      role: 'admin',
      isActive: true,
    });

    console.log(`✅ Admin user created successfully!`);
    console.log(`   User ID: ${adminUser._id}`);
    console.log(`   Email: ${adminUser.email}`);
    console.log(`   Role: ${adminUser.role}`);

    // Create default bot configuration for admin
    console.log('\n🔨 Creating default bot configuration for admin...');

    const existingConfig = await BotConfig.findOne({ userId: adminUser._id });

    if (!existingConfig) {
      const botConfig = await BotConfig.create({
        userId: adminUser._id,
        scanner: {
          pairs: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'],
          refresh_ms: 2000,
          min_volume_usd_24h: 2000000,
          max_spread_bps: 5,
          max_spread_bps_event: 10,
          tob_min_depth_usd: 50000,
          pair_signal_cooldown_min: 15,
        },
        risk: {
          R_pct: 0.006,
          daily_stop_R: -2.0,
          weekly_stop_R: -6.0,
          max_open_R: 2.0,
          max_exposure_pct: 0.60,
          max_positions: 4,
          correlation_guard: true,
          slippage_guard_bps: 5,
          slippage_guard_bps_event: 10,
        },
        execution: {
          maker_first: true,
          allow_taker_if_decay_exceeds_bps: true,
          use_OCO: true,
          trailing: {
            enable: true,
            trigger_R: 1.0,
            atr_mult: 1.0,
          },
        },
        reserve: {
          target_pct: 0.30,
          floor_pct: 0.20,
          refill_from_profits_pct: 0.30,
        },
        playbook_A: {
          enable: true,
          timeframe_anchor: '1h',
          timeframe_entry: '15m',
          volume_mult: 1.5,
          stop_atr_mult: 1.2,
          breakeven_R: 1.0,
          scale_R: 1.5,
          scale_pct: 0.5,
          trail_atr_mult: 1.0,
        },
        playbook_B: {
          enable: true,
          timeframe: '15m',
          deviation_atr_mult: 2.0,
          stop_atr_mult: 0.8,
          time_stop_min: 90,
          target_R: 1.2,
          max_trades_per_session: 2,
        },
        playbook_C: {
          enable: true,
          event_window_min: 30,
          stop_atr_mult: 1.8,
          scale_1_R: 1.0,
          scale_1_pct: 0.33,
          scale_2_R: 2.0,
          scale_2_pct: 0.33,
          trail_atr_mult: 1.0,
        },
        playbook_D: {
          enable: true,
        },
      });

      console.log(`✅ Bot configuration created for admin`);
      console.log(`   Config ID: ${botConfig._id}`);
    } else {
      console.log(`ℹ️  Bot configuration already exists for admin`);
    }

    return adminUser;
  } catch (error) {
    console.error('❌ Error seeding admin user:', error);
    throw error;
  }
}

async function main() {
  try {
    await connectDatabase();
    await seedAdminUser();

    console.log('\n✨ Admin user seeding completed successfully!\n');
    console.log('📝 Login credentials:');
    console.log(`   Email: ${ADMIN_EMAIL}`);
    console.log(`   Password: ${ADMIN_PASSWORD}`);
    console.log('\n⚠️  IMPORTANT: Change the admin password after first login!\n');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Seeding failed:', error);
    process.exit(1);
  }
}

main();
