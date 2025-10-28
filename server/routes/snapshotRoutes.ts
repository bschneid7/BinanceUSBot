import { Router, Request, Response } from 'express';
import BotState from '../models/BotState';
import snapshotService from '../services/snapshotService';

const router = Router();

/**
 * POST /api/admin/snapshot/create
 * Manually trigger snapshot creation
 */
router.post('/create', async (req: Request, res: Response) => {
  try {
    console.log('[SnapshotRoutes] Manual snapshot creation requested');
    
    const botState = await BotState.findOne();
    if (!botState) {
      return res.status(404).json({
        success: false,
        error: 'Bot state not found'
      });
    }

    await snapshotService.createSnapshot(botState.userId);

    res.json({
      success: true,
      message: 'Snapshot created successfully'
    });
  } catch (error) {
    console.error('[SnapshotRoutes] Error creating snapshot:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create snapshot'
    });
  }
});

/**
 * GET /api/admin/snapshot/list
 * List all snapshots
 */
router.get('/list', async (req: Request, res: Response) => {
  try {
    const botState = await BotState.findOne();
    if (!botState) {
      return res.status(404).json({
        success: false,
        error: 'Bot state not found'
      });
    }

    const { limit = 30 } = req.query;
    const EquitySnapshot = (await import('../models/EquitySnapshot')).default;
    
    const snapshots = await EquitySnapshot.find({ userId: botState.userId })
      .sort({ date: -1 })
      .limit(Number(limit));

    res.json({
      success: true,
      count: snapshots.length,
      snapshots
    });
  } catch (error) {
    console.error('[SnapshotRoutes] Error listing snapshots:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list snapshots'
    });
  }
});

export default router;

