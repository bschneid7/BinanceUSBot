import Order, { IOrder } from '../models/Order';
import binanceService from './binanceService';
import alertService from './alertService';
import logger from '../utils/logger';

interface BinanceOpenOrder {
  symbol: string;
  orderId: number;
  clientOrderId: string;
  price: string;
  origQty: string;
  executedQty: string;
  status: string;
  type: string;
  side: string;
  time: number;
  updateTime: number;
}

interface ReconciliationResult {
  timestamp: Date;
  localOrders: number;
  exchangeOrders: number;
  orphanedOrders: number;
  missingOrders: number;
  statusMismatches: number;
  actions: string[];
}

/**
 * Order Reconciliation Service
 * 
 * Ensures local database orders are synchronized with exchange orders.
 * Critical for preventing orphaned orders after connection loss or crashes.
 * 
 * Features:
 * - Detects orphaned orders (local but not on exchange)
 * - Detects missing orders (on exchange but not local)
 * - Detects status mismatches
 * - Auto-recovery with alerts
 */
class OrderReconciliationService {
  private isReconciling = false;
  private lastReconciliation: Date | null = null;
  private reconciliationInterval = 5 * 60 * 1000; // 5 minutes

  /**
   * Main reconciliation method
   * Compares local orders with exchange orders and fixes discrepancies
   */
  async reconcileOrders(): Promise<ReconciliationResult> {
    if (this.isReconciling) {
      logger.warn('Order reconciliation already in progress, skipping');
      return this.getEmptyResult();
    }

    try {
      this.isReconciling = true;
      logger.info('Starting order reconciliation...');

      const result: ReconciliationResult = {
        timestamp: new Date(),
        localOrders: 0,
        exchangeOrders: 0,
        orphanedOrders: 0,
        missingOrders: 0,
        statusMismatches: 0,
        actions: [],
      };

      // Get local open orders from database
      const localOrders = await Order.find({
        status: { $in: ['OPEN', 'PARTIALLY_FILLED', 'PENDING'] },
      }).lean();

      result.localOrders = localOrders.length;
      logger.info(`Found ${localOrders.length} local open orders`);

      // Get exchange open orders
      const exchangeOrders = (await binanceService.getOpenOrders()) as BinanceOpenOrder[];
      result.exchangeOrders = exchangeOrders.length;
      logger.info(`Found ${exchangeOrders.length} exchange open orders`);

      // Create lookup maps
      const localOrderMap = new Map<string, IOrder>();
      const exchangeOrderMap = new Map<string, BinanceOpenOrder>();

      // Map by exchangeOrderId (most reliable)
      for (const order of localOrders) {
        if (order.exchangeOrderId) {
          localOrderMap.set(order.exchangeOrderId, order);
        }
      }

      for (const order of exchangeOrders) {
        exchangeOrderMap.set(order.orderId.toString(), order);
      }

      // Find orphaned orders (local but not on exchange)
      const orphanedOrders = localOrders.filter(
        (order) => order.exchangeOrderId && !exchangeOrderMap.has(order.exchangeOrderId)
      );

      for (const order of orphanedOrders) {
        await this.handleOrphanedOrder(order);
        result.orphanedOrders++;
        result.actions.push(`Marked orphaned order ${order.exchangeOrderId} as CANCELLED`);
      }

      // Find missing orders (on exchange but not local)
      const missingOrders = exchangeOrders.filter(
        (order) => !localOrderMap.has(order.orderId.toString())
      );

      for (const order of missingOrders) {
        await this.handleMissingOrder(order);
        result.missingOrders++;
        result.actions.push(`Recovered missing order ${order.orderId} from exchange`);
      }

      // Check status mismatches
      for (const [exchangeOrderId, localOrder] of Array.from(localOrderMap.entries())) {
        const exchangeOrder = exchangeOrderMap.get(exchangeOrderId);
        if (exchangeOrder) {
          const mismatch = await this.checkStatusMismatch(localOrder, exchangeOrder);
          if (mismatch) {
            result.statusMismatches++;
            result.actions.push(
              `Updated order ${exchangeOrderId} status from ${localOrder.status} to ${exchangeOrder.status}`
            );
          }
        }
      }

      // Log summary
      logger.info('Order reconciliation complete', result);

      // Send alert if significant discrepancies found
      if (result.orphanedOrders > 0 || result.missingOrders > 0 || result.statusMismatches > 5) {
      await alertService.sendAlert({
        severity: 'warning',
        title: 'Order Reconciliation Alert',
        message: `Found ${result.orphanedOrders} orphaned, ${result.missingOrders} missing, ${result.statusMismatches} status mismatches`,
      });
      }

      this.lastReconciliation = new Date();
      return result;
    } catch (error) {
      logger.error('Error during order reconciliation:', error);
      await alertService.sendAlert({
        severity: 'critical',
        title: 'Order Reconciliation Failed',
        message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
      throw error;
    } finally {
      this.isReconciling = false;
    }
  }

  /**
   * Handle orphaned order (local but not on exchange)
   * This happens when order was cancelled/filled on exchange but not updated locally
   */
  private async handleOrphanedOrder(order: IOrder): Promise<void> {
    logger.warn(`Orphaned order detected: ${order.exchangeOrderId} (${order.symbol})`);

    // Mark as cancelled since it's not on exchange anymore
    await Order.updateOne(
      { _id: order._id },
      {
        $set: {
          status: 'CANCELLED',
          evidence: {
            ...order.evidence,
            reconciliationNote: 'Order not found on exchange during reconciliation',
            reconciliationTime: new Date(),
          },
        },
      }
    );

    logger.info(`Marked orphaned order ${order.exchangeOrderId} as CANCELLED`);
  }

  /**
   * Handle missing order (on exchange but not local)
   * This happens after connection loss or system crash
   */
  private async handleMissingOrder(exchangeOrder: BinanceOpenOrder): Promise<void> {
    logger.warn(`Missing order detected on exchange: ${exchangeOrder.orderId} (${exchangeOrder.symbol})`);

    // Try to find by clientOrderId as backup
    const existingOrder = await Order.findOne({
      clientOrderId: exchangeOrder.clientOrderId,
    });

    if (existingOrder) {
      // Update existing order with exchange data
      await Order.updateOne(
        { _id: existingOrder._id },
        {
          $set: {
            exchangeOrderId: exchangeOrder.orderId.toString(),
            status: this.mapBinanceStatus(exchangeOrder.status),
            filledQuantity: parseFloat(exchangeOrder.executedQty),
            evidence: {
              ...existingOrder.evidence,
              reconciliationNote: 'Order recovered from exchange during reconciliation',
              reconciliationTime: new Date(),
            },
          },
        }
      );
      logger.info(`Updated existing order ${existingOrder._id} with exchange data`);
    } else {
      // Create new order record from exchange data
      // Note: We don't know the userId, so we'll use a system user or skip
      logger.warn(`Cannot recover order ${exchangeOrder.orderId} - no matching local record found`);
      
      // Send alert for manual review
      await alertService.sendAlert({
        severity: 'warning',
        title: 'Unrecoverable Order Found',
        message: `Exchange order ${exchangeOrder.orderId} (${exchangeOrder.symbol}) has no local record. Manual review required.`,
      });
    }
  }

  /**
   * Check and fix status mismatches between local and exchange
   */
  private async checkStatusMismatch(
    localOrder: IOrder,
    exchangeOrder: BinanceOpenOrder
  ): Promise<boolean> {
    const localStatus = localOrder.status;
    const exchangeStatus = this.mapBinanceStatus(exchangeOrder.status);

    if (localStatus !== exchangeStatus) {
      logger.warn(
        `Status mismatch for order ${localOrder.exchangeOrderId}: local=${localStatus}, exchange=${exchangeStatus}`
      );

      // Update local order with exchange status
      await Order.updateOne(
        { _id: localOrder._id },
        {
          $set: {
            status: exchangeStatus,
            filledQuantity: parseFloat(exchangeOrder.executedQty),
            evidence: {
              ...localOrder.evidence,
              reconciliationNote: `Status updated from ${localStatus} to ${exchangeStatus}`,
              reconciliationTime: new Date(),
            },
          },
        }
      );

      return true;
    }

    return false;
  }

  /**
   * Map Binance order status to our internal status
   */
  private mapBinanceStatus(binanceStatus: string): IOrder['status'] {
    const statusMap: Record<string, IOrder['status']> = {
      NEW: 'OPEN',
      PARTIALLY_FILLED: 'PARTIALLY_FILLED',
      FILLED: 'FILLED',
      CANCELED: 'CANCELLED',
      PENDING_CANCEL: 'OPEN',
      REJECTED: 'REJECTED',
      EXPIRED: 'CANCELLED',
    };

    return statusMap[binanceStatus] || 'OPEN';
  }

  /**
   * Get empty result for skipped reconciliation
   */
  private getEmptyResult(): ReconciliationResult {
    return {
      timestamp: new Date(),
      localOrders: 0,
      exchangeOrders: 0,
      orphanedOrders: 0,
      missingOrders: 0,
      statusMismatches: 0,
      actions: [],
    };
  }

  /**
   * Start automatic reconciliation on interval
   */
  startAutoReconciliation(): void {
    logger.info(`Starting automatic order reconciliation every ${this.reconciliationInterval / 1000}s`);

    setInterval(async () => {
      try {
        await this.reconcileOrders();
      } catch (error) {
        logger.error('Auto-reconciliation failed:', error);
      }
    }, this.reconciliationInterval);

    // Run immediately on startup
    setTimeout(() => {
      this.reconcileOrders().catch((error) => {
        logger.error('Initial reconciliation failed:', error);
      });
    }, 10000); // Wait 10s after startup
  }

  /**
   * Get reconciliation status
   */
  getStatus(): {
    isReconciling: boolean;
    lastReconciliation: Date | null;
    intervalMs: number;
  } {
    return {
      isReconciling: this.isReconciling,
      lastReconciliation: this.lastReconciliation,
      intervalMs: this.reconciliationInterval,
    };
  }

  /**
   * Manual trigger for reconciliation (for testing or emergency)
   */
  async triggerManualReconciliation(): Promise<ReconciliationResult> {
    logger.info('Manual order reconciliation triggered');
    return await this.reconcileOrders();
  }
}

// Export singleton instance
const orderReconciliationService = new OrderReconciliationService();
export default orderReconciliationService;
