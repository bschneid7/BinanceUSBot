import pino from 'pino';

/**
 * Structured Logger - Pino-based logging with correlation IDs
 */

const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  formatters: {
    level: (label) => {
      return { level: label };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  base: {
    pid: process.pid,
    hostname: process.env.HOSTNAME || 'unknown',
  },
});

/**
 * Create a child logger with correlation ID
 */
export function withCorrelationId(cid: string) {
  return logger.child({ cid });
}

/**
 * Create a child logger for a specific module
 */
export function withModule(module: string) {
  return logger.child({ module });
}

/**
 * Create a child logger for a specific user
 */
export function withUser(userId: string) {
  return logger.child({ userId });
}

/**
 * Create a child logger with multiple context fields
 */
export function withContext(context: Record<string, any>) {
  return logger.child(context);
}

export default logger;

