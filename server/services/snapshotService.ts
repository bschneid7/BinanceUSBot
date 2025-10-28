import { Types } from 'mongoose';
import BotState from '../models/BotState';
import Position from '../models/Position';
import Trade from '../models/Trade';
import EquitySnapshot from '../models/EquitySnapshot';

/**
 * Snapshot Service
 * Handles creation and management of daily equity snapshots
 */
class SnapshotService {
  private readonly INITIAL_DEPOSIT = 15000;

  /**
   * Create equity snapshot for a specific date
   * @param userId - User ID
   * @param targetDate - Date for snapshot (defaults to today at midnight)
   */
  async createSnapshot(userId: Types.ObjectId, targetDate?: Date): Promise<void> {
    try {
      // Default to today at midnight
      const snapshotDate = targetDate || new Date();
      snapshotDate.setHours(0, 0, 0, 0);

      console.log(`[SnapshotService] Creating snapshot for ${snapshotDate.toISOString()}`);

      // Get all open positions
      const openPositions = await Position.find({ userId, status: 'OPEN' });
      console.log(`[SnapshotService] Found ${openPositions.length} open positions`);

      // Calculate positions value and unrealized P&L
      let positionsValue = 0;
      let unrealizedPnl = 0;
      
      openPositions.forEach(position => {
        const currentValue = (position.current_price || position.entry_price) * position.quantity;
        positionsValue += currentValue;
        unrealizedPnl += position.unrealized_pnl || 0;
      });

      // Get all closed trades
      const allTrades = await Trade.find({ userId });
      const realizedPnl = allTrades.reduce((sum, trade) => sum + (trade.pnl_usd || 0), 0);
      console.log(`[SnapshotService] Realized P&L: $${realizedPnl.toFixed(2)} from ${allTrades.length} trades`);

      // Calculate current equity
      const currentEquity = this.INITIAL_DEPOSIT + realizedPnl + unrealizedPnl;
      const cash = currentEquity - positionsValue;
      const reserve = cash; // Simplified

      console.log(`[SnapshotService] Current equity: $${currentEquity.toFixed(2)}`);

      // Calculate trade statistics
      const wins = allTrades.filter(t => t.pnl_usd > 0);
      const losses = allTrades.filter(t => t.pnl_usd < 0);
      const winRate = allTrades.length > 0 ? wins.length / allTrades.length : 0;
      const avgWin = wins.length > 0 ? wins.reduce((sum, t) => sum + t.pnl_usd, 0) / wins.length : 0;
      const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((sum, t) => sum + t.pnl_usd, 0) / losses.length) : 0;
      const profitFactor = avgLoss > 0 ? (avgWin * wins.length) / (avgLoss * losses.length) : 0;

      // Calculate total P&L
      const totalPnl = currentEquity - this.INITIAL_DEPOSIT;
      const totalPnlPct = (totalPnl / this.INITIAL_DEPOSIT) * 100;

      // Get previous snapshot for daily/weekly P&L calculation
      const previousSnapshot = await EquitySnapshot.findOne({ userId, date: { $lt: snapshotDate } })
        .sort({ date: -1 })
        .limit(1);

      let dailyPnl = 0;
      let dailyPnlPct = 0;
      let weeklyPnl = 0;
      let weeklyPnlPct = 0;

      if (previousSnapshot) {
        dailyPnl = currentEquity - previousSnapshot.equity;
        dailyPnlPct = (dailyPnl / previousSnapshot.equity) * 100;

        // Get snapshot from 7 days ago for weekly P&L
        const weekAgo = new Date(snapshotDate);
        weekAgo.setDate(weekAgo.getDate() - 7);
        const weeklySnapshot = await EquitySnapshot.findOne({ userId, date: { $lte: weekAgo } })
          .sort({ date: -1 })
          .limit(1);

        if (weeklySnapshot) {
          weeklyPnl = currentEquity - weeklySnapshot.equity;
          weeklyPnlPct = (weeklyPnl / weeklySnapshot.equity) * 100;
        }
      }

      // Check if snapshot already exists
      const existingSnapshot = await EquitySnapshot.findOne({ userId, date: snapshotDate });
      
      if (existingSnapshot) {
        console.log('[SnapshotService] Updating existing snapshot');
        existingSnapshot.equity = currentEquity;
        existingSnapshot.cash = cash;
        existingSnapshot.positions = positionsValue;
        existingSnapshot.reserve = reserve;
        existingSnapshot.dailyPnl = dailyPnl;
        existingSnapshot.dailyPnlPct = dailyPnlPct;
        existingSnapshot.weeklyPnl = weeklyPnl;
        existingSnapshot.weeklyPnlPct = weeklyPnlPct;
        existingSnapshot.totalPnl = totalPnl;
        existingSnapshot.totalPnlPct = totalPnlPct;
        existingSnapshot.openPositions = openPositions.length;
        existingSnapshot.closedTrades = allTrades.length;
        existingSnapshot.winRate = winRate;
        existingSnapshot.avgWin = avgWin;
        existingSnapshot.avgLoss = avgLoss;
        existingSnapshot.profitFactor = profitFactor;
        await existingSnapshot.save();
      } else {
        console.log('[SnapshotService] Creating new snapshot');
        await EquitySnapshot.create({
          userId,
          date: snapshotDate,
          equity: currentEquity,
          cash,
          positions: positionsValue,
          reserve,
          dailyPnl,
          dailyPnlPct,
          weeklyPnl,
          weeklyPnlPct,
          totalPnl,
          totalPnlPct,
          openPositions: openPositions.length,
          closedTrades: allTrades.length,
          winRate,
          avgWin,
          avgLoss,
          profitFactor,
        });
      }

      console.log('[SnapshotService] ✅ Snapshot created successfully');
    } catch (error) {
      console.error('[SnapshotService] ❌ Error creating snapshot:', error);
      throw error;
    }
  }

  /**
   * Get equity at a specific date
   * @param userId - User ID
   * @param date - Target date
   * @returns Equity value, or INITIAL_DEPOSIT if no snapshot found
   */
  async getEquityAtDate(userId: Types.ObjectId, date: Date): Promise<number> {
    const snapshot = await EquitySnapshot.findOne({
      userId,
      date: { $lte: date }
    }).sort({ date: -1 }).limit(1);

    return snapshot?.equity || this.INITIAL_DEPOSIT;
  }

  /**
   * Get all snapshots for a date range
   * @param userId - User ID
   * @param startDate - Start date
   * @param endDate - End date
   * @returns Array of snapshots
   */
  async getSnapshotsInRange(userId: Types.ObjectId, startDate: Date, endDate: Date) {
    return await EquitySnapshot.find({
      userId,
      date: { $gte: startDate, $lte: endDate }
    }).sort({ date: 1 });
  }
}

export default new SnapshotService();

