import mongoose from 'mongoose';
import BotState from '../models/BotState';
import Position from '../models/Position';
import Trade from '../models/Trade';
import EquitySnapshot from '../models/EquitySnapshot';

/**
 * Create initial equity snapshot for today
 * This establishes a baseline for future P&L calculations
 */
async function createInitialSnapshot() {
  try {
    console.log('[CreateSnapshot] Starting initial snapshot creation...');

    // Get bot state
    const botState = await BotState.findOne();
    if (!botState) {
      throw new Error('BotState not found');
    }

    const userId = botState.userId;
    console.log(`[CreateSnapshot] Found userId: ${userId}`);

    // Get all open positions
    const openPositions = await Position.find({ userId, status: 'OPEN' });
    console.log(`[CreateSnapshot] Found ${openPositions.length} open positions`);

    // Calculate positions value and unrealized P&L
    let positionsValue = 0;
    let unrealizedPnl = 0;
    
    openPositions.forEach(position => {
      const currentValue = (position.current_price || position.entry_price) * position.quantity;
      positionsValue += currentValue;
      unrealizedPnl += position.unrealized_pnl || 0;
    });

    console.log(`[CreateSnapshot] Positions value: $${positionsValue.toFixed(2)}`);
    console.log(`[CreateSnapshot] Unrealized P&L: $${unrealizedPnl.toFixed(2)}`);

    // Get all closed trades
    const allTrades = await Trade.find({ userId });
    const realizedPnl = allTrades.reduce((sum, trade) => sum + (trade.pnl_usd || 0), 0);
    console.log(`[CreateSnapshot] Realized P&L: $${realizedPnl.toFixed(2)} from ${allTrades.length} trades`);

    // Calculate current equity
    const INITIAL_DEPOSIT = 15000;
    const currentEquity = INITIAL_DEPOSIT + realizedPnl + unrealizedPnl;
    const cash = currentEquity - positionsValue;
    const reserve = cash; // Simplified - available capital is reserve

    console.log(`[CreateSnapshot] Current equity: $${currentEquity.toFixed(2)}`);
    console.log(`[CreateSnapshot] Cash: $${cash.toFixed(2)}`);

    // Calculate trade statistics
    const wins = allTrades.filter(t => t.pnl_usd > 0);
    const losses = allTrades.filter(t => t.pnl_usd < 0);
    const winRate = allTrades.length > 0 ? wins.length / allTrades.length : 0;
    const avgWin = wins.length > 0 ? wins.reduce((sum, t) => sum + t.pnl_usd, 0) / wins.length : 0;
    const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((sum, t) => sum + t.pnl_usd, 0) / losses.length) : 0;
    const profitFactor = avgLoss > 0 ? (avgWin * wins.length) / (avgLoss * losses.length) : 0;

    // Calculate total P&L
    const totalPnl = currentEquity - INITIAL_DEPOSIT;
    const totalPnlPct = (totalPnl / INITIAL_DEPOSIT) * 100;

    // Get today's date at midnight
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Check if snapshot already exists for today
    const existingSnapshot = await EquitySnapshot.findOne({ userId, date: today });
    if (existingSnapshot) {
      console.log('[CreateSnapshot] Snapshot already exists for today, updating...');
      
      existingSnapshot.equity = currentEquity;
      existingSnapshot.cash = cash;
      existingSnapshot.positions = positionsValue;
      existingSnapshot.reserve = reserve;
      existingSnapshot.dailyPnl = 0; // First snapshot, no previous day
      existingSnapshot.dailyPnlPct = 0;
      existingSnapshot.weeklyPnl = 0;
      existingSnapshot.weeklyPnlPct = 0;
      existingSnapshot.totalPnl = totalPnl;
      existingSnapshot.totalPnlPct = totalPnlPct;
      existingSnapshot.openPositions = openPositions.length;
      existingSnapshot.closedTrades = allTrades.length;
      existingSnapshot.winRate = winRate;
      existingSnapshot.avgWin = avgWin;
      existingSnapshot.avgLoss = avgLoss;
      existingSnapshot.profitFactor = profitFactor;

      await existingSnapshot.save();
      console.log('[CreateSnapshot] Updated existing snapshot');
    } else {
      // Create new snapshot
      const snapshot = await EquitySnapshot.create({
        userId,
        date: today,
        equity: currentEquity,
        cash,
        positions: positionsValue,
        reserve,
        dailyPnl: 0, // First snapshot, no previous day
        dailyPnlPct: 0,
        weeklyPnl: 0,
        weeklyPnlPct: 0,
        totalPnl,
        totalPnlPct,
        openPositions: openPositions.length,
        closedTrades: allTrades.length,
        winRate,
        avgWin,
        avgLoss,
        profitFactor,
      });

      console.log('[CreateSnapshot] Created new snapshot:', {
        date: snapshot.date,
        equity: snapshot.equity,
        totalPnl: snapshot.totalPnl,
        totalPnlPct: snapshot.totalPnlPct,
      });
    }

    console.log('[CreateSnapshot] ✅ Initial snapshot created successfully');
    return true;
  } catch (error) {
    console.error('[CreateSnapshot] ❌ Error creating snapshot:', error);
    throw error;
  }
}

// Run if called directly
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/trading_bot';

mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('[CreateSnapshot] Connected to MongoDB');
    return createInitialSnapshot();
  })
  .then(() => {
    console.log('[CreateSnapshot] Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('[CreateSnapshot] Fatal error:', error);
    process.exit(1);
  });

export default createInitialSnapshot;

