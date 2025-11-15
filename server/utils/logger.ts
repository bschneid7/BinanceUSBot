/**
 * Structured Logging System
 * 
 * Provides consistent, structured logging with log levels, context, and metadata.
 * Replaces ad-hoc console.log/console.error calls throughout the codebase.
 */

import { LOGGING } from './constants';
import { LogLevel, LogEntry } from './types';

// ============================================================================
// LOG LEVEL HIERARCHY
// ============================================================================

const LOG_LEVELS: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  CRITICAL: 4,
};

// ============================================================================
// LOGGER CLASS
// ============================================================================

class Logger {
  private minLevel: LogLevel;
  private context: string;

  constructor(context: string = 'App', minLevel: LogLevel = LOGGING.DEFAULT_LEVEL) {
    this.context = context;
    this.minLevel = minLevel;
  }

  /**
   * Create a child logger with a specific context
   */
  child(context: string): Logger {
    return new Logger(`${this.context}:${context}`, this.minLevel);
  }

  /**
   * Set minimum log level
   */
  setLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  /**
   * Check if a log level should be logged
   */
  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.minLevel];
  }

  /**
   * Format log entry for output
   */
  private formatEntry(entry: LogEntry): string {
    const timestamp = entry.timestamp.toISOString();
    const level = entry.level.padEnd(8);
    const context = entry.context ? `[${entry.context}]` : '';
    const message = entry.message;
    
    let output = `${timestamp} ${level} ${context} ${message}`;
    
    if (entry.metadata && Object.keys(entry.metadata).length > 0) {
      output += `\n  Metadata: ${JSON.stringify(entry.metadata, null, 2)}`;
    }
    
    if (entry.error) {
      output += `\n  Error: ${entry.error.message}`;
      if (entry.error.stack) {
        output += `\n  Stack: ${entry.error.stack}`;
      }
    }
    
    return output;
  }

  /**
   * Write log entry to output
   */
  private write(entry: LogEntry): void {
    if (!this.shouldLog(entry.level)) {
      return;
    }

    const formatted = this.formatEntry(entry);

    // Console output
    if (LOGGING.ENABLE_CONSOLE) {
      switch (entry.level) {
        case 'DEBUG':
        case 'INFO':
          console.log(formatted);
          break;
        case 'WARN':
          console.warn(formatted);
          break;
        case 'ERROR':
        case 'CRITICAL':
          console.error(formatted);
          break;
      }
    }

    // File output (if enabled)
    if (LOGGING.ENABLE_FILE) {
      // TODO: Implement file logging with rotation
      // fs.appendFileSync(LOGGING.FILE_PATH, formatted + '\n');
    }
  }

  /**
   * Log at DEBUG level
   */
  debug(message: string, metadata?: Record<string, any>): void {
    this.write({
      level: 'DEBUG',
      timestamp: new Date(),
      message,
      context: this.context,
      metadata,
    });
  }

  /**
   * Log at INFO level
   */
  info(message: string, metadata?: Record<string, any>): void {
    this.write({
      level: 'INFO',
      timestamp: new Date(),
      message,
      context: this.context,
      metadata,
    });
  }

  /**
   * Log at WARN level
   */
  warn(message: string, metadata?: Record<string, any>): void {
    this.write({
      level: 'WARN',
      timestamp: new Date(),
      message,
      context: this.context,
      metadata,
    });
  }

  /**
   * Log at ERROR level
   */
  error(message: string, error?: Error, metadata?: Record<string, any>): void {
    this.write({
      level: 'ERROR',
      timestamp: new Date(),
      message,
      context: this.context,
      error,
      metadata,
    });
  }

  /**
   * Log at CRITICAL level
   */
  critical(message: string, error?: Error, metadata?: Record<string, any>): void {
    this.write({
      level: 'CRITICAL',
      timestamp: new Date(),
      message,
      context: this.context,
      error,
      metadata,
    });
  }

  /**
   * Log position event
   */
  position(action: string, symbol: string, details: Record<string, any>): void {
    this.info(`Position ${action}: ${symbol}`, {
      action,
      symbol,
      ...details,
    });
  }

  /**
   * Log order event
   */
  order(action: string, symbol: string, side: string, details: Record<string, any>): void {
    this.info(`Order ${action}: ${side} ${symbol}`, {
      action,
      symbol,
      side,
      ...details,
    });
  }

  /**
   * Log signal event
   */
  signal(playbook: string, symbol: string, action: string, details: Record<string, any>): void {
    this.info(`Signal [${playbook}]: ${action} ${symbol}`, {
      playbook,
      symbol,
      action,
      ...details,
    });
  }

  /**
   * Log performance metric
   */
  metric(name: string, value: number, unit: string = '', metadata?: Record<string, any>): void {
    this.info(`Metric: ${name} = ${value}${unit}`, {
      metric: name,
      value,
      unit,
      ...metadata,
    });
  }

  /**
   * Log API call
   */
  api(method: string, endpoint: string, duration: number, status?: number): void {
    const level = status && status >= 400 ? 'ERROR' : 'DEBUG';
    const message = `API ${method} ${endpoint} - ${duration}ms`;
    
    this.write({
      level: level as LogLevel,
      timestamp: new Date(),
      message,
      context: this.context,
      metadata: {
        method,
        endpoint,
        duration,
        status,
      },
    });
  }
}

// ============================================================================
// GLOBAL LOGGER INSTANCES
// ============================================================================

export const logger = new Logger('TradingBot');

// Pre-configured loggers for different components
export const loggers = {
  app: logger.child('App'),
  trading: logger.child('TradingEngine'),
  execution: logger.child('ExecutionRouter'),
  position: logger.child('PositionManager'),
  stopLoss: logger.child('StopLossMonitor'),
  scanner: logger.child('MarketScanner'),
  signal: logger.child('SignalGenerator'),
  binance: logger.child('BinanceService'),
  database: logger.child('Database'),
  health: logger.child('HealthCheck'),
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Format duration in milliseconds to human-readable string
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(2)}m`;
  return `${(ms / 3600000).toFixed(2)}h`;
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(2)}KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(2)}MB`;
  return `${(bytes / 1073741824).toFixed(2)}GB`;
}

/**
 * Create a timer for measuring operation duration
 */
export function createTimer() {
  const start = Date.now();
  return {
    elapsed: () => Date.now() - start,
    log: (logger: Logger, message: string) => {
      const duration = Date.now() - start;
      logger.debug(`${message} - ${formatDuration(duration)}`);
    },
  };
}

/**
 * Log function execution time
 */
export function logExecutionTime(
  logger: Logger,
  fn: () => any,
  description: string
): any {
  const timer = createTimer();
  try {
    const result = fn();
    timer.log(logger, description);
    return result;
  } catch (error) {
    timer.log(logger, `${description} (failed)`);
    throw error;
  }
}

/**
 * Log async function execution time
 */
export async function logExecutionTimeAsync(
  logger: Logger,
  fn: () => Promise<any>,
  description: string
): Promise<any> {
  const timer = createTimer();
  try {
    const result = await fn();
    timer.log(logger, description);
    return result;
  } catch (error) {
    timer.log(logger, `${description} (failed)`);
    throw error;
  }
}

// ============================================================================
// MIGRATION HELPERS
// ============================================================================

/**
 * Replace console.log with structured logging
 * 
 * Usage:
 *   // Before:
 *   console.log('[PositionManager] Closing position', positionId);
 *   
 *   // After:
 *   loggers.position.info('Closing position', { positionId });
 */

/**
 * Replace console.error with structured logging
 * 
 * Usage:
 *   // Before:
 *   console.error('[PositionManager] Failed to close position:', error);
 *   
 *   // After:
 *   loggers.position.error('Failed to close position', error, { positionId });
 */

/**
 * Replace console.warn with structured logging
 * 
 * Usage:
 *   // Before:
 *   console.warn('[StopLossMonitor] Position approaching stop loss');
 *   
 *   // After:
 *   loggers.stopLoss.warn('Position approaching stop loss', { symbol, distance });
 */

export default logger;
