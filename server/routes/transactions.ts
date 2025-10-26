import express, { Request, Response } from 'express';
import Transaction from '../models/Transaction';
import BotConfig from '../models/BotConfig';

const router = express.Router();

/**
 * GET /api/transactions
 * Get all transactions for tax reporting
 * Query params:
 *   - symbol: Filter by symbol (optional)
 *   - type: Filter by type (GRID, MANUAL, etc.) (optional)
 *   - startDate: Filter by start date (optional)
 *   - endDate: Filter by end date (optional)
 *   - limit: Number of records to return (default: 100)
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    // Get bot config to get user ID
    const botConfig = await BotConfig.findOne();
    if (!botConfig) {
      return res.status(404).json({ error: 'Bot config not found' });
    }

    // Build query
    const query: any = { userId: botConfig.userId };

    if (req.query.symbol) {
      query.symbol = req.query.symbol;
    }

    if (req.query.type) {
      query.type = req.query.type;
    }

    if (req.query.startDate || req.query.endDate) {
      query.timestamp = {};
      if (req.query.startDate) {
        query.timestamp.$gte = new Date(req.query.startDate as string);
      }
      if (req.query.endDate) {
        query.timestamp.$lte = new Date(req.query.endDate as string);
      }
    }

    const limit = parseInt(req.query.limit as string) || 100;

    // Fetch transactions
    const transactions = await Transaction.find(query)
      .sort({ timestamp: -1 })
      .limit(limit);

    // Calculate summary statistics
    const totalBuys = transactions.filter(t => t.side === 'BUY').length;
    const totalSells = transactions.filter(t => t.side === 'SELL').length;
    const totalFees = transactions.reduce((sum, t) => sum + t.fees, 0);
    const totalVolume = transactions.reduce((sum, t) => sum + t.total, 0);

    res.json({
      transactions,
      summary: {
        total: transactions.length,
        buys: totalBuys,
        sells: totalSells,
        totalFees: parseFloat(totalFees.toFixed(2)),
        totalVolume: parseFloat(totalVolume.toFixed(2))
      }
    });
  } catch (error: any) {
    console.error('[TransactionsAPI] Error fetching transactions:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/transactions/export
 * Export transactions as CSV for tax reporting
 */
router.get('/export', async (req: Request, res: Response) => {
  try {
    // Get bot config to get user ID
    const botConfig = await BotConfig.findOne();
    if (!botConfig) {
      return res.status(404).json({ error: 'Bot config not found' });
    }

    // Build query (same as above)
    const query: any = { userId: botConfig.userId };

    if (req.query.symbol) {
      query.symbol = req.query.symbol;
    }

    if (req.query.type) {
      query.type = req.query.type;
    }

    if (req.query.startDate || req.query.endDate) {
      query.timestamp = {};
      if (req.query.startDate) {
        query.timestamp.$gte = new Date(req.query.startDate as string);
      }
      if (req.query.endDate) {
        query.timestamp.$lte = new Date(req.query.endDate as string);
      }
    }

    // Fetch all transactions (no limit for export)
    const transactions = await Transaction.find(query)
      .sort({ timestamp: -1 });

    // Generate CSV
    const csvHeader = 'Date,Symbol,Side,Quantity,Price,Total,Fees,Type,Order ID\n';
    const csvRows = transactions.map(t => {
      const date = new Date(t.timestamp).toISOString();
      return `${date},${t.symbol},${t.side},${t.quantity},${t.price},${t.total},${t.fees},${t.type},${t.orderId || ''}`;
    }).join('\n');

    const csv = csvHeader + csvRows;

    // Set headers for file download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=transactions_${new Date().toISOString().split('T')[0]}.csv`);
    res.send(csv);
  } catch (error: any) {
    console.error('[TransactionsAPI] Error exporting transactions:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;

