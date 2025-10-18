import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDB } from '../config/database';
import User from '../models/User';
import Position from '../models/Position';
import Trade from '../models/Trade';
import Signal from '../models/Signal';
import Alert from '../models/Alert';
import BotConfig from '../models/BotConfig';
import UserService from '../services/userService';
import { ROLES } from 'shared';
// Load environment variables
dotenv.config();
/**
 * Comprehensive database seeding script for the trading bot
 * Creates:
 * - Admin and test users
 * - Initial bot configuration
 * - Sample positions (open and closed)
 * - Historical trades
 * - Recent signals
 * - System alerts
 */
async function seedDatabase() {
    try {
        console.log('╔════════════════════════════════════════════════════════╗');
        console.log('║  Trading Bot Database Seed Script                      ║');
        console.log('╚════════════════════════════════════════════════════════╝\n');
        // Connect to database
        console.log('📡 Connecting to database...');
        await connectDB();
        console.log('✅ Database connected successfully\n');
        // ============================================================
        // 1. CREATE USERS
        // ============================================================
        console.log('👥 Creating users...');
        // Check for existing admin user
        let adminUser = await UserService.getByEmail('admin@tradingbot.com');
        if (!adminUser) {
            console.log('  Creating admin user...');
            adminUser = await UserService.create({
                email: 'admin@tradingbot.com',
                password: 'admin123',
            });
            // Update role to admin
            await User.findByIdAndUpdate(adminUser._id, { role: ROLES.ADMIN });
            adminUser = await User.findById(adminUser._id);
            console.log(`  ✅ Admin user created: ${adminUser.email} (${adminUser._id})`);
        }
        else {
            console.log(`  ℹ️  Admin user already exists: ${adminUser.email} (${adminUser._id})`);
        }
        // Check for existing test user
        let testUser = await UserService.getByEmail('test@example.com');
        if (!testUser) {
            console.log('  Creating test user...');
            testUser = await UserService.create({
                email: 'test@example.com',
                password: 'password123',
            });
            console.log(`  ✅ Test user created: ${testUser.email} (${testUser._id})`);
        }
        else {
            console.log(`  ℹ️  Test user already exists: ${testUser.email} (${testUser._id})`);
        }
        console.log(`\n✅ Users setup complete (Admin: ${adminUser._id}, Test: ${testUser._id})\n`);
        // Use test user for all trading data
        const userId = testUser._id;
        // ============================================================
        // 2. CREATE BOT CONFIGURATION
        // ============================================================
        console.log('⚙️  Creating bot configuration...');
        // Check if config exists
        let botConfig = await BotConfig.findOne({ userId });
        if (botConfig) {
            console.log('  ℹ️  Bot configuration already exists, deleting old config...');
            await BotConfig.deleteOne({ userId });
        }
        // Create default configuration based on spec
        botConfig = await BotConfig.create({
            userId,
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
                R_pct: 0.006, // 0.60% of equity
                daily_stop_R: -2.0,
                weekly_stop_R: -6.0,
                max_open_R: 2.0,
                max_exposure_pct: 0.60,
                max_positions: 4,
                correlation_guard: true,
                slippage_guard_bps: 5,
                slippage_guard_bps_event: 10,
            },
            reserve: {
                target_pct: 0.30, // 30% USDT reserve
                floor_pct: 0.20, // 20% floor
                refill_from_profits_pct: 0.30,
            },
            playbook_A: {
                enable: true,
                volume_mult: 1.5,
                stop_atr_mult: 1.2,
                breakeven_R: 1.0,
                scale_R: 1.5,
                scale_pct: 0.5,
                trail_atr_mult: 1.0,
            },
            playbook_B: {
                enable: true,
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
        console.log('✅ Bot configuration created successfully\n');
        // ============================================================
        // 3. SEED POSITIONS
        // ============================================================
        console.log('📊 Seeding positions...');
        // Clear existing positions
        const deletedPositions = await Position.deleteMany({ userId });
        console.log(`  Cleared ${deletedPositions.deletedCount} existing positions`);
        const positions = [
            // Open positions
            {
                symbol: 'BTCUSDT',
                side: 'LONG',
                entry_price: 111200,
                quantity: 0.032,
                stop_price: 111200,
                target_price: 113800,
                trailing_stop_distance: 1300,
                playbook: 'A',
                status: 'OPEN',
                opened_at: new Date(Date.now() - 5000000), // ~1.4 hours ago
                current_price: 112600,
                unrealized_pnl: 44.80,
                unrealized_r: 1.07,
                fees_paid: 1.42,
                hold_time: '1h 23m',
                userId,
            },
            {
                symbol: 'ETHUSDT',
                side: 'LONG',
                entry_price: 3420,
                quantity: 1.4,
                stop_price: 3390,
                target_price: 3500,
                playbook: 'B',
                status: 'OPEN',
                opened_at: new Date(Date.now() - 2520000), // ~42 minutes ago
                current_price: 3480,
                unrealized_pnl: 84.00,
                unrealized_r: 2.0,
                fees_paid: 0.68,
                hold_time: '42m',
                userId,
            },
            {
                symbol: 'SOLUSDT',
                side: 'LONG',
                entry_price: 145.50,
                quantity: 0.29,
                stop_price: 143.20,
                target_price: 150.00,
                playbook: 'C',
                status: 'OPEN',
                opened_at: new Date(Date.now() - 1800000), // ~30 minutes ago
                current_price: 147.80,
                unrealized_pnl: 6.67,
                unrealized_r: 0.32,
                fees_paid: 0.42,
                hold_time: '30m',
                userId,
            },
            // Closed positions
            {
                symbol: 'BTCUSDT',
                side: 'LONG',
                entry_price: 110500,
                quantity: 0.025,
                stop_price: 109800,
                playbook: 'A',
                status: 'CLOSED',
                opened_at: new Date(Date.now() - 172800000), // ~2 days ago
                closed_at: new Date(Date.now() - 172000000),
                realized_pnl: 87.50,
                realized_r: 2.5,
                fees_paid: 1.38,
                hold_time: '2h 13m',
                userId,
            },
            {
                symbol: 'ETHUSDT',
                side: 'SHORT',
                entry_price: 3500,
                quantity: 1.2,
                stop_price: 3530,
                playbook: 'B',
                status: 'CLOSED',
                opened_at: new Date(Date.now() - 259200000), // ~3 days ago
                closed_at: new Date(Date.now() - 258600000),
                realized_pnl: -36.00,
                realized_r: -1.0,
                fees_paid: 0.84,
                hold_time: '1h 40m',
                userId,
            },
        ];
        const insertedPositions = await Position.insertMany(positions);
        const openCount = insertedPositions.filter(p => p.status === 'OPEN').length;
        const closedCount = insertedPositions.filter(p => p.status === 'CLOSED').length;
        console.log(`✅ Seeded ${insertedPositions.length} positions (${openCount} open, ${closedCount} closed)\n`);
        // ============================================================
        // 4. SEED HISTORICAL TRADES
        // ============================================================
        console.log('💰 Seeding historical trades...');
        // Clear existing trades
        const deletedTrades = await Trade.deleteMany({ userId });
        console.log(`  Cleared ${deletedTrades.deletedCount} existing trades`);
        const trades = [
            // Winning trades
            {
                symbol: 'BTCUSDT',
                side: 'BUY',
                playbook: 'A',
                entry_price: 110500,
                exit_price: 114000,
                quantity: 0.025,
                pnl_usd: 87.50,
                pnl_r: 2.5,
                fees: 1.38,
                hold_time: '2h 13m',
                outcome: 'WIN',
                notes: 'Clean breakout, scaled at +1.5R, trailed to exit',
                date: new Date(Date.now() - 172800000),
                userId,
            },
            {
                symbol: 'SOLUSDT',
                side: 'BUY',
                playbook: 'C',
                entry_price: 140.20,
                exit_price: 146.80,
                quantity: 0.35,
                pnl_usd: 148.50,
                pnl_r: 4.2,
                fees: 2.10,
                hold_time: '3h 45m',
                outcome: 'WIN',
                notes: 'Event burst on protocol upgrade announcement',
                date: new Date(Date.now() - 604800000), // 7 days ago
                userId,
            },
            {
                symbol: 'ETHUSDT',
                side: 'BUY',
                playbook: 'B',
                entry_price: 3380,
                exit_price: 3502,
                quantity: 1.2,
                pnl_usd: 146.40,
                pnl_r: 1.8,
                fees: 1.52,
                hold_time: '1h 15m',
                outcome: 'WIN',
                notes: 'VWAP fade, exited at VWAP touch',
                date: new Date(Date.now() - 518400000), // 6 days ago
                userId,
            },
            // Losing trades
            {
                symbol: 'ETHUSDT',
                side: 'SELL',
                playbook: 'B',
                entry_price: 3500,
                exit_price: 3536,
                quantity: 1.2,
                pnl_usd: -43.20,
                pnl_r: -1.0,
                fees: 0.84,
                hold_time: '1h 40m',
                outcome: 'LOSS',
                notes: 'Stopped out on reversal',
                date: new Date(Date.now() - 259200000),
                userId,
            },
            {
                symbol: 'BTCUSDT',
                side: 'BUY',
                playbook: 'A',
                entry_price: 112000,
                exit_price: 111580,
                quantity: 0.03,
                pnl_usd: -12.60,
                pnl_r: -0.3,
                fees: 1.34,
                hold_time: '45m',
                outcome: 'LOSS',
                notes: 'False breakout, stopped out',
                date: new Date(Date.now() - 432000000), // 5 days ago
                userId,
            },
            // Breakeven trade
            {
                symbol: 'SOLUSDT',
                side: 'BUY',
                playbook: 'D',
                entry_price: 142.50,
                exit_price: 142.48,
                quantity: 0.28,
                pnl_usd: -0.56,
                pnl_r: 0.0,
                fees: 0.80,
                hold_time: '3h 20m',
                outcome: 'BREAKEVEN',
                notes: 'Dip buy ladder, moved to breakeven, exited on time stop',
                date: new Date(Date.now() - 345600000), // 4 days ago
                userId,
            },
            // More recent trades
            {
                symbol: 'BTCUSDT',
                side: 'BUY',
                playbook: 'A',
                entry_price: 109800,
                exit_price: 111350,
                quantity: 0.028,
                pnl_usd: 43.40,
                pnl_r: 1.2,
                fees: 1.25,
                hold_time: '1h 55m',
                outcome: 'WIN',
                date: new Date(Date.now() - 86400000), // 1 day ago
                userId,
            },
            {
                symbol: 'ETHUSDT',
                side: 'BUY',
                playbook: 'B',
                entry_price: 3450,
                exit_price: 3498,
                quantity: 1.3,
                pnl_usd: 62.40,
                pnl_r: 1.5,
                fees: 1.48,
                hold_time: '58m',
                outcome: 'WIN',
                date: new Date(Date.now() - 43200000), // 12 hours ago
                userId,
            },
        ];
        const insertedTrades = await Trade.insertMany(trades);
        const winCount = insertedTrades.filter(t => t.outcome === 'WIN').length;
        const lossCount = insertedTrades.filter(t => t.outcome === 'LOSS').length;
        const beCount = insertedTrades.filter(t => t.outcome === 'BREAKEVEN').length;
        console.log(`✅ Seeded ${insertedTrades.length} trades (${winCount} wins, ${lossCount} losses, ${beCount} breakeven)\n`);
        // ============================================================
        // 5. SEED SIGNALS
        // ============================================================
        console.log('📡 Seeding trading signals...');
        // Clear existing signals
        const deletedSignals = await Signal.deleteMany({ userId });
        console.log(`  Cleared ${deletedSignals.deletedCount} existing signals`);
        const signals = [
            {
                symbol: 'BTCUSDT',
                playbook: 'A',
                action: 'EXECUTED',
                entry_price: 111200,
                timestamp: new Date(Date.now() - 5000000), // Matches open position
                userId,
            },
            {
                symbol: 'ETHUSDT',
                playbook: 'B',
                action: 'EXECUTED',
                entry_price: 3420,
                timestamp: new Date(Date.now() - 2520000), // Matches open position
                userId,
            },
            {
                symbol: 'SOLUSDT',
                playbook: 'C',
                action: 'EXECUTED',
                entry_price: 145.50,
                timestamp: new Date(Date.now() - 1800000), // Matches open position
                userId,
            },
            {
                symbol: 'SOLUSDT',
                playbook: 'A',
                action: 'SKIPPED',
                reason: 'Max positions reached (4/4)',
                timestamp: new Date(Date.now() - 900000), // 15 min ago
                userId,
            },
            {
                symbol: 'BTCUSDT',
                playbook: 'D',
                action: 'SKIPPED',
                reason: 'Reserve floor breach - insufficient capital',
                timestamp: new Date(Date.now() - 1200000), // 20 min ago
                userId,
            },
            {
                symbol: 'ETHUSDT',
                playbook: 'A',
                action: 'SKIPPED',
                reason: 'Signal cooldown - last signal 8 min ago',
                timestamp: new Date(Date.now() - 600000), // 10 min ago
                userId,
            },
            {
                symbol: 'BTCUSDT',
                playbook: 'A',
                action: 'SKIPPED',
                reason: 'Correlation guard - BTC exposure too high',
                timestamp: new Date(Date.now() - 300000), // 5 min ago
                userId,
            },
            {
                symbol: 'SOLUSDT',
                playbook: 'B',
                action: 'SKIPPED',
                reason: 'Spread too wide (8 bps > 5 bps limit)',
                timestamp: new Date(Date.now() - 180000), // 3 min ago
                userId,
            },
        ];
        const insertedSignals = await Signal.insertMany(signals);
        const executedCount = insertedSignals.filter(s => s.action === 'EXECUTED').length;
        const skippedCount = insertedSignals.filter(s => s.action === 'SKIPPED').length;
        console.log(`✅ Seeded ${insertedSignals.length} signals (${executedCount} executed, ${skippedCount} skipped)\n`);
        // ============================================================
        // 6. SEED ALERTS
        // ============================================================
        console.log('🔔 Seeding system alerts...');
        // Clear existing alerts
        const deletedAlerts = await Alert.deleteMany({ userId });
        console.log(`  Cleared ${deletedAlerts.deletedCount} existing alerts`);
        const alerts = [
            {
                level: 'INFO',
                type: 'SYSTEM',
                message: 'Bot started successfully',
                timestamp: new Date(Date.now() - 7200000), // 2 hours ago
                userId,
            },
            {
                level: 'INFO',
                type: 'TRADE',
                message: 'Position opened: BTCUSDT LONG @ $111,200',
                timestamp: new Date(Date.now() - 5000000),
                userId,
            },
            {
                level: 'INFO',
                type: 'TRADE',
                message: 'Position moved to breakeven: BTCUSDT @ +1.0R',
                timestamp: new Date(Date.now() - 4500000),
                userId,
            },
            {
                level: 'INFO',
                type: 'TRADE',
                message: 'Position opened: ETHUSDT LONG @ $3,420',
                timestamp: new Date(Date.now() - 2520000),
                userId,
            },
            {
                level: 'INFO',
                type: 'TRADE',
                message: 'Position opened: SOLUSDT LONG @ $145.50',
                timestamp: new Date(Date.now() - 1800000),
                userId,
            },
            {
                level: 'WARNING',
                type: 'RISK',
                message: 'Daily loss approaching limit: -1.6R of -2.0R',
                timestamp: new Date(Date.now() - 3600000), // 1 hour ago
                userId,
            },
            {
                level: 'WARNING',
                type: 'EXECUTION',
                message: 'Slippage exceeded on ETHUSDT: 12.5 bps',
                timestamp: new Date(Date.now() - 2520000),
                userId,
            },
            {
                level: 'WARNING',
                type: 'RESERVE',
                message: 'Reserve level below target: 22% (target 30%)',
                timestamp: new Date(Date.now() - 1200000),
                userId,
            },
            {
                level: 'ERROR',
                type: 'API',
                message: 'API latency spike detected: 2,350ms',
                timestamp: new Date(Date.now() - 3000000),
                userId,
            },
            {
                level: 'CRITICAL',
                type: 'RISK',
                message: 'Kill-switch triggered: Daily loss limit reached (-2.0R)',
                timestamp: new Date(Date.now() - 259200000), // 3 days ago
                userId,
            },
        ];
        const insertedAlerts = await Alert.insertMany(alerts);
        const alertsByLevel = {
            INFO: insertedAlerts.filter(a => a.level === 'INFO').length,
            WARNING: insertedAlerts.filter(a => a.level === 'WARNING').length,
            ERROR: insertedAlerts.filter(a => a.level === 'ERROR').length,
            CRITICAL: insertedAlerts.filter(a => a.level === 'CRITICAL').length,
        };
        console.log(`✅ Seeded ${insertedAlerts.length} alerts`);
        console.log(`   INFO: ${alertsByLevel.INFO}, WARNING: ${alertsByLevel.WARNING}, ERROR: ${alertsByLevel.ERROR}, CRITICAL: ${alertsByLevel.CRITICAL}\n`);
        // ============================================================
        // 7. SUMMARY
        // ============================================================
        console.log('╔════════════════════════════════════════════════════════╗');
        console.log('║  Database Seeding Complete!                            ║');
        console.log('╚════════════════════════════════════════════════════════╝\n');
        console.log('📊 Summary:');
        console.log(`   👥 Users: 2 (1 admin, 1 test)`);
        console.log(`   ⚙️  Bot Configs: 1`);
        console.log(`   📊 Positions: ${insertedPositions.length} (${openCount} open, ${closedCount} closed)`);
        console.log(`   💰 Trades: ${insertedTrades.length} (${winCount}W / ${lossCount}L / ${beCount}BE)`);
        console.log(`   📡 Signals: ${insertedSignals.length} (${executedCount} executed, ${skippedCount} skipped)`);
        console.log(`   🔔 Alerts: ${insertedAlerts.length}\n`);
        console.log('🔐 Login Credentials:');
        console.log('   Admin:');
        console.log(`     Email: admin@tradingbot.com`);
        console.log(`     Password: admin123`);
        console.log('   Test User:');
        console.log(`     Email: test@example.com`);
        console.log(`     Password: password123\n`);
        console.log('✨ You can now start the application and test with these credentials!\n');
    }
    catch (error) {
        console.error('\n❌ Error seeding database:', error);
        if (error instanceof Error) {
            console.error('Error message:', error.message);
            console.error('Error stack:', error.stack);
        }
        process.exit(1);
    }
    finally {
        // Close database connection
        await mongoose.connection.close();
        console.log('🔌 Database connection closed');
        process.exit(0);
    }
}
// Run the seed script
seedDatabase();
//# sourceMappingURL=seedDatabase.js.map