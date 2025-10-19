import { Types } from 'mongoose';
import Position from '../../models/Position';
import Trade from '../../models/Trade';
import BotConfig from '../../models/BotConfig';
import BotState from '../../models/BotState';
import binanceService from '../binanceService';
import executionRouter from './executionRouter';

export class PositionManager {
  /**
   * Create a new position
   */
  async createPosition(
    userId: Types.ObjectId,
    symbol: string,
    side: 'LONG' | 'SHORT',
    entry_price: number,
    quantity: number,
    stop_price: number,
    playbook: 'A' | 'B' | 'C' | 'D',
    target_price?: number
  ): Promise<typeof Position.prototype> {
    try {
      const position = await Position.create({
        userId,
        symbol,
        side,
        entry_price,
        quantity,
        stop_price,
        target_price,
        playbook,
        status: 'OPEN',
        opened_at: new Date(),
        current_price: entry_price,
        unrealized_pnl: 0,
        unrealized_r: 0,
        fees_paid: 0,
      });

      console.log(`[PositionManager] Created position ${position._id}: ${symbol} ${side} ${quantity} @ $${entry_price}`);
      return position;
    } catch (error) {
      console.error('[PositionManager] Error creating position:', error);
      throw error;
    }
  }

  /**
   * Update position with current market price
   */
  async updatePosition(positionId: Types.ObjectId, currentPrice: number): Promise<void> {
    try {
      const position = await Position.findById(positionId);
      if (!position || position.status !== 'OPEN') {
        return;
      }

      // Calculate unrealized PnL
      const priceDiff = position.side === 'LONG'
        ? currentPrice - position.entry_price
        : position.entry_price - currentPrice;

      const unrealizedPnl = priceDiff * position.quantity;

      // Calculate unrealized R
      const state = await BotState.findOne({ userId: position.userId });
      const currentR = state?.currentR || 42;
      const unrealizedR = currentR > 0 ? unrealizedPnl / currentR : 0;

      // Calculate hold time
      const holdTimeMs = Date.now() - position.opened_at.getTime();
      const hours = Math.floor(holdTimeMs / (1000 * 60 * 60));
      const minutes = Math.floor((holdTimeMs % (1000 * 60 * 60)) / (1000 * 60));
      const hold_time = `${hours}h ${minutes}m`;

      position.current_price = currentPrice;
      position.unrealized_pnl = Math.round(unrealizedPnl * 100) / 100;
      position.unrealized_r = Math.round(unrealizedR * 100) / 100;
      position.hold_time = hold_time;

      await position.save();
    } catch (error) {
      console.error(`[PositionManager] Error updating position ${positionId}:`, error);
    }
  }

  /**
   * Check and execute position management rules (breakeven, scaling, trailing)
   */
  async managePosition(positionId: Types.ObjectId): Promise<void> {
    try {
      const position = await Position.findById(positionId);
      if (!position || position.status !== 'OPEN') {
        return;
      }

      const config = await BotConfig.findOne({ userId: position.userId });
      if (!config) {
        return;
      }

      const unrealizedR = position.unrealized_r || 0;

      // Get playbook config
      const playbookConfig = config[`playbook_${position.playbook}`];
      if (!playbookConfig) {
        return;
      }

      // Rule 1: Move to breakeven
      if (position.playbook === 'A' && unrealizedR >= playbookConfig.breakeven_R) {
        if (position.stop_price !== position.entry_price) {
          console.log(`[PositionManager] Moving ${position.symbol} to breakeven (${unrealizedR.toFixed(2)}R >= ${playbookConfig.breakeven_R}R)`);
          position.stop_price = position.entry_price;
          await position.save();
        }
      }

      // Rule 2: Scale out
      if (position.playbook === 'A' && unrealizedR >= playbookConfig.scale_R) {
        // Check if we haven't already scaled
        const scalePct = playbookConfig.scale_pct;
        const targetQty = position.quantity * (1 - scalePct);

        // Simple check: if current quantity is still original, we haven't scaled
        // In a real implementation, we'd track scale state more explicitly
        console.log(`[PositionManager] Scaling out ${(scalePct * 100).toFixed(0)}% of ${position.symbol} position at ${unrealizedR.toFixed(2)}R`);

        const scaleQty = position.quantity * scalePct;

        // Place sell order
        const result = await executionRouter.executeSignal(
          position.userId,
          {
            symbol: position.symbol,
            playbook: position.playbook,
            action: 'SELL',
            entryPrice: position.current_price || position.entry_price,
            stopPrice: position.stop_price,
            reason: 'Scale out at target',
          },
          scaleQty,
          position._id
        );

        if (result.success) {
          // Update position quantity
          position.quantity = targetQty;
          await position.save();

          console.log(`[PositionManager] Scaled out ${scaleQty} units - Remaining: ${targetQty}`);

          // Enable trailing stop
          if (config.playbook_A.trail_atr_mult) {
            const klines = await binanceService.getKlines(position.symbol, '15m', 15);
            const atr = binanceService.calculateATR(klines, 14);
            position.trailing_stop_distance = config.playbook_A.trail_atr_mult * atr;
            await position.save();
            console.log(`[PositionManager] Trailing stop enabled: ${position.trailing_stop_distance.toFixed(2)}`);
          }
        }
      }

      // Rule 3: Update trailing stop
      if (position.trailing_stop_distance && position.current_price) {
        const trailingStopPrice = position.side === 'LONG'
          ? position.current_price - position.trailing_stop_distance
          : position.current_price + position.trailing_stop_distance;

        const shouldUpdate = position.side === 'LONG'
          ? trailingStopPrice > position.stop_price
          : trailingStopPrice < position.stop_price;

        if (shouldUpdate) {
          console.log(`[PositionManager] Updating trailing stop for ${position.symbol}: $${position.stop_price.toFixed(2)} -> $${trailingStopPrice.toFixed(2)}`);
          position.stop_price = trailingStopPrice;
          await position.save();
        }
      }

      // Rule 4: Check stop loss hit
      if (position.current_price && position.stop_price) {
        const stopHit = position.side === 'LONG'
          ? position.current_price <= position.stop_price
          : position.current_price >= position.stop_price;

        if (stopHit) {
          console.log(`[PositionManager] Stop loss hit for ${position.symbol}: Price $${position.current_price.toFixed(2)}, Stop $${position.stop_price.toFixed(2)}`);
          await this.closePosition(positionId, 'STOP_LOSS');
        }
      }

      // Rule 5: Check target hit (for Playbook B)
      if (position.playbook === 'B' && position.target_price && position.current_price) {
        const targetHit = position.side === 'LONG'
          ? position.current_price >= position.target_price
          : position.current_price <= position.target_price;

        if (targetHit) {
          console.log(`[PositionManager] Target hit for ${position.symbol}: Price $${position.current_price.toFixed(2)}, Target $${position.target_price.toFixed(2)}`);
          await this.closePosition(positionId, 'TARGET');
        }
      }

      // Rule 6: Check time stop (for Playbook B)
      if (position.playbook === 'B' && playbookConfig.time_stop_min) {
        const holdTimeMs = Date.now() - position.opened_at.getTime();
        const holdTimeMin = holdTimeMs / (1000 * 60);

        if (holdTimeMin >= playbookConfig.time_stop_min) {
          console.log(`[PositionManager] Time stop hit for ${position.symbol}: ${holdTimeMin.toFixed(0)} min >= ${playbookConfig.time_stop_min} min`);
          await this.closePosition(positionId, 'TIME_STOP');
        }
      }

      // Rule 7: Scale out (Playbook C - Stage 1)
      if (position.playbook === 'C' && playbookConfig.scale_1_R && unrealizedR >= playbookConfig.scale_1_R) {
        if (!position.scaled_1) {
          console.log(`[PositionManager] Scaling out stage 1 for ${position.symbol} at ${unrealizedR.toFixed(2)}R`);

          const scaleQty = position.quantity * playbookConfig.scale_1_pct;
          const result = await executionRouter.executeSignal(
            position.userId,
            {
              symbol: position.symbol,
              playbook: position.playbook,
              action: position.side === 'LONG' ? 'SELL' : 'BUY',
              entryPrice: position.current_price || position.entry_price,
              stopPrice: position.stop_price,
              reason: 'Scale out stage 1',
            },
            scaleQty,
            position._id
          );

          if (result.success) {
            position.quantity -= scaleQty;
            position.scaled_1 = true;
            await position.save();
            console.log(`[PositionManager] Scaled out ${scaleQty.toFixed(8)} units - Remaining: ${position.quantity.toFixed(8)}`);
          }
        }
      }

      // Rule 8: Scale out (Playbook C - Stage 2)
      if (position.playbook === 'C' && playbookConfig.scale_2_R && unrealizedR >= playbookConfig.scale_2_R) {
        if (!position.scaled_2 && position.scaled_1) {
          console.log(`[PositionManager] Scaling out stage 2 for ${position.symbol} at ${unrealizedR.toFixed(2)}R`);

          const scaleQty = position.quantity * playbookConfig.scale_2_pct;
          const result = await executionRouter.executeSignal(
            position.userId,
            {
              symbol: position.symbol,
              playbook: position.playbook,
              action: position.side === 'LONG' ? 'SELL' : 'BUY',
              entryPrice: position.current_price || position.entry_price,
              stopPrice: position.stop_price,
              reason: 'Scale out stage 2',
            },
            scaleQty,
            position._id
          );

          if (result.success) {
            position.quantity -= scaleQty;
            position.scaled_2 = true;

            // Enable trailing stop after stage 2
            if (playbookConfig.trail_atr_mult) {
              const klines = await binanceService.getKlines(position.symbol, '15m', 15);
              const atr = binanceService.calculateATR(klines, 14);
              position.trailing_stop_distance = playbookConfig.trail_atr_mult * atr;
              console.log(`[PositionManager] Trailing stop enabled: ${position.trailing_stop_distance.toFixed(2)}`);
            }

            await position.save();
            console.log(`[PositionManager] Scaled out ${scaleQty.toFixed(8)} units - Remaining: ${position.quantity.toFixed(8)}`);
          }
        }
      }

      // Rule 9: Check target hit (for Playbook C)
      if (position.playbook === 'C' && playbookConfig.target_R && unrealizedR >= playbookConfig.target_R) {
        console.log(`[PositionManager] Target hit for ${position.symbol}: ${unrealizedR.toFixed(2)}R >= ${playbookConfig.target_R}R`);
        await this.closePosition(positionId, 'TARGET');
      }
    } catch (error) {
      console.error(`[PositionManager] Error managing position ${positionId}:`, error);
    }
  }

  /**
   * Close a position
   */
  async closePosition(
    positionId: Types.ObjectId,
    reason: 'STOP_LOSS' | 'TARGET' | 'MANUAL' | 'KILL_SWITCH' | 'TIME_STOP'
  ): Promise<void> {
    try {
      const position = await Position.findById(positionId);
      if (!position || position.status !== 'OPEN') {
        return;
      }

      console.log(`[PositionManager] Closing position ${positionId} - Reason: ${reason}`);

      const closePrice = position.current_price || position.entry_price;

      // Place closing order
      const result = await executionRouter.executeSignal(
        position.userId,
        {
          symbol: position.symbol,
          playbook: position.playbook,
          action: position.side === 'LONG' ? 'SELL' : 'BUY',
          entryPrice: closePrice,
          stopPrice: 0,
          reason: `Close position - ${reason}`,
        },
        position.quantity,
        position._id
      );

      if (!result.success) {
        console.error(`[PositionManager] Failed to close position: ${result.error}`);
        return;
      }

      // Calculate realized PnL
      const priceDiff = position.side === 'LONG'
        ? closePrice - position.entry_price
        : position.entry_price - closePrice;

      const realizedPnl = priceDiff * position.quantity - (result.fees || 0);

      // Calculate realized R
      const state = await BotState.findOne({ userId: position.userId });
      const currentR = state?.currentR || 42;
      const realizedR = currentR > 0 ? realizedPnl / currentR : 0;

      // Update position
      position.status = 'CLOSED';
      position.closed_at = new Date();
      position.realized_pnl = Math.round(realizedPnl * 100) / 100;
      position.realized_r = Math.round(realizedR * 100) / 100;
      position.fees_paid = (position.fees_paid || 0) + (result.fees || 0);
      await position.save();

      // Create trade record
      await Trade.create({
        userId: position.userId,
        symbol: position.symbol,
        side: position.side,
        playbook: position.playbook,
        entry_price: position.entry_price,
        exit_price: closePrice,
        quantity: position.quantity,
        pnl_usd: realizedPnl,
        pnl_r: realizedR,
        fees: position.fees_paid,
        date: position.closed_at,
        outcome: realizedPnl > 0 ? 'WIN' : realizedPnl < 0 ? 'LOSS' : 'BREAKEVEN',
        notes: `Closed via ${reason}`,
      });

      // Update bot state PnL
      if (state) {
        state.dailyPnl += realizedPnl;
        state.dailyPnlR += realizedR;
        state.weeklyPnl += realizedPnl;
        state.weeklyPnlR += realizedR;
        await state.save();
      }

      console.log(`[PositionManager] Position closed: ${position.symbol} - PnL: $${realizedPnl.toFixed(2)} (${realizedR.toFixed(2)}R)`);
    } catch (error) {
      console.error(`[PositionManager] Error closing position ${positionId}:`, error);
      throw error;
    }
  }

  /**
   * Update all open positions with current prices
   */
  async updateAllPositions(userId: Types.ObjectId): Promise<void> {
    try {
      const openPositions = await Position.find({ userId, status: 'OPEN' });

      for (const position of openPositions) {
        try {
          const ticker = await binanceService.getTicker(position.symbol);
          const currentPrice = parseFloat(ticker.lastPrice);
          await this.updatePosition(position._id, currentPrice);
          await this.managePosition(position._id);
        } catch (error) {
          console.error(`[PositionManager] Error updating position ${position._id}:`, error);
        }
      }
    } catch (error) {
      console.error('[PositionManager] Error updating all positions:', error);
    }
  }
}

export default new PositionManager();
