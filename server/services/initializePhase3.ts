import logger from '../utils/logger';
import metricsCollector from './monitoring/metricsCollector';
import anomalyDetector from './monitoring/anomalyDetector';
import exchangeFilters from './exchangeFilters';

/**
 * Initialize Phase 3 Infrastructure
 * - Metrics Collection
 * - Anomaly Detection
 * - Predictive Analytics
 */

export async function initializePhase3(): Promise<void> {
  try {
    logger.info('[Phase3] Initializing Phase 3 infrastructure...');

    // Load exchange filters (critical for order validation)
    logger.info('[Phase3] Loading exchange filters...');
    await exchangeFilters.loadFilters();
    logger.info('[Phase3] ✅ Exchange filters loaded');

    // Start metrics collection (every 10 seconds)
    metricsCollector.start(10);
    logger.info('[Phase3] ✅ Metrics collection started');

    // Start anomaly detection (every 30 seconds)
    anomalyDetector.start();
    logger.info('[Phase3] ✅ Anomaly detection started');

    // Predictive analytics is passive (no startup needed)
    logger.info('[Phase3] ✅ Predictive analytics ready');

    logger.info('[Phase3] ✅ Phase 3 infrastructure initialized successfully');
  } catch (error: any) {
    logger.error('[Phase3] Failed to initialize Phase 3 infrastructure:', error);
    throw error;
  }
}

export async function shutdownPhase3(): Promise<void> {
  try {
    logger.info('[Phase3] Shutting down Phase 3 infrastructure...');

    // Stop metrics collection
    metricsCollector.stop();
    logger.info('[Phase3] ✅ Metrics collection stopped');

    // Stop anomaly detection
    anomalyDetector.stop();
    logger.info('[Phase3] ✅ Anomaly detection stopped');

    logger.info('[Phase3] ✅ Phase 3 infrastructure shut down successfully');
  } catch (error: any) {
    logger.error('[Phase3] Failed to shut down Phase 3 infrastructure:', error);
    throw error;
  }
}
