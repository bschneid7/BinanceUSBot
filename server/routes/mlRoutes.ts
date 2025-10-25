import express from 'express';
import { requireUser } from '../middleware/auth';
import { MLMonitor, MLPredictionLog, MLErrorLog } from '../services/mlMonitor';
import { BotConfig } from '../models/BotConfig';

const router = express.Router();

/**
 * GET /api/ml/metrics
 * Get ML performance metrics for a time range
 */
router.get('/metrics', requireUser(), async (req, res) => {
  try {
    const { range = '24h' } = req.query;
    
    if (!['1h', '24h', '7d', '30d'].includes(range as string)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid time range. Must be one of: 1h, 24h, 7d, 30d'
      });
    }
    
    const metrics = await MLMonitor.getMetrics(
      req.user._id, 
      range as '1h' | '24h' | '7d' | '30d'
    );
    
    res.json({
      success: true,
      metrics
    });
  } catch (error: any) {
    console.error('[MLRoutes] Error getting metrics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get ML metrics',
      details: error.message
    });
  }
});

/**
 * GET /api/ml/alerts
 * Get current ML alerts
 */
router.get('/alerts', requireUser(), async (req, res) => {
  try {
    const alerts = await MLMonitor.getAlerts(req.user._id);
    
    res.json({
      success: true,
      alerts,
      count: alerts.length
    });
  } catch (error: any) {
    console.error('[MLRoutes] Error getting alerts:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get ML alerts',
      details: error.message
    });
  }
});

/**
 * GET /api/ml/rollback-check
 * Check if rollback conditions are met
 */
router.get('/rollback-check', requireUser(), async (req, res) => {
  try {
    const rollbackCheck = await MLMonitor.checkRollbackConditions(req.user._id);
    
    res.json({
      success: true,
      ...rollbackCheck
    });
  } catch (error: any) {
    console.error('[MLRoutes] Error checking rollback conditions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check rollback conditions',
      details: error.message
    });
  }
});

/**
 * GET /api/ml/predictions
 * Get recent ML predictions
 */
router.get('/predictions', requireUser(), async (req, res) => {
  try {
    const { limit = 100, symbol } = req.query;
    
    const query: any = { userId: req.user._id };
    if (symbol) {
      query.symbol = symbol;
    }
    
    const predictions = await MLPredictionLog.find(query)
      .sort({ timestamp: -1 })
      .limit(Number(limit))
      .lean();
    
    res.json({
      success: true,
      predictions,
      count: predictions.length
    });
  } catch (error: any) {
    console.error('[MLRoutes] Error getting predictions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get ML predictions',
      details: error.message
    });
  }
});

/**
 * GET /api/ml/errors
 * Get recent ML errors
 */
router.get('/errors', requireUser(), async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    
    const errors = await MLErrorLog.find({ userId: req.user._id })
      .sort({ timestamp: -1 })
      .limit(Number(limit))
      .lean();
    
    res.json({
      success: true,
      errors,
      count: errors.length
    });
  } catch (error: any) {
    console.error('[MLRoutes] Error getting errors:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get ML errors',
      details: error.message
    });
  }
});

/**
 * POST /api/ml/enable
 * Enable ML trading with specified allocation
 */
router.post('/enable', requireUser(), async (req, res) => {
  try {
    const { allocationPct = 10, modelVersion = 'v1', minConfidence = 0.6 } = req.body;
    
    // Validation
    if (allocationPct < 0 || allocationPct > 100) {
      return res.status(400).json({
        success: false,
        error: 'Allocation percentage must be between 0 and 100'
      });
    }
    
    if (minConfidence < 0 || minConfidence > 1) {
      return res.status(400).json({
        success: false,
        error: 'Minimum confidence must be between 0 and 1'
      });
    }
    
    // Update config
    await BotConfig.updateOne(
      { userId: req.user._id },
      {
        $set: {
          'ml.enabled': true,
          'ml.model_version': modelVersion,
          'ml.allocation_pct': allocationPct,
          'ml.min_confidence': minConfidence
        }
      },
      { upsert: true }
    );
    
    console.log(`[MLRoutes] ✅ ML enabled: ${allocationPct}% allocation, model ${modelVersion}`);
    
    res.json({
      success: true,
      message: 'ML trading enabled',
      config: {
        enabled: true,
        allocationPct,
        modelVersion,
        minConfidence
      }
    });
  } catch (error: any) {
    console.error('[MLRoutes] Error enabling ML:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to enable ML trading',
      details: error.message
    });
  }
});

/**
 * POST /api/ml/disable
 * Disable ML trading
 */
router.post('/disable', requireUser(), async (req, res) => {
  try {
    const { reason } = req.body;
    
    // Update config
    await BotConfig.updateOne(
      { userId: req.user._id },
      {
        $set: {
          'ml.enabled': false,
          'ml.allocation_pct': 0
        }
      }
    );
    
    console.log(`[MLRoutes] 🛑 ML disabled. Reason: ${reason || 'Manual disable'}`);
    
    res.json({
      success: true,
      message: 'ML trading disabled',
      reason: reason || 'Manual disable'
    });
  } catch (error: any) {
    console.error('[MLRoutes] Error disabling ML:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to disable ML trading',
      details: error.message
    });
  }
});

/**
 * POST /api/ml/update-allocation
 * Update ML allocation percentage
 */
router.post('/update-allocation', requireUser(), async (req, res) => {
  try {
    const { allocationPct } = req.body;
    
    if (typeof allocationPct !== 'number' || allocationPct < 0 || allocationPct > 100) {
      return res.status(400).json({
        success: false,
        error: 'Allocation percentage must be a number between 0 and 100'
      });
    }
    
    await BotConfig.updateOne(
      { userId: req.user._id },
      { $set: { 'ml.allocation_pct': allocationPct } }
    );
    
    console.log(`[MLRoutes] 📊 ML allocation updated: ${allocationPct}%`);
    
    res.json({
      success: true,
      message: 'ML allocation updated',
      allocationPct
    });
  } catch (error: any) {
    console.error('[MLRoutes] Error updating allocation:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update ML allocation',
      details: error.message
    });
  }
});

/**
 * GET /api/ml/status
 * Get current ML configuration and status
 */
router.get('/status', requireUser(), async (req, res) => {
  try {
    const config = await BotConfig.findOne({ userId: req.user._id }).lean();
    
    if (!config || !config.ml) {
      return res.json({
        success: true,
        status: {
          enabled: false,
          allocationPct: 0,
          modelVersion: 'none',
          minConfidence: 0.6,
          fallbackToRules: true
        }
      });
    }
    
    res.json({
      success: true,
      status: {
        enabled: config.ml.enabled || false,
        allocationPct: config.ml.allocation_pct || 0,
        modelVersion: config.ml.model_version || 'v1',
        minConfidence: config.ml.min_confidence || 0.6,
        fallbackToRules: config.ml.fallback_to_rules !== false
      }
    });
  } catch (error: any) {
    console.error('[MLRoutes] Error getting status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get ML status',
      details: error.message
    });
  }
});

export default router;

