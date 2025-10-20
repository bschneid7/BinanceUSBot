/**
 * Trading System Constants
 * 
 * Centralized configuration values to eliminate magic numbers
 * and improve maintainability.
 */

// ============================================================================
// MARKET QUALITY GATES
// ============================================================================

export const MARKET_QUALITY = {
  /** Minimum 24h volume in USD to consider a market tradeable */
  MIN_VOLUME_USD: 50000,
  
  /** Maximum bid-ask spread in basis points (100 bps = 1%) */
  MAX_SPREAD_BPS: 100,
  
  /** Minimum top-of-book depth in USD on each side */
  MIN_TOB_DEPTH_USD: 50,
  
  /** Minimum number of candles required for technical analysis */
  MIN_CANDLES_REQUIRED: 100,
  
  /** Lookback period for volume analysis (in candles) */
  VOLUME_LOOKBACK_CANDLES: 20,
} as const;

// ============================================================================
// RISK LIMITS
// ============================================================================

export const RISK_LIMITS = {
  /** Maximum risk per single trade in R multiples */
  MAX_R_PER_TRADE: 1.0,
  
  /** Maximum total open risk in R multiples */
  MAX_TOTAL_OPEN_R: 6.0,
  
  /** Maximum number of concurrent positions */
  MAX_CONCURRENT_POSITIONS: 8,
  
  /** Maximum portfolio exposure as percentage of equity */
  MAX_PORTFOLIO_EXPOSURE_PCT: 80,
  
  /** Correlation threshold for position scaling (0-1) */
  CORRELATION_THRESHOLD: 0.7,
  
  /** Position size reduction when correlated (0-1) */
  CORRELATION_SCALE_FACTOR: 0.5,
  
  /** Maximum age of currentR value before considered stale (ms) */
  MAX_R_AGE_MS: 5 * 60 * 1000, // 5 minutes
} as const;

// ============================================================================
// SLIPPAGE LIMITS
// ============================================================================

export const SLIPPAGE = {
  /** Maximum allowed slippage for normal orders (basis points) */
  MAX_NORMAL_BPS: 100,
  
  /** Maximum allowed slippage for event-driven orders (basis points) */
  MAX_EVENT_BPS: 200,
  
  /** Maximum price deviation from signal price (percentage) */
  MAX_PRICE_DEVIATION_PCT: 0.5, // 50%
  
  /** Maximum reasonable price for sanity check */
  MAX_SANE_PRICE: 1000000,
} as const;

// ============================================================================
// TIMING & INTERVALS
// ============================================================================

export const TIMING = {
  /** Scan cycle interval in milliseconds */
  SCAN_INTERVAL_MS: 50000, // 50 seconds
  
  /** Minimum cooldown between signals for same pair (minutes) */
  SIGNAL_COOLDOWN_MIN: 60,
  
  /** API request timeout in milliseconds */
  API_TIMEOUT_MS: 10000, // 10 seconds
  
  /** Database query timeout in milliseconds */
  DB_TIMEOUT_MS: 5000, // 5 seconds
  
  /** User Data Stream keepalive interval (milliseconds) */
  UDS_KEEPALIVE_MS: 30 * 60 * 1000, // 30 minutes
  
  /** Position update interval in milliseconds */
  POSITION_UPDATE_INTERVAL_MS: 60000, // 1 minute
} as const;

// ============================================================================
// EXCHANGE FILTERS
// ============================================================================

export const EXCHANGE = {
  /** Minimum order notional value in USD */
  MIN_NOTIONAL_USD: 10,
  
  /** Default price precision (decimal places) */
  DEFAULT_PRICE_PRECISION: 2,
  
  /** Default quantity precision (decimal places) */
  DEFAULT_QTY_PRECISION: 8,
  
  /** Maker fee rate (percentage) */
  MAKER_FEE_PCT: 0.1,
  
  /** Taker fee rate (percentage) */
  TAKER_FEE_PCT: 0.1,
} as const;

// ============================================================================
// LOSS LIMITS
// ============================================================================

export const LOSS_LIMITS = {
  /** Daily loss limit as percentage of starting equity */
  DAILY_LOSS_PCT: 2.0,
  
  /** Weekly loss limit as percentage of starting equity */
  WEEKLY_LOSS_PCT: 5.0,
  
  /** Minimum equity percentage before forced halt */
  MIN_EQUITY_PCT: 80.0,
} as const;

// ============================================================================
// RESERVE MANAGEMENT
// ============================================================================

export const RESERVES = {
  /** Target reserve level as percentage of equity */
  TARGET_RESERVE_PCT: 20.0,
  
  /** Minimum reserve level before refill */
  MIN_RESERVE_PCT: 10.0,
  
  /** Maximum reserve level (cap) */
  MAX_RESERVE_PCT: 30.0,
} as const;

// ============================================================================
// TECHNICAL INDICATORS
// ============================================================================

export const INDICATORS = {
  /** RSI period (candles) */
  RSI_PERIOD: 14,
  
  /** RSI overbought threshold */
  RSI_OVERBOUGHT: 70,
  
  /** RSI oversold threshold */
  RSI_OVERSOLD: 30,
  
  /** VWAP deviation threshold (percentage) */
  VWAP_DEVIATION_PCT: 2.0,
  
  /** ATR multiplier for stop loss */
  ATR_STOP_MULTIPLIER: 2.0,
  
  /** Volume surge threshold (multiple of average) */
  VOLUME_SURGE_MULTIPLIER: 2.0,
} as const;

// ============================================================================
// PLAYBOOK THRESHOLDS
// ============================================================================

export const PLAYBOOK = {
  /** Minimum volume surge for breakout signals (multiple) */
  BREAKOUT_VOLUME_SURGE: 1.5,
  
  /** Minimum VWAP deviation for mean reversion (percentage) */
  MEAN_REVERSION_VWAP_DEV: 1.5,
  
  /** Minimum RSI for mean reversion entry */
  MEAN_REVERSION_RSI_MIN: 25,
  
  /** Maximum RSI for mean reversion entry */
  MEAN_REVERSION_RSI_MAX: 75,
  
  /** Event playbook volume multiplier */
  EVENT_VOLUME_MULTIPLIER: 3.0,
  
  /** Dip playbook maximum pullback (percentage) */
  DIP_MAX_PULLBACK_PCT: 5.0,
} as const;

// ============================================================================
// DATABASE
// ============================================================================

export const DATABASE = {
  /** Connection pool size */
  POOL_SIZE: 10,
  
  /** Query timeout in milliseconds */
  QUERY_TIMEOUT_MS: 5000,
  
  /** Retry attempts for failed queries */
  RETRY_ATTEMPTS: 3,
  
  /** Retry delay in milliseconds */
  RETRY_DELAY_MS: 1000,
} as const;

// ============================================================================
// LOGGING
// ============================================================================

export const LOGGING = {
  /** Maximum log message length */
  MAX_LOG_LENGTH: 1000,
  
  /** Log retention days */
  RETENTION_DAYS: 30,
  
  /** Enable debug logging */
  DEBUG_ENABLED: process.env.LOG_LEVEL === 'debug',
} as const;

// ============================================================================
// VALIDATION
// ============================================================================

export const VALIDATION = {
  /** Minimum position size in USD */
  MIN_POSITION_SIZE_USD: 10,
  
  /** Maximum position size in USD */
  MAX_POSITION_SIZE_USD: 100000,
  
  /** Minimum stop distance in percentage */
  MIN_STOP_DISTANCE_PCT: 0.5,
  
  /** Maximum stop distance in percentage */
  MAX_STOP_DISTANCE_PCT: 10.0,
} as const;

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type MarketQuality = typeof MARKET_QUALITY;
export type RiskLimits = typeof RISK_LIMITS;
export type SlippageLimits = typeof SLIPPAGE;
export type TimingConfig = typeof TIMING;
export type ExchangeConfig = typeof EXCHANGE;
export type LossLimitsConfig = typeof LOSS_LIMITS;
export type ReservesConfig = typeof RESERVES;
export type IndicatorsConfig = typeof INDICATORS;
export type PlaybookConfig = typeof PLAYBOOK;
export type DatabaseConfig = typeof DATABASE;
export type LoggingConfig = typeof LOGGING;
export type ValidationConfig = typeof VALIDATION;

