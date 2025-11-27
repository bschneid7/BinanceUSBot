import express, { Request, Response } from 'express';
import enhancedHealthMonitor from '../services/enhancedHealthMonitor';
import continuousReconciliationService from '../services/continuousReconciliationService';
import circuitBreakerManager from '../services/circuitBreaker';
import messageQueue from '../services/messageQueue';
import logger from '../utils/logger';

const router = express.Router();

/**
 * GET /api/phase2/health
 * Get comprehensive system health status
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    const health = await enhancedHealthMonitor.performHealthCheck();
    const statusCode = health.healthy ? 200 : 503;
    res.status(statusCode).json(health);
  } catch (error: any) {
    logger.error('[Phase2Routes] Health check failed:', error);
    res.status(500).json({
      healthy: false,
      timestamp: new Date(),
      error: error.message,
    });
  }
});

/**
 * GET /api/phase2/health/quick
 * Get quick health status (fast, cached)
 */
router.get('/health/quick', async (req: Request, res: Response) => {
  try {
    const status = await enhancedHealthMonitor.getQuickStatus();
    const statusCode = status.healthy ? 200 : 503;
    res.status(statusCode).json(status);
  } catch (error: any) {
    logger.error('[Phase2Routes] Quick health check failed:', error);
    res.status(500).json({
      healthy: false,
      timestamp: new Date(),
      error: error.message,
    });
  }
});

/**
 * GET /api/phase2/reconciliation/stats
 * Get reconciliation service statistics
 */
router.get('/reconciliation/stats', (req: Request, res: Response) => {
  try {
    const stats = continuousReconciliationService.getStats();
    res.json(stats);
  } catch (error: any) {
    logger.error('[Phase2Routes] Failed to get reconciliation stats:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/phase2/reconciliation/config
 * Get reconciliation service configuration
 */
router.get('/reconciliation/config', (req: Request, res: Response) => {
  try {
    const config = continuousReconciliationService.getConfig();
    res.json(config);
  } catch (error: any) {
    logger.error('[Phase2Routes] Failed to get reconciliation config:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/phase2/reconciliation/config
 * Update reconciliation service configuration
 */
router.post('/reconciliation/config', (req: Request, res: Response) => {
  try {
    continuousReconciliationService.updateConfig(req.body);
    const config = continuousReconciliationService.getConfig();
    res.json({ success: true, config });
  } catch (error: any) {
    logger.error('[Phase2Routes] Failed to update reconciliation config:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/phase2/circuit-breakers
 * Get all circuit breaker statuses
 */
router.get('/circuit-breakers', (req: Request, res: Response) => {
  try {
    const status = circuitBreakerManager.getHealthStatus();
    res.json(status);
  } catch (error: any) {
    logger.error('[Phase2Routes] Failed to get circuit breaker status:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/phase2/circuit-breakers/reset
 * Reset all circuit breakers
 */
router.post('/circuit-breakers/reset', (req: Request, res: Response) => {
  try {
    circuitBreakerManager.resetAll();
    res.json({ success: true, message: 'All circuit breakers reset' });
  } catch (error: any) {
    logger.error('[Phase2Routes] Failed to reset circuit breakers:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/phase2/queues/stats
 * Get message queue statistics
 */
router.get('/queues/stats', async (req: Request, res: Response) => {
  try {
    const stats = await messageQueue.getAllQueueStats();
    res.json(stats);
  } catch (error: any) {
    logger.error('[Phase2Routes] Failed to get queue stats:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
