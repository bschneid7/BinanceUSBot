import express from 'express';
import orderReconciliationService from '../services/orderReconciliationService';
import logger from '../utils/logger';

const router = express.Router();

/**
 * GET /api/reconciliation/status
 * Get current reconciliation status
 */
router.get('/status', async (req, res) => {
  try {
    const status = orderReconciliationService.getStatus();
    res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    logger.error('Error getting reconciliation status:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/reconciliation/trigger
 * Manually trigger order reconciliation
 */
router.post('/trigger', async (req, res) => {
  try {
    logger.info('Manual reconciliation triggered via API');
    const result = await orderReconciliationService.triggerManualReconciliation();
    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Error triggering manual reconciliation:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
