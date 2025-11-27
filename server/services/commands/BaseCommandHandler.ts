import { Types } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import eventStore from '../eventStore';
import logger from '../../utils/logger';

/**
 * Base Command Handler
 * Provides common functionality for all command handlers
 * Ensures idempotency and event recording
 */

export interface Command {
  id: string;
  userId: Types.ObjectId;
  correlationId?: string;
  causationId?: string;
}

export interface CommandResult {
  success: boolean;
  data?: any;
  error?: string;
}

export abstract class BaseCommandHandler<TCommand extends Command> {
  protected abstract commandName: string;

  /**
   * Execute the command
   * This is the main entry point that ensures idempotency
   */
  async execute(command: TCommand): Promise<CommandResult> {
    const correlationId = command.correlationId || uuidv4();
    const causationId = command.causationId || command.id;

    // Set correlation context for all events in this command
    eventStore.setCorrelationContext(correlationId, causationId);

    try {
      logger.info(`[${this.commandName}] Executing command ${command.id}`);

      // Check if command already executed (idempotency)
      const alreadyExecuted = await this.checkIfAlreadyExecuted(command);
      if (alreadyExecuted) {
        logger.info(`[${this.commandName}] Command ${command.id} already executed, skipping`);
        return { success: true, data: alreadyExecuted };
      }

      // Validate command
      const validationError = await this.validate(command);
      if (validationError) {
        logger.warn(`[${this.commandName}] Validation failed: ${validationError}`);
        await this.recordEvent('CommandValidationFailedEvent', command.userId, {
          commandId: command.id,
          error: validationError,
        });
        return { success: false, error: validationError };
      }

      // Execute the actual command logic
      const result = await this.handle(command);

      // Record success event
      await this.recordEvent('CommandExecutedEvent', command.userId, {
        commandId: command.id,
        commandName: this.commandName,
        result,
      });

      logger.info(`[${this.commandName}] Command ${command.id} executed successfully`);

      return { success: true, data: result };
    } catch (error) {
      logger.error(`[${this.commandName}] Command ${command.id} failed:`, error);

      // Record error event
      await this.recordEvent('CommandFailedEvent', command.userId, {
        commandId: command.id,
        commandName: this.commandName,
        error: error instanceof Error ? error.message : String(error),
      });

      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      };
    } finally {
      // Clear correlation context
      eventStore.clearCorrelationContext();
    }
  }

  /**
   * Check if command was already executed (for idempotency)
   * Override this in subclasses for specific idempotency checks
   */
  protected async checkIfAlreadyExecuted(command: TCommand): Promise<any | null> {
    // Default: check if CommandExecutedEvent exists for this command ID
    const events = await eventStore.queryEvents({
      type: 'CommandExecutedEvent',
      userId: command.userId,
      limit: 1,
    });

    const executedEvent = events.find(e => e.data.commandId === command.id);
    return executedEvent ? executedEvent.data.result : null;
  }

  /**
   * Validate command before execution
   * Override this in subclasses for specific validation logic
   */
  protected async validate(command: TCommand): Promise<string | null> {
    // Default: no validation
    return null;
  }

  /**
   * Handle the actual command execution
   * Must be implemented by subclasses
   */
  protected abstract handle(command: TCommand): Promise<any>;

  /**
   * Helper method to record events
   */
  protected async recordEvent(
    type: string,
    userId: Types.ObjectId,
    data: any,
    aggregateId?: string,
    aggregateType?: 'Position' | 'Order' | 'Signal' | 'System' | 'Reconciliation'
  ): Promise<void> {
    await eventStore.recordEvent({
      type,
      aggregateId: aggregateId || 'system',
      aggregateType: aggregateType || 'System',
      userId,
      data,
      source: 'TradingEngine',
    });
  }
}
