/**
 * Trading Bot Constants
 * 
 * Centralized configuration for all magic numbers and thresholds.
 * Modify these values to tune bot behavior without changing code.
 */

// ============================================================================
// RISK MANAGEMENT
// ============================================================================

export const RISK = {
  /** Default R value as percentage of equity (0.6% = 0.006) */
  DEFAULT_R_PERCENTAGE: 0.006,
  
  /** Maximum risk per trade in R units */
  MAX_R_PER_TRADE: 1.5,
  
  /** Maximum total open risk in R units */
  MAX_OPEN_R: 4.0,
  
  /** Fallback R value if equity calculation fails */
  FALLBACK_R_VALUE: 100,
} as const;

// ============================================================================
// POSITION MANAGEMENT
// ============================================================================

export const POSITION = {
  /** Maximum price deviation from current price (50%) */
  MAX_PRICE_DEVIATION_PCT: 0.5,
  
  /** Price decay threshold for switching to market order (0.2%) */
  PRICE_DECAY_THRESHOLD_PCT: 0.002,
  
  /** Minimum position value in USD to avoid dust */
  MIN_POSITION_VALUE_USD: 10,
  
  /** Stop loss distance percentage for imported positions */
  DEFAULT_STOP_LOSS_PCT: 0.05, // 5% below entry
  
  /** Target distance percentage for imported positions */
  DEFAULT_TARGET_PCT: 0.10, // 10% above entry
} as const;

// ============================================================================
// STOP LOSS MONITOR
// ============================================================================

export const STOP_LOSS_MONITOR = {
  /** Check interval in milliseconds (30 seconds) */
  CHECK_INTERVAL_MS: 30000,
  
  /** Maximum retry attempts for closing positions */
  MAX_RETRIES: 3,
  
  /** Base delay for exponential backoff in milliseconds */
  RETRY_BASE_DELAY_MS: 1000,
  
  /** Distance from stop loss to send warning (5%) */
  WARNING_DISTANCE_PCT: 0.05,
  
  /** Critical warning distance from stop loss (2%) */
  CRITICAL_WARNING_DISTANCE_PCT: 0.02,
} as const;

// ============================================================================
// MARKET SCANNER
// ============================================================================

export const MARKET_SCANNER = {
  /** Minimum 24h volume in USD */
  MIN_VOLUME_USD: 1000,
  
  /** Maximum spread in basis points (50 bps = 0.5%) */
  MAX_SPREAD_BPS: 50,
  
  /** Minimum top-of-book depth in USD */
  MIN_TOB_DEPTH_USD: 10,
  
  /** Scan interval in milliseconds (60 seconds) */
  SCAN_INTERVAL_MS: 60000,
} as const;

// ============================================================================
// SIGNAL GENERATION (PLAYBOOKS)
// ============================================================================

export const PLAYBOOK_A = {
  /** Breakout threshold percentage */
  BREAKOUT_THRESHOLD_PCT: 0.005, // 0.5%
} as const;

export const PLAYBOOK_B = {
  /** Reversal pattern detection threshold */
  REVERSAL_THRESHOLD_PCT: 0.01, // 1%
} as const;

export const PLAYBOOK_C = {
  /** Minimum impulse move percentage */
  MIN_IMPULSE_PCT: 0.005, // 0.5%
  
  /** Minimum pullback percentage */
  MIN_PULLBACK_PCT: 0.005, // 0.5%
  
  /** Maximum pullback percentage */
  MAX_PULLBACK_PCT: 0.02, // 2%
} as const;

export const PLAYBOOK_D = {
  /** Flash crash threshold in standard deviations */
  FLASH_CRASH_THRESHOLD_SIGMA: -1.0,
} as const;

export const PLAYBOOK_E = {
  /** RSI oversold threshold */
  RSI_OVERSOLD: 40,
  
  /** Maximum decline percentage */
  MAX_DECLINE_PCT: 0.03, // 3%
} as const;

// ============================================================================
// EXCHANGE FILTERS
// ============================================================================

export const EXCHANGE_FILTERS = {
  /** Maximum decimal places for quantity rounding */
  MAX_QUANTITY_DECIMALS: 8,
  
  /** Maximum decimal places for price rounding */
  MAX_PRICE_DECIMALS: 8,
  
  /** Minimum notional value buffer multiplier */
  MIN_NOTIONAL_BUFFER: 1.01, // 1% buffer
} as const;

// ============================================================================
// BINANCE API
// ============================================================================

export const BINANCE_API = {
  /** Maximum retry attempts for API calls */
  MAX_RETRIES: 5,
  
  /** Base delay for exponential backoff in milliseconds */
  RETRY_BASE_DELAY_MS: 1000,
  
  /** Maximum delay between retries in milliseconds */
  MAX_RETRY_DELAY_MS: 10000,
  
  /** Request timeout in milliseconds */
  REQUEST_TIMEOUT_MS: 30000,
  
  /** Rate limit buffer (requests per minute) */
  RATE_LIMIT_BUFFER: 10,
} as const;

// ============================================================================
// EXECUTION ROUTER
// ============================================================================

export const EXECUTION = {
  /** Maximum slippage percentage allowed */
  MAX_SLIPPAGE_PCT: 0.01, // 1%
  
  /** Order timeout in milliseconds */
  ORDER_TIMEOUT_MS: 30000,
  
  /** Time-in-force for limit orders */
  TIME_IN_FORCE: 'GTC' as const,
} as const;

// ============================================================================
// MONGODB
// ============================================================================

export const DATABASE = {
  /** Connection timeout in milliseconds */
  CONNECTION_TIMEOUT_MS: 10000,
  
  /** Query timeout in milliseconds */
  QUERY_TIMEOUT_MS: 5000,
  
  /** Maximum connection pool size */
  MAX_POOL_SIZE: 10,
} as const;

// ============================================================================
// LOGGING
// ============================================================================

export const LOGGING = {
  /** Log level (DEBUG, INFO, WARN, ERROR, CRITICAL) */
  DEFAULT_LEVEL: 'INFO' as const,
  
  /** Enable console output */
  ENABLE_CONSOLE: true,
  
  /** Enable file output */
  ENABLE_FILE: false,
  
  /** Log file path */
  FILE_PATH: '/var/log/trading-bot.log',
  
  /** Maximum log file size in bytes (10MB) */
  MAX_FILE_SIZE: 10 * 1024 * 1024,
} as const;

// ============================================================================
// HEALTH CHECKS
// ============================================================================

export const HEALTH = {
  /** Health check interval in milliseconds (60 seconds) */
  CHECK_INTERVAL_MS: 60000,
  
  /** Maximum age of last update before considering stale (5 minutes) */
  MAX_STALE_AGE_MS: 5 * 60 * 1000,
} as const;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Calculate exponential backoff delay
 */
export function calculateBackoffDelay(attempt: number, baseDelay: number, maxDelay: number): number {
  const delay = baseDelay * Math.pow(2, attempt - 1);
  return Math.min(delay, maxDelay);
}

/**
 * Convert percentage to basis points
 */
export function percentToBps(percent: number): number {
  return percent * 10000;
}

/**
 * Convert basis points to percentage
 */
export function bpsToPercent(bps: number): number {
  return bps / 10000;
}

/**
 * Format R value for display
 */
export function formatR(rValue: number): string {
  return `${rValue.toFixed(2)}R`;
}

/**
 * Format USD value for display
 */
export function formatUSD(value: number): string {
  return `$${value.toFixed(2)}`;
}

/**
 * Format percentage for display
 */
export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}
