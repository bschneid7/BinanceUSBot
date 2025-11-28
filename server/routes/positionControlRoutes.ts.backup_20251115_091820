import { Router, Request, Response } from 'express';
import Position from '../models/Position';
import Trade from '../models/Trade';
import Transaction from '../models/Transaction';
import { getDashboardWebSocket } from './dashboardWebSocket';
import binanceService from '../services/binanceService';

const router = Router();

/**
 * POST /api/positions/:id/close
 * Close a specific position by executing a market sell order on Binance
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

        console.log(`[PositionControl] Closing position ${position.symbol} (${position.quantity} @ ${position.entry_price})`);

        // Get current price from Binance
        const tickerData = await binanceService.getTickerPrice(position.symbol);
        if (!tickerData) {
            return res.status(500).json({
                success: false,
                error: `Failed to get current price for ${position.symbol}`
            });
        }
        const currentPrice = parseFloat(tickerData.price);
        console.log(`[PositionControl] Current price for ${position.symbol}: $${currentPrice}`);

        // Execute market sell order on Binance
        const side = position.side === 'LONG' ? 'SELL' : 'BUY';
        console.log(`[PositionControl] Executing ${side} order for ${position.quantity} ${position.symbol}`);
        
        let orderResponse;
        try {
            orderResponse = await binanceService.placeOrder({
                symbol: position.symbol,
                side: side,
                type: 'MARKET',
                quantity: position.quantity,
                newOrderRespType: 'FULL'
            });
            console.log(`[PositionControl] Order executed:`, orderResponse);
        } catch (orderError: any) {
            console.error(`[PositionControl] Failed to execute order:`, orderError);
            return res.status(500).json({
                success: false,
                error: `Failed to execute ${side} order: ${orderError.message || 'Unknown error'}`
            });
        }

        // Calculate actual execution price and fees from order response
        const executedQty = parseFloat(orderResponse.executedQty || position.quantity.toString());
        const cummulativeQuoteQty = parseFloat(orderResponse.cummulativeQuoteQty || '0');
        const avgPrice = cummulativeQuoteQty > 0 ? cummulativeQuoteQty / executedQty : currentPrice;
        
        // Extract fees from fills
        let totalFees = 0;
        if (orderResponse.fills && Array.isArray(orderResponse.fills)) {
            totalFees = orderResponse.fills.reduce((sum: number, fill: any) => {
                return sum + parseFloat(fill.commission || '0');
            }, 0);
        }

        // Calculate P&L
        const priceDiff = position.side === 'LONG'
            ? avgPrice - position.entry_price
            : position.entry_price - avgPrice;
        const pnl = (priceDiff * executedQty) - totalFees;

        console.log(`[PositionControl] P&L calculation: ${priceDiff.toFixed(2)} * ${executedQty} - ${totalFees.toFixed(2)} = ${pnl.toFixed(2)}`);

        // Update position in database
        position.status = 'CLOSED';
        position.exit_price = avgPrice;
        position.closed_at = new Date();
        position.exit_reason = reason;
        position.realized_pnl = pnl;
        position.fees_paid = (position.fees_paid || 0) + totalFees;
        await position.save();

        // Create trade record (only for playbook trades, not MANUAL)
        if (position.playbook && ['A', 'B', 'C', 'D'].includes(position.playbook)) {
            // Calculate hold time
            const holdMs = position.closed_at.getTime() - position.opened_at.getTime();
            const holdHours = Math.floor(holdMs / (1000 * 60 * 60));
            const holdMins = Math.floor((holdMs % (1000 * 60 * 60)) / (1000 * 60));
            const holdTime = `${holdHours}h ${holdMins}m`;
            
            // Calculate R (risk units) - assume 1% risk per trade if not tracked
            const pnlR = pnl / (position.entry_price * position.quantity * 0.01);
            
            await Trade.create({
                userId: position.userId,
                symbol: position.symbol,
                side: position.side === 'LONG' ? 'BUY' : 'SELL',
                entry_price: position.entry_price,
                exit_price: avgPrice,
                quantity: executedQty,
                pnl_usd: pnl,
                pnl_r: pnlR,
                fees: totalFees,
                hold_time: holdTime,
                playbook: position.playbook as 'A' | 'B' | 'C' | 'D',
                outcome: pnl > 0 ? 'WIN' : pnl < 0 ? 'LOSS' : 'BREAKEVEN',
                date: position.closed_at
            });
        }

        // Create transaction record for tax reporting
        await Transaction.create({
            userId: position.userId,
            symbol: position.symbol,
            side: side,
            quantity: executedQty,
            price: avgPrice,
            total: cummulativeQuoteQty,
            fees: totalFees,
            type: 'MANUAL',
            orderId: orderResponse.orderId?.toString(),
            positionId: position._id,
            timestamp: new Date(),
            notes: `Position close: ${reason}`
        });

        // Broadcast position update
        const ws = getDashboardWebSocket();
        if (ws) {
            ws.broadcastPositionUpdate({
                ...position.toObject(),
                action: 'CLOSED'
            });
        }

        console.log(`[PositionControl] ✅ Closed position ${position.symbol}: P&L $${pnl.toFixed(2)}`);

        res.json({
            success: true,
            message: 'Position closed successfully',
            data: {
                position: position.toObject(),
                pnl,
                executedPrice: avgPrice,
                executedQty,
                fees: totalFees,
                orderId: orderResponse.orderId
            }
        });
    } catch (error: any) {
        console.error('[PositionControl] Error closing position:', error);
        res.status(500).json({
            success: false,
            error: `Failed to close position: ${error.message || 'Unknown error'}`
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

        position.stop_price = stopLoss;
        await position.save();

        // Broadcast position update
        const ws = getDashboardWebSocket();
        if (ws) {
            ws.broadcastPositionUpdate({
                ...position.toObject(),
                action: 'UPDATED'
            });
        }

        res.json({
            success: true,
            message: 'Stop loss updated successfully',
            data: position.toObject()
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

        position.target_price = takeProfit;
        await position.save();

        // Broadcast position update
        const ws = getDashboardWebSocket();
        if (ws) {
            ws.broadcastPositionUpdate({
                ...position.toObject(),
                action: 'UPDATED'
            });
        }

        res.json({
            success: true,
            message: 'Take profit updated successfully',
            data: position.toObject()
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
        const errors = [];

        for (const position of openPositions) {
            try {
                // Get current price
                const tickerData = await binanceService.getTickerPrice(position.symbol);
                if (!tickerData) {
                    errors.push({ symbol: position.symbol, error: 'Failed to get price' });
                    continue;
                }
                const currentPrice = parseFloat(tickerData.price);

                // Execute market order
                const side = position.side === 'LONG' ? 'SELL' : 'BUY';
                const orderResponse = await binanceService.placeOrder({
                    symbol: position.symbol,
                    side: side,
                    type: 'MARKET',
                    quantity: position.quantity,
                    newOrderRespType: 'FULL'
                });

                // Calculate P&L
                const executedQty = parseFloat(orderResponse.executedQty || position.quantity.toString());
                const cummulativeQuoteQty = parseFloat(orderResponse.cummulativeQuoteQty || '0');
                const avgPrice = cummulativeQuoteQty > 0 ? cummulativeQuoteQty / executedQty : currentPrice;
                
                let totalFees = 0;
                if (orderResponse.fills && Array.isArray(orderResponse.fills)) {
                    totalFees = orderResponse.fills.reduce((sum: number, fill: any) => {
                        return sum + parseFloat(fill.commission || '0');
                    }, 0);
                }

                const priceDiff = position.side === 'LONG'
                    ? avgPrice - position.entry_price
                    : position.entry_price - avgPrice;
                const pnl = (priceDiff * executedQty) - totalFees;

                // Update position
                position.status = 'CLOSED';
                position.exit_price = avgPrice;
                position.closed_at = new Date();
                position.exit_reason = reason;
                position.realized_pnl = pnl;
                position.fees_paid = (position.fees_paid || 0) + totalFees;
                await position.save();

                // Create trade record (only for playbook trades)
                if (position.playbook && ['A', 'B', 'C', 'D'].includes(position.playbook)) {
                    const holdMs = position.closed_at.getTime() - position.opened_at.getTime();
                    const holdHours = Math.floor(holdMs / (1000 * 60 * 60));
                    const holdMins = Math.floor((holdMs % (1000 * 60 * 60)) / (1000 * 60));
                    const holdTime = `${holdHours}h ${holdMins}m`;
                    const pnlR = pnl / (position.entry_price * position.quantity * 0.01);
                    
                    await Trade.create({
                        userId: position.userId,
                        symbol: position.symbol,
                        side: position.side === 'LONG' ? 'BUY' : 'SELL',
                        entry_price: position.entry_price,
                        exit_price: avgPrice,
                        quantity: executedQty,
                        pnl_usd: pnl,
                        pnl_r: pnlR,
                        fees: totalFees,
                        hold_time: holdTime,
                        playbook: position.playbook as 'A' | 'B' | 'C' | 'D',
                        outcome: pnl > 0 ? 'WIN' : pnl < 0 ? 'LOSS' : 'BREAKEVEN',
                        date: position.closed_at
                    });
                }

                // Create transaction record
                await Transaction.create({
                    userId: position.userId,
                    symbol: position.symbol,
                    side: side,
                    quantity: executedQty,
                    price: avgPrice,
                    total: cummulativeQuoteQty,
                    fees: totalFees,
                    type: 'MANUAL',
                    orderId: orderResponse.orderId?.toString(),
                    positionId: position._id,
                    timestamp: new Date(),
                    notes: `Bulk close: ${reason}`
                });

                closedPositions.push({
                    symbol: position.symbol,
                    pnl,
                    executedPrice: avgPrice
                });
                totalPnL += pnl;

                console.log(`[PositionControl] Closed ${position.symbol}: $${pnl.toFixed(2)}`);
            } catch (error: any) {
                console.error(`[PositionControl] Failed to close ${position.symbol}:`, error);
                errors.push({ symbol: position.symbol, error: error.message });
            }
        }

        // Broadcast update
        const ws = getDashboardWebSocket();
        if (ws) {
            ws.broadcastPositionUpdate({
                action: 'BULK_CLOSE',
                count: closedPositions.length
            });
        }

        res.json({
            success: true,
            message: `Closed ${closedPositions.length} positions`,
            data: {
                closedCount: closedPositions.length,
                totalPnL,
                positions: closedPositions,
                errors: errors.length > 0 ? errors : undefined
            }
        });
    } catch (error: any) {
        console.error('[PositionControl] Error closing all positions:', error);
        res.status(500).json({
            success: false,
            error: `Failed to close positions: ${error.message || 'Unknown error'}`
        });
    }
});

export default router;

