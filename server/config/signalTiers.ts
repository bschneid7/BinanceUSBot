/**
 * Signal Tier Configuration
 * 
 * Single source of truth for all trading tier parameters.
 * Eliminates magic numbers and enables easy tier switching via environment variable.
 * 
 * Usage:
 *   import { ACTIVE_TIER, ACTIVE_PARAMS } from './signalTiers';
 *   
 *   if (largestMove < ACTIVE_PARAMS.impulsePct) {
 *     // Reject signal
 *   }
 * 
 * Switching Tiers:
 *   Set SIGNAL_TIER environment variable to one of: TIER_1_CONSERVATIVE, TIER_2_MODERATE, TIER_3_AGGRESSIVE
 */

export const TIERS = {
  /**
   * TIER_3_AGGRESSIVE
   * 
   * For ranging markets with 1-2% daily moves.
   * Higher frequency trading with smaller position sizes.
   * Lower ML confidence threshold to capture more opportunities.
   */
  TIER_3_AGGRESSIVE: {
    name: 'TIER_3_AGGRESSIVE',
    displayName: 'Tier 3: Aggressive',
    impulsePct: 0.5,           // Minimum price move to trigger signal (AGGRESSIVE: lowered from 1.5%)
    positionPct: 0.02,         // 2% of equity per trade (AGGRESSIVE: increased from 1%)
    maxPositions: 20,          // Maximum concurrent positions (AGGRESSIVE: increased from 15)
    minMlConf: 0.30,           // Minimum ML confidence (30%) - KEPT AS REQUESTED
    description: 'Aggressive tier for high-frequency trading with 0.5%+ moves',
    useCase: 'All market conditions, high frequency, aggressive profit-taking',
  },
  
  /**
   * TIER_2_MODERATE
   * 
   * For trending markets with 2-3% daily moves.
   * Balanced approach with moderate position sizes.
   * Standard ML confidence threshold.
   */
  TIER_2_MODERATE: {
    name: 'TIER_2_MODERATE',
    displayName: 'Tier 2: Moderate',
    impulsePct: 2.0,           // Minimum price move to trigger signal
    positionPct: 0.015,        // 1.5% of equity per trade
    maxPositions: 10,          // Maximum concurrent positions
    minMlConf: 0.50,           // Minimum ML confidence (50%)
    description: 'Moderate tier for trending markets with 2-3% daily moves',
    useCase: 'Trending markets, moderate volatility',
  },
  
  /**
   * TIER_1_CONSERVATIVE
   * 
   * For volatile markets with 3%+ daily moves.
   * Lower frequency trading with larger position sizes.
   * Higher ML confidence threshold for quality over quantity.
   */
  TIER_1_CONSERVATIVE: {
    name: 'TIER_1_CONSERVATIVE',
    displayName: 'Tier 1: Conservative',
    impulsePct: 2.5,           // Minimum price move to trigger signal
    positionPct: 0.02,         // 2% of equity per trade
    maxPositions: 8,           // Maximum concurrent positions
    minMlConf: 0.65,           // Minimum ML confidence (65%)
    description: 'Conservative tier for volatile markets with 3%+ daily moves',
    useCase: 'Volatile markets, high volatility',
  },
} as const;

export type TierName = keyof typeof TIERS;

/**
 * Active tier name from environment variable
 * Defaults to TIER_3_AGGRESSIVE if not set or invalid
 */
export const ACTIVE_TIER: TierName = (() => {
  const envTier = process.env.SIGNAL_TIER as TierName;
  
  if (envTier && TIERS[envTier]) {
    return envTier;
  }
  
  // Default to TIER_3_AGGRESSIVE
  return 'TIER_3_AGGRESSIVE';
})();

/**
 * Active tier parameters
 * Use this throughout the codebase instead of magic numbers
 */
export const ACTIVE_PARAMS = TIERS[ACTIVE_TIER];

/**
 * Validation: Ensure active tier is valid
 */
if (!TIERS[ACTIVE_TIER]) {
  throw new Error(
    `Invalid SIGNAL_TIER: ${process.env.SIGNAL_TIER}. ` +
    `Must be one of: ${Object.keys(TIERS).join(', ')}`
  );
}

/**
 * Log active tier on module load
 */
console.log(`[SignalTiers] Active tier: ${ACTIVE_TIER}`);
console.log(`[SignalTiers] Impulse threshold: ${ACTIVE_PARAMS.impulsePct}%`);
console.log(`[SignalTiers] Position size: ${ACTIVE_PARAMS.positionPct * 100}%`);
console.log(`[SignalTiers] Max positions: ${ACTIVE_PARAMS.maxPositions}`);
console.log(`[SignalTiers] Min ML confidence: ${ACTIVE_PARAMS.minMlConf * 100}%`);
