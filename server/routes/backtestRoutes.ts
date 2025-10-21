import express from 'express';
import { Types } from 'mongoose';
import backtestService from '../services/backtestService';
import { generateReport, exportToJSON, exportToCSV, exportEquityCurve } from '../utils/backtestReporter';
import logger from '../utils/logger';

const router = express.Router();

/**
 * POST /api/backtest/run
 * Run a backtest
 */
router.post('/run', async (req, res) => {
  try {
    const { symbol, startDate, endDate, initialEquity } = req.body;

    // Validate inputs
    if (!symbol || !startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: symbol, startDate, endDate',
      });
    }

    // Get userId from session/auth (for now, use a default)
    const userId = new Types.ObjectId('000000000000000000000000'); // TODO: Get from auth

    logger.info(`[BacktestAPI] Running backtest for ${symbol} from ${startDate} to ${endDate}`);

    // Run backtest
    const result = await backtestService.runBacktest(
      userId,
      symbol,
      new Date(startDate),
      new Date(endDate),
      initialEquity || 10000
    );

    // Generate report
    const report = generateReport(result);

    res.json({
      success: true,
      result,
      report,
    });
  } catch (error: any) {
    logger.error('[BacktestAPI] Error running backtest:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to run backtest',
    });
  }
});

/**
 * POST /api/backtest/export
 * Export backtest results
 */
router.post('/export', async (req, res) => {
  try {
    const { result, format } = req.body;

    if (!result || !format) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: result, format',
      });
    }

    const timestamp = Date.now();
    const outputDir = '/tmp';
    let filePath: string;

    switch (format) {
      case 'json':
        filePath = `${outputDir}/backtest_${timestamp}.json`;
        exportToJSON(result, filePath);
        break;

      case 'csv':
        filePath = `${outputDir}/backtest_trades_${timestamp}.csv`;
        exportToCSV(result, filePath);
        break;

      case 'equity':
        filePath = `${outputDir}/backtest_equity_${timestamp}.csv`;
        exportEquityCurve(result, filePath);
        break;

      default:
        return res.status(400).json({
          success: false,
          error: 'Invalid format. Must be: json, csv, or equity',
        });
    }

    // Send file
    res.download(filePath, (err) => {
      if (err) {
        logger.error('[BacktestAPI] Error sending file:', err);
      }
      // Clean up file after sending
      require('fs').unlinkSync(filePath);
    });
  } catch (error: any) {
    logger.error('[BacktestAPI] Error exporting backtest:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to export backtest',
    });
  }
});

export default router;

