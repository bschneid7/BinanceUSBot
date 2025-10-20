import { Types } from 'mongoose';
import BotConfig from '../../models/BotConfig';
import BotState from '../../models/BotState';
import Position from '../../models/Position';
import { RESERVES } from './constants';

export class ReserveManager {
  /**
   * Check if sufficient capital is available for a trade
   */
  async checkAvailableCapital(
    userId: Types.ObjectId,
    requiredCapital: number
  ): Promise<{ available: boolean; reason?: string }> {
    try {
      const state = await BotState.findOne({ userId });
      const config = await BotConfig.findOne({ userId });

      if (!state || !config) {
        return { available: false, reason: 'State or config not found' };
      }

      // Calculate current exposure
      const openPositions = await Position.find({ userId, status: 'OPEN' });
      let currentExposure = 0;

      for (const position of openPositions) {
        const price = position.current_price || position.entry_price;
        if (!price || price <= 0 || !position.quantity || position.quantity <= 0) {
          console.warn(`[ReserveManager] Invalid position data for ${position.symbol}`);
          continue;
        }
        const notional = price * position.quantity;
        if (isNaN(notional) || notional < 0) {
          console.warn(`[ReserveManager] Invalid notional for ${position.symbol}: ${notional}`);
          continue;
        }
        currentExposure += notional;
      }

      // Validate equity
      if (!state.equity || state.equity <= 0) {
        return { available: false, reason: 'Invalid equity value' };
      }

      // Available capital = equity - exposure
      const availableCapital = state.equity - currentExposure;

      // Check reserve floor
      const reserveFloorPct = config.reserve?.floor_pct ?? (RESERVES.MIN_RESERVE_PCT / 100);
      const reserveFloor = state.equity * reserveFloorPct;
      const capitalAfterTrade = availableCapital - requiredCapital;

      if (capitalAfterTrade < reserveFloor) {
        return {
          available: false,
          reason: `Insufficient capital: would breach ${(config.reserve.floor_pct * 100).toFixed(0)}% reserve floor`,
        };
      }

      console.log(`[ReserveManager] Capital check: Required $${requiredCapital.toFixed(2)}, Available $${availableCapital.toFixed(2)}, After trade: $${capitalAfterTrade.toFixed(2)}, Floor: $${reserveFloor.toFixed(2)}`);

      return { available: true };
    } catch (error) {
      console.error('[ReserveManager] Error checking available capital:', error);
      return { available: false, reason: 'Error checking capital' };
    }
  }

  /**
   * Calculate current reserve level
   */
  async getReserveLevel(userId: Types.ObjectId): Promise<number> {
    try {
      const state = await BotState.findOne({ userId });
      if (!state) return 0;

      const openPositions = await Position.find({ userId, status: 'OPEN' });
      let currentExposure = 0;

      for (const position of openPositions) {
        const price = position.current_price || position.entry_price;
        if (!price || price <= 0 || !position.quantity || position.quantity <= 0) {
          continue;
        }
        const notional = price * position.quantity;
        if (!isNaN(notional) && notional >= 0) {
          currentExposure += notional;
        }
      }

      if (!state.equity || state.equity <= 0) {
        return 0;
      }

      const reserve = state.equity - currentExposure;
      const reservePct = (reserve / state.equity) * 100;

      return reservePct;
    } catch (error) {
      console.error('[ReserveManager] Error calculating reserve level:', error);
      return 0;
    }
  }

  /**
   * Process profit refill to reserve
   */
  async refillReserve(userId: Types.ObjectId, profit: number): Promise<void> {
    try {
      const config = await BotConfig.findOne({ userId });
      if (!config) return;

      const currentReserve = await this.getReserveLevel(userId);
      const targetReserve = config.reserve.target_pct * 100;

      if (currentReserve < targetReserve && profit > 0) {
        const refillAmount = profit * config.reserve.refill_from_profits_pct;
        console.log(`[ReserveManager] Refilling reserve with $${refillAmount.toFixed(2)} (${(config.reserve.refill_from_profits_pct * 100).toFixed(0)}% of profit)`);
        // In a real implementation, this would adjust capital allocation
      }
    } catch (error) {
      console.error('[ReserveManager] Error refilling reserve:', error);
    }
  }
}

export default new ReserveManager();
