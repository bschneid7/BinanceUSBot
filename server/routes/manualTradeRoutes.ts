import { Router, Request, Response } from 'express';
import { requireUser } from './middlewares/auth';
import { cacheMiddleware, invalidateCache } from '../middleware/cacheMiddleware';

const requireAuth = requireUser();
import binanceService from '../services/binanceService';
import Position from '../models/Position';
import Order from '../models/Order';
import BotState from '../models/BotState';
import { orderSuccess } from '../utils/metrics';
import logger from '../utils/logger';

const router = Router();

/**
 * GET /api/manual-trade/market-data
 * Get current market data for a symbol
 */
router.get('/market-data/:symbol', requireAuth, cacheMiddleware({
  ttl: 10, // Cache for 10 seconds
  keyGenerator: (req) => `market-data:${req.params.symbol}`,
}), async (req: Request, res: Response) => {
  try {
    const { symbol } = req.params;
    const userId = (req as any).user._id;

    // Get current price
    const ticker = await binanceService.getTickerPrice(symbol);
    
    // Get account balance
    const account = await binanceService.getAccountInfo();
    const usdBalance = account.balances.find((b: any) => b.asset === 'USD');

    // Get symbol info for filters
    const exchangeInfo = await binanceService.getExchangeInfo();
    const symbolInfo = exchangeInfo.symbols.find((s: any) => s.symbol === symbol);

    res.json({
      symbol,
      currentPrice: parseFloat(ticker.price),
      usdBalance: usdBalance ? parseFloat(usdBalance.free) : 0,
      filters: symbolInfo?.filters || [],
      status: symbolInfo?.status || 'UNKNOWN',
    });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error fetching market data');
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/manual-trade/place-order
 * Place a manual market order
 */
router.post('/place-order', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user._id;
    const { symbol, side, quantity, orderType = 'MARKET', price, stopPrice } = req.body;

    // Validation
    if (!symbol || !side || !quantity) {
      return res.status(400).json({ error: 'Missing required fields: symbol, side, quantity' });
    }

    if (!['BUY', 'SELL'].includes(side)) {
      return res.status(400).json({ error: 'Side must be BUY or SELL' });
    }

    if (!['MARKET', 'LIMIT', 'STOP_LOSS'].includes(orderType)) {
      return res.status(400).json({ error: 'Invalid order type' });
    }

    if (orderType === 'LIMIT' && !price) {
      return res.status(400).json({ error: 'Price required for LIMIT orders' });
    }

    if (orderType === 'STOP_LOSS' && !stopPrice) {
      return res.status(400).json({ error: 'Stop price required for STOP_LOSS orders' });
    }

    logger.info({ userId, symbol, side, quantity, orderType }, 'Manual order requested');

    // Generate client order ID
    const clientOrderId = `MANUAL_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    // Create order in database
    const order = await Order.create({
      userId,
      clientOrderId,
      symbol,
      side,
      type: orderType,
      price: price ? parseFloat(price) : undefined,
      stopPrice: stopPrice ? parseFloat(stopPrice) : undefined,
      quantity: parseFloat(quantity),
      filledQuantity: 0,
      status: 'PENDING',
      submittedAt: new Date(),
    });

    // Submit order to Binance
    try {
      const binanceOrder = await binanceService.submitOrder({
        symbol,
        side,
        type: orderType,
        quantity: parseFloat(quantity),
        price: price ? parseFloat(price) : undefined,
        stopPrice: stopPrice ? parseFloat(stopPrice) : undefined,
        newClientOrderId: clientOrderId,
        newOrderRespType: 'FULL',
      });

      // Update order with exchange response
      order.exchangeOrderId = binanceOrder.orderId.toString();
      order.status = binanceOrder.status === 'FILLED' ? 'FILLED' : 
                     binanceOrder.status === 'PARTIALLY_FILLED' ? 'PARTIALLY_FILLED' : 'OPEN';
      order.filledQuantity = parseFloat(binanceOrder.executedQty);
      
      // Extract fills and fees
      if (binanceOrder.fills && binanceOrder.fills.length > 0) {
        order.fills = binanceOrder.fills.map((fill: any) => ({
          price: parseFloat(fill.price),
          qty: parseFloat(fill.qty),
          commission: parseFloat(fill.commission),
          commissionAsset: fill.commissionAsset,
          tradeId: fill.tradeId,
        }));

        order.tradeIds = binanceOrder.fills.map((f: any) => f.tradeId.toString());
        order.commissions = binanceOrder.fills.map((f: any) => ({
          asset: f.commissionAsset,
          amount: parseFloat(f.commission),
        }));

        const totalFees = binanceOrder.fills.reduce((sum: number, fill: any) => 
          sum + parseFloat(fill.commission), 0);
        order.fees = totalFees;

        const avgPrice = binanceOrder.fills.reduce((sum: number, fill: any) => 
          sum + (parseFloat(fill.price) * parseFloat(fill.qty)), 0) / order.filledQuantity;
        order.fillPrice = avgPrice;
      }

      if (order.status === 'FILLED') {
        order.filledAt = new Date();
      }

      await order.save();

      // Track metrics
      orderSuccess.labels(orderType, order.status, symbol).inc();

      // If BUY order filled, create or update position
      if (side === 'BUY' && order.status === 'FILLED') {
        let position = await Position.findOne({ userId, symbol, status: 'OPEN' });
        
        if (position) {
          // Add to existing position
          const newQuantity = position.quantity + order.filledQuantity;
          const newCostBasis = (position.entry_price * position.quantity) + 
                               (order.fillPrice! * order.filledQuantity);
          position.entry_price = newCostBasis / newQuantity;
          position.quantity = newQuantity;
          await position.save();
        } else {
          // Create new position
          position = await Position.create({
            userId,
            symbol,
            quantity: order.filledQuantity,
            entry_price: order.fillPrice,
            current_price: order.fillPrice,
            status: 'OPEN',
            entry_time: new Date(),
            playbook: 'MANUAL',
            direction: 'LONG',
          });
        }

        logger.info({ positionId: position._id, symbol, quantity: position.quantity }, 
          'Position created/updated from manual order');
      }

      // If SELL order filled, update position
      if (side === 'SELL' && order.status === 'FILLED') {
        const position = await Position.findOne({ userId, symbol, status: 'OPEN' });
        
        if (position) {
          position.quantity -= order.filledQuantity;
          
          if (position.quantity <= 0) {
            position.status = 'CLOSED';
            position.exit_time = new Date();
            position.exit_price = order.fillPrice;
            
            const pnl = (order.fillPrice! - position.entry_price) * order.filledQuantity - (order.fees || 0);
            position.realized_pnl = pnl;
          }
          
          await position.save();
          logger.info({ positionId: position._id, symbol, status: position.status }, 
            'Position updated from manual sell');
        }
      }

      // Invalidate market data cache for this symbol
      invalidateCache(`market-data:${symbol}`);
      
      logger.info({ orderId: order._id, exchangeOrderId: order.exchangeOrderId, status: order.status }, 
        'Manual order placed successfully');

      res.json({
        success: true,
        order: {
          id: order._id,
          clientOrderId: order.clientOrderId,
          exchangeOrderId: order.exchangeOrderId,
          symbol: order.symbol,
          side: order.side,
          type: order.type,
          quantity: order.quantity,
          filledQuantity: order.filledQuantity,
          price: order.price,
          fillPrice: order.fillPrice,
          status: order.status,
          fees: order.fees,
        },
      });
    } catch (binanceError: any) {
      // Update order with error
      order.status = 'REJECTED';
      order.evidence = {
        errorMessage: binanceError.message,
      };
      await order.save();

      logger.error({ error: binanceError.message, orderId: order._id }, 
        'Binance order submission failed');

      res.status(400).json({ 
        error: 'Order rejected by exchange', 
        details: binanceError.message,
        orderId: order._id,
      });
    }
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error placing manual order');
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/manual-trade/close-position
 * Close an open position with a market sell order
 */
router.post('/close-position/:positionId', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user._id;
    const { positionId } = req.params;
    const { quantity } = req.body; // Optional: partial close

    const position = await Position.findOne({ _id: positionId, userId, status: 'OPEN' });
    
    if (!position) {
      return res.status(404).json({ error: 'Position not found or already closed' });
    }

    const closeQuantity = quantity ? parseFloat(quantity) : position.quantity;

    if (closeQuantity > position.quantity) {
      return res.status(400).json({ error: 'Close quantity exceeds position quantity' });
    }

    logger.info({ positionId, symbol: position.symbol, quantity: closeQuantity }, 
      'Closing position via manual trade');

    // Place market sell order
    const clientOrderId = `CLOSE_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    const order = await Order.create({
      userId,
      positionId: position._id,
      clientOrderId,
      symbol: position.symbol,
      side: 'SELL',
      type: 'MARKET',
      quantity: closeQuantity,
      filledQuantity: 0,
      status: 'PENDING',
      submittedAt: new Date(),
    });

    try {
      const binanceOrder = await binanceService.submitOrder({
        symbol: position.symbol,
        side: 'SELL',
        type: 'MARKET',
        quantity: closeQuantity,
        newClientOrderId: clientOrderId,
        newOrderRespType: 'FULL',
      });

      // Update order
      order.exchangeOrderId = binanceOrder.orderId.toString();
      order.status = 'FILLED';
      order.filledQuantity = parseFloat(binanceOrder.executedQty);
      order.filledAt = new Date();

      if (binanceOrder.fills && binanceOrder.fills.length > 0) {
        const totalFees = binanceOrder.fills.reduce((sum: number, fill: any) => 
          sum + parseFloat(fill.commission), 0);
        order.fees = totalFees;

        const avgPrice = binanceOrder.fills.reduce((sum: number, fill: any) => 
          sum + (parseFloat(fill.price) * parseFloat(fill.qty)), 0) / order.filledQuantity;
        order.fillPrice = avgPrice;

        order.fills = binanceOrder.fills;
        order.tradeIds = binanceOrder.fills.map((f: any) => f.tradeId.toString());
        order.commissions = binanceOrder.fills.map((f: any) => ({
          asset: f.commissionAsset,
          amount: parseFloat(f.commission),
        }));
      }

      await order.save();

      // Update position
      position.quantity -= order.filledQuantity;
      
      if (position.quantity <= 0) {
        position.status = 'CLOSED';
        position.exit_time = new Date();
        position.exit_price = order.fillPrice;
        
        const pnl = (order.fillPrice! - position.entry_price) * order.filledQuantity - (order.fees || 0);
        position.realized_pnl = pnl;
      }
      
      await position.save();

      logger.info({ positionId, orderId: order._id, pnl: position.realized_pnl }, 
        'Position closed successfully');

      res.json({
        success: true,
        position: {
          id: position._id,
          symbol: position.symbol,
          status: position.status,
          quantity: position.quantity,
          realizedPnl: position.realized_pnl,
        },
        order: {
          id: order._id,
          exchangeOrderId: order.exchangeOrderId,
          fillPrice: order.fillPrice,
          fees: order.fees,
        },
      });
    } catch (binanceError: any) {
      order.status = 'REJECTED';
      order.evidence = { errorMessage: binanceError.message };
      await order.save();

      logger.error({ error: binanceError.message }, 'Failed to close position');
      res.status(400).json({ error: 'Failed to close position', details: binanceError.message });
    }
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error closing position');
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/manual-trade/available-symbols
 * Get list of tradeable symbols on Binance.US
 */
router.get('/available-symbols', requireAuth, cacheMiddleware({
  ttl: 86400, // Cache for 24 hours
  keyGenerator: () => 'available-symbols',
}), async (req: Request, res: Response) => {
  try {
    const exchangeInfo = await binanceService.getExchangeInfo();
    
    const symbols = exchangeInfo.symbols
      .filter((s: any) => s.status === 'TRADING' && s.quoteAsset === 'USD')
      .map((s: any) => ({
        symbol: s.symbol,
        baseAsset: s.baseAsset,
        quoteAsset: s.quoteAsset,
        status: s.status,
      }))
      .sort((a: any, b: any) => a.symbol.localeCompare(b.symbol));

    res.json({ symbols });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error fetching available symbols');
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/manual-trade/cache-stats
 * Get cache statistics (for monitoring)
 */
router.get('/cache-stats', requireAuth, async (req: Request, res: Response) => {  try {
    const { getCacheStats } = require('../middleware/cacheMiddleware');
    const stats = getCacheStats();
    res.json(stats);
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error fetching cache stats');
    res.status(500).json({ error: error.message });
  }
});

export default router;

