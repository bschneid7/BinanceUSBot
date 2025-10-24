import mongoose from 'mongoose';
import dotenv from 'dotenv';
import tradingEngine from '../services/tradingEngine';
import User from '../models/User';

dotenv.config();

const connectDB = async (): Promise<void> => {
  try {
    const mongoUri = process.env.MONGO_URI || process.env.DATABASE_URL;
    if (!mongoUri) {
      throw new Error('MONGO_URI or DATABASE_URL environment variable is required');
    }
    const conn = await mongoose.connect(mongoUri);

    console.log(`MongoDB Connected: ${conn.connection.host}`);

    // Auto-start trading engine for all users
    await autoStartTradingEngine();

    mongoose.connection.on('error', (err: Error) => {
      console.error(`MongoDB connection error: ${err}`);
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('MongoDB disconnected. Attempting to reconnect...');
    });

    mongoose.connection.on('reconnected', () => {
      console.info('MongoDB reconnected');
    });

    process.on('SIGINT', async () => {
      try {
        await mongoose.connection.close();
        console.log('MongoDB connection closed through app termination');
        process.exit(0);
      } catch (err) {
        console.error('Error during MongoDB shutdown:', err);
        process.exit(1);
      }
    });

  } catch (error) {
    console.error(`Error: ${(error as Error).message}`);
    process.exit(1);
  }
};

/**
 * Auto-start trading engine for all active users
 */
const autoStartTradingEngine = async (): Promise<void> => {
  try {
    console.log('[AutoStart] Checking for users to start trading engine...');
    
    // Find all users
    const users = await User.find({});
    
    if (users.length === 0) {
      console.log('[AutoStart] No users found');
      return;
    }

    console.log(`[AutoStart] Found ${users.length} user(s)`);
    
    // Start trading engine for each user
    for (const user of users) {
      try {
        console.log(`[AutoStart] Starting trading engine for user ${user._id}...`);
        await tradingEngine.start(user._id as Types.ObjectId);
        console.log(`[AutoStart] ✓ Trading engine started for user ${user._id}`);
      } catch (error) {
        console.error(`[AutoStart] Failed to start trading engine for user ${user._id}:`, error);
      }
    }
    
    console.log('[AutoStart] Trading engine auto-start complete');
  } catch (error) {
    console.error('[AutoStart] Error during trading engine auto-start:', error);
  }
};

export {
  connectDB,
};