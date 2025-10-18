import dotenv from 'dotenv';
import { connectDB } from '../config/database';
import BotConfig from '../models/BotConfig';
import User from '../models/User';
// Load environment variables
dotenv.config();
/**
 * Seed script to create default bot configuration for all users
 */
async function seedBotConfig() {
    try {
        console.log('Starting bot config seeding...');
        // Connect to database
        await connectDB();
        console.log('Connected to database');
        // Get all users
        const users = await User.find();
        console.log(`Found ${users.length} users`);
        if (users.length === 0) {
            console.log('No users found. Please create users first.');
            process.exit(0);
        }
        let createdCount = 0;
        let existingCount = 0;
        for (const user of users) {
            // Check if config already exists
            const existingConfig = await BotConfig.findOne({ userId: user._id });
            if (existingConfig) {
                console.log(`Config already exists for user: ${user.email}`);
                existingCount++;
                continue;
            }
            // Create default config
            const config = await BotConfig.create({
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
            console.log(`✓ Created default config for user: ${user.email}`);
            createdCount++;
        }
        console.log('\n=== Bot Config Seeding Complete ===');
        console.log(`Created: ${createdCount} configs`);
        console.log(`Already existed: ${existingCount} configs`);
        console.log(`Total users: ${users.length}`);
        process.exit(0);
    }
    catch (error) {
        console.error('Error seeding bot config:', error);
        process.exit(1);
    }
}
// Run the seed script
seedBotConfig();
//# sourceMappingURL=seedBotConfig.js.map