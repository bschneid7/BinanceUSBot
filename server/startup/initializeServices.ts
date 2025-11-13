import logger from '../utils/logger';
import stopLossMonitor from '../services/stopLossMonitor';

/**
 * Initialize critical services that should run independently
 * of the trading engine state
 */
export async function initializeCriticalServices(): Promise<void> {
  logger.info('[Startup] Initializing critical services...');

  try {
    // Start Independent Stop Loss Monitor
    // This MUST run even when trading engine is stopped
    logger.info('[Startup] Starting Independent Stop Loss Monitor...');
    stopLossMonitor.start();
    logger.info('[Startup] ✅ Stop Loss Monitor started');

    // Add other critical services here in the future
    // e.g., health checks, monitoring, alerts

    logger.info('[Startup] ✅ All critical services initialized');
  } catch (error) {
    logger.error('[Startup] ❌ CRITICAL: Failed to initialize services:', error);
    throw error;
  }
}

/**
 * Shutdown critical services gracefully
 */
export async function shutdownCriticalServices(): Promise<void> {
  logger.info('[Shutdown] Stopping critical services...');

  try {
    // Stop Stop Loss Monitor
    stopLossMonitor.stop();
    logger.info('[Shutdown] Stop Loss Monitor stopped');

    logger.info('[Shutdown] ✅ All critical services stopped');
  } catch (error) {
    logger.error('[Shutdown] Error stopping services:', error);
  }
}
