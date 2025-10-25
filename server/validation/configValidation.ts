import { z } from 'zod';

/**
 * Zod Validation Schemas for Bot Configuration
 * 
 * Provides runtime validation for bot configuration with detailed error messages
 */

// Bot status enum
export const BotStatusSchema = z.enum(['ACTIVE', 'HALTED_DAILY', 'HALTED_WEEKLY', 'STOPPED'], {
  errorMap: () => ({ message: 'Bot status must be one of: ACTIVE, HALTED_DAILY, HALTED_WEEKLY, STOPPED' })
});

// Halt metadata
export const HaltMetadataSchema = z.object({
  reason: z.string().optional(),
  timestamp: z.date().optional(),
  justification: z.string().optional(),
  positionsFlattened: z.number().int().min(0).optional()
}).optional();

// Scanner configuration
export const ScannerConfigSchema = z.object({
  pairs: z.array(z.string().regex(/^[A-Z]+USD[T]?$/, 'Symbol must be uppercase and end with USD or USDT'))
    .min(1, 'At least one trading pair is required')
    .max(50, 'Maximum 50 trading pairs allowed'),
  
  refresh_ms: z.number()
    .int('Refresh interval must be an integer')
    .min(1000, 'Refresh interval must be at least 1 second')
    .max(300000, 'Refresh interval cannot exceed 5 minutes'),
  
  min_volume_usd_24h: z.number()
    .min(0, 'Minimum volume must be non-negative')
    .max(1000000000, 'Minimum volume seems unreasonably high'),
  
  max_spread_bps: z.number()
    .min(0, 'Max spread must be non-negative')
    .max(1000, 'Max spread cannot exceed 10%'),
  
  max_spread_bps_event: z.number()
    .min(0, 'Max spread (event) must be non-negative')
    .max(1000, 'Max spread (event) cannot exceed 10%'),
  
  tob_min_depth_usd: z.number()
    .min(0, 'Minimum depth must be non-negative')
    .max(10000000, 'Minimum depth seems unreasonably high'),
  
  pair_signal_cooldown_min: z.number()
    .int('Cooldown must be an integer')
    .min(0, 'Cooldown must be non-negative')
    .max(1440, 'Cooldown cannot exceed 24 hours')
});

// Risk configuration
export const RiskConfigSchema = z.object({
  R_pct: z.number()
    .min(0.001, 'R percentage must be at least 0.1%')
    .max(0.10, 'R percentage cannot exceed 10%'),
  
  max_r_per_trade: z.number()
    .min(0.1, 'Max R per trade must be at least 0.1')
    .max(10, 'Max R per trade cannot exceed 10'),
  
  daily_stop_R: z.number()
    .min(1, 'Daily stop must be at least 1R')
    .max(50, 'Daily stop cannot exceed 50R'),
  
  weekly_stop_R: z.number()
    .min(1, 'Weekly stop must be at least 1R')
    .max(100, 'Weekly stop cannot exceed 100R'),
  
  max_open_R: z.number()
    .min(1, 'Max open R must be at least 1')
    .max(50, 'Max open R cannot exceed 50'),
  
  max_exposure_pct: z.number()
    .min(0.1, 'Max exposure must be at least 10%')
    .max(1.0, 'Max exposure cannot exceed 100%'),
  
  max_positions: z.number()
    .int('Max positions must be an integer')
    .min(1, 'At least 1 position must be allowed')
    .max(50, 'Maximum 50 positions allowed'),
  
  correlation_guard: z.boolean(),
  
  slippage_guard_bps: z.number()
    .min(0, 'Slippage guard must be non-negative')
    .max(1000, 'Slippage guard cannot exceed 10%'),
  
  slippage_guard_bps_event: z.number()
    .min(0, 'Slippage guard (event) must be non-negative')
    .max(1000, 'Slippage guard (event) cannot exceed 10%')
}).refine(
  data => data.weekly_stop_R >= data.daily_stop_R,
  { message: 'Weekly stop must be greater than or equal to daily stop' }
);

// Reserve configuration
export const ReserveConfigSchema = z.object({
  target_pct: z.number()
    .min(0, 'Target percentage must be non-negative')
    .max(1.0, 'Target percentage cannot exceed 100%'),
  
  floor_pct: z.number()
    .min(0, 'Floor percentage must be non-negative')
    .max(1.0, 'Floor percentage cannot exceed 100%'),
  
  refill_from_profits_pct: z.number()
    .min(0, 'Refill percentage must be non-negative')
    .max(1.0, 'Refill percentage cannot exceed 100%')
}).refine(
  data => data.target_pct >= data.floor_pct,
  { message: 'Target percentage must be greater than or equal to floor percentage' }
);

// Playbook A configuration (Breakout)
export const PlaybookAConfigSchema = z.object({
  enable: z.boolean(),
  
  volume_mult: z.number()
    .min(1, 'Volume multiplier must be at least 1')
    .max(10, 'Volume multiplier cannot exceed 10'),
  
  stop_atr_mult: z.number()
    .min(0.5, 'Stop ATR multiplier must be at least 0.5')
    .max(5, 'Stop ATR multiplier cannot exceed 5'),
  
  breakeven_R: z.number()
    .min(0.5, 'Breakeven R must be at least 0.5')
    .max(5, 'Breakeven R cannot exceed 5'),
  
  scale_R: z.number()
    .min(0.5, 'Scale R must be at least 0.5')
    .max(10, 'Scale R cannot exceed 10'),
  
  scale_pct: z.number()
    .min(0.1, 'Scale percentage must be at least 10%')
    .max(1.0, 'Scale percentage cannot exceed 100%'),
  
  trail_atr_mult: z.number()
    .min(0.5, 'Trail ATR multiplier must be at least 0.5')
    .max(5, 'Trail ATR multiplier cannot exceed 5')
});

// Playbook B configuration (Mean Reversion)
export const PlaybookBConfigSchema = z.object({
  enable: z.boolean(),
  
  deviation_atr_mult: z.number()
    .min(0.5, 'Deviation ATR multiplier must be at least 0.5')
    .max(5, 'Deviation ATR multiplier cannot exceed 5'),
  
  stop_atr_mult: z.number()
    .min(0.5, 'Stop ATR multiplier must be at least 0.5')
    .max(5, 'Stop ATR multiplier cannot exceed 5'),
  
  time_stop_min: z.number()
    .int('Time stop must be an integer')
    .min(1, 'Time stop must be at least 1 minute')
    .max(1440, 'Time stop cannot exceed 24 hours'),
  
  target_R: z.number()
    .min(0.5, 'Target R must be at least 0.5')
    .max(10, 'Target R cannot exceed 10'),
  
  max_trades_per_session: z.number()
    .int('Max trades per session must be an integer')
    .min(1, 'At least 1 trade per session must be allowed')
    .max(50, 'Maximum 50 trades per session allowed')
});

// Playbook C configuration (Event-Driven)
export const PlaybookCConfigSchema = z.object({
  enable: z.boolean(),
  
  event_window_min: z.number()
    .int('Event window must be an integer')
    .min(1, 'Event window must be at least 1 minute')
    .max(60, 'Event window cannot exceed 1 hour'),
  
  stop_atr_mult: z.number()
    .min(0.5, 'Stop ATR multiplier must be at least 0.5')
    .max(5, 'Stop ATR multiplier cannot exceed 5'),
  
  scale_1_R: z.number()
    .min(0.5, 'Scale 1 R must be at least 0.5')
    .max(10, 'Scale 1 R cannot exceed 10'),
  
  scale_1_pct: z.number()
    .min(0.1, 'Scale 1 percentage must be at least 10%')
    .max(1.0, 'Scale 1 percentage cannot exceed 100%'),
  
  scale_2_R: z.number()
    .min(0.5, 'Scale 2 R must be at least 0.5')
    .max(10, 'Scale 2 R cannot exceed 10'),
  
  scale_2_pct: z.number()
    .min(0.1, 'Scale 2 percentage must be at least 10%')
    .max(1.0, 'Scale 2 percentage cannot exceed 100%'),
  
  trail_atr_mult: z.number()
    .min(0.5, 'Trail ATR multiplier must be at least 0.5')
    .max(5, 'Trail ATR multiplier cannot exceed 5')
}).refine(
  data => data.scale_2_R > data.scale_1_R,
  { message: 'Scale 2 R must be greater than Scale 1 R' }
);

// Playbook D configuration (Manual)
export const PlaybookDConfigSchema = z.object({
  enable: z.boolean(),
  
  stop_atr_mult: z.number()
    .min(0.5, 'Stop ATR multiplier must be at least 0.5')
    .max(5, 'Stop ATR multiplier cannot exceed 5')
});

// Grid trading configuration
export const GridTradingConfigSchema = z.object({
  symbol: z.string().regex(/^[A-Z]+USD[T]?$/, 'Symbol must be uppercase and end with USD or USDT'),
  
  lowerBound: z.number()
    .positive('Lower bound must be positive'),
  
  upperBound: z.number()
    .positive('Upper bound must be positive'),
  
  gridLevels: z.number()
    .int('Grid levels must be an integer')
    .min(2, 'At least 2 grid levels required')
    .max(100, 'Maximum 100 grid levels allowed'),
  
  orderSize: z.number()
    .min(10, 'Order size must be at least $10')
    .max(100000, 'Order size cannot exceed $100,000'),
  
  enabled: z.boolean()
}).refine(
  data => data.upperBound > data.lowerBound,
  { message: 'Upper bound must be greater than lower bound' }
).optional();

// Multi-pair grid trading configuration
export const GridTradingMultiPairConfigSchema = z.object({
  enabled: z.boolean(),
  pairs: z.array(GridTradingConfigSchema.required())
}).optional();

// Complete bot configuration schema
export const BotConfigSchema = z.object({
  botStatus: BotStatusSchema,
  haltMetadata: HaltMetadataSchema,
  scanner: ScannerConfigSchema,
  risk: RiskConfigSchema,
  reserve: ReserveConfigSchema,
  playbook_A: PlaybookAConfigSchema,
  playbook_B: PlaybookBConfigSchema,
  playbook_C: PlaybookCConfigSchema,
  playbook_D: PlaybookDConfigSchema,
  gridTrading: GridTradingConfigSchema,
  gridTradingMultiPair: GridTradingMultiPairConfigSchema
}).strict();

export type BotConfigInput = z.infer<typeof BotConfigSchema>;

/**
 * Validate bot configuration
 * Throws ValidationError if invalid
 */
export function validateBotConfig(config: any): BotConfigInput {
  return BotConfigSchema.parse(config);
}

/**
 * Validate bot configuration with detailed error reporting
 * Returns { success: true, data } or { success: false, errors }
 */
export function validateBotConfigSafe(config: any): 
  | { success: true; data: BotConfigInput }
  | { success: false; errors: Array<{ field: string; message: string }> } {
  
  const result = BotConfigSchema.safeParse(config);
  
  if (result.success) {
    return { success: true, data: result.data };
  }
  
  const errors = result.error.errors.map(err => ({
    field: err.path.join('.'),
    message: err.message
  }));
  
  return { success: false, errors };
}

/**
 * Validate partial bot configuration (for updates)
 */
export const PartialBotConfigSchema = BotConfigSchema.partial();

export function validatePartialBotConfig(config: any): Partial<BotConfigInput> {
  return PartialBotConfigSchema.parse(config);
}

