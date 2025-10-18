import express from 'express';
import { requireUser } from './middlewares/auth';
import alertService from '../services/alertService';
const router = express.Router();
// Description: Get system alerts with optional limit parameter
// Endpoint: GET /api/alerts
// Request: { limit?: number, level?: string, type?: string }
// Response: { alerts: Array<Alert> }
router.get('/', requireUser(), async (req, res) => {
    try {
        const { limit, level, type } = req.query;
        const userId = req.user._id.toString();
        console.log(`[AlertRoutes] GET /api/alerts - User: ${userId}, Limit: ${limit || 20}, Level: ${level || 'all'}, Type: ${type || 'all'}`);
        // Parse and validate limit parameter
        let alertLimit = 20; // Default limit
        if (limit) {
            const parsedLimit = parseInt(limit, 10);
            if (isNaN(parsedLimit) || parsedLimit < 1) {
                console.warn(`[AlertRoutes] Invalid limit parameter: ${limit}, using default 20`);
            }
            else if (parsedLimit > 100) {
                console.warn(`[AlertRoutes] Limit ${parsedLimit} exceeds maximum 100, capping at 100`);
                alertLimit = 100;
            }
            else {
                alertLimit = parsedLimit;
            }
        }
        let alerts;
        // Filter by level if specified
        if (level && ['INFO', 'WARNING', 'ERROR', 'CRITICAL'].includes(level.toUpperCase())) {
            alerts = await alertService.getAlertsByLevel(userId, level.toUpperCase(), alertLimit);
        }
        // Filter by type if specified
        else if (type) {
            alerts = await alertService.getAlertsByType(userId, type, alertLimit);
        }
        // Get all recent alerts
        else {
            alerts = await alertService.getRecentAlerts(userId, alertLimit);
        }
        console.log(`[AlertRoutes] Returning ${alerts.length} alerts for user ${userId}`);
        res.status(200).json({ alerts });
    }
    catch (error) {
        console.error(`[AlertRoutes] Error fetching alerts:`, error);
        const err = error;
        res.status(500).json({
            error: err.message || 'Failed to fetch alerts'
        });
    }
});
// Description: Get alert statistics
// Endpoint: GET /api/alerts/stats
// Request: {}
// Response: { total: number, info: number, warning: number, error: number, critical: number }
router.get('/stats', requireUser(), async (req, res) => {
    try {
        const userId = req.user._id.toString();
        console.log(`[AlertRoutes] GET /api/alerts/stats - User: ${userId}`);
        const stats = await alertService.getAlertStats(userId);
        console.log(`[AlertRoutes] Returning alert statistics for user ${userId}`);
        res.status(200).json(stats);
    }
    catch (error) {
        console.error(`[AlertRoutes] Error fetching alert statistics:`, error);
        const err = error;
        res.status(500).json({
            error: err.message || 'Failed to fetch alert statistics'
        });
    }
});
// Description: Create a new alert (admin/system use)
// Endpoint: POST /api/alerts
// Request: { level: string, message: string, type: string }
// Response: { alert: Alert }
router.post('/', requireUser(), async (req, res) => {
    try {
        const { level, message, type } = req.body;
        const userId = req.user._id.toString();
        console.log(`[AlertRoutes] POST /api/alerts - User: ${userId}, Level: ${level}, Type: ${type}`);
        // Validate required fields
        if (!level || !message || !type) {
            return res.status(400).json({
                error: 'Missing required fields: level, message, type'
            });
        }
        // Validate level
        if (!['INFO', 'WARNING', 'ERROR', 'CRITICAL'].includes(level.toUpperCase())) {
            return res.status(400).json({
                error: 'Invalid level. Must be one of: INFO, WARNING, ERROR, CRITICAL'
            });
        }
        const alert = await alertService.createAlert({
            userId,
            level: level.toUpperCase(),
            message,
            type
        });
        console.log(`[AlertRoutes] Alert created successfully with ID: ${alert._id}`);
        res.status(201).json({ alert });
    }
    catch (error) {
        console.error(`[AlertRoutes] Error creating alert:`, error);
        const err = error;
        res.status(500).json({
            error: err.message || 'Failed to create alert'
        });
    }
});
export default router;
//# sourceMappingURL=alertRoutes.js.map