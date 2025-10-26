import { Router, Request, Response } from 'express';
import Position from '../models/Position';
import BotState from '../models/BotState';
import { getDashboardWebSocket } from './dashboardWebSocket';

const router = Router();

/**
 * POST /api/trade/manual
 * Place a manual trade
 */
router.post('/manual', async (req: Request, res: Response) => {
    try {
        const {
            symbol,
            side,
            orderType = 'MARKET',
            quantity,
            price,
            stopLoss,
            takeProfit,
            force = false
        } = req.body;

        // Validation
        if (!symbol || !side || !quantity) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: symbol, side, quantity'
            });
        }

        if (!['BUY', 'SELL'].includes(side)) {
            return res.status(400).json({
                success: false,
                error: 'Side must be BUY or SELL'
            });
        }

        if (!['MARKET', 'LIMIT'].includes(orderType)) {
            return res.status(400).json({
                success: false,
                error: 'Order type must be MARKET or LIMIT'
            });
        }

        if (orderType === 'LIMIT' && !price) {
            return res.status(400).json({
                success: false,
                error: 'Price is required for LIMIT orders'
            });
        }

        if (quantity <= 0) {
            return res.status(400).json({
                success: false,
                error: 'Quantity must be greater than 0'
            });
        }

        // Get current price
        const currentPrice = price || 50000; // Placeholder - in production, call BinanceService

        // ML Confidence Check (if not forced)
        if (!force) {
            try {
                // In production, this would call the ML confidence scorer
                const mlConfidence = 0.65; // Placeholder

                if (mlConfidence < 0.5) {
                    return res.json({
                        success: false,
                        warning: `Low ML confidence (${(mlConfidence * 100).toFixed(1)}%). This trade may have higher risk.`,
                        requiresConfirmation: true,
                        mlConfidence,
                        data: {
                            symbol,
                            side,
                            quantity,
                            price: currentPrice
                        }
                    });
                }
            } catch (mlError) {
                console.error('[ManualTrade] ML confidence check failed:', mlError);
                // Continue with trade if ML check fails
            }
        }

        // Check available balance
        const botState = await BotState.findOne();
        if (!botState) {
            return res.status(500).json({
                success: false,
                error: 'Bot state not found'
            });
        }

        const tradeValue = currentPrice * quantity;
        if (tradeValue > botState.totalEquity * 0.5) {
            return res.status(400).json({
                success: false,
                error: 'Trade size exceeds 50% of total equity'
            });
        }

        // Calculate stop loss and take profit if not provided
        const calculatedStopLoss = stopLoss || (
            side === 'BUY'
                ? currentPrice * 0.98  // 2% below entry
                : currentPrice * 1.02  // 2% above entry
        );

        const calculatedTakeProfit = takeProfit || (
            side === 'BUY'
                ? currentPrice * 1.04  // 4% above entry
                : currentPrice * 0.96  // 4% below entry
        );

        // Place order (placeholder - in production, call BinanceService)
        const order = {
            orderId: Date.now(),
            symbol,
            side,
            type: orderType,
            quantity,
            price: currentPrice,
            executedQty: quantity,
            status: 'FILLED'
        };

        // Create position
        const position = await Position.create({
            symbol,
            side,
            entryPrice: currentPrice,
            quantity,
            stopLoss: calculatedStopLoss,
            takeProfit: calculatedTakeProfit,
            playbook: 'MANUAL',
            status: 'OPEN',
            orderId: order.orderId
        });

        // Broadcast trade execution
        const ws = getDashboardWebSocket();
        if (ws) {
            ws.broadcastTradeExecuted({
                symbol,
                side,
                price: currentPrice,
                quantity,
                playbook: 'MANUAL'
            });
            ws.broadcastPositionUpdate({
                ...position.toObject(),
                action: 'OPENED'
            });
        }

        console.log(`[ManualTrade] Executed manual ${side} order: ${symbol} @ ${currentPrice} x ${quantity}`);

        res.json({
            success: true,
            message: 'Manual trade executed successfully',
            data: {
                order,
                position: position.toObject()
            }
        });
    } catch (error) {
        console.error('[ManualTrade] Error executing manual trade:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to execute manual trade'
        });
    }
});

/**
 * POST /api/trade/validate
 * Validate a trade before execution (get ML confidence, risk checks)
 */
router.post('/validate', async (req: Request, res: Response) => {
    try {
        const { symbol, side, quantity, price } = req.body;

        if (!symbol || !side || !quantity) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields'
            });
        }

        const currentPrice = price || 50000; // Placeholder
        const tradeValue = currentPrice * quantity;

        // Get bot state
        const botState = await BotState.findOne();
        if (!botState) {
            return res.status(500).json({
                success: false,
                error: 'Bot state not found'
            });
        }

        // Risk checks
        const checks = {
            mlConfidence: 0.65, // Placeholder - would call ML service
            portfolioHeat: 0.15, // Placeholder - would calculate
            maxPositionsReached: false,
            sufficientBalance: tradeValue <= botState.totalEquity * 0.5,
            correlationRisk: 'LOW' // Placeholder - would check correlations
        };

        // Calculate suggested position size (Kelly Criterion)
        const suggestedSize = quantity * 0.8; // Placeholder

        // Overall assessment
        const warnings = [];
        if (checks.mlConfidence < 0.6) {
            warnings.push('Low ML confidence');
        }
        if (checks.portfolioHeat > 0.2) {
            warnings.push('High portfolio heat');
        }
        if (!checks.sufficientBalance) {
            warnings.push('Insufficient balance');
        }

        const recommendation = warnings.length === 0 ? 'APPROVED' : 
                             warnings.length <= 1 ? 'CAUTION' : 'NOT_RECOMMENDED';

        res.json({
            success: true,
            data: {
                symbol,
                side,
                quantity,
                price: currentPrice,
                tradeValue,
                checks,
                warnings,
                recommendation,
                suggestedSize
            }
        });
    } catch (error) {
        console.error('[ManualTrade] Error validating trade:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to validate trade'
        });
    }
});

/**
 * GET /api/trade/symbols
 * Get available trading symbols
 */
router.get('/symbols', async (req: Request, res: Response) => {
    try {
        // In production, this would fetch from Binance API
        const symbols = [
            { symbol: 'BTCUSDT', price: 50000, volume24h: 1000000000 },
            { symbol: 'ETHUSDT', price: 3000, volume24h: 500000000 },
            { symbol: 'BNBUSDT', price: 400, volume24h: 100000000 },
            { symbol: 'SOLUSDT', price: 100, volume24h: 200000000 },
            { symbol: 'ADAUSDT', price: 0.5, volume24h: 50000000 },
            { symbol: 'DOGEUSDT', price: 0.1, volume24h: 80000000 },
            { symbol: 'MATICUSDT', price: 1.2, volume24h: 40000000 },
            { symbol: 'AVAXUSDT', price: 30, volume24h: 60000000 },
            { symbol: 'LINKUSDT', price: 15, volume24h: 30000000 },
            { symbol: 'ATOMUSDT', price: 10, volume24h: 25000000 }
        ];

        res.json({
            success: true,
            data: symbols
        });
    } catch (error) {
        console.error('[ManualTrade] Error getting symbols:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get symbols'
        });
    }
});

/**
 * GET /api/trade/price/:symbol
 * Get current price for a symbol
 */
router.get('/price/:symbol', async (req: Request, res: Response) => {
    try {
        const { symbol } = req.params;

        // In production, this would call BinanceService
        const price = 50000; // Placeholder

        res.json({
            success: true,
            data: {
                symbol,
                price,
                timestamp: new Date()
            }
        });
    } catch (error) {
        console.error('[ManualTrade] Error getting price:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get price'
        });
    }
});

export default router;

