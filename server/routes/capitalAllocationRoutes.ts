/**
 * Capital Allocation API Routes
 * 
 * Provides endpoints for viewing and managing capital allocation
 */

import express from 'express';
import { Types } from 'mongoose';
import capitalAllocatorService from '../services/capitalAllocatorService';

const router = express.Router();

/**
 * GET /api/capital-allocation
 * Get current capital allocation across strategy buckets
 */
router.get('/capital-allocation', async (req, res) => {
  try {
    // @ts-ignore - user_id set by auth middleware
    const userId = req.user?.id || req.query.userId;
    
    if (!userId) {
      return res.status(401).json({ error: 'User ID required' });
    }
    
    const allocation = await capitalAllocatorService.calculateAllocation(
      new Types.ObjectId(userId as string)
    );
    
    res.json({
      success: true,
      data: allocation,
    });
  } catch (error: any) {
    console.error('[API] Error fetching capital allocation:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch capital allocation',
    });
  }
});

/**
 * GET /api/capital-allocation/position-size
 * Get recommended position size for a new trade
 */
router.get('/capital-allocation/position-size', async (req, res) => {
  try {
    // @ts-ignore
    const userId = req.user?.id || req.query.userId;
    const strategy = req.query.strategy as string || 'DIRECTIONAL';
    const signalTier = req.query.tier as string;
    
    if (!userId) {
      return res.status(401).json({ error: 'User ID required' });
    }
    
    const positionSize = await capitalAllocatorService.getRecommendedPositionSize(
      new Types.ObjectId(userId as string),
      strategy,
      signalTier
    );
    
    res.json({
      success: true,
      data: {
        recommended_size_usd: positionSize,
        strategy,
        signal_tier: signalTier,
      },
    });
  } catch (error: any) {
    console.error('[API] Error calculating position size:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to calculate position size',
    });
  }
});

export default router;
