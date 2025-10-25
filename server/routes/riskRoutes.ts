import express from 'express';
import { requireUser } from './middlewares/auth';
import kellyPositionSizer from '../services/kellyPositionSizer';
import advancedRiskManager from '../services/advancedRiskManager';
import {
  validateRequest,
  KellySizeRequestSchema,
  PreTradeCheckRequestSchema,
  DynamicStopRequestSchema
} from '../validation/riskValidation';

const router = express.Router();

/**
 * Get risk management statistics
 * GET /api/risk/stats
 */
router.get('/stats', requireUser(), async (req, res) => {
  try {
    const userId = req.user._id;
    
    const stats = await advancedRiskManager.getRiskStats(userId);
    
    console.log(`[RiskRoutes] Risk stats for user ${userId}:`, stats);
    
    res.status(200).json({
      success: true,
      stats
    });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('[RiskRoutes] Error getting risk stats:', err);
    res.status(500).json({
      error: err.message || 'Failed to get risk stats'
    });
  }
});

/**
 * Calculate Kelly position size
 * POST /api/risk/kelly-size
 * Body: { symbol: string, playbook: 'A'|'B'|'C'|'D', stopLossDistance: number }
 */
router.post('/kelly-size', requireUser(), validateRequest(KellySizeRequestSchema), async (req, res) => {
  try {
    const userId = req.user._id;
    const { symbol, playbook, stopLossDistance } = req.validatedBody;
    
    const result = await kellyPositionSizer.calculatePositionSize(
      userId,
      symbol,
      playbook,
      stopLossDistance
    );
    
    console.log(`[RiskRoutes] Kelly size for ${symbol} ${playbook}: $${result.positionSize.toFixed(2)}`);
    
    res.status(200).json({
      success: true,
      result
    });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('[RiskRoutes] Error calculating Kelly size:', err);
    res.status(500).json({
      error: err.message || 'Failed to calculate Kelly size'
    });
  }
});

/**
 * Pre-trade risk check
 * POST /api/risk/pre-trade-check
 * Body: { symbol: string, playbook: 'A'|'B'|'C'|'D', proposedSize: number, stopLossDistance: number }
 */
router.post('/pre-trade-check', requireUser(), validateRequest(PreTradeCheckRequestSchema), async (req, res) => {
  try {
    const userId = req.user._id;
    const { symbol, playbook, proposedSize, stopLossDistance } = req.validatedBody;
    
    const result = await advancedRiskManager.preTradeRiskCheck(
      userId,
      symbol,
      playbook,
      proposedSize,
      stopLossDistance
    );
    
    console.log(`[RiskRoutes] Pre-trade check for ${symbol}: ${result.allowed ? 'ALLOWED' : 'BLOCKED'}`);
    if (!result.allowed) {
      console.log(`[RiskRoutes] Reason: ${result.reason}`);
    }
    
    res.status(200).json({
      success: true,
      result
    });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('[RiskRoutes] Error in pre-trade check:', err);
    res.status(500).json({
      error: err.message || 'Failed to perform pre-trade check'
    });
  }
});

/**
 * Get portfolio heat
 * GET /api/risk/portfolio-heat
 */
router.get('/portfolio-heat', requireUser(), async (req, res) => {
  try {
    const userId = req.user._id;
    
    const heat = await kellyPositionSizer.getPortfolioHeat(userId);
    
    console.log(`[RiskRoutes] Portfolio heat for user ${userId}: ${(heat * 100).toFixed(1)}%`);
    
    res.status(200).json({
      success: true,
      portfolioHeat: heat,
      portfolioHeatPercent: (heat * 100).toFixed(2)
    });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('[RiskRoutes] Error getting portfolio heat:', err);
    res.status(500).json({
      error: err.message || 'Failed to get portfolio heat'
    });
  }
});

/**
 * Calculate dynamic stop loss
 * POST /api/risk/dynamic-stop
 * Body: { symbol: string, entryPrice: number, side: 'LONG'|'SHORT', atrMultiplier?: number }
 */
router.post('/dynamic-stop', requireUser(), validateRequest(DynamicStopRequestSchema), async (req, res) => {
  try {
    const { symbol, entryPrice, side, atrMultiplier } = req.validatedBody;
    
    const stopPrice = await advancedRiskManager.calculateDynamicStopLoss(
      symbol,
      entryPrice,
      side,
      atrMultiplier || 2.0
    );
    
    const stopDistance = Math.abs(stopPrice - entryPrice) / entryPrice;
    
    console.log(`[RiskRoutes] Dynamic stop for ${symbol} ${side}: ${stopPrice.toFixed(2)} (${(stopDistance * 100).toFixed(1)}%)`);
    
    res.status(200).json({
      success: true,
      stopPrice,
      stopDistance,
      stopDistancePercent: (stopDistance * 100).toFixed(2)
    });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('[RiskRoutes] Error calculating dynamic stop:', err);
    res.status(500).json({
      error: err.message || 'Failed to calculate dynamic stop'
    });
  }
});

export default router;

