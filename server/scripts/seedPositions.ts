import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDB } from '../config/database';
import Position from '../models/Position';
import User from '../models/User';

// Load environment variables
dotenv.config();

/**
 * Script to seed the database with sample position data for testing
 * This creates sample positions for the first user in the database
 */
async function seedPositions() {
  try {
    console.log('Starting position seeding script...');

    // Connect to database
    await connectDB();
    console.log('Database connected successfully');

    // Find the first user to assign positions to
    const user = await User.findOne();
    if (!user) {
      console.error('No users found in database. Please create a user first.');
      process.exit(1);
    }

    console.log(`Found user: ${user.email} (${user._id})`);

    // Clear existing positions for this user
    const deleteResult = await Position.deleteMany({ userId: user._id });
    console.log(`Cleared ${deleteResult.deletedCount} existing positions for user`);

    // Sample positions data
    const samplePositions = [
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
        userId: user._id,
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
        userId: user._id,
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
        userId: user._id,
      },
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
        userId: user._id,
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
        userId: user._id,
      },
    ];

    // Insert positions
    const insertedPositions = await Position.insertMany(samplePositions);
    console.log(`Successfully seeded ${insertedPositions.length} positions`);

    // Show summary
    const activeCount = insertedPositions.filter(p => p.status === 'OPEN').length;
    const closedCount = insertedPositions.filter(p => p.status === 'CLOSED').length;
    console.log(`  - Active positions: ${activeCount}`);
    console.log(`  - Closed positions: ${closedCount}`);

    console.log('\nPosition seeding completed successfully!');
    console.log('You can now test the GET /api/positions/active endpoint');

  } catch (error) {
    console.error('Error seeding positions:', error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    }
    process.exit(1);
  } finally {
    // Close database connection
    await mongoose.connection.close();
    console.log('Database connection closed');
    process.exit(0);
  }
}

// Run the seed script
seedPositions();
