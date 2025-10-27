import { Router } from 'express';
import Position from '../models/Position';
import BotConfig from '../models/BotConfig';

const router = Router();

// Store recent activity in memory (last 50 events)
const activityLog: any[] = [];

export function logActivity(type: string, data: any) {
  activityLog.unshift({
    timestamp: new Date(),
    type,
    ...data
  });
  
  // Keep only last 50 events
  if (activityLog.length > 50) {
    activityLog.pop();
  }
}

// GET /api/bot/activity - Get recent bot activity
router.get('/activity', async (req, res) => {
  try {
    const userId = req.user?._id;
    
    // Get current bot status
    const config = await BotConfig.findOne({ userId });
    const openPositions = await Position.find({ userId, status: 'OPEN' });
    
    // Get recent activity (last 20 events)
    const recentActivity = activityLog.slice(0, 20);
    
    // Calculate summary stats
    const signalCount = recentActivity.filter(a => a.type === 'signal_evaluated').length;
    const rejectedCount = recentActivity.filter(a => a.type === 'signal_rejected').length;
    const acceptedCount = recentActivity.filter(a => a.type === 'signal_accepted').length;
    
    res.json({
      success: true,
      data: {
        status: {
          botRunning: config?.botStatus === 'ACTIVE',
          openPositions: openPositions.length,
          maxPositions: config?.risk?.max_positions || 6,
          canOpenNew: openPositions.length < (config?.risk?.max_positions || 6),
          blockReason: openPositions.length >= (config?.risk?.max_positions || 6) 
            ? 'At maximum position limit' 
            : null
        },
        summary: {
          signalsEvaluated: signalCount,
          signalsRejected: rejectedCount,
          signalsAccepted: acceptedCount,
          lastActivityTime: recentActivity[0]?.timestamp || null
        },
        recentActivity: recentActivity.map(activity => ({
          timestamp: activity.timestamp,
          type: activity.type,
          symbol: activity.symbol,
          playbook: activity.playbook,
          reason: activity.reason,
          details: activity.details,
          action: activity.action
        }))
      }
    });
  } catch (error: any) {
    console.error('Error fetching bot activity:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;

