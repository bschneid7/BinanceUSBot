import express from 'express';
import { requireUser } from './middlewares/auth';
import TradeService from '../services/tradeService';

const router = express.Router();

// Description: Get trade history with optional filters
// Endpoint: GET /api/trades/history
// Request: { startDate?: string, endDate?: string, playbook?: string, outcome?: string, symbol?: string }
// Response: { trades: Trade[] }
router.get('/history', requireUser, async (req, res) => {
  try {
    console.log('[GET /api/trades/history] Request from user:', req.user._id);

    const { startDate, endDate, playbook, outcome, symbol } = req.query;

    const filters: any = {};

    if (startDate) filters.startDate = startDate as string;
    if (endDate) filters.endDate = endDate as string;
    if (playbook) filters.playbook = playbook as string;
    if (outcome) filters.outcome = outcome as string;
    if (symbol) filters.symbol = symbol as string;

    const trades = await TradeService.getTradeHistory(req.user._id, filters);

    console.log(`[GET /api/trades/history] Returning ${trades.length} trades`);
    res.status(200).json({ trades });
  } catch (error) {
    console.error('[GET /api/trades/history] Error:', error);
    if (error instanceof Error) {
      console.error('[GET /api/trades/history] Error message:', error.message);
      console.error('[GET /api/trades/history] Error stack:', error.stack);
    }
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to fetch trade history'
    });
  }
});

// Description: Get a single trade by ID
// Endpoint: GET /api/trades/:id
// Request: {}
// Response: { trade: Trade }
router.get('/:id', requireUser, async (req, res) => {
  try {
    console.log(`[GET /api/trades/:id] Request from user: ${req.user._id}, tradeId: ${req.params.id}`);

    const trade = await TradeService.getTradeById(req.params.id, req.user._id);

    if (!trade) {
      console.log(`[GET /api/trades/:id] Trade not found: ${req.params.id}`);
      return res.status(404).json({ error: 'Trade not found' });
    }

    console.log(`[GET /api/trades/:id] Returning trade: ${trade._id}`);
    res.status(200).json({ trade });
  } catch (error) {
    console.error('[GET /api/trades/:id] Error:', error);
    if (error instanceof Error) {
      console.error('[GET /api/trades/:id] Error message:', error.message);
      console.error('[GET /api/trades/:id] Error stack:', error.stack);
    }
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to fetch trade'
    });
  }
});

// Description: Get trade statistics
// Endpoint: GET /api/trades/stats
// Request: {}
// Response: { stats: TradeStatistics }
router.get('/stats/summary', requireUser, async (req, res) => {
  try {
    console.log('[GET /api/trades/stats] Request from user:', req.user._id);

    const stats = await TradeService.getTradeStatistics(req.user._id);

    console.log('[GET /api/trades/stats] Returning statistics');
    res.status(200).json({ stats });
  } catch (error) {
    console.error('[GET /api/trades/stats] Error:', error);
    if (error instanceof Error) {
      console.error('[GET /api/trades/stats] Error message:', error.message);
      console.error('[GET /api/trades/stats] Error stack:', error.stack);
    }
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to fetch trade statistics'
    });
  }
});

export default router;
