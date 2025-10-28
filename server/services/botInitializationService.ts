import { Types } from 'mongoose';
import BotState from '../models/BotState';
import Position from '../models/Position';
import Trade from '../models/Trade';

/**
 * Bot Initialization Service
 * Handles proper initialization of bot state with correct starting values
 */
class BotInitializationService {
  /**
   * Get starting equity from environment or default
   */
  private getStartingEquity(): number {
    const envValue = process.env.STARTING_EQUITY;
    if (envValue) {
      const parsed = parseFloat(envValue);
      if (!isNaN(parsed) && parsed > 0) {
        console.log(`[BotInit] Using starting equity from environment: $${parsed}`);
        return parsed;
      }
    }
    
    // Default to $15,000 if not configured
    console.log('[BotInit] No STARTING_EQUITY in environment, using default: $15000');
    return 15000;
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
   * Initialize or update bot state with correct values
   */
  async initializeBotState(userId: Types.ObjectId): Promise<void> {
    try {
      console.log(`[BotInit] Initializing bot state for user: ${userId}`);

      let botState = await BotState.findOne({ userId });
      
      if (!botState) {
        // Create new bot state
        const startingEquity = this.getStartingEquity();
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

        console.log(`[BotInit] Created new bot state with starting equity: $${startingEquity}, current equity: $${currentEquity}`);
      } else {
        // Update existing bot state if values are missing or invalid
        let updated = false;

        // Fix starting equity if not set or invalid
        if (!botState.startingEquity || botState.startingEquity <= 0) {
          botState.startingEquity = this.getStartingEquity();
          updated = true;
          console.log(`[BotInit] Updated starting equity to: $${botState.startingEquity}`);
        }

        // Recalculate equity if not set or invalid
        if (!botState.equity || botState.equity <= 0) {
          botState.equity = await this.calculateCurrentEquity(userId, botState.startingEquity);
          updated = true;
          console.log(`[BotInit] Recalculated equity to: $${botState.equity}`);
        }

        // Recalculate currentR if not set or invalid
        if (!botState.currentR || botState.currentR <= 0) {
          botState.currentR = this.calculateCurrentR(botState.equity);
          updated = true;
          console.log(`[BotInit] Recalculated currentR to: $${botState.currentR}`);
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
   * Update starting equity (admin function)
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

    console.log(`[BotInit] Updated starting equity to: $${newStartingEquity}`);
  }
}

export default new BotInitializationService();

