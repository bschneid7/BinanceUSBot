import { Types } from 'mongoose';
import BotState from '../models/BotState';
import EquitySnapshot from '../models/EquitySnapshot';
import Position from '../models/Position';
import Trade from '../models/Trade';

/**
 * Analytics Service
 * Replaces hard-coded STARTING_EQUITY with dynamic equity snapshots
 */

export class AnalyticsService {
  /**
   * Create daily equity snapshot
   * Should be run at end of each trading day
   */
  async createDailySnapshot(userId: Types.ObjectId): Promise<void> {
    try {
      const state = await BotState.findOne({ userId });
      if (!state) {
        throw new Error('Bot state not found');
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Check if snapshot already exists for today
      const existing = await EquitySnapshot.findOne({ userId, date: today });
      if (existing) {
        console.log('[Analytics] Snapshot already exists for today');
        return;
      }

      // Get open positions value
      const openPositions = await Position.find({ userId, status: 'OPEN' });
      const positionsValue = openPositions.reduce((sum, pos) => {
        const currentValue = (pos.current_price || pos.entry_price) * pos.quantity;
        return sum + currentValue;
      }, 0);

      // Get closed trades for statistics
      const closedTrades = await Trade.find({ userId, status: 'CLOSED' });
      const wins = closedTrades.filter(t => t.realized_pnl > 0);
      const losses = closedTrades.filter(t => t.realized_pnl < 0);

      const winRate = closedTrades.length > 0 ? wins.length / closedTrades.length : 0;
      const avgWin = wins.length > 0 ? wins.reduce((sum, t) => sum + t.realized_pnl, 0) / wins.length : 0;
      const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((sum, t) => sum + t.realized_pnl, 0) / losses.length) : 0;
      const profitFactor = avgLoss > 0 ? (avgWin * wins.length) / (avgLoss * losses.length) : 0;

      // Calculate total PnL
      const totalPnl = state.equity - state.startingEquity;
      const totalPnlPct = (totalPnl / state.startingEquity) * 100;

      // Calculate daily PnL percentage
      const dailyPnlPct = state.equity > 0 ? (state.dailyPnl / state.equity) * 100 : 0;
      const weeklyPnlPct = state.equity > 0 ? (state.weeklyPnl / state.equity) * 100 : 0;

      // Estimate cash (equity - positions value)
      const cash = state.equity - positionsValue;

      // Estimate reserve (simplified - would need actual reserve manager state)
      // In production, query ReserveManager for actual reserve amount
      // For now, estimate as 10% of equity (typical reserve ratio)
      const reserve = state.equity * 0.10;

      // Create snapshot
      await EquitySnapshot.create({
        userId,
        date: today,
        equity: state.equity,
        cash,
        positions: positionsValue,
        reserve,
        dailyPnl: state.dailyPnl,
        dailyPnlPct,
        weeklyPnl: state.weeklyPnl,
        weeklyPnlPct,
        totalPnl,
        totalPnlPct,
        openPositions: openPositions.length,
        closedTrades: closedTrades.length,
        winRate,
        avgWin,
        avgLoss,
        profitFactor,
      });

      console.log(`[Analytics] Created daily snapshot: Equity $${state.equity.toFixed(2)}, Daily PnL $${state.dailyPnl.toFixed(2)} (${dailyPnlPct.toFixed(2)}%)`);
    } catch (error) {
      console.error('[Analytics] Error creating daily snapshot:', error);
      throw error;
    }
  }

  /**
   * Get equity curve data
   */
  async getEquityCurve(
    userId: Types.ObjectId,
    startDate?: Date,
    endDate?: Date
  ): Promise<Array<{ date: Date; equity: number; pnl: number; pnlPct: number }>> {
    try {
      const query: any = { userId };
      
      if (startDate || endDate) {
        query.date = {};
        if (startDate) query.date.$gte = startDate;
        if (endDate) query.date.$lte = endDate;
      }

      const snapshots = await EquitySnapshot.find(query).sort({ date: 1 });

      return snapshots.map(s => ({
        date: s.date,
        equity: s.equity,
        pnl: s.totalPnl,
        pnlPct: s.totalPnlPct,
      }));
    } catch (error) {
      console.error('[Analytics] Error getting equity curve:', error);
      throw error;
    }
  }

  /**
   * Get performance statistics
   */
  async getPerformanceStats(userId: Types.ObjectId): Promise<{
    startingEquity: number;
    currentEquity: number;
    totalPnl: number;
    totalPnlPct: number;
    dailyPnl: number;
    weeklyPnl: number;
    winRate: number;
    profitFactor: number;
    sharpeRatio: number;
    maxDrawdown: number;
    maxDrawdownPct: number;
  }> {
    try {
      const state = await BotState.findOne({ userId });
      if (!state) {
        throw new Error('Bot state not found');
      }

      // Get latest snapshot for statistics
      const latestSnapshot = await EquitySnapshot.findOne({ userId }).sort({ date: -1 });

      // Calculate Sharpe ratio from daily snapshots
      const snapshots = await EquitySnapshot.find({ userId }).sort({ date: 1 }).limit(30);
      const dailyReturns = [];
      for (let i = 1; i < snapshots.length; i++) {
        const returnPct = ((snapshots[i].equity - snapshots[i - 1].equity) / snapshots[i - 1].equity) * 100;
        dailyReturns.push(returnPct);
      }

      const avgReturn = dailyReturns.length > 0 ? dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length : 0;
      const stdDev = dailyReturns.length > 1 
        ? Math.sqrt(dailyReturns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / (dailyReturns.length - 1))
        : 0;
      const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0; // Annualized

      // Calculate max drawdown
      let maxEquity = state.startingEquity;
      let maxDrawdown = 0;
      for (const snapshot of snapshots) {
        if (snapshot.equity > maxEquity) {
          maxEquity = snapshot.equity;
        }
        const drawdown = maxEquity - snapshot.equity;
        if (drawdown > maxDrawdown) {
          maxDrawdown = drawdown;
        }
      }
      const maxDrawdownPct = maxEquity > 0 ? (maxDrawdown / maxEquity) * 100 : 0;

      const totalPnl = state.equity - state.startingEquity;
      const totalPnlPct = (totalPnl / state.startingEquity) * 100;

      return {
        startingEquity: state.startingEquity,
        currentEquity: state.equity,
        totalPnl,
        totalPnlPct,
        dailyPnl: state.dailyPnl,
        weeklyPnl: state.weeklyPnl,
        winRate: latestSnapshot?.winRate || 0,
        profitFactor: latestSnapshot?.profitFactor || 0,
        sharpeRatio,
        maxDrawdown,
        maxDrawdownPct,
      };
    } catch (error) {
      console.error('[Analytics] Error getting performance stats:', error);
      throw error;
    }
  }

  /**
   * Get monthly performance summary
   */
  async getMonthlyPerformance(userId: Types.ObjectId, year: number): Promise<Array<{
    month: number;
    monthName: string;
    startEquity: number;
    endEquity: number;
    pnl: number;
    pnlPct: number;
    trades: number;
    winRate: number;
  }>> {
    try {
      const results = [];

      for (let month = 0; month < 12; month++) {
        const startDate = new Date(year, month, 1);
        const endDate = new Date(year, month + 1, 0, 23, 59, 59);

        const snapshots = await EquitySnapshot.find({
          userId,
          date: { $gte: startDate, $lte: endDate },
        }).sort({ date: 1 });

        if (snapshots.length === 0) continue;

        const startEquity = snapshots[0].equity;
        const endEquity = snapshots[snapshots.length - 1].equity;
        const pnl = endEquity - startEquity;
        const pnlPct = (pnl / startEquity) * 100;

        const lastSnapshot = snapshots[snapshots.length - 1];

        results.push({
          month: month + 1,
          monthName: new Date(year, month).toLocaleString('default', { month: 'long' }),
          startEquity,
          endEquity,
          pnl,
          pnlPct,
          trades: lastSnapshot.closedTrades,
          winRate: lastSnapshot.winRate,
        });
      }

      return results;
    } catch (error) {
      console.error('[Analytics] Error getting monthly performance:', error);
      throw error;
    }
  }
}

export default new AnalyticsService();

