import { Types } from 'mongoose';
import Position from '../models/Position';
import Order from '../models/Order';
import binanceService from './binanceService';
import eventStore from './eventStore';
import commandBus from './commandBus';
import logger from '../utils/logger';

/**
 * Continuous Reconciliation Service
 * 
 * Automatically detects and fixes state discrepancies between:
 * - Database (positions, orders)
 * - Binance exchange (actual balances, orders)
 * 
 * Runs every 30 seconds to ensure state consistency.
 */

interface ReconciliationConfig {
  enabled: boolean;
  intervalSeconds: number;
  autoFixEnabled: boolean;
  maxDiscrepanciesPerRun: number;
  notifyOnDiscrepancy: boolean;
}

interface ReconciliationStats {
  runsTotal: number;
  lastRunTime: Date | null;
  discrepanciesFound: number;
  discrepanciesFixed: number;
  discrepanciesFailed: number;
  lastDiscrepancies: DiscrepancyRecord[];
}

interface DiscrepancyRecord {
  type: 'PHANTOM_POSITION' | 'QUANTITY_MISMATCH' | 'MISSING_POSITION' | 'STALE_ORDER';
  aggregateId: string;
  details: any;
  fixed: boolean;
  timestamp: Date;
}

class ContinuousReconciliationService {
  private interval: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private config: ReconciliationConfig;
  private stats: ReconciliationStats;

  constructor() {
    this.config = {
      enabled: process.env.RECONCILIATION_ENABLED !== 'false',
      intervalSeconds: parseInt(process.env.RECONCILIATION_INTERVAL_SECONDS || '30'),
      autoFixEnabled: process.env.RECONCILIATION_AUTO_FIX !== 'false',
      maxDiscrepanciesPerRun: parseInt(process.env.RECONCILIATION_MAX_DISCREPANCIES || '10'),
      notifyOnDiscrepancy: process.env.RECONCILIATION_NOTIFY !== 'false',
    };

    this.stats = {
      runsTotal: 0,
      lastRunTime: null,
      discrepanciesFound: 0,
      discrepanciesFixed: 0,
      discrepanciesFailed: 0,
      lastDiscrepancies: [],
    };
  }

  /**
   * Start continuous reconciliation
   */
  async start(): Promise<void> {
    if (!this.config.enabled) {
      logger.info('[ContinuousReconciliation] Service disabled by configuration');
      return;
    }

    if (this.isRunning) {
      logger.warn('[ContinuousReconciliation] Service already running');
      return;
    }

    this.isRunning = true;
    logger.info(`[ContinuousReconciliation] Starting service (interval: ${this.config.intervalSeconds}s)`);

    // Run immediately on start
    await this.reconcile();

    // Then run on interval
    this.interval = setInterval(async () => {
      await this.reconcile();
    }, this.config.intervalSeconds * 1000);

    logger.info('[ContinuousReconciliation] ✅ Service started');
  }

  /**
   * Stop continuous reconciliation
   */
  async stop(): Promise<void> {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.isRunning = false;
    logger.info('[ContinuousReconciliation] Service stopped');
  }

  /**
   * Perform full reconciliation
   */
  private async reconcile(): Promise<void> {
    if (!this.isRunning) return;

    const startTime = Date.now();
    const discrepancies: DiscrepancyRecord[] = [];

    try {
      logger.info('[ContinuousReconciliation] Starting reconciliation run...');

      // Record reconciliation start event
      await eventStore.recordEvent({
        type: 'ReconciliationStarted',
        aggregateType: 'System',
        aggregateId: 'reconciliation',
        data: {
          timestamp: new Date(),
          config: this.config,
        },
      });

      // 1. Reconcile positions
      const positionDiscrepancies = await this.reconcilePositions();
      discrepancies.push(...positionDiscrepancies);

      // 2. Reconcile orders
      const orderDiscrepancies = await this.reconcileOrders();
      discrepancies.push(...orderDiscrepancies);

      // Update stats
      this.stats.runsTotal++;
      this.stats.lastRunTime = new Date();
      this.stats.discrepanciesFound += discrepancies.length;
      this.stats.discrepanciesFixed += discrepancies.filter(d => d.fixed).length;
      this.stats.discrepanciesFailed += discrepancies.filter(d => !d.fixed).length;
      this.stats.lastDiscrepancies = discrepancies.slice(0, 20); // Keep last 20

      const duration = Date.now() - startTime;

      // Record reconciliation complete event
      await eventStore.recordEvent({
        type: 'ReconciliationCompleted',
        aggregateType: 'System',
        aggregateId: 'reconciliation',
        data: {
          timestamp: new Date(),
          duration,
          discrepanciesFound: discrepancies.length,
          discrepanciesFixed: discrepancies.filter(d => d.fixed).length,
          discrepanciesFailed: discrepancies.filter(d => !d.fixed).length,
          discrepancies: discrepancies.map(d => ({
            type: d.type,
            aggregateId: d.aggregateId,
            fixed: d.fixed,
          })),
        },
      });

      if (discrepancies.length > 0) {
        logger.warn(
          `[ContinuousReconciliation] Found ${discrepancies.length} discrepancies ` +
          `(fixed: ${discrepancies.filter(d => d.fixed).length}, ` +
          `failed: ${discrepancies.filter(d => !d.fixed).length})`
        );
      } else {
        logger.info(`[ContinuousReconciliation] ✅ No discrepancies found (${duration}ms)`);
      }

    } catch (error: any) {
      logger.error('[ContinuousReconciliation] Reconciliation failed:', error);

      await eventStore.recordEvent({
        type: 'ReconciliationFailed',
        aggregateType: 'System',
        aggregateId: 'reconciliation',
        data: {
          timestamp: new Date(),
          error: error.message,
          stack: error.stack,
        },
      });
    }
  }

  /**
   * Reconcile positions
   */
  private async reconcilePositions(): Promise<DiscrepancyRecord[]> {
    const discrepancies: DiscrepancyRecord[] = [];

    try {
      // Get all open positions from database
      const dbPositions = await Position.find({ status: 'OPEN' });

      // Get actual balances from Binance
      const accountInfo = await binanceService.getAccountInfo();
      const binanceBalances = new Map<string, number>();

      for (const balance of accountInfo.balances) {
        const free = parseFloat(balance.free);
        const locked = parseFloat(balance.locked);
        const total = free + locked;
        if (total > 0) {
          binanceBalances.set(balance.asset, total);
        }
      }

      // Check each database position
      for (const position of dbPositions) {
        const actualBalance = binanceBalances.get(position.asset) || 0;

        // Phantom position: DB says OPEN but Binance has 0 balance
        if (actualBalance === 0) {
          const discrepancy: DiscrepancyRecord = {
            type: 'PHANTOM_POSITION',
            aggregateId: position._id.toString(),
            details: {
              asset: position.asset,
              pair: position.pair,
              dbQuantity: position.quantity,
              binanceBalance: 0,
              dbStatus: 'OPEN',
            },
            fixed: false,
            timestamp: new Date(),
          };

          discrepancies.push(discrepancy);

          // Auto-fix if enabled
          if (this.config.autoFixEnabled && discrepancies.length < this.config.maxDiscrepanciesPerRun) {
            try {
              await this.fixPhantomPosition(position);
              discrepancy.fixed = true;
              logger.info(
                `[ContinuousReconciliation] ✅ Fixed phantom position: ${position.pair} (${position._id})`
              );
            } catch (error: any) {
              logger.error(
                `[ContinuousReconciliation] ❌ Failed to fix phantom position: ${position.pair}`,
                error
              );
            }
          }
        }
        // Quantity mismatch: DB quantity ≠ Binance balance
        else if (Math.abs(actualBalance - position.quantity) > 0.0001) {
          const discrepancy: DiscrepancyRecord = {
            type: 'QUANTITY_MISMATCH',
            aggregateId: position._id.toString(),
            details: {
              asset: position.asset,
              pair: position.pair,
              dbQuantity: position.quantity,
              binanceBalance: actualBalance,
              difference: actualBalance - position.quantity,
            },
            fixed: false,
            timestamp: new Date(),
          };

          discrepancies.push(discrepancy);

          // Auto-fix if enabled
          if (this.config.autoFixEnabled && discrepancies.length < this.config.maxDiscrepanciesPerRun) {
            try {
              await this.fixQuantityMismatch(position, actualBalance);
              discrepancy.fixed = true;
              logger.info(
                `[ContinuousReconciliation] ✅ Fixed quantity mismatch: ${position.pair} ` +
                `(DB: ${position.quantity}, Binance: ${actualBalance})`
              );
            } catch (error: any) {
              logger.error(
                `[ContinuousReconciliation] ❌ Failed to fix quantity mismatch: ${position.pair}`,
                error
              );
            }
          }
        }
      }

    } catch (error: any) {
      logger.error('[ContinuousReconciliation] Position reconciliation failed:', error);
    }

    return discrepancies;
  }

  /**
   * Reconcile orders
   */
  private async reconcileOrders(): Promise<DiscrepancyRecord[]> {
    const discrepancies: DiscrepancyRecord[] = [];

    try {
      // Get all pending orders from database
      const dbOrders = await Order.find({ status: 'PENDING' }).limit(50);

      for (const order of dbOrders) {
        if (!order.binanceOrderId) continue;

        try {
          // Check order status on Binance
          const binanceOrder = await binanceService.getOrder(order.pair, order.binanceOrderId);

          // Stale order: DB says PENDING but Binance says FILLED/CANCELLED
          if (binanceOrder.status !== 'NEW' && binanceOrder.status !== 'PARTIALLY_FILLED') {
            const discrepancy: DiscrepancyRecord = {
              type: 'STALE_ORDER',
              aggregateId: order._id.toString(),
              details: {
                pair: order.pair,
                binanceOrderId: order.binanceOrderId,
                dbStatus: 'PENDING',
                binanceStatus: binanceOrder.status,
              },
              fixed: false,
              timestamp: new Date(),
            };

            discrepancies.push(discrepancy);

            // Auto-fix if enabled
            if (this.config.autoFixEnabled && discrepancies.length < this.config.maxDiscrepanciesPerRun) {
              try {
                await this.fixStaleOrder(order, binanceOrder.status);
                discrepancy.fixed = true;
                logger.info(
                  `[ContinuousReconciliation] ✅ Fixed stale order: ${order.pair} ` +
                  `(${order.binanceOrderId}) - ${binanceOrder.status}`
                );
              } catch (error: any) {
                logger.error(
                  `[ContinuousReconciliation] ❌ Failed to fix stale order: ${order.pair}`,
                  error
                );
              }
            }
          }
        } catch (error: any) {
          // Order not found on Binance - might be very old
          if (error.message?.includes('Order does not exist')) {
            logger.warn(`[ContinuousReconciliation] Order not found on Binance: ${order.binanceOrderId}`);
          }
        }
      }

    } catch (error: any) {
      logger.error('[ContinuousReconciliation] Order reconciliation failed:', error);
    }

    return discrepancies;
  }

  /**
   * Fix phantom position (position open in DB but not on Binance)
   */
  private async fixPhantomPosition(position: any): Promise<void> {
    // Use command bus to close position (idempotent)
    await commandBus.closePosition(
      position._id.toString(),
      'RECONCILIATION_AUTO_CLOSE',
      { userId: position.userId }
    );

    // Record discrepancy event
    await eventStore.recordEvent({
      type: 'DiscrepancyFixed',
      aggregateType: 'Position',
      aggregateId: position._id.toString(),
      data: {
        discrepancyType: 'PHANTOM_POSITION',
        asset: position.asset,
        pair: position.pair,
        dbQuantity: position.quantity,
        binanceBalance: 0,
        action: 'AUTO_CLOSED',
        timestamp: new Date(),
      },
    });
  }

  /**
   * Fix quantity mismatch
   */
  private async fixQuantityMismatch(position: any, actualBalance: number): Promise<void> {
    // Update position quantity to match Binance
    await Position.updateOne(
      { _id: position._id },
      {
        $set: {
          quantity: actualBalance,
          updatedAt: new Date(),
        },
      }
    );

    // Record discrepancy event
    await eventStore.recordEvent({
      type: 'DiscrepancyFixed',
      aggregateType: 'Position',
      aggregateId: position._id.toString(),
      data: {
        discrepancyType: 'QUANTITY_MISMATCH',
        asset: position.asset,
        pair: position.pair,
        oldQuantity: position.quantity,
        newQuantity: actualBalance,
        action: 'QUANTITY_UPDATED',
        timestamp: new Date(),
      },
    });
  }

  /**
   * Fix stale order
   */
  private async fixStaleOrder(order: any, binanceStatus: string): Promise<void> {
    // Map Binance status to our status
    let newStatus = 'PENDING';
    if (binanceStatus === 'FILLED') {
      newStatus = 'FILLED';
    } else if (binanceStatus === 'CANCELED' || binanceStatus === 'EXPIRED' || binanceStatus === 'REJECTED') {
      newStatus = 'CANCELLED';
    }

    // Update order status
    await Order.updateOne(
      { _id: order._id },
      {
        $set: {
          status: newStatus,
          updatedAt: new Date(),
        },
      }
    );

    // Record discrepancy event
    await eventStore.recordEvent({
      type: 'DiscrepancyFixed',
      aggregateType: 'Order',
      aggregateId: order._id.toString(),
      data: {
        discrepancyType: 'STALE_ORDER',
        pair: order.pair,
        binanceOrderId: order.binanceOrderId,
        oldStatus: 'PENDING',
        newStatus,
        action: 'STATUS_UPDATED',
        timestamp: new Date(),
      },
    });
  }

  /**
   * Get reconciliation statistics
   */
  getStats(): ReconciliationStats {
    return { ...this.stats };
  }

  /**
   * Get configuration
   */
  getConfig(): ReconciliationConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ReconciliationConfig>): void {
    this.config = { ...this.config, ...config };
    logger.info('[ContinuousReconciliation] Configuration updated:', this.config);
  }
}

// Export singleton instance
export const continuousReconciliationService = new ContinuousReconciliationService();
export default continuousReconciliationService;
