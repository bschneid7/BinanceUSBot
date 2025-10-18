import { Router, Request, Response } from 'express';
import { requireUser } from './middlewares/auth';
import botStatusService from '../services/botStatusService';

const router = Router();

// Description: Get bot status and real-time trading metrics
// Endpoint: GET /api/bot/status
// Request: {}
// Response: {
//   status: 'ACTIVE' | 'HALTED_DAILY' | 'HALTED_WEEKLY' | 'STOPPED',
//   equity: number,
//   availableCapital: number,
//   dailyPnl: number,
//   dailyPnlR: number,
//   weeklyPnl: number,
//   weeklyPnlR: number,
//   reserveLevel: number,
//   openPositions: number,
//   totalOpenRiskR: number,
//   totalExposurePct: number
// }
router.get('/status', requireUser(), async (req: Request, res: Response) => {
  try {
    console.log(`[BotRoutes] GET /api/bot/status - User: ${req.user._id}`);

    const botStatus = await botStatusService.getBotStatus(req.user._id);

    console.log(`[BotRoutes] Bot status retrieved successfully for user: ${req.user._id}`);

    res.status(200).json(botStatus);
  } catch (error) {
    console.error('[BotRoutes] Error fetching bot status:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch bot status';
    res.status(500).json({
      error: errorMessage
    });
  }
});

// Description: Get dashboard overview with bot status, positions, signals, and alerts
// Endpoint: GET /api/bot/overview
// Request: {}
// Response: {
//   botStatus: BotStatusMetrics,
//   recentSignals: Signal[],
//   activePositions: Position[],
//   systemAlerts: Alert[]
// }
router.get('/overview', requireUser(), async (req: Request, res: Response) => {
  try {
    console.log(`[BotRoutes] GET /api/bot/overview - User: ${req.user._id}`);

    const overview = await botStatusService.getDashboardOverview(req.user._id);

    console.log(`[BotRoutes] Dashboard overview retrieved successfully for user: ${req.user._id}`);

    res.status(200).json(overview);
  } catch (error) {
    console.error('[BotRoutes] Error fetching dashboard overview:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch dashboard overview';
    res.status(500).json({
      error: errorMessage
    });
  }
});

// Description: Get system health metrics
// Endpoint: GET /api/bot/health
// Request: {}
// Response: {
//   database: boolean,
//   exchangeAPI: boolean,
//   apiLatencyMs: number,
//   recentErrorCount: number,
//   timestamp: Date
// }
router.get('/health', requireUser(), async (req: Request, res: Response) => {
  try {
    console.log(`[BotRoutes] GET /api/bot/health - User: ${req.user._id}`);

    const health = await botStatusService.getSystemHealth(req.user._id);

    console.log(`[BotRoutes] System health retrieved successfully for user: ${req.user._id}`);

    res.status(200).json(health);
  } catch (error) {
    console.error('[BotRoutes] Error fetching system health:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch system health';
    res.status(500).json({
      error: errorMessage
    });
  }
});

export default router;
