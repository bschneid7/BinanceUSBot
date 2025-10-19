import { Types } from 'mongoose';
import binanceService from '../binanceService';
import Order from '../../models/Order';
import Lot from '../../models/Lot';
import BotConfig from '../../models/BotConfig';
import { TradingSignal } from './signalGenerator';
import riskEngine from './riskEngine';

export interface OrderResult {
  success: boolean;
  orderId?: Types.ObjectId;
  exchangeOrderId?: string;
  fillPrice?: number;
  filledQuantity?: number;
  fees?: number;
  slippageBps?: number;
  error?: string;
}

export class ExecutionRouter {
  /**
   * Execute a trading signal by placing orders
   */
  async executeSignal(
    userId: Types.ObjectId,
    signal: TradingSignal,
    quantity: number,
    positionId?: Types.ObjectId
  ): Promise<OrderResult> {
    try {
      console.log(`[ExecutionRouter] Executing signal for ${signal.symbol} - ${signal.playbook} - ${signal.action} - Qty: ${quantity}`);

      // Generate unique client order ID
      const clientOrderId = `${signal.symbol}-${signal.playbook}-${Date.now()}`;

      // Get config for execution preferences
      const config = await BotConfig.findOne({ userId });
      if (!config) {
        return { success: false, error: 'Bot configuration not found' };
      }

      // Determine order type (LIMIT vs MARKET)
      let orderType: 'LIMIT' | 'MARKET' = 'LIMIT';
      let price = signal.entryPrice;

      // For normal conditions, prefer POST-ONLY limit orders (maker)
      // For events or if price has moved significantly, use market orders
      if (signal.isEvent) {
        // Check signal decay
        const currentTicker = await binanceService.getTicker(signal.symbol);
        const currentPrice = parseFloat(currentTicker.lastPrice);
        const priceChange = Math.abs(currentPrice - signal.entryPrice);
        const changePercent = (priceChange / signal.entryPrice) * 100;

        if (changePercent > 0.2) {
          console.log(`[ExecutionRouter] Signal decayed ${changePercent.toFixed(2)}% - using MARKET order`);
          orderType = 'MARKET';
          price = currentPrice;
        }
      }

      // Place the order
      const orderResult = await this.placeOrder(
        userId,
        {
          symbol: signal.symbol,
          side: signal.action,
          type: orderType,
          quantity,
          price: orderType === 'LIMIT' ? price : undefined,
          clientOrderId,
        },
        positionId
      );

      if (!orderResult.success) {
        console.error(`[ExecutionRouter] Order failed: ${orderResult.error}`);
        return orderResult;
      }

      // Calculate slippage
      if (orderResult.fillPrice) {
        const midPrice = signal.entryPrice;
        const slippageBps = riskEngine.calculateSlippage(midPrice, orderResult.fillPrice);
        orderResult.slippageBps = slippageBps;

        // Check slippage limits
        const slippageCheck = riskEngine.checkSlippage(
          slippageBps,
          signal.isEvent || false,
          config.risk
        );

        if (!slippageCheck.approved) {
          console.warn(`[ExecutionRouter] WARNING: ${slippageCheck.reason}`);
        }

        console.log(`[ExecutionRouter] Order filled at $${orderResult.fillPrice.toFixed(2)} - Slippage: ${slippageBps.toFixed(2)} bps`);
      }

      // Create tax lot for BUY orders
      if (signal.action === 'BUY' && orderResult.success) {
        await this.createTaxLot(
          userId,
          signal.symbol,
          orderResult.filledQuantity || quantity,
          orderResult.fillPrice || price,
          orderResult.fees || 0,
          orderResult.orderId
        );
      }

      return orderResult;
    } catch (error) {
      console.error('[ExecutionRouter] Error executing signal:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Place an order on the exchange
   */
  private async placeOrder(
    userId: Types.ObjectId,
    params: {
      symbol: string;
      side: 'BUY' | 'SELL';
      type: 'LIMIT' | 'MARKET';
      quantity: number;
      price?: number;
      stopPrice?: number;
      clientOrderId: string;
    },
    positionId?: Types.ObjectId
  ): Promise<OrderResult> {
    try {
      // Create order record first
      const order = await Order.create({
        userId,
        positionId,
        clientOrderId: params.clientOrderId,
        symbol: params.symbol,
        side: params.side,
        type: params.type,
        price: params.price,
        stopPrice: params.stopPrice,
        quantity: params.quantity,
        filledQuantity: 0,
        status: 'PENDING',
        submittedAt: new Date(),
      });

      console.log(`[ExecutionRouter] Created order record: ${order._id}`);

      // Check if Binance API is configured
      if (!binanceService.isConfigured()) {
        console.warn('[ExecutionRouter] Binance API not configured - simulating order fill');

        // Simulate order fill for testing
        order.status = 'FILLED';
        order.filledQuantity = params.quantity;
        order.fillPrice = params.price || 0;
        order.filledAt = new Date();
        order.fees = (params.price || 0) * params.quantity * 0.001; // 0.1% maker fee
        await order.save();

        return {
          success: true,
          orderId: order._id,
          fillPrice: order.fillPrice,
          filledQuantity: order.filledQuantity,
          fees: order.fees,
        };
      }

      // Place order on exchange
      const binanceOrder = await binanceService.placeOrder({
        symbol: params.symbol,
        side: params.side,
        type: params.type,
        quantity: params.quantity,
        price: params.price,
        stopPrice: params.stopPrice,
        timeInForce: params.type === 'LIMIT' ? 'GTC' : undefined,
        newClientOrderId: params.clientOrderId,
      });

      // Update order record with exchange response
      order.exchangeOrderId = binanceOrder.orderId.toString();
      
      // Map Binance order status
      const statusMap: Record<string, string> = {
        'NEW': 'OPEN',
        'PARTIALLY_FILLED': 'PARTIAL',
        'FILLED': 'FILLED',
        'CANCELED': 'CANCELLED',
        'REJECTED': 'REJECTED',
        'EXPIRED': 'EXPIRED',
      };
      
      order.status = statusMap[binanceOrder.status] || 'OPEN';
      order.filledQuantity = parseFloat(binanceOrder.executedQty);
      
      // Handle partial fills
      if (order.status === 'PARTIAL') {
        console.warn(`[ExecutionRouter] Order partially filled: ${order.filledQuantity}/${params.quantity}`);
        // Cancel unfilled portion to avoid hanging orders
        try {
          await binanceService.cancelOrder(params.symbol, binanceOrder.orderId);
          order.status = 'PARTIAL_CANCELLED';
          console.log(`[ExecutionRouter] Cancelled unfilled portion of partial order`);
        } catch (cancelError) {
          console.error(`[ExecutionRouter] Failed to cancel partial order:`, cancelError);
        }
      }
      order.evidence = {
        requestPayload: params,
        responsePayload: binanceOrder,
      };

      // Calculate fill price and fees from fills
      if (binanceOrder.fills && binanceOrder.fills.length > 0) {
        let totalCost = 0;
        let totalQty = 0;
        let totalFees = 0;

        binanceOrder.fills.forEach(fill => {
          const qty = parseFloat(fill.qty);
          const price = parseFloat(fill.price);
          const fee = parseFloat(fill.commission);

          totalCost += qty * price;
          totalQty += qty;
          totalFees += fee;
        });

        order.fillPrice = totalQty > 0 ? totalCost / totalQty : params.price;
        order.fees = totalFees;
        order.filledAt = new Date();
      }

      await order.save();

      console.log(`[ExecutionRouter] Order placed on exchange: ${binanceOrder.orderId}`);

      return {
        success: true,
        orderId: order._id,
        exchangeOrderId: order.exchangeOrderId,
        fillPrice: order.fillPrice,
        filledQuantity: order.filledQuantity,
        fees: order.fees,
      };
    } catch (error) {
      console.error('[ExecutionRouter] Error placing order:', error);

      // Update order record with error
      const order = await Order.findOne({ clientOrderId: params.clientOrderId });
      if (order) {
        order.status = 'REJECTED';
        order.evidence = {
          requestPayload: params,
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
        };
        await order.save();
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Create a tax lot for a BUY order
   */
  private async createTaxLot(
    userId: Types.ObjectId,
    symbol: string,
    quantity: number,
    price: number,
    fees: number,
    orderId?: Types.ObjectId
  ): Promise<void> {
    try {
      // Generate lot ID
      const date = new Date();
      const dateStr = date.toISOString().split('T')[0].replace(/-/g, '');
      const count = await Lot.countDocuments({
        userId,
        acquiredDate: {
          $gte: new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0),
        },
      });
      const lotId = `LOT-${dateStr}-${String(count + 1).padStart(3, '0')}`;

      // Calculate cost basis (price + allocated fees)
      const totalCost = price * quantity + fees;
      const costPerUnit = totalCost / quantity;

      await Lot.create({
        userId,
        lotId,
        symbol,
        acquiredDate: date,
        quantity,
        costPerUnit,
        totalCostBasis: totalCost,
        feesAllocated: fees,
        remainingQuantity: quantity,
        status: 'OPEN',
        evidence: {
          orderId,
          note: `Acquired via ${symbol} purchase`,
        },
      });

      console.log(`[ExecutionRouter] Created tax lot: ${lotId} - ${quantity} ${symbol} @ $${costPerUnit.toFixed(2)}/unit`);
    } catch (error) {
      console.error('[ExecutionRouter] Error creating tax lot:', error);
    }
  }

  /**
   * Cancel an open order
   */
  async cancelOrder(orderId: Types.ObjectId): Promise<{ success: boolean; error?: string }> {
    try {
      const order = await Order.findById(orderId);
      if (!order) {
        return { success: false, error: 'Order not found' };
      }

      if (order.status !== 'OPEN') {
        return { success: false, error: `Cannot cancel order with status ${order.status}` };
      }

      // Cancel on exchange if configured
      if (binanceService.isConfigured() && order.exchangeOrderId) {
        await binanceService.cancelOrder(order.symbol, parseInt(order.exchangeOrderId));
      }

      order.status = 'CANCELLED';
      await order.save();

      console.log(`[ExecutionRouter] Cancelled order: ${orderId}`);
      return { success: true };
    } catch (error) {
      console.error('[ExecutionRouter] Error cancelling order:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get open orders
   */
  async getOpenOrders(userId: Types.ObjectId): Promise<typeof Order.prototype[]> {
    return await Order.find({ userId, status: 'OPEN' });
  }
}

export default new ExecutionRouter();
