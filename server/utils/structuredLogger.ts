/**
 * Structured JSON Logger
 * 
 * Provides structured logging in JSON format for better parsing and analysis.
 * Compatible with Loki, Grafana, and other log aggregation tools.
 */

import winston from 'winston';

// Log levels
export enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  DEBUG = 'debug'
}

// Base log entry interface
interface BaseLogEntry {
  timestamp: string;
  level: string;
  message?: string;
  [key: string]: any;
}

// Create Winston logger with JSON format
const winstonLogger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
          return `${timestamp} [${level}]: ${message || ''} ${metaStr}`;
        })
      )
    }),
    new winston.transports.File({
      filename: '/var/log/trading-bot/combined.log',
      format: winston.format.json()
    }),
    new winston.transports.File({
      filename: '/var/log/trading-bot/error.log',
      level: 'error',
      format: winston.format.json()
    })
  ]
});

/**
 * Structured Logger Class
 */
export class StructuredLogger {
  private context: string;

  constructor(context: string = 'App') {
    this.context = context;
  }

  /**
   * Log with structured data
   */
  private log(level: LogLevel, data: Record<string, any>): void {
    const logEntry: BaseLogEntry = {
      timestamp: new Date().toISOString(),
      level,
      context: this.context,
      ...data
    };

    winstonLogger.log(level, logEntry);
  }

  /**
   * Info level logging
   */
  info(data: Record<string, any> | string): void {
    if (typeof data === 'string') {
      this.log(LogLevel.INFO, { message: data });
    } else {
      this.log(LogLevel.INFO, data);
    }
  }

  /**
   * Warning level logging
   */
  warn(data: Record<string, any> | string): void {
    if (typeof data === 'string') {
      this.log(LogLevel.WARN, { message: data });
    } else {
      this.log(LogLevel.WARN, data);
    }
  }

  /**
   * Error level logging
   */
  error(data: Record<string, any> | string, error?: Error): void {
    if (typeof data === 'string') {
      this.log(LogLevel.ERROR, {
        message: data,
        error: error?.message,
        stack: error?.stack
      });
    } else {
      this.log(LogLevel.ERROR, {
        ...data,
        error: error?.message,
        stack: error?.stack
      });
    }
  }

  /**
   * Debug level logging
   */
  debug(data: Record<string, any> | string): void {
    if (typeof data === 'string') {
      this.log(LogLevel.DEBUG, { message: data });
    } else {
      this.log(LogLevel.DEBUG, data);
    }
  }

  /**
   * Log trading signal
   */
  logSignal(signal: {
    symbol: string;
    side: string;
    confidence: number;
    playbook?: string;
    reason?: string;
  }): void {
    this.info({
      event: 'signal_generated',
      ...signal
    });
  }

  /**
   * Log order execution
   */
  logOrder(order: {
    orderId: string;
    symbol: string;
    side: string;
    quantity: number;
    price: number;
    status: string;
  }): void {
    this.info({
      event: 'order_executed',
      ...order
    });
  }

  /**
   * Log trade result
   */
  logTrade(trade: {
    symbol: string;
    side: string;
    entryPrice: number;
    exitPrice: number;
    quantity: number;
    pnl: number;
    pnlPercent: number;
    duration: number;
  }): void {
    this.info({
      event: 'trade_closed',
      ...trade
    });
  }

  /**
   * Log performance metrics
   */
  logMetrics(metrics: {
    equity: number;
    totalPnL: number;
    winRate: number;
    sharpeRatio?: number;
    maxDrawdown?: number;
  }): void {
    this.info({
      event: 'performance_metrics',
      ...metrics
    });
  }

  /**
   * Log system health
   */
  logHealth(health: {
    status: string;
    apiConnectivity: boolean;
    databaseConnectivity: boolean;
    latency?: number;
  }): void {
    this.info({
      event: 'health_check',
      ...health
    });
  }

  /**
   * Log ML prediction
   */
  logMLPrediction(prediction: {
    symbol: string;
    model: string;
    prediction: string;
    confidence: number;
    features?: Record<string, any>;
  }): void {
    this.debug({
      event: 'ml_prediction',
      ...prediction
    });
  }

  /**
   * Log risk event
   */
  logRiskEvent(risk: {
    type: string;
    severity: string;
    symbol?: string;
    details: Record<string, any>;
  }): void {
    this.warn({
      event: 'risk_event',
      ...risk
    });
  }
}

// Export singleton instances for different contexts
export const logger = new StructuredLogger('TradingBot');
export const tradingLogger = new StructuredLogger('TradingEngine');
export const mlLogger = new StructuredLogger('MLEngine');
export const riskLogger = new StructuredLogger('RiskManager');

// Export factory function
export function createLogger(context: string): StructuredLogger {
  return new StructuredLogger(context);
}
