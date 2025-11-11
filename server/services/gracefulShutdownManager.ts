/**
 * Graceful Shutdown Manager
 * 
 * Handles clean shutdown of the trading bot to prevent:
 * - Orphaned orders
 * - Database connection leaks
 * - Incomplete transactions
 * - Data corruption
 * 
 * Features:
 * - Cancels all open orders before shutdown
 * - Closes database connections properly
 * - Gives ongoing operations time to complete
 * - Handles SIGTERM, SIGINT, uncaught exceptions
 */

import { Server } from 'http';
import logger from '../utils/logger';
import mongoose from 'mongoose';

interface ShutdownOptions {
  gracePeriodMs?: number; // Time to wait for ongoing operations
  cancelOrders?: boolean; // Whether to cancel open orders
  closeConnections?: boolean; // Whether to close database connections
}

class GracefulShutdownManager {
  private isShuttingDown = false;
  private server: Server | null = null;
  private shutdownCallbacks: Array<() => Promise<void>> = [];
  private options: Required<ShutdownOptions>;

  constructor(options: ShutdownOptions = {}) {
    this.options = {
      gracePeriodMs: options.gracePeriodMs || 10000, // 10 seconds default
      cancelOrders: options.cancelOrders !== false, // Default true
      closeConnections: options.closeConnections !== false, // Default true
    };

    // Don't register handlers in constructor - let caller decide when
    logger.info('[GracefulShutdown] Manager initialized with options:', this.options);
  }

  /**
   * Register the HTTP server for graceful shutdown
   */
  registerServer(server: Server): void {
    this.server = server;
    logger.info('[GracefulShutdown] HTTP server registered');
  }

  /**
   * Register a custom cleanup callback
   */
  registerCleanupCallback(callback: () => Promise<void>): void {
    this.shutdownCallbacks.push(callback);
    logger.info('[GracefulShutdown] Cleanup callback registered');
  }

  /**
   * Register signal handlers for graceful shutdown
   */
  registerSignalHandlers(): void {
    // Handle termination signals
    process.on('SIGTERM', () => this.handleShutdown('SIGTERM'));
    process.on('SIGINT', () => this.handleShutdown('SIGINT'));
    
    // Handle uncaught exceptions (but don't shutdown - just log)
    process.on('uncaughtException', (error: Error) => {
      logger.error('[GracefulShutdown] Uncaught exception:', error);
      // Don't shutdown automatically - let the app decide
    });
    
    // Handle unhandled promise rejections (but don't shutdown - just log)
    process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
      logger.error('[GracefulShutdown] Unhandled rejection at:', promise, 'reason:', reason);
      // Don't shutdown automatically - let the app decide
    });

    logger.info('[GracefulShutdown] Signal handlers registered');
  }

  /**
   * Handle shutdown signal
   */
  private async handleShutdown(signal: string): Promise<void> {
    if (this.isShuttingDown) {
      logger.warn('[GracefulShutdown] Shutdown already in progress, ignoring signal:', signal);
      return;
    }

    logger.info(`[GracefulShutdown] Received ${signal}, starting graceful shutdown...`);
    this.isShuttingDown = true;

    try {
      // Step 1: Stop accepting new connections
      await this.stopServer();

      // Step 2: Give ongoing operations time to complete
      await this.waitForOngoingOperations();

      // Step 3: Run cleanup tasks
      await this.cleanup();

      // Step 4: Exit cleanly
      logger.info('[GracefulShutdown] Shutdown complete, exiting...');
      process.exit(0);
    } catch (error) {
      logger.error('[GracefulShutdown] Error during shutdown:', error);
      // Force exit after error
      process.exit(1);
    }
  }

  /**
   * Stop the HTTP server from accepting new connections
   */
  private async stopServer(): Promise<void> {
    if (!this.server) {
      logger.warn('[GracefulShutdown] No server registered, skipping server shutdown');
      return;
    }

    return new Promise((resolve) => {
      logger.info('[GracefulShutdown] Stopping HTTP server...');
      this.server!.close(() => {
        logger.info('[GracefulShutdown] HTTP server stopped');
        resolve();
      });
    });
  }

  /**
   * Wait for ongoing operations to complete
   */
  private async waitForOngoingOperations(): Promise<void> {
    logger.info(`[GracefulShutdown] Waiting ${this.options.gracePeriodMs}ms for ongoing operations...`);
    await new Promise(resolve => setTimeout(resolve, this.options.gracePeriodMs));
    logger.info('[GracefulShutdown] Grace period elapsed');
  }

  /**
   * Run cleanup tasks
   */
  private async cleanup(): Promise<void> {
    logger.info('[GracefulShutdown] Running cleanup tasks...');

    const cleanupTasks: Array<Promise<void>> = [];

    // Cancel all open orders (if enabled)
    if (this.options.cancelOrders) {
      cleanupTasks.push(this.cancelAllOrders());
    }

    // Close database connections (if enabled)
    if (this.options.closeConnections) {
      cleanupTasks.push(this.closeDatabaseConnections());
    }

    // Run custom cleanup callbacks
    for (const callback of this.shutdownCallbacks) {
      cleanupTasks.push(
        callback().catch(error => {
          logger.error('[GracefulShutdown] Error in cleanup callback:', error);
        })
      );
    }

    // Wait for all cleanup tasks to complete
    await Promise.allSettled(cleanupTasks);
    logger.info('[GracefulShutdown] Cleanup tasks completed');
  }

  /**
   * Cancel all open orders
   */
  private async cancelAllOrders(): Promise<void> {
    try {
      logger.info('[GracefulShutdown] Cancelling all open orders...');
      
      // Import here to avoid circular dependencies
      const Order = (await import('../models/Order')).default;
      
      // Find all open orders
      const openOrders = await Order.find({
        status: { $in: ['NEW', 'PARTIALLY_FILLED', 'PENDING_CANCEL'] },
      });

      if (openOrders.length === 0) {
        logger.info('[GracefulShutdown] No open orders to cancel');
        return;
      }

      logger.info(`[GracefulShutdown] Found ${openOrders.length} open orders to cancel`);

      // Import BinanceService here to avoid circular dependencies
      const binanceService = (await import('./binanceService')).default;

      // Cancel each order
      const cancelPromises = openOrders.map(async (order) => {
        try {
          await binanceService.cancelOrder(order.symbol, order.exchange_order_id);
          logger.info(`[GracefulShutdown] Cancelled order ${order.exchange_order_id}`);
        } catch (error) {
          logger.error(`[GracefulShutdown] Failed to cancel order ${order.exchange_order_id}:`, error);
        }
      });

      await Promise.allSettled(cancelPromises);
      logger.info('[GracefulShutdown] All open orders cancelled');
    } catch (error) {
      logger.error('[GracefulShutdown] Error cancelling orders:', error);
    }
  }

  /**
   * Close database connections
   */
  private async closeDatabaseConnections(): Promise<void> {
    try {
      logger.info('[GracefulShutdown] Closing database connections...');

      // Close MongoDB connection
      if (mongoose.connection.readyState === 1) {
        await mongoose.connection.close();
        logger.info('[GracefulShutdown] MongoDB connection closed');
      }

      // Note: PostgreSQL connections are handled by the pool
      // If you have a PostgreSQL pool, close it here:
      // await pgPool.end();

      logger.info('[GracefulShutdown] Database connections closed');
    } catch (error) {
      logger.error('[GracefulShutdown] Error closing database connections:', error);
    }
  }

  /**
   * Manually trigger shutdown (for testing or manual shutdown)
   */
  async shutdown(reason: string = 'Manual shutdown'): Promise<void> {
    logger.info(`[GracefulShutdown] Manual shutdown triggered: ${reason}`);
    await this.handleShutdown(reason);
  }

  /**
   * Check if shutdown is in progress
   */
  isShutdownInProgress(): boolean {
    return this.isShuttingDown;
  }
}

// Export singleton instance
const gracefulShutdownManager = new GracefulShutdownManager({
  gracePeriodMs: 10000, // 10 seconds
  cancelOrders: true,
  closeConnections: true,
});

export default gracefulShutdownManager;
