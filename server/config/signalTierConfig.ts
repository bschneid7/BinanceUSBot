/**
 * Signal Tier Configuration
 * 
 * Defines thresholds and parameters for tiered signal generation
 */

export interface SignalTierConfig {
  name: string;
  confidence_threshold: number; // ML confidence threshold (0-1)
  position_size_pct: number; // % of capital per position
  max_positions: number; // Max concurrent positions for this tier
  playbook_multipliers: {
    volume_mult: number; // Multiplier for volume requirement
    breakout_tolerance: number; // % tolerance for breakout level
    impulse_threshold: number; // % move required for impulse
    reversal_strength: number; // Strength requirement for reversal
  };
}

export const SIGNAL_TIERS: Record<string, SignalTierConfig> = {
  TIER_1_CONSERVATIVE: {
    name: 'Conservative',
    confidence_threshold: 0.70,
    position_size_pct: 2.5,
    max_positions: 5,
    playbook_multipliers: {
      volume_mult: 1.8, // Require 1.8x volume
      breakout_tolerance: 0.0, // Must be at/above breakout level
      impulse_threshold: 2.5, // 2.5% move required
      reversal_strength: 1.0, // Full strength reversal
    },
  },
  
  TIER_2_MODERATE: {
    name: 'Moderate',
    confidence_threshold: 0.50,
    position_size_pct: 1.5,
    max_positions: 10,
    playbook_multipliers: {
      volume_mult: 1.5, // Require 1.5x volume (relaxed)
      breakout_tolerance: 0.5, // Within 0.5% of breakout level
      impulse_threshold: 2.0, // 2.0% move required (relaxed)
      reversal_strength: 0.8, // 80% reversal strength
    },
  },
  
  TIER_3_AGGRESSIVE: {
    name: 'Aggressive',
    confidence_threshold: 0.30,
    position_size_pct: 1.0,
    max_positions: 15,
    playbook_multipliers: {
      volume_mult: 1.2, // Require 1.2x volume (very relaxed)
      breakout_tolerance: 1.0, // Within 1% of breakout level
      impulse_threshold: 1.5, // 1.5% move required (very relaxed)
      reversal_strength: 0.6, // 60% reversal strength
    },
  },
};

/**
 * Determine signal tier based on ML confidence and market conditions
 */
export function determineSignalTier(
  mlConfidence: number,
  enabledTiers: string[] = ['TIER_2_MODERATE']
): SignalTierConfig | null {
  // Check tiers in order of confidence (highest first)
  const tierOrder = ['TIER_1_CONSERVATIVE', 'TIER_2_MODERATE', 'TIER_3_AGGRESSIVE'];
  
  for (const tierId of tierOrder) {
    if (!enabledTiers.includes(tierId)) continue;
    
    const tier = SIGNAL_TIERS[tierId];
    if (mlConfidence >= tier.confidence_threshold) {
      return tier;
    }
  }
  
  return null; // No tier meets confidence threshold
}

export default SIGNAL_TIERS;
