import { Types } from 'mongoose';
import { BaseCommandHandler, Command } from './BaseCommandHandler';
import Position from '../../models/Position';
import binanceService from '../binanceService';
import logger from '../../utils/logger';

/**
 * Close Position Command Handler
 * Idempotent handler for closing trading positions
 */

export interface ClosePositionCommand extends Command {
  positionId: string;
  reason: string;
  manualPrice?: number;
}

export class ClosePositionHandler extends BaseCommandHandler<ClosePositionCommand> {
  protected commandName = 'ClosePosition';

  /**
   * Check if position is already closed (idempotency)
   */
  protected async checkIfAlreadyExecuted(command: ClosePositionCommand): Promise<any | null> {
    const position = await Position.findById(command.positionId);
    
    if (!position) {
      logger.warn(`[ClosePosition] Position ${command.positionId} not found`);
      return { alreadyClosed: true, reason: 'Position not found' };
    }

    if (position.status === 'CLOSED') {
      logger.info(`[ClosePosition] Position ${command.positionId} already closed`);
      return { 
        alreadyClosed: true, 
        position: {
          id: position._id,
          symbol: position.symbol,
          status: position.status,
          close_reason: position.close_reason,
        }
      };
    }

    return null;
  }

  /**
   * Validate command
   */
  protected async validate(command: ClosePositionCommand): Promise<string | null> {
    const position = await Position.findById(command.positionId);

    if (!position) {
      return 'Position not found';
    }

    if (position.userId.toString() !== command.userId.toString()) {
      return 'Position does not belong to this user';
    }

    if (position.status !== 'OPEN') {
      return `Position status is ${position.status}, expected OPEN`;
    }

    return null;
  }

  /**
   * Handle position closure
   */
  protected async handle(command: ClosePositionCommand): Promise<any> {
    const position = await Position.findById(command.positionId);
    if (!position) {
      throw new Error('Position not found');
    }

    logger.info(`[ClosePosition] Closing position ${position.symbol} (${command.reason})`);

    // Extract base asset from symbol (e.g., BTC from BTCUSD)
    const baseAsset = position.symbol.replace(/USD(T)?$/, '');

    // Step 1: Check actual Binance balance
    let actualBalance = 0;
    try {
      actualBalance = await binanceService.getBalance(baseAsset);
      logger.info(`[ClosePosition] Binance balance for ${baseAsset}: ${actualBalance}`);
    } catch (error) {
      logger.error(`[ClosePosition] Failed to get balance for ${baseAsset}:`, error);
      throw new Error(`Failed to get balance: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Step 2: Check if position already closed on exchange
    if (actualBalance === 0 || actualBalance < position.quantity * 0.01) {
      logger.warn(`[ClosePosition] Position already closed on exchange (balance: ${actualBalance})`);
      
      // Record event
      await this.recordEvent(
        'PositionClosedEvent',
        command.userId,
        {
          positionId: position._id.toString(),
          symbol: position.symbol,
          reason: 'Already closed on exchange',
          actualBalance,
          expectedQuantity: position.quantity,
        },
        position._id.toString(),
        'Position'
      );

      // Update database
      position.status = 'CLOSED';
      position.close_reason = command.reason + ' (already closed on exchange)';
      position.closed_at = new Date();
      await position.save();

      return {
        positionId: position._id,
        symbol: position.symbol,
        status: 'CLOSED',
        reason: 'Already closed on exchange',
      };
    }

    // Step 3: Determine quantity to sell (use actual balance if less than position quantity)
    const quantityToSell = Math.min(actualBalance, position.quantity);
    
    if (quantityToSell < position.quantity) {
      logger.warn(`[ClosePosition] Partial balance: selling ${quantityToSell} instead of ${position.quantity}`);
    }

    // Step 4: Place sell order on Binance
    let order;
    try {
      logger.info(`[ClosePosition] Placing SELL order: ${position.symbol} ${quantityToSell}`);
      
      order = await binanceService.placeOrder({
        symbol: position.symbol,
        side: 'SELL',
        type: 'MARKET',
        quantity: quantityToSell,
      });

      logger.info(`[ClosePosition] Order placed successfully: ${order.orderId}`);

      // Record order placed event
      await this.recordEvent(
        'OrderPlacedEvent',
        command.userId,
        {
          orderId: order.orderId,
          symbol: position.symbol,
          side: 'SELL',
          type: 'MARKET',
          quantity: quantityToSell,
          status: order.status,
        },
        order.orderId.toString(),
        'Order'
      );

    } catch (error) {
      logger.error(`[ClosePosition] Failed to place order:`, error);
      
      // Record error event
      await this.recordEvent(
        'OrderPlacementFailedEvent',
        command.userId,
        {
          positionId: position._id.toString(),
          symbol: position.symbol,
          error: error instanceof Error ? error.message : String(error),
        },
        position._id.toString(),
        'Position'
      );

      throw error;
    }

    // Step 5: Calculate P&L
    const exitPrice = command.manualPrice || (order.fills ? 
      order.fills.reduce((sum: number, fill: any) => sum + parseFloat(fill.price), 0) / order.fills.length : 
      0);

    const pnl = (exitPrice - position.entry_price) * quantityToSell;
    const pnlPct = ((exitPrice - position.entry_price) / position.entry_price) * 100;

    // Step 6: Record position closed event
    await this.recordEvent(
      'PositionClosedEvent',
      command.userId,
      {
        positionId: position._id.toString(),
        symbol: position.symbol,
        quantity: quantityToSell,
        entryPrice: position.entry_price,
        exitPrice,
        pnl,
        pnlPct,
        reason: command.reason,
        orderId: order.orderId,
      },
      position._id.toString(),
      'Position'
    );

    // Step 7: Update position in database
    position.status = 'CLOSED';
    position.close_reason = command.reason;
    position.exit_price = exitPrice;
    position.realized_pnl = pnl;
    position.closed_at = new Date();
    await position.save();

    logger.info(`[ClosePosition] ✅ Position closed: ${position.symbol}, P&L: $${pnl.toFixed(2)} (${pnlPct.toFixed(2)}%)`);

    return {
      positionId: position._id,
      symbol: position.symbol,
      quantity: quantityToSell,
      entryPrice: position.entry_price,
      exitPrice,
      pnl,
      pnlPct,
      orderId: order.orderId,
      status: 'CLOSED',
    };
  }
}

// Export singleton instance
export const closePositionHandler = new ClosePositionHandler();
export default closePositionHandler;
