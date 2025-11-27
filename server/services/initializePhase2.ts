import continuousReconciliationService from './continuousReconciliationService';
import logger from '../utils/logger';

/**
 * Initialize Phase 2 Infrastructure
 * - Continuous Reconciliation
 * - Enhanced Health Monitoring
 */

export async function initializePhase2(): Promise<void> {
  try {
    logger.info('[Phase2] Initializing Phase 2 infrastructure...');

    // Start continuous reconciliation service
    await continuousReconciliationService.start();
    logger.info('[Phase2] ✅ Continuous reconciliation started');

    logger.info('[Phase2] ✅ Phase 2 infrastructure initialized successfully');
  } catch (error: any) {
    logger.error('[Phase2] Failed to initialize Phase 2 infrastructure:', error);
    throw error;
  }
}

export async function shutdownPhase2(): Promise<void> {
  try {
    logger.info('[Phase2] Shutting down Phase 2 infrastructure...');

    // Stop continuous reconciliation service
    await continuousReconciliationService.stop();
    logger.info('[Phase2] ✅ Continuous reconciliation stopped');

    logger.info('[Phase2] ✅ Phase 2 infrastructure shut down successfully');
  } catch (error: any) {
    logger.error('[Phase2] Failed to shut down Phase 2 infrastructure:', error);
    throw error;
  }
}
