import logger from '../utils/logger';
import Position from '../models/Position';
import binanceService from './binanceService';
import positionManager from './tradingEngine/positionManager';
import { slackNotifier } from './slackNotifier';
import { Types } from 'mongoose';
import { STOP_LOSS_MONITOR, calculateBackoffDelay, formatUSD } from '../utils/constants';
import { Position as IPosition, CloseReason } from '../utils/types';

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
  private lastCheckTime: Date | null = null;
  private checksPerformed: number = 0;
  private stopsTriggered: number = 0;
  private readonly log = logger.child('StopLossMonitor');

  /**
   * Start the independent stop loss monitor
   */
  start(): void {
    if (this.isRunning) {
      this.log.warn('Already running');
      return;
    }

    this.log.info('Starting independent stop loss monitor', {
      checkIntervalMs: STOP_LOSS_MONITOR.CHECK_INTERVAL_MS,
      checkIntervalSec: STOP_LOSS_MONITOR.CHECK_INTERVAL_MS / 1000,
    });

    this.isRunning = true;

    // Run first check immediately
    this.checkAllStopLosses().catch(error => {
      this.log.error('Error in initial check', error);
    });

    // Schedule recurring checks
    this.interval = setInterval(async () => {
      try {
        await this.checkAllStopLosses();
      } catch (error) {
        this.log.error('Error in scheduled check', error as Error);
      }
    }, STOP_LOSS_MONITOR.CHECK_INTERVAL_MS);

    this.log.info('✅ Monitor started successfully');
  }

  /**
   * Close position with retry logic and exponential backoff
   */
  private async closePositionWithRetry(position: IPosition, currentPrice: number): Promise<void> {
    for (let attempt = 1; attempt <= STOP_LOSS_MONITOR.MAX_RETRIES; attempt++) {
      try {
        await positionManager.closePosition(
          position._id as Types.ObjectId,
          'STOP_LOSS' as CloseReason
        );
        
        this.stopsTriggered++;
        
        this.log.position('closed', position.symbol, {
          reason: 'STOP_LOSS',
          entryPrice: position.entry_price,
          stopPrice: position.stop_price,
          exitPrice: currentPrice,
          pnl: position.unrealized_pnl,
          attempt,
          maxRetries: STOP_LOSS_MONITOR.MAX_RETRIES,
        });
        
        // Send success alert
        await slackNotifier.sendAlert({
          type: 'STOP_LOSS',
          message: `🚨 Stop Loss Triggered\n\n` +
            `Symbol: ${position.symbol}\n` +
            `Side: ${position.side}\n` +
            `Entry: ${formatUSD(position.entry_price)}\n` +
            `Stop: ${formatUSD(position.stop_price)}\n` +
            `Exit: ${formatUSD(currentPrice)}\n` +
            `P&L: ${formatUSD(position.unrealized_pnl || 0)}\n` +
            `Attempt: ${attempt}/${STOP_LOSS_MONITOR.MAX_RETRIES}\n` +
            `Closed by: Independent Stop Loss Monitor`
        });
        
        return; // Success!
        
      } catch (closeError) {
        const error = closeError as Error;
        const errorMessage = error?.message || String(closeError);
        
        // Check if it's a race condition (position already closed)
        if (errorMessage.includes('not found') || errorMessage.includes('already closing')) {
          this.log.info('Position already closed by another process', {
            symbol: position.symbol,
            positionId: position._id.toString(),
          });
          return; // Not an error
        }
        
        // If last attempt, send critical alert
        if (attempt === STOP_LOSS_MONITOR.MAX_RETRIES) {
          this.log.critical('Failed to close position after max retries', error, {
            symbol: position.symbol,
            positionId: position._id.toString(),
            currentPrice,
            stopPrice: position.stop_price,
            attempts: STOP_LOSS_MONITOR.MAX_RETRIES,
          });
          
          await slackNotifier.sendAlert({
            type: 'CRITICAL',
            message: `🚨 CRITICAL: Failed to close position ${position.symbol} at stop loss after ${STOP_LOSS_MONITOR.MAX_RETRIES} attempts!\n` +
              `Current: ${formatUSD(currentPrice)}, Stop: ${formatUSD(position.stop_price)}\n` +
              `Error: ${errorMessage}\n` +
              `MANUAL INTERVENTION REQUIRED`
          });
          
          throw closeError; // Re-throw on final attempt
        }
        
        // Exponential backoff
        const delay = calculateBackoffDelay(
          attempt,
          STOP_LOSS_MONITOR.RETRY_BASE_DELAY_MS,
          STOP_LOSS_MONITOR.RETRY_BASE_DELAY_MS * 8 // Max 8 seconds
        );
        
        this.log.warn('Retry attempt failed, backing off', {
          symbol: position.symbol,
          attempt,
          maxRetries: STOP_LOSS_MONITOR.MAX_RETRIES,
          delayMs: delay,
          error: errorMessage,
        });
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * Stop the monitor
   */
  stop(): void {
    if (!this.isRunning) {
      this.log.warn('Not running');
      return;
    }

    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    this.isRunning = false;
    this.log.info('Monitor stopped', {
      checksPerformed: this.checksPerformed,
      stopsTriggered: this.stopsTriggered,
    });
  }

  /**
   * Check all open positions for stop loss triggers
   */
  private async checkAllStopLosses(): Promise<void> {
    try {
      this.checksPerformed++;
      this.lastCheckTime = new Date();

      // Get all open positions
      const positions = await Position.find({ status: 'OPEN' }).lean<IPosition[]>();

      if (positions.length === 0) {
        this.log.debug('No open positions to check');
        return;
      }

      this.log.debug('Checking stop losses', {
        positionCount: positions.length,
        checkNumber: this.checksPerformed,
      });

      // Check each position
      for (const position of positions) {
        await this.checkPosition(position);
      }

    } catch (error) {
      this.log.error('Error checking stop losses', error as Error);
    }
  }

  /**
   * Check a single position for stop loss trigger
   */
  private async checkPosition(position: IPosition): Promise<void> {
    try {
      // Get current price
      const ticker = await binanceService.getTicker(position.symbol);
      const currentPrice = parseFloat(ticker.price);

      // Skip if price is invalid (NaN or undefined)
      if (!currentPrice || isNaN(currentPrice)) {
        this.log.debug('Skipping position check - price not available yet', {
          symbol: position.symbol,
          positionId: position._id,
        });
        return;
      }

      // Update position current price
      await Position.findByIdAndUpdate(position._id, {
        current_price: currentPrice,
      });

      // Check if stop loss is hit
      const stopHit = position.side === 'LONG'
        ? currentPrice <= position.stop_price
        : currentPrice >= position.stop_price;

      if (stopHit) {
        const distancePct = Math.abs((currentPrice - position.stop_price) / position.stop_price) * 100;

        this.log.warn('🚨 STOP LOSS HIT', {
          symbol: position.symbol,
          side: position.side,
          currentPrice,
          stopPrice: position.stop_price,
          distancePct: distancePct.toFixed(2) + '%',
          unrealizedPnl: position.unrealized_pnl,
        });

        // Close the position with retry logic
        await this.closePositionWithRetry(position, currentPrice);
        
      } else {
        // Log positions approaching stop loss
        const distanceToStop = position.side === 'LONG'
          ? (currentPrice - position.stop_price) / position.stop_price
          : (position.stop_price - currentPrice) / currentPrice;

        if (distanceToStop < STOP_LOSS_MONITOR.WARNING_DISTANCE_PCT && distanceToStop > 0) {
          const distancePct = distanceToStop * 100;
          
          this.log.info('⚠️  Position approaching stop', {
            symbol: position.symbol,
            currentPrice,
            stopPrice: position.stop_price,
            distancePct: distancePct.toFixed(1) + '%',
          });
          
          // Send critical warning if very close
          if (distancePct < STOP_LOSS_MONITOR.CRITICAL_WARNING_DISTANCE_PCT * 100) {
            await slackNotifier.sendAlert({
              type: 'WARNING',
              message: `⚠️ ${position.symbol} within ${distancePct.toFixed(1)}% of stop loss\n` +
                `Current: ${formatUSD(currentPrice)}, Stop: ${formatUSD(position.stop_price)}`
            });
          }
        }
      }

    } catch (error) {
      this.log.error('Error checking position', error as Error, {
        symbol: position.symbol,
        positionId: position._id.toString(),
      });
    }
  }

  /**
   * Get monitor status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      checksPerformed: this.checksPerformed,
      stopsTriggered: this.stopsTriggered,
      lastCheckTime: this.lastCheckTime,
      checkIntervalMs: STOP_LOSS_MONITOR.CHECK_INTERVAL_MS,
    };
  }
}

export default new StopLossMonitor();
