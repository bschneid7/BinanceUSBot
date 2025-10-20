/**
 * Frontend Logger Utility
 * Provides structured logging for the React application
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  data?: unknown;
  context?: string;
}

class Logger {
  private isDevelopment: boolean;

  constructor() {
    this.isDevelopment = import.meta.env.DEV || process.env.NODE_ENV === 'development';
  }

  private log(level: LogLevel, message: string, data?: unknown, context?: string): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      data,
      context,
    };

    // In development, log everything to console
    if (this.isDevelopment) {
      const prefix = context ? `[${context}]` : '';
      switch (level) {
        case 'debug':
          console.debug(prefix, message, data || '');
          break;
        case 'info':
          console.info(prefix, message, data || '');
          break;
        case 'warn':
          console.warn(prefix, message, data || '');
          break;
        case 'error':
          console.error(prefix, message, data || '');
          break;
      }
    } else {
      // In production, only log warnings and errors
      if (level === 'warn' || level === 'error') {
        console[level](entry);
      }
    }

    // TODO: In production, send errors to monitoring service (e.g., Sentry)
    if (!this.isDevelopment && level === 'error') {
      // this.sendToMonitoring(entry);
    }
  }

  debug(message: string, data?: unknown, context?: string): void {
    this.log('debug', message, data, context);
  }

  info(message: string, data?: unknown, context?: string): void {
    this.log('info', message, data, context);
  }

  warn(message: string, data?: unknown, context?: string): void {
    this.log('warn', message, data, context);
  }

  error(message: string, error?: unknown, context?: string): void {
    this.log('error', message, error, context);
  }

  // Helper for API errors
  apiError(endpoint: string, error: unknown): void {
    this.error(`API Error: ${endpoint}`, error, 'API');
  }
}

// Export singleton instance
export const logger = new Logger();
export default logger;

