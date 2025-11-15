import { Types } from 'mongoose';
import Position from '../../models/Position';
import Trade from '../../models/Trade';
import BotConfig from '../../models/BotConfig';
import BotState from '../../models/BotState';
import binanceService from '../binanceService';
import executionRouter from './executionRouter';
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
        position._id as Types.ObjectId
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
      let state = null;
      let currentR = 42; // Default fallback
      try {
        state = await BotState.findOne({ userId: position.userId });
        currentR = state?.currentR || 42;
      } catch (error) {
        console.warn(`[PositionManager] Could not fetch BotState, using default R value: ${error}`);
      }
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

  /**
   * Check if a new position would violate correlation risk limits
   * Phase 3: Correlation-Based Risk Management
   * @param userId User ID
   * @param symbol Symbol to check
   * @returns Object with canOpen flag and reason
   */
  async checkCorrelationRisk(
    userId: Types.ObjectId,
    symbol: string
  ): Promise<{ canOpen: boolean; reason?: string; correlatedSymbols?: string[] }> {
    try {
      // Import CDD helper
      const getCDDHelper = (await import('../cddDataHelper')).default;
      const cddHelper = getCDDHelper();

      // Get all open positions for this user
      const openPositions = await Position.find({
        userId,
        status: 'OPEN',
      });

      if (openPositions.length === 0) {
        return { canOpen: true };
      }

      // Correlation thresholds
      const HIGH_CORRELATION = 0.7;
      const MODERATE_CORRELATION = 0.5;
      const MAX_HIGH_CORR_POSITIONS = 2;
      const MAX_MODERATE_CORR_POSITIONS = 3;

      const highlyCorrelated: string[] = [];
      const moderatelyCorrelated: string[] = [];

      // Check correlation with each open position
      for (const position of openPositions) {
        const correlation = await cddHelper.getCorrelation(symbol, position.symbol);

        if (correlation === null) {
          // No correlation data available, allow position
          continue;
        }

        const absCorr = Math.abs(correlation);

        if (absCorr >= HIGH_CORRELATION) {
          highlyCorrelated.push(position.symbol);
        } else if (absCorr >= MODERATE_CORRELATION) {
          moderatelyCorrelated.push(position.symbol);
        }
      }

      // Check if we exceed high correlation limit
      if (highlyCorrelated.length >= MAX_HIGH_CORR_POSITIONS) {
        console.log(
          `[PositionManager] Correlation risk: ${symbol} highly correlated (>0.7) with ${highlyCorrelated.length} positions: ${highlyCorrelated.join(', ')}`
        );
        return {
          canOpen: false,
          reason: `Too many highly correlated positions (${highlyCorrelated.length}/${MAX_HIGH_CORR_POSITIONS})`,
          correlatedSymbols: highlyCorrelated,
        };
      }

      // Check if we exceed moderate correlation limit
      if (moderatelyCorrelated.length >= MAX_MODERATE_CORR_POSITIONS) {
        console.log(
          `[PositionManager] Correlation risk: ${symbol} moderately correlated (>0.5) with ${moderatelyCorrelated.length} positions: ${moderatelyCorrelated.join(', ')}`
        );
        return {
          canOpen: false,
          reason: `Too many moderately correlated positions (${moderatelyCorrelated.length}/${MAX_MODERATE_CORR_POSITIONS})`,
          correlatedSymbols: moderatelyCorrelated,
        };
      }

      // Log correlation info if any correlations found
      if (highlyCorrelated.length > 0 || moderatelyCorrelated.length > 0) {
        console.log(
          `[PositionManager] Correlation check passed for ${symbol}: ${highlyCorrelated.length} high, ${moderatelyCorrelated.length} moderate`
        );
      }

      return { canOpen: true };
    } catch (error) {
      console.error(`[PositionManager] Error checking correlation risk:`, error);
      // On error, allow position to avoid blocking trades
      return { canOpen: true };
    }
  }
}

export default new PositionManager();
