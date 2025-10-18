import Signal, { ISignal } from '../models/Signal';
import mongoose from 'mongoose';

/**
 * Signal Service
 * Handles business logic for trading signals
 */
class SignalService {
  /**
   * Get recent signals for a user with optional limit
   * @param userId - User ID to fetch signals for
   * @param limit - Maximum number of signals to return (default: 10)
   * @returns Array of recent signals sorted by timestamp (descending)
   */
  async getRecentSignals(userId: string | mongoose.Types.ObjectId, limit: number = 10): Promise<ISignal[]> {
    try {
      console.log(`📡 Fetching recent signals for user ${userId}, limit: ${limit}`);

      // Validate limit parameter
      const validLimit = Math.max(1, Math.min(limit, 100)); // Between 1 and 100
      if (validLimit !== limit) {
        console.log(`⚠️  Adjusted limit from ${limit} to ${validLimit}`);
      }

      // Query signals with pagination and sorting
      const signals = await Signal
        .find({ userId })
        .sort({ timestamp: -1 }) // Most recent first
        .limit(validLimit)
        .lean()
        .exec();

      console.log(`✅ Found ${signals.length} signals for user ${userId}`);
      return signals as ISignal[];
    } catch (error) {
      console.error(`❌ Error fetching recent signals for user ${userId}:`, error);
      if (error instanceof Error) {
        console.error('Error stack:', error.stack);
      }
      throw new Error('Failed to fetch recent signals');
    }
  }

  /**
   * Create a new signal
   * @param signalData - Signal data to create
   * @returns Created signal
   */
  async createSignal(signalData: Partial<ISignal>): Promise<ISignal> {
    try {
      console.log(`📡 Creating new signal: ${signalData.symbol} - ${signalData.playbook} - ${signalData.action}`);

      const signal = await Signal.create(signalData);

      console.log(`✅ Signal created successfully: ${signal._id}`);
      return signal;
    } catch (error) {
      console.error('❌ Error creating signal:', error);
      if (error instanceof Error) {
        console.error('Error stack:', error.stack);
      }
      throw new Error('Failed to create signal');
    }
  }

  /**
   * Get signals by filters
   * @param userId - User ID
   * @param filters - Filter options (symbol, playbook, action, startDate, endDate)
   * @returns Array of signals matching filters
   */
  async getSignalsByFilters(
    userId: string | mongoose.Types.ObjectId,
    filters: {
      symbol?: string;
      playbook?: 'A' | 'B' | 'C' | 'D';
      action?: 'EXECUTED' | 'SKIPPED';
      startDate?: Date;
      endDate?: Date;
    }
  ): Promise<ISignal[]> {
    try {
      console.log(`📡 Fetching signals with filters for user ${userId}:`, filters);

      // Build query
      const query: Record<string, unknown> = { userId };

      if (filters.symbol) {
        query.symbol = filters.symbol;
      }

      if (filters.playbook) {
        query.playbook = filters.playbook;
      }

      if (filters.action) {
        query.action = filters.action;
      }

      if (filters.startDate || filters.endDate) {
        query.timestamp = {};
        if (filters.startDate) {
          (query.timestamp as Record<string, Date>).$gte = filters.startDate;
        }
        if (filters.endDate) {
          (query.timestamp as Record<string, Date>).$lte = filters.endDate;
        }
      }

      const signals = await Signal
        .find(query)
        .sort({ timestamp: -1 })
        .lean()
        .exec();

      console.log(`✅ Found ${signals.length} signals matching filters`);
      return signals as ISignal[];
    } catch (error) {
      console.error('❌ Error fetching signals by filters:', error);
      if (error instanceof Error) {
        console.error('Error stack:', error.stack);
      }
      throw new Error('Failed to fetch signals by filters');
    }
  }

  /**
   * Get signal statistics for a user
   * @param userId - User ID
   * @returns Signal statistics
   */
  async getSignalStats(userId: string | mongoose.Types.ObjectId): Promise<{
    total: number;
    executed: number;
    skipped: number;
    byPlaybook: Record<string, number>;
  }> {
    try {
      console.log(`📊 Calculating signal statistics for user ${userId}`);

      const [total, executed, skipped, byPlaybook] = await Promise.all([
        Signal.countDocuments({ userId }),
        Signal.countDocuments({ userId, action: 'EXECUTED' }),
        Signal.countDocuments({ userId, action: 'SKIPPED' }),
        Signal.aggregate([
          { $match: { userId: new mongoose.Types.ObjectId(userId.toString()) } },
          { $group: { _id: '$playbook', count: { $sum: 1 } } },
        ]),
      ]);

      const playbookStats = byPlaybook.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {} as Record<string, number>);

      const stats = {
        total,
        executed,
        skipped,
        byPlaybook: playbookStats,
      };

      console.log(`✅ Signal statistics calculated:`, stats);
      return stats;
    } catch (error) {
      console.error('❌ Error calculating signal statistics:', error);
      if (error instanceof Error) {
        console.error('Error stack:', error.stack);
      }
      throw new Error('Failed to calculate signal statistics');
    }
  }
}

export default new SignalService();
