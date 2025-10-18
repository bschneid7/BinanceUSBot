import express, { Response } from 'express';
import { requireUser } from './middlewares/auth';
import * as taxReportService from '../services/taxReportService';

interface AuthRequest extends express.Request {
  user?: {
    _id: {
      toString: () => string;
    };
    email: string;
    role: string;
  };
}

const router = express.Router();

// Description: Get all tax reports for the authenticated user
// Endpoint: GET /api/tax/reports
// Request: { year?: number, status?: 'pending' | 'balanced' | 'discrepancy' } (query params)
// Response: { reports: Array<TaxReport> }
router.get('/reports', requireUser(), async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!._id.toString();
    console.log(`[TaxReportRoutes] GET /api/tax/reports - User: ${userId}`);

    const { year, status } = req.query;

    const filters: { year?: number; status?: string } = {};

    if (year) {
      const yearNum = parseInt(year as string, 10);
      if (isNaN(yearNum)) {
        console.error('[TaxReportRoutes] Invalid year parameter');
        return res.status(400).json({ error: 'Invalid year parameter' });
      }
      filters.year = yearNum;
    }

    if (status) {
      if (!['pending', 'balanced', 'discrepancy'].includes(status as string)) {
        console.error('[TaxReportRoutes] Invalid status parameter');
        return res.status(400).json({ error: 'Invalid status parameter' });
      }
      filters.status = status as string;
    }

    const reports = await taxReportService.getTaxReports(userId, filters);

    console.log(`[TaxReportRoutes] Returning ${reports.length} tax reports`);
    res.status(200).json({ reports });
  } catch (error) {
    console.error('[TaxReportRoutes] Error fetching tax reports:', error);
    const err = error as Error;
    res.status(500).json({ error: err.message || 'Failed to fetch tax reports' });
  }
});

// Description: Get a specific tax report by month
// Endpoint: GET /api/tax/reports/:month
// Request: { month: string } (URL param in YYYY-MM format)
// Response: { report: TaxReport }
router.get('/reports/:month', requireUser(), async (req: AuthRequest, res: Response) => {
  try {
    const { month } = req.params;
    const userId = req.user!._id.toString();
    console.log(`[TaxReportRoutes] GET /api/tax/reports/${month} - User: ${userId}`);

    // Validate month format
    if (!/^\d{4}-\d{2}$/.test(month)) {
      console.error('[TaxReportRoutes] Invalid month format');
      return res.status(400).json({ error: 'Invalid month format. Expected YYYY-MM' });
    }

    const report = await taxReportService.getTaxReportByMonth(userId, month);

    if (!report) {
      console.log(`[TaxReportRoutes] Tax report not found for month: ${month}`);
      return res.status(404).json({ error: 'Tax report not found' });
    }

    console.log(`[TaxReportRoutes] Returning tax report for month: ${month}`);
    res.status(200).json({ report });
  } catch (error) {
    console.error('[TaxReportRoutes] Error fetching tax report:', error);
    const err = error as Error;
    res.status(500).json({ error: err.message || 'Failed to fetch tax report' });
  }
});

// Description: Create a new tax report
// Endpoint: POST /api/tax/reports
// Request: { month: string, equity: number, realizedPnl: number, feesPaid: number, balances: object, contentHash: string, frozen?: boolean, pdfUrl?: string, reconciliationStatus?: string, notes?: string }
// Response: { report: TaxReport }
router.post('/reports', requireUser(), async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!._id.toString();
    console.log(`[TaxReportRoutes] POST /api/tax/reports - User: ${userId}`);

    const {
      month,
      equity,
      realizedPnl,
      feesPaid,
      balances,
      contentHash,
      frozen,
      pdfUrl,
      reconciliationStatus,
      notes
    } = req.body;

    // Validate required fields
    if (!month || equity === undefined || realizedPnl === undefined || feesPaid === undefined || !balances || !contentHash) {
      console.error('[TaxReportRoutes] Missing required fields');
      return res.status(400).json({
        error: 'Missing required fields: month, equity, realizedPnl, feesPaid, balances, contentHash'
      });
    }

    // Validate month format
    if (!/^\d{4}-\d{2}$/.test(month)) {
      console.error('[TaxReportRoutes] Invalid month format');
      return res.status(400).json({ error: 'Invalid month format. Expected YYYY-MM' });
    }

    const report = await taxReportService.createTaxReport(userId, {
      month,
      equity,
      realizedPnl,
      feesPaid,
      balances,
      contentHash,
      frozen,
      pdfUrl,
      reconciliationStatus,
      notes
    });

    console.log(`[TaxReportRoutes] Tax report created successfully for month: ${month}`);
    res.status(201).json({ report });
  } catch (error) {
    console.error('[TaxReportRoutes] Error creating tax report:', error);
    const err = error as Error;
    res.status(500).json({ error: err.message || 'Failed to create tax report' });
  }
});

// Description: Update an existing tax report (only if not frozen)
// Endpoint: PUT /api/tax/reports/:month
// Request: { equity?: number, realizedPnl?: number, feesPaid?: number, balances?: object, pdfUrl?: string, reconciliationStatus?: string, notes?: string }
// Response: { report: TaxReport }
router.put('/reports/:month', requireUser(), async (req: AuthRequest, res: Response) => {
  try {
    const { month } = req.params;
    const userId = req.user!._id.toString();
    console.log(`[TaxReportRoutes] PUT /api/tax/reports/${month} - User: ${userId}`);

    // Validate month format
    if (!/^\d{4}-\d{2}$/.test(month)) {
      console.error('[TaxReportRoutes] Invalid month format');
      return res.status(400).json({ error: 'Invalid month format. Expected YYYY-MM' });
    }

    const updates = req.body;

    const report = await taxReportService.updateTaxReport(userId, month, updates);

    console.log(`[TaxReportRoutes] Tax report updated successfully for month: ${month}`);
    res.status(200).json({ report });
  } catch (error) {
    console.error('[TaxReportRoutes] Error updating tax report:', error);
    const err = error as Error;
    res.status(500).json({ error: err.message || 'Failed to update tax report' });
  }
});

// Description: Delete a tax report (only if not frozen)
// Endpoint: DELETE /api/tax/reports/:month
// Request: { month: string } (URL param)
// Response: { success: boolean, message: string }
router.delete('/reports/:month', requireUser(), async (req: AuthRequest, res: Response) => {
  try {
    const { month } = req.params;
    const userId = req.user!._id.toString();
    console.log(`[TaxReportRoutes] DELETE /api/tax/reports/${month} - User: ${userId}`);

    // Validate month format
    if (!/^\d{4}-\d{2}$/.test(month)) {
      console.error('[TaxReportRoutes] Invalid month format');
      return res.status(400).json({ error: 'Invalid month format. Expected YYYY-MM' });
    }

    await taxReportService.deleteTaxReport(userId, month);

    console.log(`[TaxReportRoutes] Tax report deleted successfully for month: ${month}`);
    res.status(200).json({ success: true, message: 'Tax report deleted successfully' });
  } catch (error) {
    console.error('[TaxReportRoutes] Error deleting tax report:', error);
    const err = error as Error;
    res.status(500).json({ error: err.message || 'Failed to delete tax report' });
  }
});

// Description: Get tax report statistics
// Endpoint: GET /api/tax/stats
// Request: {}
// Response: { stats: object }
router.get('/stats', requireUser(), async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!._id.toString();
    console.log(`[TaxReportRoutes] GET /api/tax/stats - User: ${userId}`);

    const stats = await taxReportService.getTaxReportStats(userId);

    console.log(`[TaxReportRoutes] Returning tax report statistics`);
    res.status(200).json({ stats });
  } catch (error) {
    console.error('[TaxReportRoutes] Error fetching tax report statistics:', error);
    const err = error as Error;
    res.status(500).json({ error: err.message || 'Failed to fetch tax report statistics' });
  }
});

export default router;
