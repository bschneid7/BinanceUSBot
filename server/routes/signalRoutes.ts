import express, { Request, Response } from 'express';
import { requireUser } from './middlewares/auth';
import signalService from '../services/signalService';

const router = express.Router();

// All signal routes require authentication
router.use(requireUser());

// Description: Get recent trading signals
// Endpoint: GET /api/signals/recent
// Request: { limit?: number } (query parameter)
// Response: { signals: Signal[] }
router.get('/recent', async (req: Request, res: Response) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      console.error('❌ User ID not found in request');
      return res.status(401).json({ error: 'Unauthorized - User not authenticated' });
    }

    // Parse limit parameter from query string
    const limitParam = req.query.limit;
    let limit = 10; // Default limit

    if (limitParam) {
      const parsedLimit = parseInt(limitParam as string, 10);
      if (!isNaN(parsedLimit)) {
        limit = parsedLimit;
      } else {
        console.log(`⚠️  Invalid limit parameter: ${limitParam}, using default: 10`);
      }
    }

    console.log(`📡 GET /api/signals/recent - User: ${userId}, Limit: ${limit}`);

    // Fetch signals from service
    const signals = await signalService.getRecentSignals(userId, limit);

    console.log(`✅ Returning ${signals.length} signals`);
    res.status(200).json({ signals });
  } catch (error) {
    console.error('❌ Error fetching recent signals:', error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    }
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to fetch recent signals'
    });
  }
});

// Description: Get signal statistics
// Endpoint: GET /api/signals/stats
// Request: {}
// Response: { stats: { total: number, executed: number, skipped: number, byPlaybook: Record<string, number> } }
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      console.error('❌ User ID not found in request');
      return res.status(401).json({ error: 'Unauthorized - User not authenticated' });
    }

    console.log(`📊 GET /api/signals/stats - User: ${userId}`);

    // Fetch statistics from service
    const stats = await signalService.getSignalStats(userId);

    console.log(`✅ Returning signal statistics`);
    res.status(200).json({ stats });
  } catch (error) {
    console.error('❌ Error fetching signal statistics:', error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    }
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to fetch signal statistics'
    });
  }
});

// Description: Get signals with filters
// Endpoint: GET /api/signals
// Request: { symbol?: string, playbook?: string, action?: string, startDate?: string, endDate?: string } (query parameters)
// Response: { signals: Signal[] }
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      console.error('❌ User ID not found in request');
      return res.status(401).json({ error: 'Unauthorized - User not authenticated' });
    }

    // Parse filter parameters
    const { symbol, playbook, action, startDate, endDate } = req.query;

    const filters: {
      symbol?: string;
      playbook?: 'A' | 'B' | 'C' | 'D';
      action?: 'EXECUTED' | 'SKIPPED';
      startDate?: Date;
      endDate?: Date;
    } = {};

    if (symbol) {
      filters.symbol = symbol as string;
    }

    if (playbook && ['A', 'B', 'C', 'D'].includes(playbook as string)) {
      filters.playbook = playbook as 'A' | 'B' | 'C' | 'D';
    }

    if (action && ['EXECUTED', 'SKIPPED'].includes(action as string)) {
      filters.action = action as 'EXECUTED' | 'SKIPPED';
    }

    if (startDate) {
      filters.startDate = new Date(startDate as string);
    }

    if (endDate) {
      filters.endDate = new Date(endDate as string);
    }

    console.log(`📡 GET /api/signals - User: ${userId}, Filters:`, filters);

    // Fetch signals from service
    const signals = await signalService.getSignalsByFilters(userId, filters);

    console.log(`✅ Returning ${signals.length} filtered signals`);
    res.status(200).json({ signals });
  } catch (error) {
    console.error('❌ Error fetching filtered signals:', error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    }
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to fetch filtered signals'
    });
  }
});

export default router;
