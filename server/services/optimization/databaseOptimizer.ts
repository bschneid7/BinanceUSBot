import Position from '../../models/Position';
import Trade from '../../models/Trade';
import Signal from '../../models/Signal';
import Order from '../../models/Order';

/**
 * Database Optimizer
 * Creates indexes and provides optimized query methods
 */
export class DatabaseOptimizer {
  /**
   * Create all necessary indexes for optimal query performance
   */
  async createIndexes(): Promise<void> {
    console.log('[DatabaseOptimizer] Creating database indexes...');

    try {
      // Position indexes
      await Position.collection.createIndex({ userId: 1, status: 1 });
      await Position.collection.createIndex({ symbol: 1, status: 1 });
      await Position.collection.createIndex({ status: 1, updatedAt: -1 });
      await Position.collection.createIndex({ userId: 1, symbol: 1, status: 1 });
      console.log('[DatabaseOptimizer] ✅ Position indexes created');

      // Trade indexes
      await Trade.collection.createIndex({ userId: 1, createdAt: -1 });
      await Trade.collection.createIndex({ symbol: 1, createdAt: -1 });
      await Trade.collection.createIndex({ playbook: 1, outcome: 1 });
      await Trade.collection.createIndex({ userId: 1, playbook: 1, createdAt: -1 });
      console.log('[DatabaseOptimizer] ✅ Trade indexes created');

      // Signal indexes
      await Signal.collection.createIndex({ createdAt: -1 });
      await Signal.collection.createIndex({ symbol: 1, playbook: 1 });
      await Signal.collection.createIndex({ symbol: 1, createdAt: -1 });
      await Signal.collection.createIndex({ status: 1, createdAt: -1 });
      console.log('[DatabaseOptimizer] ✅ Signal indexes created');

      // Order indexes
      await Order.collection.createIndex({ userId: 1, status: 1 });
      await Order.collection.createIndex({ symbol: 1, status: 1 });
      await Order.collection.createIndex({ orderId: 1 }, { unique: true, sparse: true });
      await Order.collection.createIndex({ createdAt: -1 });
      console.log('[DatabaseOptimizer] ✅ Order indexes created');

      console.log('[DatabaseOptimizer] All indexes created successfully');

    } catch (error) {
      console.error('[DatabaseOptimizer] Error creating indexes:', error);
      throw error;
    }
  }

  /**
   * Get open positions with optimized query
   */
  async getOpenPositions(userId?: string): Promise<any[]> {
    const query: any = { status: 'OPEN' };
    if (userId) {
      query.userId = userId;
    }

    return Position.find(query)
      .select('symbol quantity entry_price stop_price target_price side playbook notional_value unrealized_pnl')
      .lean()
      .exec();
  }

  /**
   * Get positions by symbols (batched)
   */
  async getPositionsBySymbols(symbols: string[], status?: string): Promise<any[]> {
    const query: any = { symbol: { $in: symbols } };
    if (status) {
      query.status = status;
    }

    return Position.find(query)
      .select('symbol quantity entry_price status side')
      .lean()
      .exec();
  }

  /**
   * Get recent trades for performance analysis
   */
  async getRecentTrades(playbook?: string, limit: number = 100): Promise<any[]> {
    const query: any = {};
    if (playbook) {
      query.playbook = playbook;
    }

    return Trade.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .select('symbol playbook outcome entry_price exit_price pnl pnl_percent')
      .lean()
      .exec();
  }

  /**
   * Get playbook statistics (win rate, avg P&L, etc.)
   */
  async getPlaybookStats(playbook: string, days: number = 30): Promise<{
    totalTrades: number;
    wins: number;
    losses: number;
    winRate: number;
    avgWin: number;
    avgLoss: number;
    avgPnL: number;
    sharpeRatio: number;
  }> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const trades = await Trade.find({
      playbook,
      createdAt: { $gte: since },
      outcome: { $in: ['WIN', 'LOSS'] },
    })
      .select('outcome pnl pnl_percent')
      .lean()
      .exec();

    const wins = trades.filter(t => t.outcome === 'WIN');
    const losses = trades.filter(t => t.outcome === 'LOSS');

    const avgWin = wins.length > 0
      ? wins.reduce((sum, t) => sum + (t.pnl_percent || 0), 0) / wins.length
      : 0;

    const avgLoss = losses.length > 0
      ? losses.reduce((sum, t) => sum + (t.pnl_percent || 0), 0) / losses.length
      : 0;

    const avgPnL = trades.length > 0
      ? trades.reduce((sum, t) => sum + (t.pnl_percent || 0), 0) / trades.length
      : 0;

    const stdDev = trades.length > 1
      ? Math.sqrt(trades.reduce((sum, t) => sum + Math.pow((t.pnl_percent || 0) - avgPnL, 2), 0) / trades.length)
      : 0;

    const sharpeRatio = stdDev > 0 ? (avgPnL / stdDev) * Math.sqrt(252) : 0;

    return {
      totalTrades: trades.length,
      wins: wins.length,
      losses: losses.length,
      winRate: trades.length > 0 ? wins.length / trades.length : 0,
      avgWin,
      avgLoss,
      avgPnL,
      sharpeRatio,
    };
  }

  /**
   * Batch update positions
   */
  async batchUpdatePositions(updates: Array<{ _id: string; update: any }>): Promise<void> {
    const bulkOps = updates.map(({ _id, update }) => ({
      updateOne: {
        filter: { _id },
        update: { $set: update },
      },
    }));

    if (bulkOps.length > 0) {
      await Position.bulkWrite(bulkOps);
    }
  }

  /**
   * Get database statistics
   */
  async getStats(): Promise<{
    positions: { total: number; open: number; closed: number };
    trades: { total: number; recent: number };
    signals: { total: number; recent: number };
    orders: { total: number; pending: number };
  }> {
    const [
      totalPositions,
      openPositions,
      closedPositions,
      totalTrades,
      recentTrades,
      totalSignals,
      recentSignals,
      totalOrders,
      pendingOrders,
    ] = await Promise.all([
      Position.countDocuments(),
      Position.countDocuments({ status: 'OPEN' }),
      Position.countDocuments({ status: 'CLOSED' }),
      Trade.countDocuments(),
      Trade.countDocuments({ createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }),
      Signal.countDocuments(),
      Signal.countDocuments({ createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }),
      Order.countDocuments(),
      Order.countDocuments({ status: { $in: ['NEW', 'PARTIALLY_FILLED'] } }),
    ]);

    return {
      positions: {
        total: totalPositions,
        open: openPositions,
        closed: closedPositions,
      },
      trades: {
        total: totalTrades,
        recent: recentTrades,
      },
      signals: {
        total: totalSignals,
        recent: recentSignals,
      },
      orders: {
        total: totalOrders,
        pending: pendingOrders,
      },
    };
  }
}

// Singleton instance
export const databaseOptimizer = new DatabaseOptimizer();
