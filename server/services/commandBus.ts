import { v4 as uuidv4 } from 'uuid';
import { Types } from 'mongoose';
import messageQueue from './messageQueue';
import logger from '../utils/logger';

/**
 * Command Bus
 * Simplified interface for submitting commands to the message queue
 */

export interface CommandOptions {
  userId: Types.ObjectId;
  correlationId?: string;
  priority?: number;
  delay?: number;
}

class CommandBus {
  /**
   * Close a position (idempotent)
   */
  async closePosition(
    positionId: string,
    reason: string,
    options: CommandOptions,
    manualPrice?: number
  ): Promise<void> {
    const correlationId = options.correlationId || uuidv4();

    await messageQueue.addJob(
      'position-management',
      'ClosePosition',
      {
        positionId,
        reason,
        manualPrice,
        userId: options.userId,
        correlationId,
      },
      {
        priority: options.priority,
        delay: options.delay,
      }
    );

    logger.info(`[CommandBus] Submitted ClosePosition command for ${positionId}`);
  }

  /**
   * Get command execution status
   */
  async getCommandStatus(queueName: string, jobId: string): Promise<any> {
    // This would query the event store for command execution events
    // For now, just return queue stats
    return messageQueue.getQueueStats(queueName);
  }
}

// Export singleton instance
export const commandBus = new CommandBus();
export default commandBus;
