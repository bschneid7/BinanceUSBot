import dotenv from 'dotenv';
import { connectDB } from '../config/database';
import User from '../models/User';
import Position from '../models/Position';
import Trade from '../models/Trade';
import Signal from '../models/Signal';
import Alert from '../models/Alert';
import BotConfig from '../models/BotConfig';
dotenv.config();
async function seedBotData() {
    try {
        console.log('[SeedBotData] Starting bot data seeding...');
        await connectDB();
        console.log('[SeedBotData] Connected to database');
        // Find the first user
        const user = await User.findOne();
        if (!user) {
            console.error('[SeedBotData] No users found. Please create a user first.');
            process.exit(1);
        }
        console.log(`[SeedBotData] Using user: ${user.email}`);
        // Create bot configuration if it doesn't exist
        let config = await BotConfig.findOne({ userId: user._id });
        if (!config) {
            config = await BotConfig.create({
                userId: user._id,
                scanner: {
                    pairs: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'],
                    refresh_ms: 2000,
                    min_volume_usd_24h: 2000000,
                    max_spread_bps: 5,
                    max_spread_bps_event: 10,
                    tob_min_depth_usd: 50000,
                    pair_signal_cooldown_min: 15
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
                    slippage_guard_bps_event: 10
                },
                reserve: {
                    target_pct: 0.30,
                    floor_pct: 0.20,
                    refill_from_profits_pct: 0.30
                },
                playbook_A: {
                    enable: true,
                    volume_mult: 1.5,
                    stop_atr_mult: 1.2,
                    breakeven_R: 1.0,
                    scale_R: 1.5,
                    scale_pct: 0.5,
                    trail_atr_mult: 1.0
                },
                playbook_B: {
                    enable: true,
                    deviation_atr_mult: 2.0,
                    stop_atr_mult: 0.8,
                    time_stop_min: 90,
                    target_R: 1.2,
                    max_trades_per_session: 2
                },
                playbook_C: {
                    enable: true,
                    event_window_min: 30,
                    stop_atr_mult: 1.8,
                    scale_1_R: 1.0,
                    scale_1_pct: 0.33,
                    scale_2_R: 2.0,
                    scale_2_pct: 0.33,
                    trail_atr_mult: 1.0
                },
                playbook_D: {
                    enable: true
                }
            });
            console.log('[SeedBotData] Created bot configuration');
        }
        else {
            console.log('[SeedBotData] Bot configuration already exists');
        }
        // Create some historical trades for PnL calculations
        console.log('[SeedBotData] Creating historical trades...');
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const weekAgo = new Date(today);
        weekAgo.setDate(weekAgo.getDate() - 7);
        // Clear existing trades and positions for this user
        await Trade.deleteMany({ userId: user._id });
        await Position.deleteMany({ userId: user._id });
        await Signal.deleteMany({ userId: user._id });
        await Alert.deleteMany({ userId: user._id });
        // Create trades for today (positive PnL)
        const todayTrades = [
            {
                userId: user._id,
                symbol: 'BTCUSDT',
                side: 'BUY',
                playbook: 'A',
                entry_price: 111000,
                exit_price: 111800,
                quantity: 0.032,
                pnl_usd: 25.60,
                pnl_r: 0.61,
                fees: 0.89,
                hold_time: '2h',
                outcome: 'WIN',
                date: new Date(today.getTime() + 4 * 3600000)
            },
            {
                userId: user._id,
                symbol: 'ETHUSDT',
                side: 'BUY',
                playbook: 'B',
                entry_price: 3400,
                exit_price: 3450,
                quantity: 1.2,
                pnl_usd: 60.00,
                pnl_r: 1.43,
                fees: 1.22,
                hold_time: '1h',
                outcome: 'WIN',
                date: new Date(today.getTime() + 6 * 3600000)
            },
            {
                userId: user._id,
                symbol: 'SOLUSDT',
                side: 'BUY',
                playbook: 'A',
                entry_price: 180,
                exit_price: 175,
                quantity: 5,
                pnl_usd: -25.00,
                pnl_r: -0.60,
                fees: 0.45,
                hold_time: '1h',
                outcome: 'LOSS',
                date: new Date(today.getTime() + 8 * 3600000)
            }
        ];
        await Trade.insertMany(todayTrades);
        console.log(`[SeedBotData] Created ${todayTrades.length} trades for today`);
        // Create trades for this week (mixed PnL)
        const weekTrades = [
            {
                userId: user._id,
                symbol: 'BTCUSDT',
                side: 'BUY',
                playbook: 'C',
                entry_price: 109500,
                exit_price: 110200,
                quantity: 0.045,
                pnl_usd: 31.50,
                pnl_r: 0.75,
                fees: 1.24,
                hold_time: '2h',
                outcome: 'WIN',
                date: new Date(weekAgo.getTime() + 1 * 86400000 + 7200000)
            },
            {
                userId: user._id,
                symbol: 'ETHUSDT',
                side: 'BUY',
                playbook: 'A',
                entry_price: 3300,
                exit_price: 3250,
                quantity: 1.5,
                pnl_usd: -75.00,
                pnl_r: -1.79,
                fees: 1.48,
                hold_time: '1h 30m',
                outcome: 'LOSS',
                date: new Date(weekAgo.getTime() + 2 * 86400000 + 5400000)
            },
            {
                userId: user._id,
                symbol: 'SOLUSDT',
                side: 'BUY',
                playbook: 'D',
                entry_price: 175,
                exit_price: 182,
                quantity: 6,
                pnl_usd: 42.00,
                pnl_r: 1.00,
                fees: 0.63,
                hold_time: '3h',
                outcome: 'WIN',
                date: new Date(weekAgo.getTime() + 3 * 86400000 + 10800000)
            },
            {
                userId: user._id,
                symbol: 'BTCUSDT',
                side: 'BUY',
                playbook: 'A',
                entry_price: 110800,
                exit_price: 109900,
                quantity: 0.038,
                pnl_usd: -34.20,
                pnl_r: -0.81,
                fees: 1.06,
                hold_time: '1h',
                outcome: 'LOSS',
                date: new Date(weekAgo.getTime() + 4 * 86400000 + 3600000)
            }
        ];
        await Trade.insertMany(weekTrades);
        console.log(`[SeedBotData] Created ${weekTrades.length} trades for this week`);
        // Create some open positions
        console.log('[SeedBotData] Creating open positions...');
        const openPositions = [
            {
                userId: user._id,
                symbol: 'BTCUSDT',
                side: 'LONG',
                entry_price: 111200,
                current_price: 111850,
                quantity: 0.032,
                stop_price: 109900,
                target_price: 113500,
                trailing_stop_distance: 1300,
                playbook: 'A',
                status: 'OPEN',
                opened_at: new Date(now.getTime() - 3600000),
                unrealized_pnl: 20.80,
                unrealized_r: 0.50,
                fees_paid: 0.89
            },
            {
                userId: user._id,
                symbol: 'ETHUSDT',
                side: 'LONG',
                entry_price: 3420,
                current_price: 3480,
                quantity: 1.4,
                stop_price: 3390,
                target_price: 3500,
                playbook: 'B',
                status: 'OPEN',
                opened_at: new Date(now.getTime() - 2700000),
                unrealized_pnl: 84.00,
                unrealized_r: 2.00,
                fees_paid: 1.20
            }
        ];
        await Position.insertMany(openPositions);
        console.log(`[SeedBotData] Created ${openPositions.length} open positions`);
        // Create some recent signals
        console.log('[SeedBotData] Creating signals...');
        const signals = [
            {
                userId: user._id,
                symbol: 'BTCUSDT',
                playbook: 'A',
                action: 'EXECUTED',
                entry_price: 111200,
                timestamp: new Date(now.getTime() - 3600000)
            },
            {
                userId: user._id,
                symbol: 'ETHUSDT',
                playbook: 'B',
                action: 'EXECUTED',
                entry_price: 3420,
                timestamp: new Date(now.getTime() - 2700000)
            },
            {
                userId: user._id,
                symbol: 'SOLUSDT',
                playbook: 'A',
                action: 'SKIPPED',
                reason: 'Max positions reached',
                timestamp: new Date(now.getTime() - 5400000)
            },
            {
                userId: user._id,
                symbol: 'BTCUSDT',
                playbook: 'C',
                action: 'SKIPPED',
                reason: 'Spread too wide',
                timestamp: new Date(now.getTime() - 7200000)
            }
        ];
        await Signal.insertMany(signals);
        console.log(`[SeedBotData] Created ${signals.length} signals`);
        // Create some alerts
        console.log('[SeedBotData] Creating alerts...');
        const alerts = [
            {
                userId: user._id,
                level: 'INFO',
                message: 'Trading session started',
                type: 'SYSTEM',
                timestamp: new Date(today)
            },
            {
                userId: user._id,
                level: 'INFO',
                message: 'Position opened: BTCUSDT LONG @ $111,200',
                type: 'TRADE',
                timestamp: new Date(now.getTime() - 3600000)
            },
            {
                userId: user._id,
                level: 'WARNING',
                message: 'Reserve level below target: 28.5% (target: 30%)',
                type: 'RESERVE',
                timestamp: new Date(now.getTime() - 5400000)
            },
            {
                userId: user._id,
                level: 'INFO',
                message: 'Trade closed: ETHUSDT +$60.00 (+1.43R)',
                type: 'TRADE',
                timestamp: new Date(today.getTime() + 6 * 3600000)
            }
        ];
        await Alert.insertMany(alerts);
        console.log(`[SeedBotData] Created ${alerts.length} alerts`);
        console.log('[SeedBotData] Bot data seeding completed successfully!');
        console.log('[SeedBotData] Summary:');
        console.log(`  - Bot configuration: ✓`);
        console.log(`  - Today trades: ${todayTrades.length} (Daily PnL: +$60.60)`);
        console.log(`  - Week trades: ${weekTrades.length} (Weekly PnL: -$35.70)`);
        console.log(`  - Open positions: ${openPositions.length}`);
        console.log(`  - Signals: ${signals.length}`);
        console.log(`  - Alerts: ${alerts.length}`);
        process.exit(0);
    }
    catch (error) {
        console.error('[SeedBotData] Error seeding bot data:', error);
        process.exit(1);
    }
}
seedBotData();
//# sourceMappingURL=seedBotData.js.map