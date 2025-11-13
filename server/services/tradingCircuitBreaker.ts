import logger from '../utils/logger';
import { Types } from 'mongoose';
import Trade from '../models/Trade';
import BotState from '../models/BotState';
import killSwitch from './tradingEngine/killSwitch';
import { slackNotifier } from './slackNotifier';

/**
 * Trading Circuit Breaker Service
 * 
 * Automatically stops trading when dangerous conditions are detected:
 * - Consecutive losses
 * - Maximum drawdown exceeded
 * - Rapid equity decline
 * 
 * Prevents cascading failures and protects capital.
 * 
 * Note: This is different from the generic CircuitBreaker class which handles
 * API/service failures. This specifically handles trading risk conditions.
 */
class TradingCircuitBreaker {
  private config = {
    maxConsecutiveLosses: 3,
    maxDrawdownPct: -15,
    rapidDeclinePct: -5, // Stop if equity drops 5% in one hour
    rapidDeclineWindowMs: 3600000, // 1 hour
  };

  /**
   * Check all circuit breaker conditions
   */
  async checkAll(userId: Types.ObjectId): Promise<{
    triggered: boolean;
    reason?: string;
    details?: any;
  }> {
    try {
      // Check consecutive losses
      const consecutiveCheck = await this.checkConsecutiveLosses(userId);
      if (consecutiveCheck.triggered) {
        return consecutiveCheck;
      }

      // Check maximum drawdown
      const drawdownCheck = await this.checkMaxDrawdown(userId);
      if (drawdownCheck.triggered) {
        return drawdownCheck;
      }

      // Check rapid equity decline
      const rapidDeclineCheck = await this.checkRapidDecline(userId);
      if (rapidDeclineCheck.triggered) {
        return rapidDeclineCheck;
      }

      return { triggered: false };

    } catch (error) {
      logger.error('[TradingCircuitBreaker] Error checking conditions:', error);
      return { triggered: false };
    }
  }

  /**
   * Check for consecutive losses
   */
  async checkConsecutiveLosses(userId: Types.ObjectId): Promise<{
    triggered: boolean;
    reason?: string;
    details?: any;
  }> {
    try {
      // Get recent trades
      const recentTrades = await Trade.find({ userId })
        .sort({ date: -1 })
        .limit(this.config.maxConsecutiveLosses + 2); // Get a few extra for context

      if (recentTrades.length < this.config.maxConsecutiveLosses) {
        // Not enough trades to trigger
        return { triggered: false };
      }

      // Check if last N trades are all losses
      const lastNTrades = recentTrades.slice(0, this.config.maxConsecutiveLosses);
      const allLosses = lastNTrades.every(trade => trade.outcome === 'LOSS');

      if (allLosses) {
        const totalLoss = lastNTrades.reduce((sum, trade) => sum + (trade.pnl_usd || 0), 0);
        const totalLossR = lastNTrades.reduce((sum, trade) => sum + (trade.pnl_r || 0), 0);

        logger.warn(`[TradingCircuitBreaker] 🚨 CONSECUTIVE LOSSES DETECTED`);
        logger.warn(`[TradingCircuitBreaker]   Count: ${this.config.maxConsecutiveLosses} consecutive losses`);
        logger.warn(`[TradingCircuitBreaker]   Total Loss: $${totalLoss.toFixed(2)} (${totalLossR.toFixed(2)}R)`);

        const reason = `Trading circuit breaker: ${this.config.maxConsecutiveLosses} consecutive losses`;
        const details = {
          consecutiveLosses: this.config.maxConsecutiveLosses,
          totalLoss,
          totalLossR,
          trades: lastNTrades.map(t => ({
            symbol: t.symbol,
            pnl: t.pnl_usd,
            date: t.date,
          })),
        };

        // Trigger kill switch
        await killSwitch.execute(userId, 'CIRCUIT_BREAKER', reason);

        // Send alert
        await slackNotifier.sendAlert({
          type: 'CRITICAL',
          message: `🚨 TRADING CIRCUIT BREAKER TRIGGERED\n\n` +
            `Reason: ${this.config.maxConsecutiveLosses} consecutive losses\n` +
            `Total Loss: $${totalLoss.toFixed(2)} (${totalLossR.toFixed(2)}R)\n` +
            `Bot has been stopped automatically.\n\n` +
            `Recent trades:\n` +
            lastNTrades.map(t => 
              `• ${t.symbol}: $${(t.pnl_usd || 0).toFixed(2)}`
            ).join('\n')
        });

        return {
          triggered: true,
          reason,
          details,
        };
      }

      return { triggered: false };

    } catch (error) {
      logger.error('[TradingCircuitBreaker] Error checking consecutive losses:', error);
      return { triggered: false };
    }
  }

  /**
   * Check for maximum drawdown exceeded
   */
  async checkMaxDrawdown(userId: Types.ObjectId): Promise<{
    triggered: boolean;
    reason?: string;
    details?: any;
  }> {
    try {
      const state = await BotState.findOne({ userId });
      if (!state) {
        return { triggered: false };
      }

      // Calculate drawdown percentage
      const drawdownPct = ((state.equity - state.startingEquity) / state.startingEquity) * 100;

      if (drawdownPct <= this.config.maxDrawdownPct) {
        logger.warn(`[TradingCircuitBreaker] 🚨 MAX DRAWDOWN EXCEEDED`);
        logger.warn(`[TradingCircuitBreaker]   Current: ${drawdownPct.toFixed(2)}%`);
        logger.warn(`[TradingCircuitBreaker]   Limit: ${this.config.maxDrawdownPct}%`);
        logger.warn(`[TradingCircuitBreaker]   Starting Equity: $${state.startingEquity.toFixed(2)}`);
        logger.warn(`[TradingCircuitBreaker]   Current Equity: $${state.equity.toFixed(2)}`);

        const reason = `Trading circuit breaker: Max drawdown exceeded (${drawdownPct.toFixed(1)}%)`;
        const details = {
          drawdownPct,
          maxDrawdownPct: this.config.maxDrawdownPct,
          startingEquity: state.startingEquity,
          currentEquity: state.equity,
          totalLoss: state.equity - state.startingEquity,
        };

        // Trigger kill switch
        await killSwitch.execute(userId, 'MAX_DRAWDOWN', reason);

        // Send alert
        await slackNotifier.sendAlert({
          type: 'CRITICAL',
          message: `🚨 TRADING CIRCUIT BREAKER TRIGGERED\n\n` +
            `Reason: Maximum drawdown exceeded\n` +
            `Current Drawdown: ${drawdownPct.toFixed(1)}%\n` +
            `Limit: ${this.config.maxDrawdownPct}%\n` +
            `Starting Equity: $${state.startingEquity.toFixed(2)}\n` +
            `Current Equity: $${state.equity.toFixed(2)}\n` +
            `Total Loss: $${(state.equity - state.startingEquity).toFixed(2)}\n\n` +
            `Bot has been stopped automatically.`
        });

        return {
          triggered: true,
          reason,
          details,
        };
      }

      // Warning if approaching limit (within 2%)
      if (drawdownPct <= this.config.maxDrawdownPct + 2) {
        logger.warn(`[TradingCircuitBreaker] ⚠️  Approaching max drawdown: ${drawdownPct.toFixed(2)}%`);
        
        await slackNotifier.sendAlert({
          type: 'WARNING',
          message: `⚠️ Approaching Maximum Drawdown\n\n` +
            `Current: ${drawdownPct.toFixed(1)}%\n` +
            `Limit: ${this.config.maxDrawdownPct}%\n` +
            `Remaining buffer: ${Math.abs(drawdownPct - this.config.maxDrawdownPct).toFixed(1)}%`
        });
      }

      return { triggered: false };

    } catch (error) {
      logger.error('[TradingCircuitBreaker] Error checking max drawdown:', error);
      return { triggered: false };
    }
  }

  /**
   * Check for rapid equity decline
   */
  async checkRapidDecline(userId: Types.ObjectId): Promise<{
    triggered: boolean;
    reason?: string;
    details?: any;
  }> {
    try {
      const state = await BotState.findOne({ userId });
      if (!state) {
        return { triggered: false };
      }

      // Get equity from 1 hour ago (if available)
      // This would require equity snapshots - simplified for now
      // TODO: Implement with EquitySnapshot model

      return { triggered: false };

    } catch (error) {
      logger.error('[TradingCircuitBreaker] Error checking rapid decline:', error);
      return { triggered: false };
    }
  }

  /**
   * Update circuit breaker configuration
   */
  updateConfig(newConfig: Partial<typeof this.config>): void {
    this.config = { ...this.config, ...newConfig };
    logger.info('[TradingCircuitBreaker] Configuration updated:', this.config);
  }

  /**
   * Get current configuration
   */
  getConfig() {
    return { ...this.config };
  }
}

export const tradingCircuitBreaker = new TradingCircuitBreaker();
export default tradingCircuitBreaker;
