/**
 * Position Management Service
 * 
 * Manages open positions with:
 * - Trailing stops (move to breakeven at +1R, trail at +2R)
 * - Multiple profit targets (33% at +1R, 50% remaining at +2R, rest at +3R)
 * - Time-based exits (close if >7 days and <+0.5R)
 * - Stop loss management
 * 
 * Enhanced with partial profit-taking at multiple levels:
 * - 1R: Take 33% profit (lock in gains early)
 * - 2R: Take 50% of remaining (50% of original 67% = 33.5%)
 * - 3R: Close remaining position (33.5%)
 */

import Position from '../models/Position';
import binanceService from './binanceService';
import { Types } from 'mongoose';

const logger = console;

interface PositionManagementConfig {
  trailingStopEnabled: boolean;
  trailingStopDistance: number; // Percentage (e.g., 2 = 2%)
  profitTarget1: number; // First profit target in R (e.g., 1 = 1R)
  profitTarget1Percent: number; // Percentage to close at PT1 (e.g., 0.33 = 33%)
  profitTarget2: number; // Second profit target in R (e.g., 2 = 2R)
  profitTarget2Percent: number; // Percentage of remaining to close at PT2 (e.g., 0.5 = 50%)
  profitTarget3: number; // Third profit target in R (e.g., 3 = 3R)
  maxHoldingDays: number; // Maximum days to hold a position
  minProfitForTimeExit: number; // Minimum profit % to avoid time-based exit
}

const DEFAULT_CONFIG: PositionManagementConfig = {
  trailingStopEnabled: true,
  trailingStopDistance: 2, // Trail 2% below peak
  profitTarget1: 1, // Close 33% at +1R
  profitTarget1Percent: 0.33, // Take 33% profit at 1R
  profitTarget2: 2, // Close 50% of remaining at +2R
  profitTarget2Percent: 0.5, // Take 50% of remaining at 2R
  profitTarget3: 3, // Close rest at +3R
  maxHoldingDays: 7,
  minProfitForTimeExit: 0.5, // 0.5% minimum profit
};

class PositionManagementService {
  private config: PositionManagementConfig;

  constructor(config: Partial<PositionManagementConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Main method to manage all open positions
   */
  async managePositions(userId: Types.ObjectId): Promise<void> {
    try {
      logger.info('[PositionMgmt] Starting position management cycle');

      // Get all open positions
      const positions = await Position.find({ userId, status: 'OPEN' });
      logger.info(`[PositionMgmt] Managing ${positions.length} open positions`);

      for (const position of positions) {
        try {
          await this.managePosition(position);
        } catch (error) {
          logger.error(`[PositionMgmt] Error managing position ${position._id}:`, error);
        }
      }

      logger.info('[PositionMgmt] Position management cycle complete');
    } catch (error) {
      logger.error('[PositionMgmt] Error in position management:', error);
    }
  }

  /**
   * Manage a single position
   */
  private async managePosition(position: any): Promise<void> {
    const symbol = position.symbol;
    
    // Get current price
    const ticker = await binanceService.getTickerPrice(symbol);
    if (!ticker) {
      logger.error(`[PositionMgmt] Failed to get price for ${symbol}`);
      return;
    }
    const currentPrice = parseFloat(ticker.price);

    // Calculate position metrics
    const entryPrice = position.entry_price;
    const positionSize = Math.abs(position.position_size_usd);
    const pnlPct = ((currentPrice - entryPrice) / entryPrice) * 100;
    const pnlUsd = (positionSize * pnlPct) / 100;

    // Calculate R (risk units)
    const stopLoss = position.stop_loss || entryPrice * 0.95; // Default 5% stop if not set
    const riskPerUnit = Math.abs(entryPrice - stopLoss);
    const currentR = riskPerUnit > 0 ? (currentPrice - entryPrice) / riskPerUnit : 0;

    logger.info(`[PositionMgmt] ${symbol}: Price $${currentPrice.toFixed(2)}, P&L ${pnlPct.toFixed(2)}% ($${pnlUsd.toFixed(2)}), R: ${currentR.toFixed(2)}`);

    // Check time-based exit
    const daysHeld = (Date.now() - position.entry_time.getTime()) / (1000 * 60 * 60 * 24);
    if (daysHeld > this.config.maxHoldingDays && pnlPct < this.config.minProfitForTimeExit) {
      logger.info(`[PositionMgmt] ${symbol}: Time-based exit (${daysHeld.toFixed(1)} days, ${pnlPct.toFixed(2)}% profit)`);
      await this.closePosition(position, currentPrice, 'TIME_EXIT');
      return;
    }

    // Check stop loss
    if (currentPrice <= stopLoss) {
      logger.info(`[PositionMgmt] ${symbol}: Stop loss hit at $${currentPrice.toFixed(2)} (SL: $${stopLoss.toFixed(2)})`);
      await this.closePosition(position, currentPrice, 'STOP_LOSS');
      return;
    }

    // Check profit targets (in reverse order - highest first)
    if (currentR >= this.config.profitTarget3) {
      logger.info(`[PositionMgmt] ${symbol}: Profit target 3 hit (${currentR.toFixed(2)}R), closing remaining position`);
      await this.closePosition(position, currentPrice, 'PROFIT_TARGET_3');
      return;
    }

    if (currentR >= this.config.profitTarget2 && !position.partial_close_2) {
      logger.info(`[PositionMgmt] ${symbol}: Profit target 2 hit (${currentR.toFixed(2)}R), closing ${(this.config.profitTarget2Percent * 100).toFixed(0)}% of remaining`);
      await this.partialClose(position, currentPrice, this.config.profitTarget2Percent, 'PROFIT_TARGET_2', 2);
      return;
    }

    if (currentR >= this.config.profitTarget1 && !position.partial_close_1) {
      logger.info(`[PositionMgmt] ${symbol}: Profit target 1 hit (${currentR.toFixed(2)}R), closing ${(this.config.profitTarget1Percent * 100).toFixed(0)}%`);
      await this.partialClose(position, currentPrice, this.config.profitTarget1Percent, 'PROFIT_TARGET_1', 1);
      return;
    }

    // Update trailing stop
    if (this.config.trailingStopEnabled && currentR >= 1) {
      const newStopLoss = currentPrice * (1 - this.config.trailingStopDistance / 100);
      
      if (currentR >= 1 && currentR < 2) {
        // Move to breakeven at +1R
        const breakevenStop = entryPrice * 1.001; // Slightly above entry
        if (!position.stop_loss || breakevenStop > position.stop_loss) {
          logger.info(`[PositionMgmt] ${symbol}: Moving stop to breakeven at $${breakevenStop.toFixed(2)}`);
          position.stop_loss = breakevenStop;
          position.trailing_stop_active = true;
          await position.save();
        }
      } else if (currentR >= 2) {
        // Trail stop at +2R
        if (!position.stop_loss || newStopLoss > position.stop_loss) {
          logger.info(`[PositionMgmt] ${symbol}: Trailing stop updated to $${newStopLoss.toFixed(2)} (${this.config.trailingStopDistance}% below peak)`);
          position.stop_loss = newStopLoss;
          position.trailing_stop_active = true;
          await position.save();
        }
      }
    }

    // Update peak price for trailing
    if (!position.peak_price || currentPrice > position.peak_price) {
      position.peak_price = currentPrice;
      await position.save();
    }
  }

  /**
   * Close a position completely
   */
  private async closePosition(position: any, currentPrice: number, reason: string): Promise<void> {
    try {
      const symbol = position.symbol;
      const quantity = Math.abs(position.position_size);

      logger.info(`[PositionMgmt] Closing ${symbol} position: ${quantity} units at $${currentPrice.toFixed(2)} (Reason: ${reason})`);

      // Get symbol precision and adjust quantity
      const precision = await binanceService.getSymbolPrecision(symbol);
      if (!precision) {
        throw new Error(`Failed to get precision info for ${symbol}`);
      }
      const adjustedQuantity = binanceService.adjustQuantity(quantity, precision);
      logger.info(`[PositionMgmt] Adjusted quantity from ${quantity} to ${adjustedQuantity}`);

      // Place market sell order
      const order = await binanceService.placeOrder(
        symbol,
        'SELL',
        'MARKET',
        adjustedQuantity
      );

      // Update position
      position.status = 'CLOSED';
      position.exit_price = currentPrice;
      position.exit_time = new Date();
      position.exit_reason = reason;
      position.realized_pnl = ((currentPrice - position.entry_price) / position.entry_price) * Math.abs(position.position_size_usd);
      await position.save();

      logger.info(`[PositionMgmt] ${symbol} position closed successfully. P&L: $${position.realized_pnl.toFixed(2)}`);
    } catch (error) {
      logger.error(`[PositionMgmt] Error closing position ${position.symbol}:`, error);
      throw error;
    }
  }

  /**
   * Partially close a position
   * @param position Position to partially close
   * @param currentPrice Current market price
   * @param percentage Percentage of CURRENT position to close (not original)
   * @param reason Exit reason
   * @param targetNumber Which profit target (1, 2, or 3)
   */
  private async partialClose(position: any, currentPrice: number, percentage: number, reason: string, targetNumber: number = 1): Promise<void> {
    try {
      const symbol = position.symbol;
      const quantityToClose = Math.abs(position.position_size) * percentage;

      logger.info(`[PositionMgmt] Partially closing ${symbol}: ${(percentage * 100).toFixed(0)}% (${quantityToClose} units) at $${currentPrice.toFixed(2)}`);

      // Get symbol precision and adjust quantity
      const precision = await binanceService.getSymbolPrecision(symbol);
      if (!precision) {
        throw new Error(`Failed to get precision info for ${symbol}`);
      }
      const adjustedQuantity = binanceService.adjustQuantity(quantityToClose, precision);
      logger.info(`[PositionMgmt] Adjusted partial close quantity from ${quantityToClose} to ${adjustedQuantity}`);

      // Place market sell order
      const order = await binanceService.placeOrder(
        symbol,
        'SELL',
        'MARKET',
        adjustedQuantity
      );

      // Update position
      const partialPnl = ((currentPrice - position.entry_price) / position.entry_price) * Math.abs(position.position_size_usd) * percentage;
      
      position.position_size *= (1 - percentage);
      position.position_size_usd *= (1 - percentage);
      position.realized_pnl = (position.realized_pnl || 0) + partialPnl;
      
      // Track which partial close this is
      if (targetNumber === 1) {
        position.partial_close_1 = true;
        position.partial_close_1_price = currentPrice;
        position.partial_close_1_time = new Date();
        position.partial_close_1_reason = reason;
      } else if (targetNumber === 2) {
        position.partial_close_2 = true;
        position.partial_close_2_price = currentPrice;
        position.partial_close_2_time = new Date();
        position.partial_close_2_reason = reason;
      }
      
      await position.save();

      logger.info(`[PositionMgmt] ${symbol} partial close successful. Realized P&L: $${partialPnl.toFixed(2)}`);
    } catch (error) {
      logger.error(`[PositionMgmt] Error partially closing position ${position.symbol}:`, error);
      throw error;
    }
  }
}

export default PositionManagementService;
