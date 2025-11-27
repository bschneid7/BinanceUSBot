import express from 'express';
import BotConfig from '../models/BotConfig';
import logger from '../utils/logger';

const router = express.Router();

/**
 * POST /api/config/update-limits
 * Update max positions and exposure limits
 */
router.post('/update-limits', async (req, res) => {
  try {
    logger.info('[ConfigUpdate] Updating bot configuration limits...');

    const result = await BotConfig.updateOne(
      {}, // Update first config found
      {
        $set: {
          'risk.max_positions': 18,
          'risk.max_exposure_pct': 0.90,
        }
      }
    );

    const config = await BotConfig.findOne({});
    
    logger.info('[ConfigUpdate] ✅ Configuration updated successfully');

    res.json({
      success: true,
      message: 'Configuration updated successfully',
      config: {
        max_positions: config?.risk.max_positions,
        max_exposure_pct: config?.risk.max_exposure_pct,
      }
    });
  } catch (error) {
    logger.error('[ConfigUpdate] Error updating configuration:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update configuration'
    });
  }
});

export default router;
