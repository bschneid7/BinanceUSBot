import messageQueue from './messageQueue';
import closePositionHandler from './commands/ClosePositionHandler';
import logger from '../utils/logger';
import { Job } from 'bull';
import { QueueJobData } from './messageQueue';

/**
 * Initialize Infrastructure
 * Sets up event store, message queues, and command handlers
 */

export async function initializeInfrastructure(): Promise<void> {
  try {
    logger.info('[Infrastructure] Initializing event sourcing and message queue infrastructure...');

    // Step 1: Initialize message queue
    await messageQueue.initialize();

    // Step 2: Register command handlers
    registerCommandHandlers();

    logger.info('[Infrastructure] ✅ Infrastructure initialized successfully');
  } catch (error) {
    logger.error('[Infrastructure] Failed to initialize infrastructure:', error);
    throw error;
  }
}

/**
 * Register all command handlers with their respective queues
 */
function registerCommandHandlers(): void {
  // Register ClosePosition handler
  messageQueue.registerProcessor(
    'position-management',
    'ClosePosition',
    async (job: Job<QueueJobData>) => {
      const { positionId, reason, manualPrice, userId, correlationId, causationId } = job.data;

      const command = {
        id: job.id?.toString() || 'unknown',
        positionId,
        reason,
        manualPrice,
        userId,
        correlationId,
        causationId,
      };

      const result = await closePositionHandler.execute(command);

      if (!result.success) {
        throw new Error(result.error || 'Command execution failed');
      }

      return result.data;
    }
  );

  logger.info('[Infrastructure] ✅ Command handlers registered');
}

/**
 * Shutdown infrastructure gracefully
 */
export async function shutdownInfrastructure(): Promise<void> {
  try {
    logger.info('[Infrastructure] Shutting down infrastructure...');

    await messageQueue.shutdown();

    logger.info('[Infrastructure] ✅ Infrastructure shutdown complete');
  } catch (error) {
    logger.error('[Infrastructure] Error during shutdown:', error);
    throw error;
  }
}

export default {
  initialize: initializeInfrastructure,
  shutdown: shutdownInfrastructure,
};
