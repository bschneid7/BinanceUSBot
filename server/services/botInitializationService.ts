import { Types } from 'mongoose';
import BotState from '../models/BotState';
import Position from '../models/Position';
import Trade from '../models/Trade';

/**
 * Bot Initialization Service
 * Handles proper initialization of bot state by calculating actual starting values
 */
class BotInitializationService {
  /**
   * Calculate starting equity from current state
   * Formula: starting_equity = current_equity - realized_pnl - unrealized_pnl
   */
  private async calculateStartingEquity(userId: Types.ObjectId): Promise<number> {
    // Get all closed trades for realized P&L
    const closedTrades = await Trade.find({ userId });
    const realizedPnl = closedTrades.reduce((sum, trade) => sum + (trade.pnl_usd || 0), 0);

    // Get all open positions for unrealized P&L
    const openPositions = await Position.find({ userId, status: 'OPEN' });
    const unrealizedPnl = openPositions.reduce((sum, pos) => sum + (pos.unrealized_pnl || 0), 0);

    // Calculate current equity (cash + positions value)
    const positionsValue = openPositions.reduce((sum, pos) => 
      sum + Math.abs(pos.position_size_usd || 0), 0
    );
    
    // Get cash balance from positions summary or calculate
    // For now, use a simple approximation: equity = starting + pnl
    // We need to work backwards: starting = equity - pnl
    
    // Get current total equity from environment or calculate from positions
    const envEquity = process.env.CURRENT_EQUITY ? parseFloat(process.env.CURRENT_EQUITY) : null;
    
    if (envEquity && envEquity > 0) {
      // Calculate starting equity from known current equity
      const startingEquity = envEquity - realizedPnl - unrealizedPnl;
      console.log(`[BotInit] Calculated starting equity: $${startingEquity.toFixed(2)} (from current: $${envEquity}, realized: $${realizedPnl.toFixed(2)}, unrealized: $${unrealizedPnl.toFixed(2)})`);
      return startingEquity;
    }
    
    // If no current equity provided, check for earliest equity snapshot
    const EquitySnapshot = (await import('../models/EquitySnapshot')).default;
    const earliestSnapshot = await EquitySnapshot.findOne({ userId })
      .sort({ date: 1 })
      .limit(1);
    
    if (earliestSnapshot) {
      // Use earliest snapshot equity minus its P&L as starting point
      const startingEquity = earliestSnapshot.equity - (earliestSnapshot.totalPnl || 0);
      console.log(`[BotInit] Calculated starting equity from earliest snapshot: $${startingEquity.toFixed(2)}`);
      return startingEquity;
    }
    
    // Last resort: check environment variable
    const envStarting = process.env.STARTING_EQUITY;
    if (envStarting) {
      const parsed = parseFloat(envStarting);
      if (!isNaN(parsed) && parsed > 0) {
        console.log(`[BotInit] Using STARTING_EQUITY from environment: $${parsed}`);
        return parsed;
      }
    }
    
    throw new Error('Cannot determine starting equity. Please set CURRENT_EQUITY or STARTING_EQUITY environment variable, or create an equity snapshot first.');
  }

  /**
   * Calculate current equity from positions and trades
   */
  private async calculateCurrentEquity(userId: Types.ObjectId, startingEquity: number): Promise<number> {
    // Get all closed trades for realized P&L
    const closedTrades = await Trade.find({ userId });
    const realizedPnl = closedTrades.reduce((sum, trade) => sum + (trade.pnl_usd || 0), 0);

    // Get all open positions for unrealized P&L
    const openPositions = await Position.find({ userId, status: 'OPEN' });
    const unrealizedPnl = openPositions.reduce((sum, pos) => sum + (pos.unrealized_pnl || 0), 0);

    return startingEquity + realizedPnl + unrealizedPnl;
  }

  /**
   * Calculate current R value from equity and risk percentage
   */
  private calculateCurrentR(equity: number, riskPct: number = 0.006): number {
    return equity * riskPct;
  }

  /**
   * Initialize or update bot state with calculated values
   */
  async initializeBotState(userId: Types.ObjectId): Promise<void> {
    try {
      console.log(`[BotInit] Initializing bot state for user: ${userId}`);

      let botState = await BotState.findOne({ userId });
      
      if (!botState) {
        // Create new bot state
        const startingEquity = await this.calculateStartingEquity(userId);
        const currentEquity = await this.calculateCurrentEquity(userId, startingEquity);
        const currentR = this.calculateCurrentR(currentEquity);

        botState = await BotState.create({
          userId,
          status: 'ACTIVE',
          startingEquity,
          equity: currentEquity,
          currentR,
          totalEquity: currentEquity,
          availableCapital: currentEquity,
          dailyPnl: 0,
          dailyPnlR: 0,
          weeklyPnl: 0,
          weeklyPnlR: 0,
        });

        console.log(`[BotInit] Created new bot state with calculated starting equity: $${startingEquity.toFixed(2)}, current equity: $${currentEquity.toFixed(2)}`);
      } else {
        // Update existing bot state if values are missing or invalid
        let updated = false;

        // Fix starting equity if not set or invalid
        if (!botState.startingEquity || botState.startingEquity <= 0) {
          botState.startingEquity = await this.calculateStartingEquity(userId);
          updated = true;
          console.log(`[BotInit] Calculated starting equity: $${botState.startingEquity.toFixed(2)}`);
        }

        // Recalculate equity if not set or invalid
        if (!botState.equity || botState.equity <= 0) {
          botState.equity = await this.calculateCurrentEquity(userId, botState.startingEquity);
          updated = true;
          console.log(`[BotInit] Recalculated equity: $${botState.equity.toFixed(2)}`);
        }

        // Recalculate currentR if not set or invalid
        if (!botState.currentR || botState.currentR <= 0) {
          botState.currentR = this.calculateCurrentR(botState.equity);
          updated = true;
          console.log(`[BotInit] Recalculated currentR: $${botState.currentR.toFixed(2)}`);
        }

        if (updated) {
          await botState.save();
          console.log('[BotInit] Bot state updated successfully');
        } else {
          console.log('[BotInit] Bot state already properly initialized');
        }
      }
    } catch (error) {
      console.error('[BotInit] Error initializing bot state:', error);
      throw error;
    }
  }

  /**
   * Update starting equity manually (admin function)
   * Use this if you know the exact starting equity (e.g., from account opening)
   */
  async updateStartingEquity(userId: Types.ObjectId, newStartingEquity: number): Promise<void> {
    if (newStartingEquity <= 0) {
      throw new Error('Starting equity must be positive');
    }

    const botState = await BotState.findOne({ userId });
    if (!botState) {
      throw new Error('Bot state not found');
    }

    botState.startingEquity = newStartingEquity;
    await botState.save();

    console.log(`[BotInit] Manually updated starting equity to: $${newStartingEquity}`);
  }
}

export default new BotInitializationService();

