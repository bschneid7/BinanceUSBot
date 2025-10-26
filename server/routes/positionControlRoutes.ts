import { Router, Request, Response } from 'express';
import Position from '../models/Position';
import Trade from '../models/Trade';
import { getDashboardWebSocket } from './dashboardWebSocket';

const router = Router();

/**
 * POST /api/positions/:id/close
 * Close a specific position
 */
router.post('/:id/close', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { reason = 'MANUAL_CLOSE' } = req.body;

        const position = await Position.findById(id);
        
        if (!position) {
            return res.status(404).json({
                success: false,
                error: 'Position not found'
            });
        }

        if (position.status !== 'OPEN') {
            return res.status(400).json({
                success: false,
                error: 'Position is not open'
            });
        }

        // Get current price (in production, this would call BinanceService)
        const currentPrice = 50000; // Placeholder

        // Calculate P&L
        const priceDiff = position.side === 'BUY'
            ? currentPrice - position.entryPrice
            : position.entryPrice - currentPrice;
        const pnl = priceDiff * position.quantity;

        // Close position
        position.status = 'CLOSED';
        position.exitPrice = currentPrice;
        position.exitTime = new Date();
        position.exitReason = reason;
        position.realizedPnL = pnl;
        await position.save();

        // Create trade record
        await Trade.create({
            symbol: position.symbol,
            side: position.side,
            entryPrice: position.entryPrice,
            exitPrice: currentPrice,
            quantity: position.quantity,
            pnl,
            playbook: position.playbook,
            entryTime: position.createdAt,
            exitTime: position.exitTime,
            exitReason: reason
        });

        // Broadcast position update
        const ws = getDashboardWebSocket();
        if (ws) {
            ws.broadcastPositionUpdate({
                ...position.toObject(),
                action: 'CLOSED'
            });
        }

        console.log(`[PositionControl] Closed position ${position.symbol}: P&L $${pnl.toFixed(2)}`);

        res.json({
            success: true,
            message: 'Position closed successfully',
            data: {
                position: position.toObject(),
                pnl
            }
        });
    } catch (error) {
        console.error('[PositionControl] Error closing position:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to close position'
        });
    }
});

/**
 * PATCH /api/positions/:id/stop-loss
 * Update stop loss for a position
 */
router.patch('/:id/stop-loss', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { stopLoss } = req.body;

        if (!stopLoss || stopLoss <= 0) {
            return res.status(400).json({
                success: false,
                error: 'Invalid stop loss value'
            });
        }

        const position = await Position.findById(id);
        
        if (!position) {
            return res.status(404).json({
                success: false,
                error: 'Position not found'
            });
        }

        if (position.status !== 'OPEN') {
            return res.status(400).json({
                success: false,
                error: 'Position is not open'
            });
        }

        // Validate stop loss is on the correct side
        if (position.side === 'BUY' && stopLoss >= position.entryPrice) {
            return res.status(400).json({
                success: false,
                error: 'Stop loss must be below entry price for BUY positions'
            });
        }

        if (position.side === 'SELL' && stopLoss <= position.entryPrice) {
            return res.status(400).json({
                success: false,
                error: 'Stop loss must be above entry price for SELL positions'
            });
        }

        // Update stop loss
        const oldStopLoss = position.stopLoss;
        position.stopLoss = stopLoss;
        await position.save();

        // Broadcast update
        const ws = getDashboardWebSocket();
        if (ws) {
            ws.broadcastPositionUpdate({
                ...position.toObject(),
                action: 'STOP_LOSS_UPDATED',
                oldStopLoss
            });
        }

        console.log(`[PositionControl] Updated stop loss for ${position.symbol}: ${oldStopLoss} -> ${stopLoss}`);

        res.json({
            success: true,
            message: 'Stop loss updated successfully',
            data: {
                position: position.toObject(),
                oldStopLoss,
                newStopLoss: stopLoss
            }
        });
    } catch (error) {
        console.error('[PositionControl] Error updating stop loss:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update stop loss'
        });
    }
});

/**
 * PATCH /api/positions/:id/take-profit
 * Update take profit for a position
 */
router.patch('/:id/take-profit', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { takeProfit } = req.body;

        if (!takeProfit || takeProfit <= 0) {
            return res.status(400).json({
                success: false,
                error: 'Invalid take profit value'
            });
        }

        const position = await Position.findById(id);
        
        if (!position) {
            return res.status(404).json({
                success: false,
                error: 'Position not found'
            });
        }

        if (position.status !== 'OPEN') {
            return res.status(400).json({
                success: false,
                error: 'Position is not open'
            });
        }

        // Validate take profit is on the correct side
        if (position.side === 'BUY' && takeProfit <= position.entryPrice) {
            return res.status(400).json({
                success: false,
                error: 'Take profit must be above entry price for BUY positions'
            });
        }

        if (position.side === 'SELL' && takeProfit >= position.entryPrice) {
            return res.status(400).json({
                success: false,
                error: 'Take profit must be below entry price for SELL positions'
            });
        }

        // Update take profit
        const oldTakeProfit = position.takeProfit;
        position.takeProfit = takeProfit;
        await position.save();

        // Broadcast update
        const ws = getDashboardWebSocket();
        if (ws) {
            ws.broadcastPositionUpdate({
                ...position.toObject(),
                action: 'TAKE_PROFIT_UPDATED',
                oldTakeProfit
            });
        }

        console.log(`[PositionControl] Updated take profit for ${position.symbol}: ${oldTakeProfit} -> ${takeProfit}`);

        res.json({
            success: true,
            message: 'Take profit updated successfully',
            data: {
                position: position.toObject(),
                oldTakeProfit,
                newTakeProfit: takeProfit
            }
        });
    } catch (error) {
        console.error('[PositionControl] Error updating take profit:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update take profit'
        });
    }
});

/**
 * POST /api/positions/:id/scale
 * Scale in or out of a position
 */
router.post('/:id/scale', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { action, percentage } = req.body;

        if (!['IN', 'OUT'].includes(action)) {
            return res.status(400).json({
                success: false,
                error: 'Action must be IN or OUT'
            });
        }

        if (!percentage || percentage <= 0 || percentage > 100) {
            return res.status(400).json({
                success: false,
                error: 'Percentage must be between 0 and 100'
            });
        }

        const position = await Position.findById(id);
        
        if (!position) {
            return res.status(404).json({
                success: false,
                error: 'Position not found'
            });
        }

        if (position.status !== 'OPEN') {
            return res.status(400).json({
                success: false,
                error: 'Position is not open'
            });
        }

        const currentPrice = 50000; // Placeholder
        const oldQuantity = position.quantity;

        if (action === 'OUT') {
            // Scale out (partial close)
            const closeQuantity = position.quantity * (percentage / 100);
            const remainingQuantity = position.quantity - closeQuantity;

            if (remainingQuantity < 0.001) {
                // Close entire position if remaining is too small
                return res.status(400).json({
                    success: false,
                    error: 'Use close endpoint to close entire position'
                });
            }

            // Calculate P&L for closed portion
            const priceDiff = position.side === 'BUY'
                ? currentPrice - position.entryPrice
                : position.entryPrice - currentPrice;
            const pnl = priceDiff * closeQuantity;

            // Update position
            position.quantity = remainingQuantity;
            position.realizedPnL = (position.realizedPnL || 0) + pnl;
            await position.save();

            // Create trade record for scaled out portion
            await Trade.create({
                symbol: position.symbol,
                side: position.side,
                entryPrice: position.entryPrice,
                exitPrice: currentPrice,
                quantity: closeQuantity,
                pnl,
                playbook: position.playbook,
                entryTime: position.createdAt,
                exitTime: new Date(),
                exitReason: 'SCALE_OUT'
            });

            console.log(`[PositionControl] Scaled out ${percentage}% of ${position.symbol}: P&L $${pnl.toFixed(2)}`);

            res.json({
                success: true,
                message: `Scaled out ${percentage}% successfully`,
                data: {
                    action: 'SCALE_OUT',
                    oldQuantity,
                    newQuantity: remainingQuantity,
                    closedQuantity: closeQuantity,
                    pnl
                }
            });
        } else {
            // Scale in (add to position)
            const addQuantity = position.quantity * (percentage / 100);
            
            // Update position
            const newQuantity = position.quantity + addQuantity;
            const newAvgPrice = (
                (position.entryPrice * position.quantity) + 
                (currentPrice * addQuantity)
            ) / newQuantity;

            position.quantity = newQuantity;
            position.entryPrice = newAvgPrice;
            await position.save();

            console.log(`[PositionControl] Scaled in ${percentage}% to ${position.symbol}`);

            res.json({
                success: true,
                message: `Scaled in ${percentage}% successfully`,
                data: {
                    action: 'SCALE_IN',
                    oldQuantity,
                    newQuantity,
                    addedQuantity: addQuantity,
                    newAvgPrice
                }
            });
        }

        // Broadcast update
        const ws = getDashboardWebSocket();
        if (ws) {
            ws.broadcastPositionUpdate({
                ...position.toObject(),
                action: action === 'OUT' ? 'SCALED_OUT' : 'SCALED_IN'
            });
        }
    } catch (error) {
        console.error('[PositionControl] Error scaling position:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to scale position'
        });
    }
});

/**
 * POST /api/positions/close-all
 * Close all open positions
 */
router.post('/close-all', async (req: Request, res: Response) => {
    try {
        const { reason = 'MANUAL_CLOSE_ALL' } = req.body;

        const openPositions = await Position.find({ status: 'OPEN' });
        
        if (openPositions.length === 0) {
            return res.json({
                success: true,
                message: 'No open positions to close',
                data: { closedCount: 0 }
            });
        }

        const closedPositions = [];
        let totalPnL = 0;

        for (const position of openPositions) {
            const currentPrice = 50000; // Placeholder
            
            const priceDiff = position.side === 'BUY'
                ? currentPrice - position.entryPrice
                : position.entryPrice - currentPrice;
            const pnl = priceDiff * position.quantity;

            position.status = 'CLOSED';
            position.exitPrice = currentPrice;
            position.exitTime = new Date();
            position.exitReason = reason;
            position.realizedPnL = pnl;
            await position.save();

            await Trade.create({
                symbol: position.symbol,
                side: position.side,
                entryPrice: position.entryPrice,
                exitPrice: currentPrice,
                quantity: position.quantity,
                pnl,
                playbook: position.playbook,
                entryTime: position.createdAt,
                exitTime: position.exitTime,
                exitReason: reason
            });

            closedPositions.push(position.symbol);
            totalPnL += pnl;
        }

        console.log(`[PositionControl] Closed all ${closedPositions.length} positions: Total P&L $${totalPnL.toFixed(2)}`);

        res.json({
            success: true,
            message: `Closed ${closedPositions.length} positions`,
            data: {
                closedCount: closedPositions.length,
                closedSymbols: closedPositions,
                totalPnL
            }
        });
    } catch (error) {
        console.error('[PositionControl] Error closing all positions:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to close all positions'
        });
    }
});

export default router;

