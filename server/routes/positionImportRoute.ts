import express from 'express';
import positionImporter from '../services/positionImporter';
import logger from '../utils/logger';

const router = express.Router();

/**
 * Import untracked holdings as positions
 */
router.post('/import', async (req, res) => {
  try {
    const userId = req.body.userId || '507f1f77bcf86cd799439011'; // Default user ID
    
    logger.info('[API] Starting position import...');
    
    const results = await positionImporter.importUntrackedHoldings(userId);
    
    res.json({
      success: true,
      ...results
    });
    
  } catch (error: any) {
    logger.error('[API] Position import failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get summary of untracked holdings
 */
router.get('/untracked', async (req, res) => {
  try {
    const userId = req.query.userId as string || '507f1f77bcf86cd799439011';
    
    const summary = await positionImporter.getUntrackedHoldingsSummary(userId);
    
    res.json({
      success: true,
      ...summary
    });
    
  } catch (error: any) {
    logger.error('[API] Failed to get untracked summary:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
