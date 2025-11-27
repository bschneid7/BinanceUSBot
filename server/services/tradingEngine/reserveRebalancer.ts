import { Types } from 'mongoose';
import logger from '../../utils/logger';
import binanceService from '../binanceService';
import BotConfig from '../../models/BotConfig';
import Position from '../../models/Position';
import positionManager from './positionManager';

/**
 * Reserve Rebalancing Service
 * Automatically maintains target cash reserves by selling crypto positions
 * Ensures bot always has capital available for new trades
 */
export class ReserveRebalancer {
  private isRebalancing: boolean = false;
  private lastRebalance: number = 0;
  private readonly MIN_REBALANCE_INTERVAL_MS = 300000; // 5 minutes minimum between rebalances

  /**
   * Check if reserves need rebalancing and execute if needed
   */
  async checkAndRebalance(userId: Types.ObjectId): Promise<boolean> {
    try {
      // Prevent concurrent rebalancing
      if (this.isRebalancing) {
        logger.info('[ReserveRebalancer] Rebalancing already in progress, skipping');
        return false;
      }

      // Prevent too-frequent rebalancing
      const now = Date.now();
      if (now - this.lastRebalance < this.MIN_REBALANCE_INTERVAL_MS) {
        return false;
      }

      const config = await BotConfig.findOne({ userId });
      if (!config) {
        logger.error('[ReserveRebalancer] Bot configuration not found');
        return false;
      }

      const targetReservePct = config.reserve.target_pct; // e.g., 0.30 (30%)
      const floorReservePct = config.reserve.floor_pct; // e.g., 0.20 (20%)

      // 1. Calculate current reserves
      const usdBalance = await binanceService.getBalance('USD');
      const usdtBalance = await binanceService.getBalance('USDT');
      const busdBalance = await binanceService.getBalance('BUSD');
      const totalCash = usdBalance + usdtBalance + busdBalance;

      // 2. Calculate total equity
      const totalEquity = await this.calculateTotalEquity();

      // 3. Calculate reserve percentage
      const currentReservePct = totalEquity > 0 ? totalCash / totalEquity : 0;

      logger.info('[ReserveRebalancer] Reserve status:', {
        totalCash: totalCash.toFixed(2),
        totalEquity: totalEquity.toFixed(2),
        currentReservePct: (currentReservePct * 100).toFixed(2) + '%',
        floorReservePct: (floorReservePct * 100).toFixed(2) + '%',
        targetReservePct: (targetReservePct * 100).toFixed(2) + '%',
      });

      // 4. Check if rebalancing needed
      if (currentReservePct >= floorReservePct) {
        logger.info('[ReserveRebalancer] ✅ Reserves above floor, no rebalancing needed');
        return false;
      }

      // 5. Execute rebalancing
      logger.warn(`[ReserveRebalancer] 🚨 Reserves below floor (${(currentReservePct * 100).toFixed(2)}% < ${(floorReservePct * 100).toFixed(2)}%), rebalancing...`);
      
      this.isRebalancing = true;
      this.lastRebalance = now;

      try {
        await this.rebalanceReserves(userId, totalEquity, totalCash, targetReservePct);
        return true;
      } finally {
        this.isRebalancing = false;
      }
    } catch (error) {
      logger.error('[ReserveRebalancer] Error checking reserves:', error);
      this.isRebalancing = false;
      return false;
    }
  }

  /**
   * Execute reserve rebalancing by selling positions
   */
  private async rebalanceReserves(
    userId: Types.ObjectId,
    totalEquity: number,
    currentCash: number,
    targetReservePct: number
  ): Promise<void> {
    try {
      // Calculate how much cash we need to raise
      const targetCash = totalEquity * targetReservePct;
      const amountToRaise = targetCash - currentCash;

      logger.info('[ReserveRebalancer] Rebalancing plan:', {
        targetCash: targetCash.toFixed(2),
        currentCash: currentCash.toFixed(2),
        amountToRaise: amountToRaise.toFixed(2),
      });

      if (amountToRaise <= 0) {
        logger.info('[ReserveRebalancer] No rebalancing needed');
        return;
      }

      // Get all open positions
      const positions = await Position.find({ 
        userId, 
        status: 'OPEN' 
      });

      if (positions.length === 0) {
        logger.warn('[ReserveRebalancer] ⚠️ No open positions to close for rebalancing');
        return;
      }

      // Sort positions by performance (close worst performers first)
      const sortedPositions = positions.sort((a, b) => {
        const aPnlPct = a.notionalValue > 0 ? a.unrealizedPnL / a.notionalValue : 0;
        const bPnlPct = b.notionalValue > 0 ? b.unrealizedPnL / b.notionalValue : 0;
        return aPnlPct - bPnlPct; // Ascending: worst performers first
      });

      logger.info('[ReserveRebalancer] Positions sorted by P&L:', 
        sortedPositions.map(p => ({
          symbol: p.symbol,
          notional: p.notionalValue.toFixed(2),
          pnl: p.unrealizedPnL.toFixed(2),
          pnlPct: ((p.unrealizedPnL / p.notionalValue) * 100).toFixed(2) + '%',
        }))
      );

      // Close positions until we've raised enough cash
      let raised = 0;
      let closedCount = 0;

      for (const position of sortedPositions) {
        if (raised >= amountToRaise) {
          break;
        }

        try {
          logger.info(`[ReserveRebalancer] Closing position ${position.symbol} (notional: $${position.notionalValue.toFixed(2)}, P&L: $${position.unrealizedPnL.toFixed(2)})`);
          
          // Close the position
          await positionManager.closePosition(position._id, 'REBALANCE');
          
          raised += position.notionalValue;
          closedCount++;

          logger.info(`[ReserveRebalancer] ✅ Closed ${position.symbol}, raised $${raised.toFixed(2)} / $${amountToRaise.toFixed(2)}`);
        } catch (error) {
          logger.error(`[ReserveRebalancer] ❌ Failed to close position ${position.symbol}:`, error);
          // Continue with next position
        }
      }

      logger.info(`[ReserveRebalancer] ✅ Rebalancing complete: Closed ${closedCount} positions, raised $${raised.toFixed(2)}`);
    } catch (error) {
      logger.error('[ReserveRebalancer] Error during rebalancing:', error);
      throw error;
    }
  }

  /**
   * Calculate total account equity
   */
  private async calculateTotalEquity(): Promise<number> {
    try {
      const accountInfo = await binanceService.getAccountInfo();
      const balances = accountInfo.balances;
      let totalEquity = 0;

      for (const balance of balances) {
        const amount = parseFloat(balance.free) + parseFloat(balance.locked);
        if (amount <= 0) continue;

        if (['USD', 'USDT', 'BUSD', 'USDC', 'DAI'].includes(balance.asset)) {
          // Stablecoins count as 1:1
          totalEquity += amount;
        } else {
          // Get market value of crypto assets
          try {
            const price = await binanceService.getAssetPrice(balance.asset);
            totalEquity += amount * price;
          } catch (error) {
            logger.warn(`[ReserveRebalancer] Could not price ${balance.asset}, skipping`);
          }
        }
      }

      return totalEquity;
    } catch (error) {
      logger.error('[ReserveRebalancer] Error calculating total equity:', error);
      return 0;
    }
  }

  /**
   * Get current reserve status without rebalancing
   */
  async getReserveStatus(userId: Types.ObjectId): Promise<{
    totalCash: number;
    totalEquity: number;
    reservePct: number;
    targetPct: number;
    floorPct: number;
    needsRebalancing: boolean;
  }> {
    try {
      const config = await BotConfig.findOne({ userId });
      if (!config) {
        throw new Error('Bot configuration not found');
      }

      const usdBalance = await binanceService.getBalance('USD');
      const usdtBalance = await binanceService.getBalance('USDT');
      const busdBalance = await binanceService.getBalance('BUSD');
      const totalCash = usdBalance + usdtBalance + busdBalance;
      const totalEquity = await this.calculateTotalEquity();
      const reservePct = totalEquity > 0 ? totalCash / totalEquity : 0;

      return {
        totalCash,
        totalEquity,
        reservePct,
        targetPct: config.reserve.target_pct,
        floorPct: config.reserve.floor_pct,
        needsRebalancing: reservePct < config.reserve.floor_pct,
      };
    } catch (error) {
      logger.error('[ReserveRebalancer] Error getting reserve status:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const reserveRebalancer = new ReserveRebalancer();
export default reserveRebalancer;
