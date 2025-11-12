import logger from '../../utils/logger';
import { Types } from 'mongoose';
import binanceService from '../binanceService';
import exchangeFilters from '../exchangeFilters';
import Order from '../../models/Order';
import Lot from '../../models/Lot';
import BotConfig from '../../models/BotConfig';
import BotState from '../../models/BotState';
import { TradingSignal } from './signalGenerator';
import riskEngine from './riskEngine';
import makerFirstExecution from '../makerFirstExecution';
import exchangeInfoCache from '../exchangeInfoCache';
import policyGuardrails from './policyGuardrails';
import getCDDHelper from '../cddDataHelper';

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
      logger.info(`[ExecutionRouter] Executing signal for ${signal.symbol} - ${signal.playbook} - ${signal.action} - Qty: ${quantity}`);

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
      let makerFirstResult: any = null;

      // Phase 2: VWAP-Based Entry Timing (only for new positions, not closes)
      if (!positionId) {
        price = await this.adjustPriceWithVWAP(signal.symbol, signal.action, signal.entryPrice);
        if (price !== signal.entryPrice) {
          logger.info(`[ExecutionRouter] VWAP-adjusted entry: ${signal.entryPrice.toFixed(8)} -> ${price.toFixed(8)}`);
        }
      }

      // Apply maker-first execution if enabled (adjust price to maker side)
      if (makerFirstExecution.isEnabled() && orderType === 'LIMIT') {
        try {
          makerFirstResult = await makerFirstExecution.adjustPriceToMaker(
            signal.symbol,
            signal.action,
            signal.entryPrice
          );
          price = makerFirstResult.adjustedPrice;
          logger.info(`[ExecutionRouter] Maker-first adjusted price: ${signal.entryPrice.toFixed(8)} -> ${price.toFixed(8)} (${makerFirstResult.adjustmentBps.toFixed(2)}bps)`);
        } catch (error) {
          logger.warn('[ExecutionRouter] Maker-first adjustment failed, using original price:', error);
        }
      }

      // Validate signal prices
      if (signal.entryPrice <= 0) {
        logger.error(`[ExecutionRouter] Invalid entry price: ${signal.entryPrice}`);
        return { success: false, error: 'Invalid entry price (must be > 0)' };
      }
      
      // Stop price is only required for new positions (not for closing)
      if (!positionId && signal.stopPrice <= 0) {
        logger.error(`[ExecutionRouter] Invalid stop price for new position: ${signal.stopPrice}`);
        return { success: false, error: 'Stop price required for new positions (must be > 0)' };
      }
      
      if (signal.entryPrice > 1000000) {
        logger.error(`[ExecutionRouter] Suspiciously high entry price: ${signal.entryPrice}`);
        return { success: false, error: 'Entry price exceeds sanity check threshold' };
      }
      
      // Get current price for pre-trade checks
      const currentTicker = await binanceService.getTicker(signal.symbol);
      const currentPrice = parseFloat(currentTicker.lastPrice);
      
      // Sanity check: signal price shouldn't be more than 50% away from current price
      const priceDiff = Math.abs(currentPrice - signal.entryPrice) / currentPrice;
      if (priceDiff > 0.5) {
        logger.error(`[ExecutionRouter] Signal price ${signal.entryPrice} is ${(priceDiff*100).toFixed(1)}% away from current price ${currentPrice}`);
        return { success: false, error: 'Signal price too far from current market price (>50%)' };
      }
      
      const priceChange = Math.abs(currentPrice - signal.entryPrice);
      const preTradeSlippageBps = (priceChange / signal.entryPrice) * 10000;

      logger.info(`[ExecutionRouter] Pre-trade check: Signal price $${signal.entryPrice.toFixed(2)}, Current $${currentPrice.toFixed(2)}, Slippage ${preTradeSlippageBps.toFixed(2)}bps`);

      // Calculate proposed risk and notional
      const proposedNotional = quantity * price;
      const riskPerUnit = Math.abs(signal.entryPrice - signal.stopPrice);
      
      // Get current equity for R calculation
      const state = await BotState.findOne({ userId });
      const currentEquity = (state?.currentEquity || state?.startingEquity) ?? 10000; // Fallback to reasonable default
      const rDollarValue = currentEquity * (config?.risk?.R_pct / 100);
      const proposedRiskR = (riskPerUnit * quantity) / rDollarValue;

      // Run comprehensive pre-trade gates
      const gateCheck = await policyGuardrails.checkAllPreTradeGates({
        userId,
        symbol: signal.symbol,
        action: signal.action,
        side: signal.action === 'BUY' ? 'LONG' : 'SHORT',
        quantity,
        price,
        signalPrice: signal.entryPrice,
        proposedRiskR,
        proposedNotional,
        isEvent: signal.isEvent || false,
      });

      if (!gateCheck.approved) {
        logger.warn(`[ExecutionRouter] Pre-trade gate failed: ${gateCheck.reason}`);
        return {
          success: false,
          error: `Pre-trade gate failed (${gateCheck.gate}): ${gateCheck.reason}`,
        };
      }

      // For normal conditions, prefer POST-ONLY limit orders (maker)
      // For events or if price has moved significantly, use market orders
      if (signal.isEvent) {
        const changePercent = (priceChange / signal.entryPrice) * 100;

        if (changePercent > 0.2) {
          logger.info(`[ExecutionRouter] Signal decayed ${changePercent.toFixed(2)}% - using MARKET order`);
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
        logger.error(`[ExecutionRouter] Order failed: ${orderResult.error}`);
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
          logger.warn(`[ExecutionRouter] WARNING: ${slippageCheck.reason}`);
        }

        logger.info(`[ExecutionRouter] Order filled at $${orderResult.fillPrice.toFixed(2)} - Slippage: ${slippageBps.toFixed(2)} bps`);
      }

      // Create tax lot for BUY orders
      if (signal.action === 'BUY' && orderResult.success) {
        await this.createTaxLot(
          userId,
          signal.symbol,
          orderResult.filledQuantity || quantity,
          orderResult.fillPrice || price,
          orderResult.fees ?? 0,
          orderResult.orderId
        );
      }

      return orderResult;
    } catch (error) {
      logger.error('[ExecutionRouter] Error executing signal:', error);
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

      logger.info(`[ExecutionRouter] Created order record: ${order._id as any}`);

      // Check if Binance API is configured
      if (!binanceService.isConfigured()) {
        logger.warn('[ExecutionRouter] Binance API not configured - simulating order fill');

        // Simulate order fill for testing
        if (order) order.status = 'FILLED';
        order.filledQuantity = params.quantity;
        order.fillPrice = params.price ?? 0;
        order.filledAt = new Date();
        order.fees = (params.price ?? 0) * params.quantity * 0.001; // 0.1% maker fee
        await order.save();

        return {
          success: true,
          orderId: order._id as any,
          fillPrice: order.fillPrice,
          filledQuantity: order.filledQuantity,
          fees: order.fees,
        };
      }

      // Validate and round order parameters using exchange filters
      if (params.type === 'LIMIT' && params.price) {
        const validation = exchangeFilters.validateOrder(
          params.symbol,
          params.price,
          params.quantity
        );

        if (!validation.valid) {
          logger.error(
            `[ExecutionRouter] Order validation failed for ${params.symbol}: ${validation.errors.join(', ')}`
          );
          
          // Update order status to REJECTED
          order.status = 'REJECTED';
          order.rejectReason = validation.errors.join('; ');
          await order.save();
          
          return {
            success: false,
            orderId: order._id as any,
            error: `Order validation failed: ${validation.errors.join(', ')}`,
          };
        }

        // Use rounded values for order
        params.price = parseFloat(validation.roundedPrice);
        params.quantity = parseFloat(validation.roundedQty);
        
        logger.info(
          `[ExecutionRouter] Order validated and rounded: ${params.symbol} ` +
          `price=${validation.roundedPrice} qty=${validation.roundedQty}`
        );
      }

      // Force LIMIT_MAKER for maker-only execution (0.0% fee)
      // LIMIT_MAKER will be rejected with -2010 if it would match immediately
      const orderType = params.type === 'LIMIT' ? 'LIMIT_MAKER' : params.type;
      
      // Place order on exchange
      const binanceOrder = await binanceService.placeOrder({
        symbol: params.symbol,
        side: params.side,
        type: orderType,
        quantity: params.quantity,
        price: params.price,
        stopPrice: params.stopPrice,
        timeInForce: orderType === 'LIMIT_MAKER' ? 'GTC' : undefined,
        newClientOrderId: params.clientOrderId,
      });
      
      logger.info(
        `[ExecutionRouter] Order placed: ${params.symbol} ${orderType} ` +
        `${params.side} ${params.quantity} @ ${params.price}`
      );

      // Update order record with exchange response
      order.exchangeOrderId = binanceOrder.orderId.toString();
      
      // Map Binance order status to schema-accurate values
      // Schema enums: 'PENDING' | 'OPEN' | 'FILLED' | 'PARTIALLY_FILLED' | 'CANCELLED' | 'REJECTED'
      const statusMap: Record<string, IOrder['status']> = {
        'NEW': 'OPEN',
        'PARTIALLY_FILLED': 'PARTIALLY_FILLED',  // Fixed: was 'PARTIAL'
        'FILLED': 'FILLED',
        'CANCELED': 'CANCELLED',
        'REJECTED': 'REJECTED',
        'EXPIRED': 'CANCELLED',  // Treat expired as cancelled
      };
      
      if (order) order.status = statusMap[binanceOrder.status] || 'OPEN';
      order.filledQuantity = parseFloat(binanceOrder.executedQty);
      
      // Handle partial fills - keep order open for remaining quantity
      if (order?.status === 'PARTIALLY_FILLED') {
        const remainingQty = params.quantity - order.filledQuantity;
        logger.warn(`[ExecutionRouter] Order partially filled: ${order.filledQuantity}/${params.quantity} (${remainingQty} remaining)`);
        // Note: Order remains OPEN on exchange for the unfilled portion
        // Position manager will track this and update when fully filled or cancelled
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

        binanceOrder.fills?.forEach(fill => {
          // Null-safe parsing with defaults
          const qty = fill?.qty ? parseFloat(fill.qty) : 0;
          const price = fill?.price ? parseFloat(fill.price) : 0;
          const fee = fill?.commission ? parseFloat(fill.commission) : 0;
          
          // Validate parsed values
          if (isNaN(qty) || isNaN(price) || isNaN(fee)) {
            logger.warn('[ExecutionRouter] Invalid fill data:', fill);
            return; // Skip this fill
          }

          totalCost += qty * price;
          totalQty += qty;
          totalFees += fee;
        });

        // Only update if we have valid data
        if (totalQty > 0) {
          order.fillPrice = totalCost / totalQty;
          order.fees = totalFees;
          order.filledAt = new Date();
        } else {
          logger.warn('[ExecutionRouter] No valid fills found, using order price');
          order.fillPrice = params.price;
          order.fees = 0;
        }
      } else {
        // No fills data - use order price and zero fees
        order.fillPrice = params.price;
        order.fees = 0;
      }

      await order.save();

      logger.info(`[ExecutionRouter] Order placed on exchange: ${binanceOrder.orderId}`);

      return {
        success: true,
        orderId: order._id as any,
        exchangeOrderId: order.exchangeOrderId,
        fillPrice: order.fillPrice,
        filledQuantity: order.filledQuantity,
        fees: order.fees,
      };
    } catch (error: any) {
      // Check if this is a -2010 error (LIMIT_MAKER would immediately match)
      const is2010Error = error?.message?.includes('-2010') || 
                          error?.message?.includes('would immediately match');
      
      if (is2010Error && params.type === 'LIMIT' && params.price) {
        logger.warn(
          `[ExecutionRouter] LIMIT_MAKER rejected (-2010) for ${params.symbol}, repricing...`
        );
        
        // Reprice order away from market
        // BUY: Lower price (more conservative)
        // SELL: Higher price (more conservative)
        const tickSize = parseFloat(
          exchangeFilters.getFilters(params.symbol)?.priceFilter?.tickSize || '0.01'
        );
        
        const repricedPrice = params.side === 'BUY'
          ? params.price - tickSize  // Lower for BUY
          : params.price + tickSize; // Higher for SELL
        
        logger.info(
          `[ExecutionRouter] Repricing ${params.symbol} ${params.side}: ` +
          `${params.price} → ${repricedPrice}`
        );
        
        // Retry with repriced order
        return this.placeOrder(userId, {
          ...params,
          price: repricedPrice,
          clientOrderId: `${params.clientOrderId}_r1`, // Add retry suffix
        }, positionId);
      }
      
      logger.error('[ExecutionRouter] Error placing order:', error);

      // Update order record with error
      const order = await Order.findOne({ clientOrderId: params.clientOrderId });
      if (order) {
        if (order) order.status = 'REJECTED';
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

      logger.info(`[ExecutionRouter] Created tax lot: ${lotId} - ${quantity} ${symbol} @ $${costPerUnit.toFixed(2)}/unit`);
    } catch (error) {
      logger.error('[ExecutionRouter] Error creating tax lot:', error);
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

      if (order?.status !== 'OPEN') {
        return { success: false, error: `Cannot cancel order with status ${order?.status}` };
      }

      // Cancel on exchange if configured
      if (binanceService.isConfigured() && order.exchangeOrderId) {
        await binanceService.cancelOrder(order.symbol, parseInt(order.exchangeOrderId));
      }

      if (order) order.status = 'CANCELLED';
      await order.save();

      logger.info(`[ExecutionRouter] Cancelled order: ${orderId}`);
      return { success: true };
    } catch (error) {
      logger.error('[ExecutionRouter] Error cancelling order:', error);
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

  /**
   * Phase 2: VWAP-Based Entry Timing
   * Adjust entry price based on VWAP to get better fills
   */
  private async adjustPriceWithVWAP(
    symbol: string,
    action: 'BUY' | 'SELL',
    entryPrice: number
  ): Promise<number> {
    try {
      // Only BTC and ETH have VWAP data
      if (!['BTCUSDT', 'ETHUSDT'].includes(symbol)) {
        return entryPrice;
      }

      const cddHelper = getCDDHelper();
      const vwap = await cddHelper.getLatestVWAP(symbol);

      // If no VWAP data, use original price
      if (!vwap) {
        return entryPrice;
      }

      // For LONG: prefer entry below VWAP (better value)
      if (action === 'BUY') {
        // If current price is above VWAP, adjust entry down toward VWAP
        if (entryPrice > vwap) {
          const adjustedPrice = vwap + (entryPrice - vwap) * 0.5; // Move halfway to VWAP
          logger.info(`[VWAPTiming] LONG entry above VWAP: ${entryPrice.toFixed(2)} -> ${adjustedPrice.toFixed(2)} (VWAP: ${vwap.toFixed(2)})`);
          return adjustedPrice;
        }
      }

      // For SHORT: prefer entry above VWAP (better value)
      if (action === 'SELL') {
        // If current price is below VWAP, adjust entry up toward VWAP
        if (entryPrice < vwap) {
          const adjustedPrice = vwap - (vwap - entryPrice) * 0.5; // Move halfway to VWAP
          logger.info(`[VWAPTiming] SHORT entry below VWAP: ${entryPrice.toFixed(2)} -> ${adjustedPrice.toFixed(2)} (VWAP: ${vwap.toFixed(2)})`);
          return adjustedPrice;
        }
      }

      // Price is already on the favorable side of VWAP, no adjustment needed
      return entryPrice;
    } catch (error) {
      logger.error(`[VWAPTiming] Error adjusting price for ${symbol}:`, error);
      // If error, return original price (fail-open)
      return entryPrice;
    }
  }
}

export default new ExecutionRouter();
