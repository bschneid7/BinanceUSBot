import { Types } from 'mongoose';
import BotConfig from '../../models/BotConfig';
import BotState from '../../models/BotState';
import riskEngine from './riskEngine';
import exchangeInfoCache from '../exchangeInfoCache';
import { RISK_LIMITS, SLIPPAGE } from './constants';

/**
 * Policy Guardrails Service
 * Enforces invariants and safety rules before any trade execution
 */

export interface PreTradeCheckResult {
  approved: boolean;
  reason?: string;
  gate?: string; // Which gate failed
}

export class PolicyGuardrails {
  /**
   * INVARIANT 1: Spot-only enforcement
   * Disallow any exchange "short" positions on Binance.US Spot
   * SHORT may only be used internally for PnL orientation, never for order creation
   */
  enforceSpotOnly(action: 'BUY' | 'SELL', side: 'LONG' | 'SHORT'): PreTradeCheckResult {
    // On Binance.US Spot, we can only:
    // - BUY to open LONG positions
    // - SELL to close LONG positions
    // We CANNOT create SHORT positions (no margin/futures on Binance.US)
    
    // CRITICAL FIX: SELL orders are ALWAYS used to close LONG positions on Spot
    // The 'side' parameter here refers to the position being closed, not the order direction
    // So SELL + SHORT side means "closing a SHORT position" which is impossible on Spot
    // But in practice, all positions should be LONG, so we allow all SELL orders
    
    // Only block if trying to open a SHORT position (which would be BUY with side=SHORT)
    // This should never happen, but add as safety check
    if (side === 'SHORT' && action === 'BUY') {
      return {
        approved: false,
        reason: 'Cannot open SHORT positions on Binance.US Spot. Only LONG positions are supported.',
        gate: 'spot_only',
      };
    }

    // Allow all SELL orders - they close existing positions
    // Allow BUY orders with side=LONG - they open new positions
    return { approved: true };
  }

  /**
   * INVARIANT 2: Per-trade R clamp
   * Never exceed max_r_per_trade for any single position
   */
  async enforcePerTradeRClamp(
    userId: Types.ObjectId,
    proposedRiskR: number
  ): PreTradeCheckResult {
    // Validate input
    if (!proposedRiskR || isNaN(proposedRiskR) || proposedRiskR <= 0) {
      return { approved: false, reason: 'Invalid risk value', gate: 'r_clamp' };
    }

    try {
      const config = await BotConfig.findOne({ userId });
      if (!config) {
        return { approved: false, reason: 'Bot configuration not found', gate: 'r_clamp' };
      }

      const maxRPerTrade = config.risk?.max_r_per_trade ?? RISK_LIMITS.MAX_R_PER_TRADE;

      if (proposedRiskR > maxRPerTrade) {
        return {
          approved: false,
          reason: `Proposed risk ${proposedRiskR.toFixed(2)}R exceeds max ${maxRPerTrade}R per trade`,
          gate: 'r_clamp',
        };
      }

      return { approved: true };
    } catch (error) {
      console.error('[PolicyGuardrails] Error checking R clamp:', error);
      return {
        approved: false,
        reason: error instanceof Error ? error.message : 'Unknown error',
        gate: 'r_clamp',
      };
    }
  }

  /**
   * INVARIANT 3: Kill-switch stickiness
   * When tripped (daily/weekly), no new risk until:
   * - Daily: Auto-resume at next session boundary (next day)
   * - Weekly: Human reset (admin+2FA) required
   */
  async enforceKillSwitchStickiness(userId: Types.ObjectId): PreTradeCheckResult {
    try {
      const config = await BotConfig.findOne({ userId });
      if (!config) {
        return { approved: false, reason: 'Bot configuration not found', gate: 'kill_switch' };
      }

      // Check if bot is halted
      if (config.botStatus === 'HALTED_DAILY') {
        return {
          approved: false,
          reason: 'Trading halted due to daily loss limit. Will auto-resume tomorrow.',
          gate: 'kill_switch',
        };
      }

      if (config.botStatus === 'HALTED_WEEKLY') {
        return {
          approved: false,
          reason: 'Trading halted due to weekly loss limit. Requires admin reset.',
          gate: 'kill_switch',
        };
      }

      // Check if kill-switch should be triggered now
      const killSwitchResult = await riskEngine.checkKillSwitch(userId);
      if (killSwitchResult.shouldHalt) {
        return {
          approved: false,
          reason: killSwitchResult.reason || 'Kill-switch triggered',
          gate: 'kill_switch',
        };
      }

      return { approved: true };
    } catch (error) {
      console.error('[PolicyGuardrails] Error checking kill-switch stickiness:', error);
      return {
        approved: false,
        reason: error instanceof Error ? error.message : 'Unknown error',
        gate: 'kill_switch',
      };
    }
  }

  /**
   * INVARIANT 4: Exchange filters (LOT_SIZE, PRICE_FILTER, MIN_NOTIONAL)
   * Validate order parameters against exchange rules before submission
   */
  async enforceExchangeFilters(
    symbol: string,
    quantity: number,
    price: number
  ): PreTradeCheckResult {
    try {
      // CRITICAL FIX: validateOrder expects (symbol, price, quantity) not (symbol, quantity, price)
      const validation = await exchangeInfoCache.validateOrder(symbol, price, quantity);
      
      if (!validation.valid) {
        console.error(`[PolicyGuardrails] Exchange filter validation failed for ${symbol}:`);
        console.error(`  Price: ${price}, Quantity: ${quantity}`);
        console.error(`  Error: ${validation.error || validation.reason || 'Unknown'}`);
        return {
          approved: false,
          reason: validation.error || validation.reason || 'Exchange filter validation failed',
          gate: 'exchange_filters',
        };
      }

      return { approved: true };
    } catch (error) {
      console.error('[PolicyGuardrails] Error checking exchange filters:', error);
      return {
        approved: false,
        reason: error instanceof Error ? error.message : 'Unknown error',
        gate: 'exchange_filters',
      };
    }
  }

  /**
   * INVARIANT 5: Slippage guard
   * Reject orders if pre-trade slippage exceeds limits
   */
  async enforceSlippageGuard(
    userId: Types.ObjectId,
    signalPrice: number,
    currentPrice: number,
    isEvent: boolean
  ): PreTradeCheckResult {
    // Validate inputs
    if (!signalPrice || signalPrice <= 0 || !currentPrice || currentPrice <= 0) {
      return { approved: false, reason: 'Invalid price data', gate: 'slippage' };
    }

    try {
      const config = await BotConfig.findOne({ userId });
      if (!config) {
        return { approved: false, reason: 'Bot configuration not found', gate: 'slippage' };
      }

      const slippageBps = Math.abs((currentPrice - signalPrice) / signalPrice) * 10000;
      
      // Use constants as fallback
      const maxSlippageBps = isEvent 
        ? (config.risk?.slippage_guard_bps_event ?? SLIPPAGE.MAX_EVENT_BPS)
        : (config.risk?.slippage_guard_bps ?? SLIPPAGE.MAX_NORMAL_BPS);

      if (slippageBps > maxSlippageBps) {
        return {
          approved: false,
          reason: `Pre-trade slippage ${slippageBps.toFixed(2)}bps exceeds limit ${maxSlippageBps}bps`,
          gate: 'slippage',
        };
      }

      return { approved: true };
    } catch (error) {
      console.error('[PolicyGuardrails] Error checking slippage guard:', error);
      return {
        approved: false,
        reason: error instanceof Error ? error.message : 'Unknown error',
        gate: 'slippage',
      };
    }
  }

  /**
   * INVARIANT 6: Exposure limits
   * Check max positions, max open R, and max exposure percentage
   */
  async enforceExposureLimits(
    userId: Types.ObjectId,
    symbol: string,
    proposedRiskR: number,
    proposedNotional: number
  ): PreTradeCheckResult {
    try {
      const riskCheck = await riskEngine.checkRiskLimits(
        userId,
        symbol,
        proposedRiskR,
        proposedNotional
      );

      if (!riskCheck.approved) {
        return {
          approved: false,
          reason: riskCheck.reason || 'Risk limits exceeded',
          gate: 'exposure',
        };
      }

      return { approved: true };
    } catch (error) {
      console.error('[PolicyGuardrails] Error checking exposure limits:', error);
      return {
        approved: false,
        reason: error instanceof Error ? error.message : 'Unknown error',
        gate: 'exposure',
      };
    }
  }

  /**
   * MASTER PRE-TRADE GATE
   * All orders must pass ALL gates before execution
   * Gates are checked in order of computational cost (cheapest first)
   */
  async checkAllPreTradeGates(params: {
    userId: Types.ObjectId;
    symbol: string;
    action: 'BUY' | 'SELL';
    side: 'LONG' | 'SHORT';
    quantity: number;
    price: number;
    signalPrice: number;
    proposedRiskR: number;
    proposedNotional: number;
    isEvent: boolean;
    isClosing?: boolean; // Skip exposure limits for closing orders
  }): Promise<PreTradeCheckResult> {
    console.log(`[PolicyGuardrails] Running pre-trade gates for ${params.symbol} ${params.action}`);

    // Gate 1: Spot-only enforcement (cheapest - in-memory)
    const spotCheck = this.enforceSpotOnly(params.action, params.side);
    if (!spotCheck.approved) {
      console.log(`[PolicyGuardrails] ❌ GATE 1 FAILED: ${spotCheck.reason}`);
      return spotCheck;
    }
    console.log('[PolicyGuardrails] ✅ Gate 1 passed: Spot-only');

    // Gate 2: Per-trade R clamp (cheap - single DB query)
    const rClampCheck = await this.enforcePerTradeRClamp(params.userId, params.proposedRiskR);
    if (!rClampCheck.approved) {
      console.log(`[PolicyGuardrails] ❌ GATE 2 FAILED: ${rClampCheck.reason}`);
      return rClampCheck;
    }
    console.log('[PolicyGuardrails] ✅ Gate 2 passed: R clamp');

    // Gate 3: Kill-switch stickiness (moderate - DB query + logic)
    const killSwitchCheck = await this.enforceKillSwitchStickiness(params.userId);
    if (!killSwitchCheck.approved) {
      console.log(`[PolicyGuardrails] ❌ GATE 3 FAILED: ${killSwitchCheck.reason}`);
      return killSwitchCheck;
    }
    console.log('[PolicyGuardrails] ✅ Gate 3 passed: Kill-switch');

    // Gate 4: Exchange filters (moderate - cached data)
    const filtersCheck = await this.enforceExchangeFilters(params.symbol, params.quantity, params.price);
    if (!filtersCheck.approved) {
      console.log(`[PolicyGuardrails] ❌ GATE 4 FAILED: ${filtersCheck.reason}`);
      return filtersCheck;
    }
    console.log('[PolicyGuardrails] ✅ Gate 4 passed: Exchange filters');

    // Gate 5: Slippage guard (cheap - calculation only)
    const slippageCheck = await this.enforceSlippageGuard(
      params.userId,
      params.signalPrice,
      params.price,
      params.isEvent
    );
    if (!slippageCheck.approved) {
      console.log(`[PolicyGuardrails] ❌ GATE 5 FAILED: ${slippageCheck.reason}`);
      return slippageCheck;
    }
    console.log('[PolicyGuardrails] ✅ Gate 5 passed: Slippage');

    // Gate 6: Exposure limits (expensive - multiple DB queries + calculations)
    // SKIP for closing orders to prevent infinite recursion
    if (!params.isClosing) {
      const exposureCheck = await this.enforceExposureLimits(
        params.userId,
        params.symbol,
        params.proposedRiskR,
        params.proposedNotional
      );
      if (!exposureCheck.approved) {
        console.log(`[PolicyGuardrails] ❌ GATE 6 FAILED: ${exposureCheck.reason}`);
        return exposureCheck;
      }
      console.log('[PolicyGuardrails] ✅ Gate 6 passed: Exposure limits');
    } else {
      console.log('[PolicyGuardrails] ⏭️  Gate 6 skipped: Closing order (reduces risk)');
    }

    console.log('[PolicyGuardrails] ✅ ALL GATES PASSED - Order approved for execution');
    return { approved: true };
  }

  /**
   * Admin reset for weekly kill-switch
   * Requires admin role + 2FA (enforced by route middleware)
   */
  async resetWeeklyKillSwitch(userId: Types.ObjectId, adminUserId: Types.ObjectId): Promise<void> {
    try {
      const config = await BotConfig.findOne({ userId });
      if (!config) {
        throw new Error('Bot configuration not found');
      }

      if (config.botStatus !== 'HALTED_WEEKLY') {
        throw new Error('Bot is not halted weekly');
      }

      console.log(`[PolicyGuardrails] Admin ${adminUserId} resetting weekly kill-switch for user ${userId}`);

      config.botStatus = 'ACTIVE';
      config.haltMetadata = {
        reason: `Admin reset by ${adminUserId}`,
        timestamp: new Date(),
      };

      await config.save();

      console.log('[PolicyGuardrails] Weekly kill-switch reset successfully');
    } catch (error) {
      console.error('[PolicyGuardrails] Error resetting weekly kill-switch:', error);
      throw error;
    }
  }
}

export default new PolicyGuardrails();

