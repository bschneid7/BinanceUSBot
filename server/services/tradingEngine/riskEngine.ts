import { Types } from 'mongoose';
import Position from '../../models/Position';
import BotConfig from '../../models/BotConfig';
import BotState from '../../models/BotState';

export interface RiskCheckResult {
  approved: boolean;
  reason?: string;
  maxQuantity?: number;
}

export class RiskEngine {
  /**
   * Calculate position size based on R and stop distance
   */
  calculatePositionSize(
    entryPrice: number,
    stopPrice: number,
    riskAmount: number
  ): number {
    const riskPerUnit = Math.abs(entryPrice - stopPrice);
    if (riskPerUnit === 0) {
      throw new Error('Entry price and stop price cannot be the same');
    }
    return riskAmount / riskPerUnit;
  }

  /**
   * Check if a new position passes all risk limits
   */
  async checkRiskLimits(
    userId: Types.ObjectId,
    symbol: string,
    proposedRiskR: number,
    proposedNotional: number
  ): Promise<RiskCheckResult> {
    try {
      console.log(`[RiskEngine] Checking risk limits for ${symbol} - Risk: ${proposedRiskR}R, Notional: $${proposedNotional}`);

      const config = await BotConfig.findOne({ userId });
      if (!config) {
        return { approved: false, reason: 'Bot configuration not found' };
      }

      const state = await BotState.findOne({ userId });
      if (!state) {
        return { approved: false, reason: 'Bot state not found' };
      }

      // Get open positions
      const openPositions = await Position.find({ userId, status: 'OPEN' });
      console.log(`[RiskEngine] Found ${openPositions.length} open positions`);

      // Calculate current open risk
      let currentOpenRiskR = 0;
      let currentExposure = 0;

      openPositions.forEach(position => {
        // Calculate risk in R for each position
        const riskAmount = Math.abs(position.entry_price - position.stop_price) * position.quantity;
        const riskR = state.currentR > 0 ? riskAmount / state.currentR : 0;
        currentOpenRiskR += riskR;

        // Calculate exposure
        const notional = (position.current_price || position.entry_price) * position.quantity;
        currentExposure += notional;
      });

      console.log(`[RiskEngine] Current open risk: ${currentOpenRiskR.toFixed(2)}R, Current exposure: $${currentExposure.toFixed(2)}`);

      // Check 1: Max open risk
      const totalOpenRiskR = currentOpenRiskR + proposedRiskR;
      if (totalOpenRiskR > config.risk.max_open_R) {
        console.log(`[RiskEngine] REJECTED: Total open risk ${totalOpenRiskR.toFixed(2)}R exceeds max ${config.risk.max_open_R}R`);
        return {
          approved: false,
          reason: `Total open risk ${totalOpenRiskR.toFixed(2)}R exceeds maximum ${config.risk.max_open_R}R`,
        };
      }

      // Check 2: Max positions
      if (openPositions.length >= config.risk.max_positions) {
        console.log(`[RiskEngine] REJECTED: Max positions (${config.risk.max_positions}) reached`);
        return {
          approved: false,
          reason: `Maximum ${config.risk.max_positions} positions already open`,
        };
      }

      // Check 3: Max exposure
      const totalExposure = currentExposure + proposedNotional;
      const maxExposure = state.equity * config.risk.max_exposure_pct;
      if (totalExposure > maxExposure) {
        console.log(`[RiskEngine] REJECTED: Total exposure $${totalExposure.toFixed(2)} exceeds max $${maxExposure.toFixed(2)}`);
        return {
          approved: false,
          reason: `Total exposure $${totalExposure.toFixed(2)} exceeds maximum ${(config.risk.max_exposure_pct * 100).toFixed(0)}% of equity`,
        };
      }

      // Check 4: Correlation guard
      if (config.risk.correlation_guard && symbol !== 'BTCUSDT') {
        const btcPosition = openPositions.find(p => p.symbol === 'BTCUSDT');
        if (btcPosition) {
          const btcRiskAmount = Math.abs(btcPosition.entry_price - btcPosition.stop_price) * btcPosition.quantity;
          const btcRiskR = state.currentR > 0 ? btcRiskAmount / state.currentR : 0;

          if (btcRiskR >= 1.0) {
            console.log(`[RiskEngine] WARNING: BTC risk is ${btcRiskR.toFixed(2)}R - scaling down correlated alt`);
            // Scale down proposed position by 50%
            return {
              approved: true,
              maxQuantity: 0.5, // Factor to scale down
              reason: 'Position scaled down due to BTC correlation guard',
            };
          }
        }
      }

      console.log(`[RiskEngine] APPROVED: All risk checks passed`);
      return { approved: true };
    } catch (error) {
      console.error('[RiskEngine] Error checking risk limits:', error);
      return {
        approved: false,
        reason: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Calculate slippage in basis points
   */
  calculateSlippage(midPrice: number, fillPrice: number): number {
    return Math.abs((fillPrice - midPrice) / midPrice) * 10000;
  }

  /**
   * Check if slippage is acceptable
   */
  checkSlippage(
    slippageBps: number,
    isEvent: boolean,
    config: { slippage_guard_bps: number; slippage_guard_bps_event: number }
  ): { approved: boolean; reason?: string } {
    const maxSlippage = isEvent
      ? config.slippage_guard_bps_event
      : config.slippage_guard_bps;

    if (slippageBps > maxSlippage) {
      console.log(`[RiskEngine] Slippage ${slippageBps.toFixed(2)} bps exceeds limit ${maxSlippage} bps`);
      return {
        approved: false,
        reason: `Slippage ${slippageBps.toFixed(2)} bps exceeds limit ${maxSlippage} bps`,
      };
    }

    return { approved: true };
  }

  /**
   * Update daily and weekly PnL tracking
   */
  async updatePnLTracking(userId: Types.ObjectId): Promise<void> {
    try {
      const state = await BotState.findOne({ userId });
      if (!state) {
        throw new Error('Bot state not found');
      }

      const now = new Date();

      // Check if we need to reset daily counters
      const currentSessionStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      if (state.sessionStartDate < currentSessionStart) {
        console.log('[RiskEngine] New trading day detected - resetting daily PnL and Playbook B counters');
        state.dailyPnl = 0;
        state.dailyPnlR = 0;
        state.sessionStartDate = currentSessionStart;
        
        // Reset Playbook B session counters
        state.playbookBCounters.clear();
      }

      // Check if we need to reset weekly counters
      const dayOfWeek = now.getDay();
      const currentWeekStart = new Date(now);
      currentWeekStart.setDate(now.getDate() - dayOfWeek);
      currentWeekStart.setHours(0, 0, 0, 0);

      if (state.weekStartDate < currentWeekStart) {
        console.log('[RiskEngine] New trading week detected - resetting weekly PnL');
        state.weeklyPnl = 0;
        state.weeklyPnlR = 0;
        state.weekStartDate = currentWeekStart;
      }

      await state.save();
    } catch (error) {
      console.error('[RiskEngine] Error updating PnL tracking:', error);
      throw error;
    }
  }

  /**
   * Check if kill-switch should be triggered
   */
  async checkKillSwitch(userId: Types.ObjectId): Promise<{
    shouldHalt: boolean;
    haltType?: 'DAILY' | 'WEEKLY';
    reason?: string;
  }> {
    try {
      const config = await BotConfig.findOne({ userId });
      const state = await BotState.findOne({ userId });

      if (!config || !state) {
        return { shouldHalt: false };
      }

      // Check daily loss limit
      if (state.dailyPnlR <= config.risk.daily_stop_R) {
        console.log(`[RiskEngine] KILL-SWITCH TRIGGERED: Daily loss ${state.dailyPnlR.toFixed(2)}R <= ${config.risk.daily_stop_R}R`);
        return {
          shouldHalt: true,
          haltType: 'DAILY',
          reason: `Daily loss limit reached: ${state.dailyPnlR.toFixed(2)}R`,
        };
      }

      // Check weekly loss limit
      if (state.weeklyPnlR <= config.risk.weekly_stop_R) {
        console.log(`[RiskEngine] KILL-SWITCH TRIGGERED: Weekly loss ${state.weeklyPnlR.toFixed(2)}R <= ${config.risk.weekly_stop_R}R`);
        return {
          shouldHalt: true,
          haltType: 'WEEKLY',
          reason: `Weekly loss limit reached: ${state.weeklyPnlR.toFixed(2)}R`,
        };
      }

      return { shouldHalt: false };
    } catch (error) {
      console.error('[RiskEngine] Error checking kill-switch:', error);
      return { shouldHalt: false };
    }
  }
}

export default new RiskEngine();
