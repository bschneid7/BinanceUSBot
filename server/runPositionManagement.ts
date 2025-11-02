/**
 * Position Management Runner
 * 
 * Runs position management service every 5 minutes
 * Can be called from trading engine or run as standalone process
 */

import cron from 'node-cron';
import PositionManagementService from './services/positionManagementService';
import BotState from './models/BotState';
import { Types } from 'mongoose';
import mongoose from 'mongoose';

const logger = console;

class PositionManagementRunner {
  private positionMgmt: PositionManagementService;
  private isRunning: boolean = false;

  constructor() {
    this.positionMgmt = new PositionManagementService();
  }

  /**
   * Run position management for all active users
   */
  async run(): Promise<void> {
    if (this.isRunning) {
      logger.warn('[PositionMgmtRunner] Already running, skipping cycle');
      return;
    }

    this.isRunning = true;
    try {
      logger.info('[PositionMgmtRunner] Starting position management cycle');

      // Get all users with running bots
      const activeStates = await BotState.find({ isRunning: true });
      logger.info(`[PositionMgmtRunner] Found ${activeStates.length} active bots`);

      for (const state of activeStates) {
        try {
          await this.positionMgmt.managePositions(state.userId);
        } catch (error) {
          logger.error(`[PositionMgmtRunner] Error managing positions for user ${state.userId}:`, error);
        }
      }

      logger.info('[PositionMgmtRunner] Position management cycle complete');
    } catch (error) {
      logger.error('[PositionMgmtRunner] Error in position management runner:', error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Start scheduled position management (every 5 minutes)
   */
  startScheduled(): void {
    logger.info('[PositionMgmtRunner] Starting scheduled position management (every 5 minutes)');

    // Run every 5 minutes
    cron.schedule('*/5 * * * *', async () => {
      await this.run();
    });

    // Run immediately on start
    this.run();
  }
}

// Export singleton instance
const positionMgmtRunner = new PositionManagementRunner();
export default positionMgmtRunner;
