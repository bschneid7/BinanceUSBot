import express, { Request, Response } from 'express';
import metricsCollector from '../services/monitoring/metricsCollector';
import anomalyDetector from '../services/monitoring/anomalyDetector';
import alertManager from '../services/monitoring/alertManager';
import discrepancyPredictor from '../services/prediction/discrepancyPredictor';
import riskScorer from '../services/prediction/riskScorer';
import logger from '../utils/logger';

const router = express.Router();

/**
 * GET /api/phase3/metrics
 * Get current system metrics
 */
router.get('/metrics', (req: Request, res: Response) => {
  try {
    const metrics = metricsCollector.getCurrentMetrics();
    res.json(metrics || { message: 'No metrics available yet' });
  } catch (error: any) {
    logger.error('[Phase3Routes] Failed to get metrics:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/phase3/metrics/history
 * Get historical metrics
 */
router.get('/metrics/history', (req: Request, res: Response) => {
  try {
    const minutes = parseInt(req.query.minutes as string) || 60;
    const history = metricsCollector.getMetricsHistory(minutes);
    res.json({ minutes, dataPoints: history.length, metrics: history });
  } catch (error: any) {
    logger.error('[Phase3Routes] Failed to get metrics history:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/phase3/metrics/summary
 * Get metrics summary
 */
router.get('/metrics/summary', (req: Request, res: Response) => {
  try {
    const minutes = parseInt(req.query.minutes as string) || 60;
    const summary = metricsCollector.getMetricsSummary(minutes);
    res.json(summary || { message: 'No metrics available yet' });
  } catch (error: any) {
    logger.error('[Phase3Routes] Failed to get metrics summary:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/phase3/alerts
 * Get recent alerts
 */
router.get('/alerts', (req: Request, res: Response) => {
  try {
    const minutes = parseInt(req.query.minutes as string) || 60;
    const level = req.query.level as any;
    const alerts = alertManager.getAlertHistory(minutes, level);
    res.json({ minutes, level: level || 'all', count: alerts.length, alerts });
  } catch (error: any) {
    logger.error('[Phase3Routes] Failed to get alerts:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/phase3/alerts/active
 * Get active alerts
 */
router.get('/alerts/active', (req: Request, res: Response) => {
  try {
    const level = req.query.level as any;
    const alerts = alertManager.getActiveAlerts(level);
    res.json({ level: level || 'all', count: alerts.length, alerts });
  } catch (error: any) {
    logger.error('[Phase3Routes] Failed to get active alerts:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/phase3/alerts/acknowledge
 * Acknowledge an alert
 */
router.post('/alerts/acknowledge', (req: Request, res: Response) => {
  try {
    const { alertId, acknowledgedBy } = req.body;
    const success = alertManager.acknowledgeAlert(alertId, acknowledgedBy);
    res.json({ success, alertId });
  } catch (error: any) {
    logger.error('[Phase3Routes] Failed to acknowledge alert:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/phase3/alerts/clear
 * Clear acknowledged alerts
 */
router.post('/alerts/clear', (req: Request, res: Response) => {
  try {
    const cleared = alertManager.clearAcknowledgedAlerts();
    res.json({ success: true, cleared });
  } catch (error: any) {
    logger.error('[Phase3Routes] Failed to clear alerts:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/phase3/alerts/stats
 * Get alert statistics
 */
router.get('/alerts/stats', (req: Request, res: Response) => {
  try {
    const stats = alertManager.getAlertStats();
    res.json(stats);
  } catch (error: any) {
    logger.error('[Phase3Routes] Failed to get alert stats:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/phase3/prediction/risk
 * Get current risk score for an operation
 */
router.get('/prediction/risk', (req: Request, res: Response) => {
  try {
    const { type, pair } = req.query;
    
    const context: any = {
      type: type || 'ORDER_PLACEMENT',
      pair: pair as string,
    };

    const riskScore = riskScorer.calculateRiskScore(context);
    res.json(riskScore);
  } catch (error: any) {
    logger.error('[Phase3Routes] Failed to calculate risk:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/phase3/prediction/history
 * Get prediction history
 */
router.get('/prediction/history', (req: Request, res: Response) => {
  try {
    const minutes = parseInt(req.query.minutes as string) || 60;
    const history = discrepancyPredictor.getPredictionHistory(minutes);
    res.json({ minutes, count: history.length, predictions: history });
  } catch (error: any) {
    logger.error('[Phase3Routes] Failed to get prediction history:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/phase3/prediction/stats
 * Get prediction statistics
 */
router.get('/prediction/stats', (req: Request, res: Response) => {
  try {
    const stats = discrepancyPredictor.getPredictionStats();
    res.json(stats);
  } catch (error: any) {
    logger.error('[Phase3Routes] Failed to get prediction stats:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/phase3/prediction/config
 * Get prediction configuration
 */
router.get('/prediction/config', (req: Request, res: Response) => {
  try {
    const config = discrepancyPredictor.getConfig();
    res.json(config);
  } catch (error: any) {
    logger.error('[Phase3Routes] Failed to get prediction config:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/phase3/prediction/config
 * Update prediction configuration
 */
router.post('/prediction/config', (req: Request, res: Response) => {
  try {
    discrepancyPredictor.updateConfig(req.body);
    const config = discrepancyPredictor.getConfig();
    res.json({ success: true, config });
  } catch (error: any) {
    logger.error('[Phase3Routes] Failed to update prediction config:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/phase3/anomaly/config
 * Get anomaly detection configuration
 */
router.get('/anomaly/config', (req: Request, res: Response) => {
  try {
    const config = anomalyDetector.getConfig();
    res.json(config);
  } catch (error: any) {
    logger.error('[Phase3Routes] Failed to get anomaly config:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/phase3/anomaly/config
 * Update anomaly detection configuration
 */
router.post('/anomaly/config', (req: Request, res: Response) => {
  try {
    anomalyDetector.updateConfig(req.body);
    const config = anomalyDetector.getConfig();
    res.json({ success: true, config });
  } catch (error: any) {
    logger.error('[Phase3Routes] Failed to update anomaly config:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
