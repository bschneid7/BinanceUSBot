import express from 'express';
import { requireUser } from './middlewares/auth';
import analyticsService from '../services/analyticsService';
const router = express.Router();
// Description: Get performance metrics for analytics dashboard
// Endpoint: GET /api/analytics/performance
// Request: {}
// Response: { metrics: PerformanceMetrics }
router.get('/performance', requireUser(), async (req, res) => {
    try {
        console.log(`[AnalyticsRoutes] GET /performance - User: ${req.user?._id}`);
        if (!req.user) {
            console.error('[AnalyticsRoutes] User not authenticated');
            return res.status(401).json({ error: 'User not authenticated' });
        }
        const metrics = await analyticsService.getPerformanceMetrics(req.user._id);
        console.log(`[AnalyticsRoutes] Performance metrics retrieved successfully`);
        res.status(200).json({ metrics });
    }
    catch (error) {
        console.error('[AnalyticsRoutes] Error fetching performance metrics:', error);
        if (error instanceof Error) {
            console.error('[AnalyticsRoutes] Error details:', error.message);
            console.error('[AnalyticsRoutes] Error stack:', error.stack);
        }
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Failed to fetch performance metrics'
        });
    }
});
// Description: Get equity curve data for charting
// Endpoint: GET /api/analytics/equity-curve
// Request: { days?: number }
// Response: { data: Array<{ date: string, equity: number }> }
router.get('/equity-curve', requireUser(), async (req, res) => {
    try {
        const days = req.query.days ? parseInt(req.query.days, 10) : 30;
        console.log(`[AnalyticsRoutes] GET /equity-curve - User: ${req.user?._id}, Days: ${days}`);
        if (!req.user) {
            console.error('[AnalyticsRoutes] User not authenticated');
            return res.status(401).json({ error: 'User not authenticated' });
        }
        // Validate days parameter
        if (isNaN(days) || days < 1 || days > 365) {
            console.error('[AnalyticsRoutes] Invalid days parameter:', days);
            return res.status(400).json({
                error: 'Invalid days parameter. Must be between 1 and 365'
            });
        }
        const data = await analyticsService.getEquityCurve(req.user._id, days);
        console.log(`[AnalyticsRoutes] Equity curve data retrieved successfully with ${data.length} points`);
        res.status(200).json({ data });
    }
    catch (error) {
        console.error('[AnalyticsRoutes] Error fetching equity curve:', error);
        if (error instanceof Error) {
            console.error('[AnalyticsRoutes] Error details:', error.message);
            console.error('[AnalyticsRoutes] Error stack:', error.stack);
        }
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Failed to fetch equity curve'
        });
    }
});
export default router;
//# sourceMappingURL=analyticsRoutes.js.map