import { Types } from 'mongoose';
import { connectDB } from '../config/database';
import botInitializationService from '../services/botInitializationService';

/**
 * Run bot initialization to set up proper starting equity
 */
async function main() {
  try {
    console.log('[Init] Connecting to database...');
    await connectDB();
    
    // Use the real user ID from the system
    const userId = new Types.ObjectId('68fac3bbd5f133b16fce5f47');
    
    console.log('[Init] Initializing bot state...');
    await botInitializationService.initializeBotState(userId);
    
    console.log('[Init] ✅ Initialization complete!');
    process.exit(0);
  } catch (error) {
    console.error('[Init] ❌ Initialization failed:', error);
    process.exit(1);
  }
}

main();

