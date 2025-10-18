import dotenv from 'dotenv';
import Alert from '../models/Alert';
import User from '../models/User';
import { connectDB } from '../config/database';
// Load environment variables
dotenv.config();
/**
 * Seed script to populate the database with sample alerts
 * This creates various types of alerts for testing the alerts API
 */
async function seedAlerts() {
    try {
        console.log('Starting alert seeding process...');
        // Connect to database
        await connectDB();
        console.log('Database connected successfully');
        // Find the first user in the database
        const user = await User.findOne();
        if (!user) {
            console.error('No user found in database. Please run seedDatabase.ts first to create test users.');
            process.exit(1);
        }
        console.log(`Using user: ${user.email} (${user._id})`);
        // Clear existing alerts for this user
        const deleteResult = await Alert.deleteMany({ userId: user._id });
        console.log(`Cleared ${deleteResult.deletedCount} existing alerts for user ${user._id}`);
        // Sample alerts with various types and levels
        const alerts = [
            // Recent critical alerts
            {
                userId: user._id,
                level: 'CRITICAL',
                message: 'Daily loss limit reached: -2.0R. All positions flattened and trading halted.',
                type: 'KILL_SWITCH',
                timestamp: new Date(Date.now() - 1000 * 60 * 30) // 30 minutes ago
            },
            {
                userId: user._id,
                level: 'CRITICAL',
                message: 'API connection lost to Binance.US. Retrying...',
                type: 'API_ERROR',
                timestamp: new Date(Date.now() - 1000 * 60 * 60 * 4) // 4 hours ago
            },
            // Warning alerts
            {
                userId: user._id,
                level: 'WARNING',
                message: 'Daily loss approaching: -1.6R of -2.0R',
                type: 'RISK_LIMIT',
                timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2) // 2 hours ago
            },
            {
                userId: user._id,
                level: 'WARNING',
                message: 'Slippage exceeded on ETHUSDT: 12.5 bps',
                type: 'SLIPPAGE',
                timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2.5) // 2.5 hours ago
            },
            {
                userId: user._id,
                level: 'WARNING',
                message: 'Reserve level below target: 22% (target: 30%)',
                type: 'RESERVE',
                timestamp: new Date(Date.now() - 1000 * 60 * 60 * 5) // 5 hours ago
            },
            {
                userId: user._id,
                level: 'WARNING',
                message: 'Max concurrent positions reached (4/4). New signals will be queued.',
                type: 'RISK_LIMIT',
                timestamp: new Date(Date.now() - 1000 * 60 * 60 * 6) // 6 hours ago
            },
            {
                userId: user._id,
                level: 'WARNING',
                message: 'High correlation detected: BTC and ETH positions both LONG with combined risk 1.8R',
                type: 'CORRELATION',
                timestamp: new Date(Date.now() - 1000 * 60 * 60 * 8) // 8 hours ago
            },
            // Error alerts
            {
                userId: user._id,
                level: 'ERROR',
                message: 'Order rejected: Insufficient balance for SOLUSDT entry',
                type: 'ORDER_ERROR',
                timestamp: new Date(Date.now() - 1000 * 60 * 60 * 10) // 10 hours ago
            },
            {
                userId: user._id,
                level: 'ERROR',
                message: 'Failed to fetch market data for BTCUSDT: Connection timeout',
                type: 'DATA_ERROR',
                timestamp: new Date(Date.now() - 1000 * 60 * 60 * 12) // 12 hours ago
            },
            // Info alerts
            {
                userId: user._id,
                level: 'INFO',
                message: 'Position BTCUSDT moved to breakeven at +1.0R',
                type: 'POSITION_UPDATE',
                timestamp: new Date(Date.now() - 1000 * 60 * 45) // 45 minutes ago
            },
            {
                userId: user._id,
                level: 'INFO',
                message: 'Scaled out 50% of ETHUSDT position at +1.5R',
                type: 'POSITION_UPDATE',
                timestamp: new Date(Date.now() - 1000 * 60 * 90) // 1.5 hours ago
            },
            {
                userId: user._id,
                level: 'INFO',
                message: 'Trailing stop engaged for BTCUSDT at 1.0×ATR',
                type: 'POSITION_UPDATE',
                timestamp: new Date(Date.now() - 1000 * 60 * 60 * 3) // 3 hours ago
            },
            {
                userId: user._id,
                level: 'INFO',
                message: 'Breakout signal detected for SOLUSDT (Playbook A)',
                type: 'SIGNAL',
                timestamp: new Date(Date.now() - 1000 * 60 * 60 * 4) // 4 hours ago
            },
            {
                userId: user._id,
                level: 'INFO',
                message: 'VWAP fade signal detected for ETHUSDT (Playbook B)',
                type: 'SIGNAL',
                timestamp: new Date(Date.now() - 1000 * 60 * 60 * 7) // 7 hours ago
            },
            {
                userId: user._id,
                level: 'INFO',
                message: 'Daily session started. Risk unit (R) recalculated: $42.50',
                type: 'SESSION',
                timestamp: new Date(Date.now() - 1000 * 60 * 60 * 14) // 14 hours ago
            },
            {
                userId: user._id,
                level: 'INFO',
                message: 'Month-end reconciliation complete for 2025-01. Status: Balanced',
                type: 'TAX',
                timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24) // 1 day ago
            },
            {
                userId: user._id,
                level: 'INFO',
                message: 'Reserve refilled from profits: $45.00 added to reserve',
                type: 'RESERVE',
                timestamp: new Date(Date.now() - 1000 * 60 * 60 * 26) // 26 hours ago
            },
            {
                userId: user._id,
                level: 'INFO',
                message: 'Dip module activated: Flash crash detected, ladders placed',
                type: 'DIP_MODULE',
                timestamp: new Date(Date.now() - 1000 * 60 * 60 * 36) // 36 hours ago
            },
            {
                userId: user._id,
                level: 'INFO',
                message: 'Trading resumed after daily loss limit reset',
                type: 'SESSION',
                timestamp: new Date(Date.now() - 1000 * 60 * 60 * 48) // 2 days ago
            },
            {
                userId: user._id,
                level: 'INFO',
                message: 'System health check passed: API latency 120ms, all systems operational',
                type: 'HEALTH',
                timestamp: new Date(Date.now() - 1000 * 60 * 60 * 50) // ~2 days ago
            }
        ];
        // Insert alerts
        const insertedAlerts = await Alert.insertMany(alerts);
        console.log(`Successfully inserted ${insertedAlerts.length} alerts`);
        // Display summary
        const stats = await Alert.aggregate([
            { $match: { userId: user._id } },
            {
                $group: {
                    _id: '$level',
                    count: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]);
        console.log('\n=== Alert Summary ===');
        stats.forEach(stat => {
            console.log(`${stat._id}: ${stat.count} alerts`);
        });
        console.log('\n✅ Alert seeding completed successfully!');
        process.exit(0);
    }
    catch (error) {
        console.error('Error seeding alerts:', error);
        process.exit(1);
    }
}
// Run the seed function
seedAlerts();
//# sourceMappingURL=seedAlerts.js.map