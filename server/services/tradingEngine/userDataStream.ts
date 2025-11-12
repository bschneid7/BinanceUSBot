import WebSocket from 'ws';
import { Types } from 'mongoose';
import binanceService from '../binanceService';
import Order from '../../models/Order';
import Position from '../../models/Position';
import BotState from '../../models/BotState';
import { slackNotifier } from '../slackNotifier';

/**
 * User Data Stream Service
 * Maintains WebSocket connection to Binance User Data Stream
 * Receives real-time updates for orders, fills, cancellations, and balances
 */
export class UserDataStreamService {
  private ws: WebSocket | null = null;
  private listenKey: string | null = null;
  private keepAliveInterval: NodeJS.Timeout | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private userId: Types.ObjectId | null = null;
  private isRunning: boolean = false;

  /**
   * Start the User Data Stream for a user
   */
  async start(userId: Types.ObjectId): Promise<void> {
    if (this.isRunning) {
      console.log('[UserDataStream] Already running');
      return;
    }

    this.userId = userId;
    this.isRunning = true;

    try {
      // Create listen key
      this.listenKey = await binanceService.createListenKey();
      console.log(`[UserDataStream] Created listen key: ${this.listenKey}`);

      // Connect WebSocket
      await this.connect();

      // Start keep-alive (every 30 minutes)
      this.startKeepAlive();

      console.log('[UserDataStream] Started successfully');
    } catch (error) {
      console.error('[UserDataStream] Failed to start:', error);
      this.isRunning = false;
      throw error;
    }
  }

  /**
   * Stop the User Data Stream
   */
  async stop(): Promise<void> {
    console.log('[UserDataStream] Stopping...');
    this.isRunning = false;

    // Stop keep-alive
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }

    // Stop reconnect timeout
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    // Close WebSocket
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    // Delete listen key
    if (this.listenKey) {
      try {
        await binanceService.deleteListenKey(this.listenKey);
        console.log('[UserDataStream] Deleted listen key');
      } catch (error) {
        console.error('[UserDataStream] Failed to delete listen key:', error);
      }
      this.listenKey = null;
    }

    this.userId = null;
    console.log('[UserDataStream] Stopped');
  }

  /**
   * Connect to WebSocket
   */
  private async connect(): Promise<void> {
    if (!this.listenKey) {
      throw new Error('Listen key not created');
    }

    const wsUrl = `wss://stream.binance.us:9443/ws/${this.listenKey}`;
    this.ws = new WebSocket(wsUrl);

    this.ws.on('open', () => {
      console.log('[UserDataStream] WebSocket connected');
    });

    this.ws.on('message', (data: WebSocket.Data) => {
      this.handleMessage(data.toString());
    });

    this.ws.on('error', (error) => {
      console.error('[UserDataStream] WebSocket error:', error);
    });

    this.ws.on('close', () => {
      console.log('[UserDataStream] WebSocket closed');
      if (this.isRunning) {
        this.scheduleReconnect();
      }
    });
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(data: string): void {
    try {
      const event = JSON.parse(data);

      switch (event.e) {
        case 'executionReport':
          this.handleExecutionReport(event);
          break;
        case 'outboundAccountPosition':
          this.handleAccountUpdate(event);
          break;
        case 'balanceUpdate':
          this.handleBalanceUpdate(event);
          break;
        default:
          console.log(`[UserDataStream] Unknown event type: ${event.e}`);
      }
    } catch (error) {
      console.error('[UserDataStream] Error handling message:', error);
    }
  }

  /**
   * Handle execution report (order updates)
   */
  private async handleExecutionReport(event: any): Promise<void> {
    try {
      const {
        s: symbol,           // Symbol
        c: clientOrderId,    // Client order ID
        i: orderId,          // Exchange order ID
        X: orderStatus,      // Order status
        x: executionType,    // Execution type
        S: side,             // Side (BUY/SELL)
        o: orderType,        // Order type
        q: origQty,          // Original quantity
        z: executedQty,      // Executed quantity
        Z: cummulativeQuoteQty, // Cumulative quote quantity
        L: lastExecutedPrice,   // Last executed price
        n: commission,       // Commission
        N: commissionAsset,  // Commission asset
        T: transactionTime,  // Transaction time
      } = event;

      console.log(`[UserDataStream] Execution report: ${symbol} ${side} ${orderStatus} - ${executedQty}/${origQty} @ ${lastExecutedPrice}`);

      // Find order in database
      const order = await Order.findOne({ clientOrderId });
      if (!order) {
        console.warn(`[UserDataStream] Order not found: ${clientOrderId}`);
        return;
      }

      // Update order status
      const statusMap: Record<string, any> = {
        'NEW': 'OPEN',
        'PARTIALLY_FILLED': 'PARTIALLY_FILLED',
        'FILLED': 'FILLED',
        'CANCELED': 'CANCELLED',
        'REJECTED': 'REJECTED',
        'EXPIRED': 'CANCELLED',
      };

      const previousStatus = order.status;
      order.status = statusMap[orderStatus] || order.status;
      order.exchangeOrderId = orderId.toString();
      order.filledQuantity = parseFloat(executedQty);

      // Update fill price and fees for fills
      if (executionType === 'TRADE') {
        const lastPrice = parseFloat(lastExecutedPrice);
        const lastQty = parseFloat(event.l); // Last executed quantity
        const fee = parseFloat(commission);

        // Update weighted average fill price
        if (order.filledQuantity > 0) {
          const prevTotal = (order.fillPrice || 0) * (order.filledQuantity - lastQty);
          const newTotal = prevTotal + (lastPrice * lastQty);
          order.fillPrice = newTotal / order.filledQuantity;
        }

        // Add to total fees
        order.fees = (order.fees || 0) + fee;

        console.log(`[UserDataStream] Fill: ${lastQty} @ ${lastPrice}, Fee: ${fee} ${commissionAsset}`);
      }

      // Mark as filled if fully executed
      if (order.status === 'FILLED') {
        order.filledAt = new Date(transactionTime);
        console.log(`[UserDataStream] Order FILLED: ${clientOrderId}`);

        // Notify Slack about order fill
        // Calculate P&L if this is a closing order
        let pnl: number | undefined;
        let pnlPercent: number | undefined;
        if (order.positionId) {
          try {
            const position = await Position.findById(order.positionId);
            if (position && position.unrealized_pnl !== undefined) {
              pnl = position.unrealized_pnl;
              pnlPercent = (pnl / (position.entry_price * position.quantity)) * 100;
            }
          } catch (err) {
            console.error('[UserDataStream] Error calculating P&L for Slack notification:', err);
          }
        }

        await slackNotifier.notifyOrderFilled(
          order.symbol,
          order.side as 'BUY' | 'SELL',
          order.executedQty,
          order.avgPrice,
          pnl,
          pnlPercent
        );
      }

      // Mark as cancelled
      if (order.status === 'CANCELLED') {
        console.log(`[UserDataStream] Order CANCELLED: ${clientOrderId}`);
      }

      await order.save();

      // Update position if this is a fill
      if (executionType === 'TRADE' && order.positionId) {
        await this.updatePosition(order.positionId, order);
      }

      // Log status change
      if (previousStatus !== order.status) {
        console.log(`[UserDataStream] Order ${clientOrderId}: ${previousStatus} -> ${order.status}`);
      }

    } catch (error) {
      console.error('[UserDataStream] Error handling execution report:', error);
    }
  }

  /**
   * Handle account position update
   */
  private async handleAccountUpdate(event: any): Promise<void> {
    try {
      console.log('[UserDataStream] Account position update');

      if (!this.userId) return;

      // Update balances in bot state
      const state = await BotState.findOne({ userId: this.userId });
      if (!state) return;

      // Update USD balance
      const usdBalance = event.B?.find((b: any) => b.a === 'USD');
      if (usdBalance) {
        const free = parseFloat(usdBalance.f);
        const locked = parseFloat(usdBalance.l);
        console.log(`[UserDataStream] USD balance: ${free} free, ${locked} locked`);
      }

      // Could update other balances here if needed
      await state.save();

    } catch (error) {
      console.error('[UserDataStream] Error handling account update:', error);
    }
  }

  /**
   * Handle balance update
   */
  private async handleBalanceUpdate(event: any): Promise<void> {
    try {
      const {
        a: asset,
        d: delta,
        T: clearTime,
      } = event;

      console.log(`[UserDataStream] Balance update: ${asset} ${delta > 0 ? '+' : ''}${delta}`);

    } catch (error) {
      console.error('[UserDataStream] Error handling balance update:', error);
    }
  }

  /**
   * Update position based on order fill
   */
  private async updatePosition(positionId: Types.ObjectId, order: any): Promise<void> {
    try {
      const position = await Position.findById(positionId);
      if (!position) {
        console.warn(`[UserDataStream] Position not found: ${positionId}`);
        return;
      }

      // Update position quantity based on order side
      if (order.side === 'BUY') {
        position.quantity += order.filledQuantity;
        console.log(`[UserDataStream] Position ${position.symbol}: Added ${order.filledQuantity} (now ${position.quantity})`);
      } else if (order.side === 'SELL') {
        position.quantity -= order.filledQuantity;
        console.log(`[UserDataStream] Position ${position.symbol}: Removed ${order.filledQuantity} (now ${position.quantity})`);

        // Close position if quantity is zero
        if (position.quantity <= 0.0001) {
          position.status = 'CLOSED';
          position.closed_at = new Date();
          console.log(`[UserDataStream] Position ${position.symbol} CLOSED`);
        }
      }

      await position.save();

    } catch (error) {
      console.error('[UserDataStream] Error updating position:', error);
    }
  }

  /**
   * Start keep-alive interval (ping every 30 minutes)
   */
  private startKeepAlive(): void {
    this.keepAliveInterval = setInterval(async () => {
      try {
        if (this.listenKey) {
          await binanceService.keepAliveListenKey(this.listenKey);
          console.log('[UserDataStream] Keep-alive sent');
        }
      } catch (error) {
        console.error('[UserDataStream] Keep-alive failed:', error);
      }
    }, 30 * 60 * 1000); // 30 minutes
  }

  /**
   * Schedule reconnect after disconnect
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    console.log('[UserDataStream] Reconnecting in 5 seconds...');
    this.reconnectTimeout = setTimeout(async () => {
      try {
        await this.connect();
        console.log('[UserDataStream] Reconnected successfully');
      } catch (error) {
        console.error('[UserDataStream] Reconnect failed:', error);
        this.scheduleReconnect();
      }
    }, 5000);
  }

  /**
   * Check if stream is running
   */
  isActive(): boolean {
    return this.isRunning && this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}

// Export singleton instance
export const userDataStream = new UserDataStreamService();
export default userDataStream;

