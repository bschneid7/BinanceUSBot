import mongoose from 'mongoose';
import { Types } from 'mongoose';
import Position from '../../models/Position';
import Trade from '../../models/Trade';
import BotConfig from '../../models/BotConfig';
import BotState from '../../models/BotState';
import binanceService from '../binanceService';
import executionRouter from './executionRouter';
import exchangeFilters from '../exchangeFilters';
import { RISK_LIMITS } from './constants';

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
      let state = null;
      try {
        state = await BotState.findOne({ userId: position.userId });
      } catch (error) {
        console.warn(`[PositionManager] Could not fetch BotState for position ${positionId}: ${error}`);
      }
      
      // If state is missing or currentR invalid, calculate R from equity
      let currentR = state?.currentR;
      if (!state || !currentR || currentR <= 0) {
        console.warn(`[PositionManager] Invalid currentR for position ${positionId}, calculating from equity`);
        
        // Calculate R as 1% of equity (standard risk per trade)
        const equity = state?.equity || 10000; // Fallback to $10k if equity missing
        currentR = equity * 0.01;
        
        console.info(`[PositionManager] Calculated R = ${currentR.toFixed(2)} (1% of equity $${equity.toFixed(2)})`);
      }
      
      const unrealizedR = unrealizedPnl / currentR;

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
      if (position.playbook === 'A' && 'breakeven_R' in playbookConfig && unrealizedR >= playbookConfig.breakeven_R) {
        if (position.stop_price !== position.entry_price) {
          console.log(`[PositionManager] Moving ${position.symbol} to breakeven (${unrealizedR.toFixed(2)}R >= ${playbookConfig.breakeven_R}R)`);
          position.stop_price = position.entry_price;
          await position.save();
        }
      }

      // Rule 2: Scale out
      if (position.playbook === 'A' && 'scale_R' in playbookConfig && unrealizedR >= playbookConfig.scale_R) {
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

      // Rule 3.5: Auto-close positions without stop-loss (Layer 1 safeguard)
      if (!position.stop_price || position.stop_price === 0) {
        const ageHours = (Date.now() - position.opened_at.getTime()) / (1000 * 60 * 60);
        const autoCloseThreshold = 24; // Close after 24 hours without stop-loss
        
        // Check if position is protected (e.g., APEUSD for boost program)
        const isProtected = position.symbol === 'APEUSD' && position.playbook === 'MANUAL';
        
        if (!isProtected && ageHours > autoCloseThreshold) {
          console.log(`[PositionManager] Auto-closing position without stop-loss: ${position.symbol} (${ageHours.toFixed(1)}h old, threshold ${autoCloseThreshold}h)`);
          await this.closePosition(positionId, 'AUTO_CLOSE_NO_STOP');
          return; // Exit early since position is closed
        }
      }

      // Rule 3.6: Age-based auto-close (Layer 2 safeguard)
      const ageHours = (Date.now() - position.opened_at.getTime()) / (1000 * 60 * 60);
      const maxAge = config?.max_position_age_hours || 72; // Default 72 hours
      const isProtected = position.symbol === 'APEUSD' && position.playbook === 'MANUAL';
      
      if (!isProtected && ageHours > maxAge) {
        // Don't auto-close if position has significant unrealized profit
        const profitThreshold = 50; // Don't close if profit > $50
        if (position.unrealized_pnl < profitThreshold) {
          console.log(`[PositionManager] Auto-closing stale position: ${position.symbol} (${ageHours.toFixed(1)}h old, limit ${maxAge}h, P&L $${position.unrealized_pnl.toFixed(2)})`);
          await this.closePosition(positionId, 'AUTO_CLOSE_STALE');
          return; // Exit early since position is closed
        } else {
          console.log(`[PositionManager] Keeping profitable stale position: ${position.symbol} (${ageHours.toFixed(1)}h old, P&L $${position.unrealized_pnl.toFixed(2)})`);
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
      if (position.playbook === 'C' && 'scale_1_R' in playbookConfig && playbookConfig.scale_1_R && unrealizedR >= playbookConfig.scale_1_R) {
        if (!position.scaled_1) {
          console.log(`[PositionManager] Scaling out stage 1 for ${position.symbol} at ${unrealizedR.toFixed(2)}R`);

          const scaleQty = 'scale_1_pct' in playbookConfig ? position.quantity * playbookConfig.scale_1_pct : position.quantity * 0.5;
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
            position._id as Types.ObjectId
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
      if (position.playbook === 'C' && 'scale_2_R' in playbookConfig && playbookConfig.scale_2_R && unrealizedR >= playbookConfig.scale_2_R) {
        if (!position.scaled_2 && position.scaled_1) {
          console.log(`[PositionManager] Scaling out stage 2 for ${position.symbol} at ${unrealizedR.toFixed(2)}R`);

          const scaleQty = 'scale_2_pct' in playbookConfig ? position.quantity * playbookConfig.scale_2_pct : position.quantity * 0.5;
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
            position._id as Types.ObjectId
          );

          if (result.success) {
            position.quantity -= scaleQty;
            position.scaled_2 = true;

            // Enable trailing stop after stage 2
            if ('trail_atr_mult' in playbookConfig && playbookConfig.trail_atr_mult) {
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
      if (position.playbook === 'C' && 'target_R' in playbookConfig && playbookConfig.target_R && unrealizedR >= playbookConfig.target_R) {
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
  /**
   * Close position with atomic transaction
   * ✅ FIXED: All database operations are now atomic (all succeed or all fail)
   */
  async closePosition(
    positionId: Types.ObjectId,
    reason: 'STOP_LOSS' | 'TARGET' | 'MANUAL' | 'KILL_SWITCH' | 'TIME_STOP'
  ): Promise<void> {
    // Start MongoDB session for transaction
    const session = await mongoose.startSession();
    
    try {
      // Execute all operations in a transaction
      await session.withTransaction(async () => {
        // 1. Get position (with session)
        const position = await Position.findById(positionId).session(session);
        if (!position || position.status !== 'OPEN') {
          throw new Error(`Position ${positionId} not found or already closed`);
        }

        console.log(`[PositionManager] Closing position ${positionId} - Reason: ${reason}`);
        
        const closePrice = position.current_price || position.entry_price;

        // Round quantity to exchange lot size requirements
        let roundedQuantity = position.quantity;
        try {
          roundedQuantity = await exchangeFilters.roundQuantity(position.symbol, position.quantity);
          
          if (roundedQuantity !== position.quantity) {
            console.log(`[PositionManager] Truncated quantity: ${position.quantity} -> ${roundedQuantity}`);
          }
        } catch (error) {
          console.error(`[PositionManager] Failed to round quantity, using original:`, error);
          console.error(`[PositionManager] Error details:`, error);
          // Continue with original quantity if rounding fails
        }

        // Check for dust (quantity below minQty after truncation)
        const filters = exchangeFilters.getFilters(position.symbol);
        if (filters && filters.lotSizeFilter) {
          const minQty = parseFloat(filters.lotSizeFilter.minQty);
          if (roundedQuantity < minQty) {
            console.warn(`[PositionManager] Quantity ${roundedQuantity} is below minQty (${minQty}) for ${position.symbol}. Dust position detected.`);
            
            // Mark position as closed to prevent continuous retry
            position.status = 'CLOSED';
            position.closed_at = new Date();
            position.close_reason = 'DUST';
            await position.save({ session });
            
            console.log(`[PositionManager] Marked dust position ${positionId} as CLOSED`);
            return; // Exit successfully without placing order
          }
        }

        // 2. Place closing order (outside transaction - exchange operation)
        // Note: This happens BEFORE the transaction commits
        // If this fails, the transaction will rollback
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
          roundedQuantity,
          position._id as Types.ObjectId
        );

        if (!result.success) {
          throw new Error(`Failed to execute closing order: ${result.error}`);
        }

        // 3. Calculate realized PnL
        const priceDiff = position.side === 'LONG'
          ? closePrice - position.entry_price
          : position.entry_price - closePrice;
        const realizedPnl = priceDiff * position.quantity - (result.fees || 0);

        // 4. Get BotState for R calculation
        let state = await BotState.findOne({ userId: position.userId }).session(session);
        
        // Calculate R from equity and risk percentage (0.6%)
        let currentR: number;
        if (state && state.currentR && state.currentR > 0) {
          currentR = state.currentR;
        } else if (state && state.equity && state.equity > 0) {
          // Calculate R as 0.6% of equity
          currentR = state.equity * 0.006;
          console.log(`[PositionManager] Calculated R from equity: $${currentR.toFixed(2)}`);
        } else {
          throw new Error('BotState not properly initialized - cannot calculate R value');
        }
        
        const realizedR = currentR > 0 ? realizedPnl / currentR : 0;

        // 5. Update position (atomic - part of transaction)
        position.status = 'CLOSED';
        position.closed_at = new Date();
        position.realized_pnl = Math.round(realizedPnl * 100) / 100;
        position.realized_r = Math.round(realizedR * 100) / 100;
        position.fees_paid = (position.fees_paid || 0) + (result.fees || 0);
        await position.save({ session });

        // 6. Create trade record (atomic - part of transaction)
        await Trade.create([{
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
        }], { session });

        // 7. Update bot state PnL (atomic - part of transaction)
        if (state) {
          state.dailyPnl += realizedPnl;
          state.dailyPnlR += realizedR;
          state.weeklyPnl += realizedPnl;
          state.weeklyPnlR += realizedR;
          await state.save({ session });
        }

        console.log(`[PositionManager] ✅ Position ${positionId} closed atomically: ${realizedPnl.toFixed(2)} USD (${realizedR.toFixed(2)}R)`);
      });
      
      // Transaction committed successfully
      console.log(`[PositionManager] Transaction committed for position ${positionId}`);
      
    } catch (error) {
      // Transaction rolled back automatically
      console.error(`[PositionManager] ❌ Transaction failed for position ${positionId}:`, error);
      console.error(`[PositionManager] All changes rolled back`);
      throw error;
    } finally {
      // Always end the session
      await session.endSession();
    }
  }

  /**
   * Update all open positions with current prices
   */
  async updateAllPositions(userId: Types.ObjectId): Promise<void> {
    try {
      const openPositions = await Position.find({ userId, status: 'OPEN' });
      
      if (!openPositions || openPositions.length === 0) {
        return;
      }

      console.log(`[PositionManager] Updating ${openPositions.length} open positions`);

      // Fetch all tickers in parallel for better performance
      const tickerPromises = openPositions.map(position =>
        binanceService.getTicker(position.symbol)
          .then(ticker => ({ position, ticker, success: true }))
          .catch(error => {
            console.error(`[PositionManager] Failed to fetch ticker for ${position.symbol}:`, error);
            return { position, ticker: null, success: false };
          })
      );

      const tickerResults = await Promise.all(tickerPromises);

      // Update positions in parallel
      const updatePromises = tickerResults.map(async ({ position, ticker, success }) => {
        if (!success || !ticker) {
          return;
        }

        try {
          // Validate ticker data
          if (!ticker.lastPrice || isNaN(parseFloat(ticker.lastPrice))) {
            console.warn(`[PositionManager] Invalid price data for ${position.symbol}:`, ticker.lastPrice);
            return;
          }

          const currentPrice = parseFloat(ticker.lastPrice);
          
          // Sanity check on price
          if (currentPrice <= 0 || currentPrice > 1000000) {
            console.warn(`[PositionManager] Unreasonable price for ${position.symbol}: $${currentPrice}`);
            return;
          }

          await this.updatePosition(position._id as Types.ObjectId, currentPrice);
          await this.managePosition(position._id as Types.ObjectId);
        } catch (error) {
          console.error(`[PositionManager] Error updating position ${position._id}:`, error);
        }
      });

      await Promise.all(updatePromises);
      console.log(`[PositionManager] Position updates complete`);
    } catch (error) {
      console.error('[PositionManager] Error updating all positions:', error);
    }
  }
}

export default new PositionManager();
