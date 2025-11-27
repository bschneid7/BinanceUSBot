import Bull, { Queue, Job, JobOptions } from 'bull';
import logger from '../utils/logger';
import eventStore from './eventStore';
import { Types } from 'mongoose';

/**
 * Message Queue Service
 * Provides reliable, retryable operation processing using Bull and Redis
 */

export interface QueueJobData {
  userId: Types.ObjectId;
  correlationId: string;
  causationId?: string;
  [key: string]: any;
}

export interface QueueConfig {
  redis: {
    host: string;
    port: number;
    password?: string;
  };
  defaultJobOptions: JobOptions;
}

class MessageQueueService {
  private queues: Map<string, Queue> = new Map();
  private config: QueueConfig;
  private isInitialized: boolean = false;

  constructor() {
    this.config = {
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD,
      },
      defaultJobOptions: {
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        timeout: 30000,
        removeOnComplete: 100, // Keep last 100 completed jobs
        removeOnFail: 1000,    // Keep last 1000 failed jobs
      },
    };
  }

  /**
   * Initialize the message queue service
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.warn('[MessageQueue] Already initialized');
      return;
    }

    try {
      // Create queues
      this.createQueue('order-placement', { priority: 10 });
      this.createQueue('position-management', { priority: 5 });
      this.createQueue('reconciliation', { priority: 1 });
      this.createQueue('notification', { priority: 1 });

      this.isInitialized = true;
      logger.info('[MessageQueue] ✅ Initialized successfully');
    } catch (error) {
      logger.error('[MessageQueue] Failed to initialize:', error);
      throw error;
    }
  }

  /**
   * Create a new queue
   */
  private createQueue(name: string, options: { priority?: number } = {}): Queue {
    if (this.queues.has(name)) {
      return this.queues.get(name)!;
    }

    const queue = new Bull(name, {
      redis: this.config.redis,
      defaultJobOptions: {
        ...this.config.defaultJobOptions,
        priority: options.priority,
      },
    });

    // Error handling
    queue.on('error', (error) => {
      logger.error(`[MessageQueue:${name}] Queue error:`, error);
    });

    queue.on('failed', (job, error) => {
      logger.error(`[MessageQueue:${name}] Job ${job.id} failed:`, error);
      
      // Record failure event
      if (job.data.userId) {
        eventStore.recordEvent({
          type: 'JobFailedEvent',
          aggregateId: job.id?.toString() || 'unknown',
          aggregateType: 'System',
          userId: job.data.userId,
          data: {
            queueName: name,
            jobType: job.name,
            error: error.message,
            attempts: job.attemptsMade,
            data: job.data,
          },
          source: 'System',
        }).catch(err => logger.error('[MessageQueue] Failed to record failure event:', err));
      }
    });

    queue.on('completed', (job) => {
      logger.info(`[MessageQueue:${name}] Job ${job.id} completed`);
    });

    queue.on('stalled', (job) => {
      logger.warn(`[MessageQueue:${name}] Job ${job.id} stalled`);
    });

    this.queues.set(name, queue);
    logger.info(`[MessageQueue] Created queue: ${name}`);

    return queue;
  }

  /**
   * Add a job to a queue
   */
  async addJob(
    queueName: string,
    jobName: string,
    data: QueueJobData,
    options?: JobOptions
  ): Promise<Job> {
    try {
      const queue = this.queues.get(queueName);
      if (!queue) {
        throw new Error(`Queue ${queueName} not found`);
      }

      const job = await queue.add(jobName, data, options);

      logger.info(`[MessageQueue:${queueName}] Added job ${job.id}: ${jobName}`);

      // Record job creation event
      await eventStore.recordEvent({
        type: 'JobCreatedEvent',
        aggregateId: job.id?.toString() || 'unknown',
        aggregateType: 'System',
        userId: data.userId,
        data: {
          queueName,
          jobName,
          jobId: job.id,
        },
        correlationId: data.correlationId,
        causationId: data.causationId,
        source: 'System',
      });

      return job;
    } catch (error) {
      logger.error(`[MessageQueue] Failed to add job to ${queueName}:`, error);
      throw error;
    }
  }

  /**
   * Register a job processor
   */
  registerProcessor(
    queueName: string,
    jobName: string,
    processor: (job: Job<QueueJobData>) => Promise<any>
  ): void {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    queue.process(jobName, async (job) => {
      logger.info(`[MessageQueue:${queueName}] Processing job ${job.id}: ${jobName}`);

      // Set correlation context for events
      eventStore.setCorrelationContext(
        job.data.correlationId,
        job.data.causationId || job.id?.toString()
      );

      try {
        const result = await processor(job);

        // Record success event
        await eventStore.recordEvent({
          type: 'JobCompletedEvent',
          aggregateId: job.id?.toString() || 'unknown',
          aggregateType: 'System',
          userId: job.data.userId,
          data: {
            queueName,
            jobName,
            result,
          },
          source: 'System',
        });

        return result;
      } catch (error) {
        logger.error(`[MessageQueue:${queueName}] Job ${job.id} processing failed:`, error);
        throw error;
      } finally {
        // Clear correlation context
        eventStore.clearCorrelationContext();
      }
    });

    logger.info(`[MessageQueue:${queueName}] Registered processor for ${jobName}`);
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(queueName: string): Promise<any> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
    ]);

    return {
      queueName,
      waiting,
      active,
      completed,
      failed,
      delayed,
      total: waiting + active + completed + failed + delayed,
    };
  }

  /**
   * Get all queue statistics
   */
  async getAllQueueStats(): Promise<any[]> {
    const stats = [];
    for (const queueName of this.queues.keys()) {
      stats.push(await this.getQueueStats(queueName));
    }
    return stats;
  }

  /**
   * Get failed jobs from a queue
   */
  async getFailedJobs(queueName: string, limit: number = 10): Promise<Job[]> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    return queue.getFailed(0, limit - 1);
  }

  /**
   * Retry a failed job
   */
  async retryFailedJob(queueName: string, jobId: string): Promise<void> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    const job = await queue.getJob(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    await job.retry();
    logger.info(`[MessageQueue:${queueName}] Retrying job ${jobId}`);
  }

  /**
   * Clean up old completed/failed jobs
   */
  async cleanupQueue(queueName: string, grace: number = 86400000): Promise<void> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    await queue.clean(grace, 'completed');
    await queue.clean(grace, 'failed');

    logger.info(`[MessageQueue:${queueName}] Cleaned up jobs older than ${grace}ms`);
  }

  /**
   * Pause a queue
   */
  async pauseQueue(queueName: string): Promise<void> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    await queue.pause();
    logger.info(`[MessageQueue:${queueName}] Queue paused`);
  }

  /**
   * Resume a queue
   */
  async resumeQueue(queueName: string): Promise<void> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    await queue.resume();
    logger.info(`[MessageQueue:${queueName}] Queue resumed`);
  }

  /**
   * Shutdown all queues gracefully
   */
  async shutdown(): Promise<void> {
    logger.info('[MessageQueue] Shutting down...');

    for (const [name, queue] of this.queues.entries()) {
      await queue.close();
      logger.info(`[MessageQueue] Closed queue: ${name}`);
    }

    this.queues.clear();
    this.isInitialized = false;

    logger.info('[MessageQueue] ✅ Shutdown complete');
  }
}

// Export singleton instance
export const messageQueue = new MessageQueueService();
export default messageQueue;
