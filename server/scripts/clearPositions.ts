import dotenv from 'dotenv';
dotenv.config({ path: '/opt/binance-bot/.env.production' });

import { connectDB } from '../config/database';
import Position from '../models/Position';
import mongoose from 'mongoose';

async function clearPositions(userId: string) {
  try {
    await connectDB();
    
    console.log('\n=== Clearing old positions ===\n');
    
    const result = await Position.deleteMany({
      userId: new mongoose.Types.ObjectId(userId)
    });
    
    console.log(`✓ Deleted ${result.deletedCount} positions\n`);
    process.exit(0);
    
  } catch (error) {
    console.error('Error clearing positions:', error);
    process.exit(1);
  }
}

const userId = process.argv[2] || '68f44e83d8f6d83fb4db687a';
clearPositions(userId);
