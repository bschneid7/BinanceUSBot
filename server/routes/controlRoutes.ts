import { Router, Request, Response } from 'express';
import BotState from '../models/BotState';
import BotConfig from '../models/BotConfig';
import Position from '../models/Position';
import { getDashboardWebSocket } from './dashboardWebSocket';

const router = Router();

/**
 * POST /api/control/bot/start
 * Start the trading bot
 */
router.post('/bot/start', async (req: Request, res: Response) => {
    try {
        const botState = await BotState.findOne();
        
        if (!botState) {
            return res.status(404).json({
                success: false,
                error: 'Bot state not found'
            });
        }

        if (botState.isActive) {
            return res.json({
                success: true,
                message: 'Bot is already running'
            });
        }

        // Start the bot
        botState.isActive = true;
        await botState.save();

        // Broadcast status change
        const ws = getDashboardWebSocket();
        if (ws) {
            ws.broadcastBotStatus({ isActive: true, reason: 'Manual start' });
        }

        console.log('[Control] Bot started manually');

        res.json({
            success: true,
            message: 'Bot started successfully',
            data: {
                isActive: true,
                timestamp: new Date()
            }
        });
    } catch (error) {
        console.error('[Control] Error starting bot:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to start bot'
        });
    }
});

/**
 * POST /api/control/bot/stop
 * Stop the trading bot (keeps positions open)
 */
router.post('/bot/stop', async (req: Request, res: Response) => {
    try {
        const botState = await BotState.findOne();
        
        if (!botState) {
            return res.status(404).json({
                success: false,
                error: 'Bot state not found'
            });
        }

        if (!botState.isActive) {
            return res.json({
                success: true,
                message: 'Bot is already stopped'
            });
        }

        // Stop the bot
        botState.isActive = false;
        await botState.save();

        // Broadcast status change
        const ws = getDashboardWebSocket();
        if (ws) {
            ws.broadcastBotStatus({ isActive: false, reason: 'Manual stop' });
        }

        console.log('[Control] Bot stopped manually');

        res.json({
            success: true,
            message: 'Bot stopped successfully',
            data: {
                isActive: false,
                timestamp: new Date()
            }
        });
    } catch (error) {
        console.error('[Control] Error stopping bot:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to stop bot'
        });
    }
});

/**
 * POST /api/control/bot/emergency-stop
 * Emergency stop: close all positions and stop bot
 */
router.post('/bot/emergency-stop', async (req: Request, res: Response) => {
    try {
        console.log('[Control] ⚠️  EMERGENCY STOP INITIATED');

        // Stop the bot first
        const botState = await BotState.findOne();
        if (botState) {
            botState.isActive = false;
            await botState.save();
        }

        // Get all open positions
        const openPositions = await Position.find({ status: 'OPEN' });
        console.log(`[Control] Closing ${openPositions.length} open positions`);

        // Close all positions
        const closedPositions = [];
        for (const position of openPositions) {
            try {
                // Mark position as closed
                position.status = 'CLOSED';
                position.exitReason = 'EMERGENCY_STOP';
                position.exitTime = new Date();
                await position.save();

                closedPositions.push(position.symbol);
                console.log(`[Control] Closed position: ${position.symbol}`);
            } catch (error) {
                console.error(`[Control] Error closing position ${position.symbol}:`, error);
            }
        }

        // Broadcast emergency stop
        const ws = getDashboardWebSocket();
        if (ws) {
            ws.broadcastBotStatus({ 
                isActive: false, 
                reason: 'EMERGENCY STOP - All positions closed' 
            });
            ws.broadcastRiskAlert({
                level: 'CRITICAL',
                message: 'Emergency stop executed',
                positionsClosed: closedPositions.length
            });
        }

        console.log('[Control] ✅ Emergency stop completed');

        res.json({
            success: true,
            message: 'Emergency stop executed',
            data: {
                positionsClosed: closedPositions.length,
                closedSymbols: closedPositions,
                timestamp: new Date()
            }
        });
    } catch (error) {
        console.error('[Control] Error in emergency stop:', error);
        res.status(500).json({
            success: false,
            error: 'Emergency stop failed'
        });
    }
});

/**
 * GET /api/control/bot/status
 * Get current bot status
 */
router.get('/bot/status', async (req: Request, res: Response) => {
    try {
        const botState = await BotState.findOne();
        const botConfig = await BotConfig.findOne();
        const openPositions = await Position.countDocuments({ status: 'OPEN' });
        
        // Use BotConfig.botStatus for consistency with dashboard
        const isActive = botConfig?.botStatus === 'ACTIVE' || botState?.isRunning || false;
        
        res.json({
            success: true,
            data: {
                isActive,
                totalEquity: botState?.totalEquity || 0,
                openPositions,
                lastUpdate: botState?.updatedAt || new Date()
            }
        });
    } catch (error) {
        console.error('[Control] Error getting bot status:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get bot status'
        });
    }
});

/**
 * PATCH /api/control/config
 * Update bot configuration
 */
router.patch('/config', async (req: Request, res: Response) => {
    try {
        const updates = req.body;
        
        // Validate updates
        const allowedFields = [
            'maxPositions',
            'riskPerTrade',
            'playbooksEnabled',
            'mlConfidenceThreshold',
            'mlAllocation',
            'tradingPairs'
        ];

        const invalidFields = Object.keys(updates).filter(
            key => !allowedFields.includes(key)
        );

        if (invalidFields.length > 0) {
            return res.status(400).json({
                success: false,
                error: `Invalid fields: ${invalidFields.join(', ')}`
            });
        }

        // Update configuration
        const config = await BotConfig.findOneAndUpdate(
            {},
            { $set: updates },
            { new: true, upsert: true }
        );

        console.log('[Control] Configuration updated:', updates);

        res.json({
            success: true,
            message: 'Configuration updated successfully',
            data: config
        });
    } catch (error) {
        console.error('[Control] Error updating config:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update configuration'
        });
    }
});

/**
 * GET /api/control/config
 * Get current bot configuration
 */
router.get('/config', async (req: Request, res: Response) => {
    try {
        const config = await BotConfig.findOne();
        
        if (!config) {
            return res.status(404).json({
                success: false,
                error: 'Configuration not found'
            });
        }

        res.json({
            success: true,
            data: config
        });
    } catch (error) {
        console.error('[Control] Error getting config:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get configuration'
        });
    }
});

/**
 * POST /api/control/playbook/toggle
 * Enable/disable specific playbook
 */
router.post('/playbook/toggle', async (req: Request, res: Response) => {
    try {
        const { playbook, enabled } = req.body;

        if (!['A', 'B', 'C', 'D'].includes(playbook)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid playbook. Must be A, B, C, or D'
            });
        }

        const config = await BotConfig.findOne();
        if (!config) {
            return res.status(404).json({
                success: false,
                error: 'Configuration not found'
            });
        }

        if (!config.playbooksEnabled) {
            config.playbooksEnabled = {};
        }

        config.playbooksEnabled[playbook] = enabled;
        await config.save();

        console.log(`[Control] Playbook ${playbook} ${enabled ? 'enabled' : 'disabled'}`);

        res.json({
            success: true,
            message: `Playbook ${playbook} ${enabled ? 'enabled' : 'disabled'}`,
            data: {
                playbook,
                enabled
            }
        });
    } catch (error) {
        console.error('[Control] Error toggling playbook:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to toggle playbook'
        });
    }
});

export default router;

