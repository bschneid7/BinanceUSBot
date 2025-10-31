import { Types } from 'mongoose';
import Trade from '../models/Trade';
import Position from '../models/Position';
import BotState from '../models/BotState';
import EquitySnapshot from '../models/EquitySnapshot';
import snapshotService from './snapshotService';
import depositService from './depositService';

class AnalyticsService {
  /**
   * Get performance statistics for a date range
   */
  async getPerformanceStats(
    userId: Types.ObjectId,
    startDate?: Date,
    endDate?: Date
  ): Promise<{
    startingCapital: number;
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

      // Get starting capital (all deposits up to and including start date)
      // For all-time P&L, this is total deposits
      const startingCapital = await depositService.getNetDeposits(userId);
      console.log(`[Analytics] Starting capital (net deposits): $${startingCapital.toFixed(2)}`);

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
        
        // Get all-time realized P&L
        const allTrades = await Trade.find({ userId });
        const allTimeRealizedPnl = allTrades.reduce((sum, trade) => sum + (trade.pnl_usd || 0), 0);
        
        // Get current net deposits
        const currentNetDeposits = await depositService.getNetDeposits(userId);
        
        currentEquity = currentNetDeposits + allTimeRealizedPnl + unrealizedPnl;
        console.log(`[Analytics] Current equity (real-time): $${currentEquity.toFixed(2)}`);
      } else {
        // For historical date, use snapshot
        currentEquity = await snapshotService.getEquityAtDate(userId, endDate);
        console.log(`[Analytics] Current equity (snapshot): $${currentEquity.toFixed(2)}`);
      }

      // Calculate total P&L (only trading gains/losses, not deposits)
      const totalPnl = currentEquity - startingCapital;
      const totalPnlPct = startingCapital > 0 ? (totalPnl / startingCapital) * 100 : 0;

      console.log(`[Analytics] Total P&L: $${totalPnl.toFixed(2)} (${totalPnlPct.toFixed(2)}%)`);

      // Get daily and weekly P&L from BotState (for current period only)
      const state = await BotState.findOne({ userId });
      const dailyPnl = state?.dailyPnl || 0;
      const weeklyPnl = state?.weeklyPnl || 0;

      // Get latest snapshot for win rate and profit factor
      const latestSnapshot = await EquitySnapshot.findOne({ userId }).sort({ date: -1 });

      // Calculate Sharpe ratio from snapshots in the period
      const snapshots = await snapshotService.getSnapshotsInRange(userId, startDate, endDate);
      const { sharpeRatio, maxDrawdown, maxDrawdownPct } = this.calculateRiskMetrics(snapshots, startingCapital);

      return {
        startingCapital,
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

  private isToday(date: Date): boolean {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  }

  private calculateRiskMetrics(
    snapshots: any[],
    startingCapital: number
  ): { sharpeRatio: number; maxDrawdown: number; maxDrawdownPct: number } {
    if (snapshots.length < 2) {
      return { sharpeRatio: 0, maxDrawdown: 0, maxDrawdownPct: 0 };
    }

    // Calculate daily returns
    const returns: number[] = [];
    for (let i = 1; i < snapshots.length; i++) {
      const prevEquity = snapshots[i - 1].equity;
      const currEquity = snapshots[i].equity;
      const dailyReturn = (currEquity - prevEquity) / prevEquity;
      returns.push(dailyReturn);
    }

    // Calculate Sharpe ratio (assuming risk-free rate = 0)
    const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);
    const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0; // Annualized

    // Calculate max drawdown
    let peak = snapshots[0].equity;
    let maxDrawdown = 0;
    let maxDrawdownPct = 0;

    for (const snapshot of snapshots) {
      if (snapshot.equity > peak) {
        peak = snapshot.equity;
      }
      const drawdown = peak - snapshot.equity;
      const drawdownPct = (drawdown / peak) * 100;
      
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
        maxDrawdownPct = drawdownPct;
      }
    }

    return {
      sharpeRatio: Math.round(sharpeRatio * 100) / 100,
      maxDrawdown: Math.round(maxDrawdown * 100) / 100,
      maxDrawdownPct: Math.round(maxDrawdownPct * 100) / 100,
    };
  }

  /**
   * Get equity curve data for charting
   */
  async getEquityCurve(
    userId: Types.ObjectId,
    days: number = 30
  ): Promise<{ timestamp: Date; equity: number }[]> {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      
      const snapshots = await EquitySnapshot.find({
        userId,
        timestamp: { $gte: startDate }
      })
      .sort({ timestamp: 1 })
      .lean();
      
      return snapshots.map(s => ({
        timestamp: s.timestamp,
        equity: s.equity
      }));
    } catch (error) {
      console.error('[Analytics] Error getting equity curve:', error);
      return [];
    }
  }

}

export default new AnalyticsService();

