import { Types } from 'mongoose';
import BotState from '../models/BotState';
import EquitySnapshot from '../models/EquitySnapshot';
import Position from '../models/Position';
import Trade from '../models/Trade';
import snapshotService from './snapshotService';

/**
 * Analytics Service
 * Provides time-range aware performance analytics
 */

export class AnalyticsService {
  private readonly INITIAL_DEPOSIT = 15000;

  /**
   * Get performance statistics for a date range
   * @param userId - User ID
   * @param startDate - Start date (defaults to inception)
   * @param endDate - End date (defaults to now)
   */
  async getPerformanceStats(
    userId: Types.ObjectId,
    startDate?: Date,
    endDate?: Date
  ): Promise<{
    startingEquity: number;
    currentEquity: number;
    totalPnl: number;
    totalPnlPct: number;
    realizedPnl: number;
    unrealizedPnl: number;
    dailyPnl: number;
    weeklyPnl: number;
    winRate: number;
    profitFactor: number;
    sharpeRatio: number;
    maxDrawdown: number;
    maxDrawdownPct: number;
  }> {
    try {
      // Default date range
      if (!startDate) {
        startDate = new Date('2025-01-01'); // Bot inception
      }
      if (!endDate) {
        endDate = new Date(); // Now
      }

      console.log(`[Analytics] Getting performance for ${startDate.toISOString()} to ${endDate.toISOString()}`);

      // Get starting equity for the period
      const startingEquity = await snapshotService.getEquityAtDate(userId, startDate);
      console.log(`[Analytics] Starting equity: $${startingEquity.toFixed(2)}`);

      // Get realized P&L for the period (closed trades)
      const trades = await Trade.find({
        userId,
        date: { $gte: startDate, $lte: endDate }
      });
      const realizedPnl = trades.reduce((sum, trade) => sum + (trade.pnl_usd || 0), 0);
      console.log(`[Analytics] Realized P&L: $${realizedPnl.toFixed(2)} from ${trades.length} trades`);

      // Determine current equity
      let currentEquity: number;
      let unrealizedPnl = 0;
      
      const isToday = this.isToday(endDate);
      if (isToday) {
        // For current date, calculate real-time equity
        const openPositions = await Position.find({ userId, status: 'OPEN' });
        unrealizedPnl = openPositions.reduce((sum, pos) => sum + (pos.unrealized_pnl || 0), 0);
        currentEquity = startingEquity + realizedPnl + unrealizedPnl;
        console.log(`[Analytics] Current equity (real-time): $${currentEquity.toFixed(2)}`);
      } else {
        // For historical date, use snapshot
        currentEquity = await snapshotService.getEquityAtDate(userId, endDate);
        console.log(`[Analytics] Current equity (snapshot): $${currentEquity.toFixed(2)}`);
      }

      // Calculate total P&L
      const totalPnl = currentEquity - startingEquity;
      const totalPnlPct = startingEquity > 0 ? (totalPnl / startingEquity) * 100 : 0;

      // Get daily and weekly P&L from BotState (for current period only)
      const state = await BotState.findOne({ userId });
      const dailyPnl = state?.dailyPnl || 0;
      const weeklyPnl = state?.weeklyPnl || 0;

      // Get latest snapshot for win rate and profit factor
      const latestSnapshot = await EquitySnapshot.findOne({ userId }).sort({ date: -1 });

      // Calculate Sharpe ratio from snapshots in the period
      const snapshots = await snapshotService.getSnapshotsInRange(userId, startDate, endDate);
      const { sharpeRatio, maxDrawdown, maxDrawdownPct } = this.calculateRiskMetrics(snapshots, startingEquity);

      return {
        startingEquity,
        currentEquity,
        totalPnl,
        totalPnlPct,
        realizedPnl,
        unrealizedPnl,
        dailyPnl,
        weeklyPnl,
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
   * Calculate risk metrics from snapshots
   */
  private calculateRiskMetrics(snapshots: any[], startingEquity: number) {
    if (snapshots.length < 2) {
      return { sharpeRatio: 0, maxDrawdown: 0, maxDrawdownPct: 0 };
    }

    // Calculate daily returns
    const dailyReturns = [];
    for (let i = 1; i < snapshots.length; i++) {
      const returnPct = ((snapshots[i].equity - snapshots[i - 1].equity) / snapshots[i - 1].equity) * 100;
      dailyReturns.push(returnPct);
    }

    // Sharpe ratio
    const avgReturn = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
    const stdDev = Math.sqrt(
      dailyReturns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / (dailyReturns.length - 1)
    );
    const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0; // Annualized

    // Max drawdown
    let maxEquity = startingEquity;
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

    return { sharpeRatio, maxDrawdown, maxDrawdownPct };
  }

  /**
   * Check if a date is today
   */
  private isToday(date: Date): boolean {
    const today = new Date();
    return date.getDate() === today.getDate() &&
           date.getMonth() === today.getMonth() &&
           date.getFullYear() === today.getFullYear();
  }

  /**
   * Get equity curve data for charting
   */
  async getEquityCurve(userId: Types.ObjectId, days: number = 30): Promise<Array<{ date: string; equity: number }>> {
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const snapshots = await snapshotService.getSnapshotsInRange(userId, startDate, endDate);

      return snapshots.map(snapshot => ({
        date: snapshot.date.toISOString(),
        equity: snapshot.equity,
      }));
    } catch (error) {
      console.error('[Analytics] Error getting equity curve:', error);
      throw error;
    }
  }

  /**
   * Create daily equity snapshot
   * Should be run at end of each trading day
   */
  async createDailySnapshot(userId: Types.ObjectId): Promise<void> {
    try {
      await snapshotService.createSnapshot(userId);
    } catch (error) {
      console.error('[Analytics] Error creating daily snapshot:', error);
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
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

      for (let month = 0; month < 12; month++) {
        const startDate = new Date(year, month, 1);
        const endDate = new Date(year, month + 1, 0, 23, 59, 59);

        const snapshots = await snapshotService.getSnapshotsInRange(userId, startDate, endDate);
        if (snapshots.length === 0) continue;

        const startEquity = snapshots[0].equity;
        const endEquity = snapshots[snapshots.length - 1].equity;
        const pnl = endEquity - startEquity;
        const pnlPct = (pnl / startEquity) * 100;

        const trades = await Trade.find({
          userId,
          date: { $gte: startDate, $lte: endDate },
        });

        const wins = trades.filter(t => t.pnl_usd > 0);
        const winRate = trades.length > 0 ? wins.length / trades.length : 0;

        results.push({
          month,
          monthName: monthNames[month],
          startEquity,
          endEquity,
          pnl,
          pnlPct,
          trades: trades.length,
          winRate,
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

