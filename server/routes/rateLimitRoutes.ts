import express from 'express';
import rateLimitManager from '../services/rateLimitManager';
import logger from '../utils/logger';

const router = express.Router();

/**
 * GET /api/rate-limit/usage
 * Get current rate limit usage
 */
router.get('/usage', (req, res) => {
  try {
    const usage = rateLimitManager.getUsage();
    res.json({
      success: true,
      data: usage,
    });
  } catch (error) {
    logger.error('Error getting rate limit usage:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/rate-limit/stats
 * Get rate limit statistics
 */
router.get('/stats', (req, res) => {
  try {
    const stats = rateLimitManager.getStats();
    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    logger.error('Error getting rate limit stats:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/rate-limit/reset
 * Reset rate limit statistics (for testing)
 */
router.post('/reset', (req, res) => {
  try {
    rateLimitManager.resetStats();
    res.json({
      success: true,
      message: 'Rate limit statistics reset',
    });
  } catch (error) {
    logger.error('Error resetting rate limit stats:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
