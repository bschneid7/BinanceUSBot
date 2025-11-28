import express, { Request, Response } from 'express';
import { multiTimeframeAnalysis } from '../services/trading/multiTimeframeAnalysis';
import { riskAdjustedSizing } from '../services/trading/riskAdjustedSizing';
import { portfolioOptimization } from '../services/trading/portfolioOptimization';
import { trailingStopLoss } from '../services/trading/trailingStopLoss';
import { exitStrategies } from '../services/trading/exitStrategies';

const router = express.Router();

/**
 * GET /api/advanced-trading/multi-timeframe/:symbol
 * Get multi-timeframe analysis for a symbol
 */
router.get('/multi-timeframe/:symbol', async (req: Request, res: Response) => {
  try {
    const { symbol } = req.params;
    const analysis = await multiTimeframeAnalysis.analyze(symbol);
    
    res.json({
      success: true,
      analysis,
    });
  } catch (error: any) {
    console.error('[AdvancedTradingRoutes] Error in multi-timeframe analysis:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to analyze symbol',
    });
  }
});

/**
 * POST /api/advanced-trading/validate-signal
 * Validate a trading signal using multi-timeframe analysis
 */
router.post('/validate-signal', async (req: Request, res: Response) => {
  try {
    const { symbol, direction } = req.body;
    
    if (!symbol || !direction) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: symbol, direction',
      });
    }
    
    const validation = await multiTimeframeAnalysis.validateSignal(symbol, direction);
    
    res.json({
      success: true,
      validation,
    });
  } catch (error: any) {
    console.error('[AdvancedTradingRoutes] Error validating signal:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to validate signal',
    });
  }
});

/**
 * POST /api/advanced-trading/calculate-position-size
 * Calculate risk-adjusted position size
 */
router.post('/calculate-position-size', async (req: Request, res: Response) => {
  try {
    const {
      symbol,
      accountEquity,
      basePositionSize = 5,
      maxPositionSize = 10,
      minPositionSize = 2,
    } = req.body;
    
    if (!symbol || !accountEquity) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: symbol, accountEquity',
      });
    }
    
    const result = await riskAdjustedSizing.calculatePositionSize({
      symbol,
      accountEquity,
      basePositionSize,
      maxPositionSize,
      minPositionSize,
    });
    
    res.json({
      success: true,
      result,
    });
  } catch (error: any) {
    console.error('[AdvancedTradingRoutes] Error calculating position size:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to calculate position size',
    });
  }
});

/**
 * GET /api/advanced-trading/portfolio-analysis
 * Get portfolio optimization analysis
 */
router.get('/portfolio-analysis', async (req: Request, res: Response) => {
  try {
    const analysis = await portfolioOptimization.analyzePortfolio();
    
    res.json({
      success: true,
      analysis,
    });
  } catch (error: any) {
    console.error('[AdvancedTradingRoutes] Error analyzing portfolio:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to analyze portfolio',
    });
  }
});

/**
 * POST /api/advanced-trading/rebalance-portfolio
 * Execute portfolio rebalancing
 */
router.post('/rebalance-portfolio', async (req: Request, res: Response) => {
  try {
    await portfolioOptimization.executeRebalancing();
    
    res.json({
      success: true,
      message: 'Portfolio rebalancing initiated',
    });
  } catch (error: any) {
    console.error('[AdvancedTradingRoutes] Error rebalancing portfolio:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to rebalance portfolio',
    });
  }
});

/**
 * GET /api/advanced-trading/trailing-stops
 * Get status of all trailing stops
 */
router.get('/trailing-stops', async (req: Request, res: Response) => {
  try {
    const status = trailingStopLoss.getStatus();
    
    res.json({
      success: true,
      status,
    });
  } catch (error: any) {
    console.error('[AdvancedTradingRoutes] Error getting trailing stops:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get trailing stops',
    });
  }
});

/**
 * POST /api/advanced-trading/add-trailing-stop
 * Add trailing stop for a position
 */
router.post('/add-trailing-stop', async (req: Request, res: Response) => {
  try {
    const {
      symbol,
      positionId,
      entryPrice,
      currentPrice,
      quantity,
      trailingPercent = 5,
      activationPercent = 3,
    } = req.body;
    
    if (!symbol || !positionId || !entryPrice || !currentPrice || !quantity) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
      });
    }
    
    await trailingStopLoss.addTrailingStop({
      symbol,
      positionId,
      entryPrice,
      currentPrice,
      quantity,
      trailingPercent,
      activationPercent,
    });
    
    res.json({
      success: true,
      message: 'Trailing stop added',
    });
  } catch (error: any) {
    console.error('[AdvancedTradingRoutes] Error adding trailing stop:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to add trailing stop',
    });
  }
});

/**
 * DELETE /api/advanced-trading/trailing-stop/:positionId
 * Remove trailing stop for a position
 */
router.delete('/trailing-stop/:positionId', async (req: Request, res: Response) => {
  try {
    const { positionId } = req.params;
    trailingStopLoss.removeTrailingStop(positionId);
    
    res.json({
      success: true,
      message: 'Trailing stop removed',
    });
  } catch (error: any) {
    console.error('[AdvancedTradingRoutes] Error removing trailing stop:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to remove trailing stop',
    });
  }
});

/**
 * POST /api/advanced-trading/evaluate-exit/:positionId
 * Evaluate exit strategies for a position
 */
router.post('/evaluate-exit/:positionId', async (req: Request, res: Response) => {
  try {
    const { positionId } = req.params;
    const { config } = req.body;
    
    // Fetch position
    const positionResponse = await fetch(`http://localhost:3000/api/positions/${positionId}`);
    const positionData = await positionResponse.json();
    
    if (!positionData.position) {
      return res.status(404).json({
        success: false,
        error: 'Position not found',
      });
    }
    
    const exitSignal = await exitStrategies.evaluateExit(positionData.position, config);
    
    res.json({
      success: true,
      exitSignal,
    });
  } catch (error: any) {
    console.error('[AdvancedTradingRoutes] Error evaluating exit:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to evaluate exit',
    });
  }
});

export default router;
