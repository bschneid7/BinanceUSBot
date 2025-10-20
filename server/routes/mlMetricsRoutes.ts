import express, { Request, Response } from 'express';
import { requireUser } from './middlewares/auth';
const authMiddleware = requireUser();
import MLPerformanceLog from '../models/MLPerformanceLog';
import { Types } from 'mongoose';

const router = express.Router();

/**
 * GET /api/ml-metrics/summary
 * Get overall ML performance summary
 */
router.get('/summary', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;

    // Get date range (default: last 30 days)
    const daysBack = parseInt(req.query.days as string) || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);

    // Total signals
    const totalSignals = await MLPerformanceLog.countDocuments({
      userId,
      timestamp: { $gte: startDate },
    });

    // Approved vs rejected
    const approvedCount = await MLPerformanceLog.countDocuments({
      userId,
      timestamp: { $gte: startDate },
      'ml.approved': true,
    });

    const rejectedCount = totalSignals - approvedCount;
    const approvalRate = totalSignals > 0 ? (approvedCount / totalSignals) * 100 : 0;

    // Win/loss stats (only for closed positions)
    const closedPositions = await MLPerformanceLog.find({
      userId,
      timestamp: { $gte: startDate },
      'ml.approved': true,
      'outcome.closed': true,
    });

    const wins = closedPositions.filter(p => p.outcome?.winLoss === 'win').length;
    const losses = closedPositions.filter(p => p.outcome?.winLoss === 'loss').length;
    const breakevens = closedPositions.filter(p => p.outcome?.winLoss === 'breakeven').length;

    const winRate = closedPositions.length > 0 ? (wins / closedPositions.length) * 100 : 0;

    // Total P&L
    const totalPnL = closedPositions.reduce((sum, p) => sum + (p.outcome?.pnl || 0), 0);
    const totalPnLR = closedPositions.reduce((sum, p) => sum + (p.outcome?.pnlR || 0), 0);

    // Average confidence
    const avgConfidence = totalSignals > 0
      ? (await MLPerformanceLog.aggregate([
          { $match: { userId: new Types.ObjectId(userId), timestamp: { $gte: startDate } } },
          { $group: { _id: null, avgConf: { $avg: '$ml.confidence' } } },
        ]))[0]?.avgConf || 0
      : 0;

    // By playbook
    const byPlaybook = await MLPerformanceLog.aggregate([
      { $match: { userId: new Types.ObjectId(userId), timestamp: { $gte: startDate } } },
      {
        $group: {
          _id: '$signal.playbook',
          total: { $sum: 1 },
          approved: { $sum: { $cond: ['$ml.approved', 1, 0] } },
        },
      },
    ]);

    res.json({
      period: {
        days: daysBack,
        startDate,
        endDate: new Date(),
      },
      overall: {
        totalSignals,
        approvedCount,
        rejectedCount,
        approvalRate: approvalRate.toFixed(1),
        avgConfidence: (avgConfidence * 100).toFixed(1),
      },
      performance: {
        closedPositions: closedPositions.length,
        wins,
        losses,
        breakevens,
        winRate: winRate.toFixed(1),
        totalPnL: totalPnL.toFixed(2),
        totalPnLR: totalPnLR.toFixed(2),
      },
      byPlaybook: byPlaybook.map(p => ({
        playbook: p._id,
        total: p.total,
        approved: p.approved,
        approvalRate: ((p.approved / p.total) * 100).toFixed(1),
      })),
    });
  } catch (error) {
    console.error('[MLMetrics] Error getting summary:', error);
    res.status(500).json({ error: 'Failed to get ML metrics summary' });
  }
});

/**
 * GET /api/ml-metrics/recent
 * Get recent ML decisions
 */
router.get('/recent', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const limit = parseInt(req.query.limit as string) || 50;

    const recentLogs = await MLPerformanceLog.find({ userId })
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean();

    res.json({
      count: recentLogs.length,
      logs: recentLogs,
    });
  } catch (error) {
    console.error('[MLMetrics] Error getting recent logs:', error);
    res.status(500).json({ error: 'Failed to get recent ML logs' });
  }
});

/**
 * GET /api/ml-metrics/confidence-analysis
 * Analyze performance by confidence level
 */
router.get('/confidence-analysis', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;

    const daysBack = parseInt(req.query.days as string) || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);

    // Group by confidence buckets
    const confidenceBuckets = await MLPerformanceLog.aggregate([
      {
        $match: {
          userId: new Types.ObjectId(userId),
          timestamp: { $gte: startDate },
          'ml.approved': true,
          'outcome.closed': true,
        },
      },
      {
        $bucket: {
          groupBy: '$ml.confidence',
          boundaries: [0, 0.5, 0.7, 0.8, 0.9, 1.0],
          default: 'other',
          output: {
            count: { $sum: 1 },
            wins: { $sum: { $cond: [{ $eq: ['$outcome.winLoss', 'win'] }, 1, 0] } },
            avgPnLR: { $avg: '$outcome.pnlR' },
          },
        },
      },
    ]);

    const analysis = confidenceBuckets.map(bucket => ({
      confidenceRange: bucket._id === 'other' ? 'other' : `${bucket._id * 100}-${(bucket._id + 0.1) * 100}%`,
      count: bucket.count,
      wins: bucket.wins,
      winRate: ((bucket.wins / bucket.count) * 100).toFixed(1),
      avgPnLR: bucket.avgPnLR?.toFixed(2) || '0.00',
    }));

    res.json({ analysis });
  } catch (error) {
    console.error('[MLMetrics] Error in confidence analysis:', error);
    res.status(500).json({ error: 'Failed to analyze confidence levels' });
  }
});

/**
 * GET /api/ml-metrics/rejection-reasons
 * Get breakdown of why ML rejected signals
 */
router.get('/rejection-reasons', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;

    const daysBack = parseInt(req.query.days as string) || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);

    const rejections = await MLPerformanceLog.aggregate([
      {
        $match: {
          userId: new Types.ObjectId(userId),
          timestamp: { $gte: startDate },
          'ml.approved': false,
        },
      },
      {
        $group: {
          _id: '$ml.rejectionReason',
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ]);

    res.json({
      totalRejections: rejections.reduce((sum, r) => sum + r.count, 0),
      reasons: rejections.map(r => ({
        reason: r._id || 'Unknown',
        count: r.count,
      })),
    });
  } catch (error) {
    console.error('[MLMetrics] Error getting rejection reasons:', error);
    res.status(500).json({ error: 'Failed to get rejection reasons' });
  }
});

/**
 * GET /api/ml-metrics/timeline
 * Get ML performance over time
 */
router.get('/timeline', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;

    const daysBack = parseInt(req.query.days as string) || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);

    // Group by day
    const timeline = await MLPerformanceLog.aggregate([
      {
        $match: {
          userId: new Types.ObjectId(userId),
          timestamp: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$timestamp' },
          },
          totalSignals: { $sum: 1 },
          approved: { $sum: { $cond: ['$ml.approved', 1, 0] } },
          avgConfidence: { $avg: '$ml.confidence' },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.json({
      timeline: timeline.map(day => ({
        date: day._id,
        totalSignals: day.totalSignals,
        approved: day.approved,
        rejected: day.totalSignals - day.approved,
        approvalRate: ((day.approved / day.totalSignals) * 100).toFixed(1),
        avgConfidence: (day.avgConfidence * 100).toFixed(1),
      })),
    });
  } catch (error) {
    console.error('[MLMetrics] Error getting timeline:', error);
    res.status(500).json({ error: 'Failed to get timeline' });
  }
});

export default router;

