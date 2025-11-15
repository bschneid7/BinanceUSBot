import logger from '../utils/logger';
import Position from '../models/Position';
import binanceService from './binanceService';
import positionManager from './tradingEngine/positionManager';
import { slackNotifier } from './slackNotifier';
import { Types } from 'mongoose';

/**
 * Independent Stop Loss Monitor
 * 
 * This service runs independently of the trading engine to ensure
 * stop losses are checked even when the bot is stopped.
 * 
 * Critical safety feature to prevent runaway losses.
 */
class StopLossMonitor {
  private interval: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private checkIntervalMs: number = 30000; // 30 seconds
  private lastCheckTime: Date | null = null;
  private checksPerformed: number = 0;
  private stopsTriggered: number = 0;

  /**
   * Start the independent stop loss monitor
   */
  start(): void {
    if (this.isRunning) {
      logger.warn('[StopLossMonitor] Already running');
      return;
    }

    logger.info('[StopLossMonitor] Starting independent stop loss monitor');
    logger.info(`[StopLossMonitor] Check interval: ${this.checkIntervalMs / 1000}s`);

    this.isRunning = true;

    // Run first check immediately
    this.checkAllStopLosses().catch(error => {
      logger.error('[StopLossMonitor] Error in initial check:', error);
    });

    // Schedule recurring checks
    this.interval = setInterval(async () => {
      try {
        await this.checkAllStopLosses();
      } catch (error) {
        logger.error('[StopLossMonitor] Error in scheduled check:', error);
      }
    }, this.checkIntervalMs);

    logger.info('[StopLossMonitor] ✅ Monitor started successfully');
  }

  /**
   * Close position with retry logic and exponential backoff
   */
  private async closePositionWithRetry(position: any, currentPrice: number): Promise<void> {
    const maxRetries = 3;
    const baseDelay = 1000; // 1 second
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await positionManager.closePosition(
          position._id as Types.ObjectId,
          'STOP_LOSS'
        );
        
        this.stopsTriggered++;
        logger.info(`[StopLossMonitor] ✅ Position closed: ${position.symbol}`);
        
        // Send success alert
        await slackNotifier.sendAlert({
          type: 'STOP_LOSS',
          message: `🚨 Stop Loss Triggered\n\n` +
            `Symbol: ${position.symbol}\n` +
            `Side: ${position.side}\n` +
            `Entry: $${position.entry_price.toFixed(2)}\n` +
            `Stop: $${position.stop_price.toFixed(2)}\n` +
            `Exit: $${currentPrice.toFixed(2)}\n` +
            `P&L: $${position.unrealized_pnl?.toFixed(2) || 'N/A'}\n` +
            `Attempt: ${attempt}/${maxRetries}\n` +
            `Closed by: Independent Stop Loss Monitor`
        });
        
        return; // Success!
        
      } catch (closeError: any) {
        const errorMessage = closeError?.message || String(closeError);
        
        // Check if it's a race condition (position already closed)
        if (errorMessage.includes('not found') || errorMessage.includes('already closing')) {
          logger.info(`[StopLossMonitor] Position ${position.symbol} already closed by another process`);
          return; // Not an error
        }
        
        // If last attempt, send critical alert
        if (attempt === maxRetries) {
          logger.error(`[StopLossMonitor] ❌ Failed to close position ${position.symbol} after ${maxRetries} attempts`);
          
          await slackNotifier.sendAlert({
            type: 'CRITICAL',
            message: `🚨 CRITICAL: Failed to close position ${position.symbol} at stop loss after ${maxRetries} attempts!\n` +
              `Current: $${currentPrice.toFixed(2)}, Stop: $${position.stop_price.toFixed(2)}\n` +
              `Error: ${errorMessage}\n` +
              `MANUAL INTERVENTION REQUIRED`
          });
          
          throw closeError; // Re-throw on final attempt
        }
        
        // Exponential backoff
        const delay = baseDelay * Math.pow(2, attempt - 1);
        logger.warn(`[StopLossMonitor] Attempt ${attempt}/${maxRetries} failed, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * Stop the monitor
   */
  stop(): void {
    if (!this.isRunning) {
      logger.warn('[StopLossMonitor] Not running');
      return;
    }

    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    this.isRunning = false;
    logger.info('[StopLossMonitor] Monitor stopped');
    logger.info(`[StopLossMonitor] Stats: ${this.checksPerformed} checks, ${this.stopsTriggered} stops triggered`);
  }

  /**
   * Check all open positions for stop loss hits
   */
  private async checkAllStopLosses(): Promise<void> {
    const startTime = Date.now();
    this.lastCheckTime = new Date();
    this.checksPerformed++;

    try {
      // Get all open positions
      const openPositions = await Position.find({ status: 'OPEN' });

      if (!openPositions || openPositions.length === 0) {
        logger.debug('[StopLossMonitor] No open positions to check');
        return;
      }

      logger.debug(`[StopLossMonitor] Checking ${openPositions.length} open positions`);

      // Check each position
      const checkPromises = openPositions.map(position => 
        this.checkPositionStopLoss(position)
      );

      await Promise.all(checkPromises);

      const duration = Date.now() - startTime;
      logger.debug(`[StopLossMonitor] Check complete in ${duration}ms`);

    } catch (error) {
      logger.error('[StopLossMonitor] Error checking stop losses:', error);
    }
  }

  /**
   * Check a single position for stop loss hit
   */
  private async checkPositionStopLoss(position: any): Promise<void> {
    try {
      // Skip positions without stop loss
      if (!position.stop_price || position.stop_price === 0) {
        logger.debug(`[StopLossMonitor] ${position.symbol} has no stop loss set`);
        return;
      }

      // Get current price from Binance
      const ticker = await binanceService.getTicker(position.symbol);
      if (!ticker || !ticker.lastPrice) {
        logger.warn(`[StopLossMonitor] Could not get price for ${position.symbol}`);
        return;
      }

      const currentPrice = parseFloat(ticker.lastPrice);

      // Validate price
      if (isNaN(currentPrice) || currentPrice <= 0) {
        logger.warn(`[StopLossMonitor] Invalid price for ${position.symbol}: ${ticker.lastPrice}`);
        return;
      }

      // Check if stop loss is hit
      const stopHit = position.side === 'LONG'
        ? currentPrice <= position.stop_price
        : currentPrice >= position.stop_price;

      if (stopHit) {
        const distancePct = Math.abs((currentPrice - position.stop_price) / position.stop_price * 100);
        
        logger.warn(`[StopLossMonitor] 🚨 STOP LOSS HIT: ${position.symbol}`);
        logger.warn(`[StopLossMonitor]   Current: $${currentPrice.toFixed(2)}, Stop: $${position.stop_price.toFixed(2)}`);
        logger.warn(`[StopLossMonitor]   Distance: ${distancePct.toFixed(2)}% ${position.side === 'LONG' ? 'below' : 'above'} stop`);
        logger.warn(`[StopLossMonitor]   Unrealized P&L: $${position.unrealized_pnl?.toFixed(2) || 'N/A'}`);

        // Close the position with retry logic
        await this.closePositionWithRetry(position, currentPrice);
      } else {
        // Log positions approaching stop loss (within 5%)
        const distanceToStop = position.side === 'LONG'
          ? (currentPrice - position.stop_price) / position.stop_price
          : (position.stop_price - currentPrice) / currentPrice;

        if (distanceToStop < 0.05 && distanceToStop > 0) {
          const distancePct = distanceToStop * 100;
          logger.info(`[StopLossMonitor] ⚠️  ${position.symbol} approaching stop: ${distancePct.toFixed(1)}% away`);
          
          // Send warning if within 2%
          if (distancePct < 2) {
            await slackNotifier.sendAlert({
              type: 'WARNING',
              message: `⚠️ ${position.symbol} within ${distancePct.toFixed(1)}% of stop loss\n` +
                `Current: $${currentPrice.toFixed(2)}, Stop: $${position.stop_price.toFixed(2)}`
            });
          }
        }
      }

    } catch (error) {
      logger.error(`[StopLossMonitor] Error checking ${position.symbol}:`, error);
    }
  }

  /**
   * Get monitor status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      checkIntervalMs: this.checkIntervalMs,
      lastCheckTime: this.lastCheckTime,
      checksPerformed: this.checksPerformed,
      stopsTriggered: this.stopsTriggered,
    };
  }

  /**
   * Force an immediate check (for testing)
   */
  async forceCheck(): Promise<void> {
    logger.info('[StopLossMonitor] Force check requested');
    await this.checkAllStopLosses();
  }
}

export const stopLossMonitor = new StopLossMonitor();
export default stopLossMonitor;
