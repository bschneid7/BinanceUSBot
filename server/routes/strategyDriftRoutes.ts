import express from 'express';
import strategyDriftDetector from '../services/strategyDriftDetector';
import logger from '../utils/logger';

const router = express.Router();

/**
 * GET /api/drift/status
 * Get current drift status for all strategies
 */
router.get('/status', async (req, res) => {
  try {
    const status = await strategyDriftDetector.getDriftStatus();
    res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    logger.error('Error getting drift status:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/drift/check
 * Manually trigger drift detection
 */
router.post('/check', async (req, res) => {
  try {
    const { minTrades = 30 } = req.body;
    
    logger.info('Manual drift detection triggered via API');
    await strategyDriftDetector.checkAllStrategies(minTrades);
    
    res.json({
      success: true,
      message: 'Drift detection completed',
    });
  } catch (error) {
    logger.error('Error triggering drift detection:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/drift/metrics/:strategy
 * Get live metrics for a specific strategy
 */
router.get('/metrics/:strategy', async (req, res) => {
  try {
    const { strategy } = req.params;
    const { minTrades = 30 } = req.query;
    
    const metrics = await strategyDriftDetector.calculateLiveMetrics(
      strategy.toUpperCase(),
      Number(minTrades)
    );
    
    if (!metrics) {
      return res.status(404).json({
        success: false,
        error: `Not enough trades for strategy ${strategy}`,
      });
    }
    
    res.json({
      success: true,
      data: metrics,
    });
  } catch (error) {
    logger.error(`Error getting metrics for strategy ${req.params.strategy}:`, error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
