import BotState from '../models/BotState';
import BotConfig from '../models/BotConfig';
import Position from '../models/Position';
import Trade from '../models/Trade';
import { Types } from 'mongoose';

interface LossLimitStatus {
  dailyLossLimit: number;
  weeklyLossLimit: number;
  currentDailyLoss: number;
  currentWeeklyLoss: number;
  dailyLimitReached: boolean;
  weeklyLimitReached: boolean;
  tradingAllowed: boolean;
}

class LossLimitService {
  /**
   * Check if daily or weekly loss limits have been reached
   */
  async checkLossLimits(userId: Types.ObjectId): Promise<LossLimitStatus> {
    const config = await BotConfig.findOne({ userId });
    if (!config) {
      throw new Error('Bot config not found');
    }

    // Get loss limits from config (default to reasonable values)
    const dailyLossLimit = config.risk?.daily_loss_limit_usd || 500;
    const weeklyLossLimit = config.risk?.weekly_loss_limit_usd || 1000;

    // Calculate current daily loss
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    
    const dailyTrades = await Trade.find({
      userId,
      closed_at: { $gte: startOfDay },
    });

    const currentDailyLoss = dailyTrades.reduce((sum, trade) => {
      const pnl = trade.realized_pnl || 0;
      return pnl < 0 ? sum + Math.abs(pnl) : sum;
    }, 0);

    // Calculate current weekly loss
    const startOfWeek = new Date();
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    const weeklyTrades = await Trade.find({
      userId,
      closed_at: { $gte: startOfWeek },
    });

    const currentWeeklyLoss = weeklyTrades.reduce((sum, trade) => {
      const pnl = trade.realized_pnl || 0;
      return pnl < 0 ? sum + Math.abs(pnl) : sum;
    }, 0);

    // Check if limits reached
    const dailyLimitReached = currentDailyLoss >= dailyLossLimit;
    const weeklyLimitReached = currentWeeklyLoss >= weeklyLossLimit;
    const tradingAllowed = !dailyLimitReached && !weeklyLimitReached;

    return {
      dailyLossLimit,
      weeklyLossLimit,
      currentDailyLoss,
      currentWeeklyLoss,
      dailyLimitReached,
      weeklyLimitReached,
      tradingAllowed,
    };
  }

  /**
   * Enforce loss limits - stop trading if limits reached
   */
  async enforceLossLimits(userId: Types.ObjectId): Promise<boolean> {
    const status = await this.checkLossLimits(userId);

    if (!status.tradingAllowed) {
      console.error('[LossLimit] Loss limit reached!', {
        dailyLoss: status.currentDailyLoss,
        dailyLimit: status.dailyLossLimit,
        weeklyLoss: status.currentWeeklyLoss,
        weeklyLimit: status.weeklyLossLimit,
      });

      // Stop trading
      await BotState.updateOne(
        { userId },
        {
          isRunning: false,
          stoppedReason: status.dailyLimitReached
            ? `Daily loss limit reached: $${status.currentDailyLoss.toFixed(2)} / $${status.dailyLossLimit}`
            : `Weekly loss limit reached: $${status.currentWeeklyLoss.toFixed(2)} / $${status.weeklyLimitLimit}`,
          stoppedAt: new Date(),
        }
      );

      // Close all open positions
      await this.closeAllPositions(userId, 'Loss limit reached');

      return false; // Trading not allowed
    }

    return true; // Trading allowed
  }

  /**
   * Close all open positions
   */
  private async closeAllPositions(userId: Types.ObjectId, reason: string): Promise<void> {
    const openPositions = await Position.find({
      userId,
      status: 'OPEN',
    });

    console.log(`[LossLimit] Closing ${openPositions.length} open positions due to: ${reason}`);

    for (const position of openPositions) {
      try {
        // Mark position for closure
        await Position.updateOne(
          { _id: position._id },
          {
            status: 'CLOSING',
            close_reason: reason,
          }
        );

        // The position manager will handle actual order placement
        console.log(`[LossLimit] Marked position ${position.symbol} for closure`);
      } catch (error) {
        console.error(`[LossLimit] Error closing position ${position.symbol}:`, error);
      }
    }
  }

  /**
   * Get loss limit status for API/dashboard
   */
  async getLossLimitStatus(userId: Types.ObjectId): Promise<LossLimitStatus> {
    return this.checkLossLimits(userId);
  }

  /**
   * Reset daily loss tracking (called at start of new day)
   */
  async resetDailyTracking(userId: Types.ObjectId): Promise<void> {
    const state = await BotState.findOne({ userId });
    if (!state) return;

    // If bot was stopped due to daily loss limit, allow restart
    if (state.stoppedReason?.includes('Daily loss limit')) {
      console.log('[LossLimit] New day started, resetting daily loss tracking');
      await BotState.updateOne(
        { userId },
        {
          $unset: { stoppedReason: '', stoppedAt: '' },
        }
      );
    }
  }

  /**
   * Reset weekly loss tracking (called at start of new week)
   */
  async resetWeeklyTracking(userId: Types.ObjectId): Promise<void> {
    const state = await BotState.findOne({ userId });
    if (!state) return;

    // If bot was stopped due to weekly loss limit, allow restart
    if (state.stoppedReason?.includes('Weekly loss limit')) {
      console.log('[LossLimit] New week started, resetting weekly loss tracking');
      await BotState.updateOne(
        { userId },
        {
          $unset: { stoppedReason: '', stoppedAt: '' },
        }
      );
    }
  }
}

export default new LossLimitService();

