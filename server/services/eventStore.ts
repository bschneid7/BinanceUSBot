import { v4 as uuidv4 } from 'uuid';
import { Types } from 'mongoose';
import Event, { IEvent } from '../models/Event';
import logger from '../utils/logger';

/**
 * Event Store Service
 * Central service for recording and querying events
 * Provides immutable audit trail and state replay capability
 */

export interface RecordEventParams {
  type: string;
  aggregateId: string;
  aggregateType: 'Position' | 'Order' | 'Signal' | 'System' | 'Reconciliation';
  userId: Types.ObjectId;
  data: any;
  correlationId?: string;
  causationId?: string;
  source?: 'TradingEngine' | 'Reconciliation' | 'Manual' | 'System' | 'API';
}

export interface QueryEventsParams {
  aggregateId?: string;
  aggregateType?: string;
  type?: string;
  userId?: Types.ObjectId;
  correlationId?: string;
  startTime?: Date;
  endTime?: Date;
  limit?: number;
  sortOrder?: 'asc' | 'desc';
}

class EventStore {
  private currentCorrelationId: string | null = null;
  private currentCausationId: string | null = null;

  /**
   * Record a new event in the event store
   */
  async recordEvent(params: RecordEventParams): Promise<IEvent> {
    try {
      const eventId = uuidv4();
      const correlationId = params.correlationId || this.currentCorrelationId || eventId;
      const causationId = params.causationId || this.currentCausationId || eventId;

      const event = new Event({
        id: eventId,
        type: params.type,
        aggregateId: params.aggregateId,
        aggregateType: params.aggregateType,
        timestamp: new Date(),
        userId: params.userId,
        data: params.data,
        metadata: {
          correlationId,
          causationId,
          source: params.source || 'System',
          version: 1,
        },
      });

      await event.save();

      logger.info(`[EventStore] Recorded event: ${params.type}`, {
        eventId,
        aggregateId: params.aggregateId,
        aggregateType: params.aggregateType,
      });

      return event;
    } catch (error) {
      logger.error('[EventStore] Failed to record event:', error);
      throw error;
    }
  }

  /**
   * Query events from the event store
   */
  async queryEvents(params: QueryEventsParams): Promise<IEvent[]> {
    try {
      const query: any = {};

      if (params.aggregateId) query.aggregateId = params.aggregateId;
      if (params.aggregateType) query.aggregateType = params.aggregateType;
      if (params.type) query.type = params.type;
      if (params.userId) query.userId = params.userId;
      if (params.correlationId) query['metadata.correlationId'] = params.correlationId;

      if (params.startTime || params.endTime) {
        query.timestamp = {};
        if (params.startTime) query.timestamp.$gte = params.startTime;
        if (params.endTime) query.timestamp.$lte = params.endTime;
      }

      const sortOrder = params.sortOrder === 'asc' ? 1 : -1;
      const limit = params.limit || 100;

      const events = await Event.find(query)
        .sort({ timestamp: sortOrder })
        .limit(limit)
        .lean();

      return events as IEvent[];
    } catch (error) {
      logger.error('[EventStore] Failed to query events:', error);
      throw error;
    }
  }

  /**
   * Get all events for a specific aggregate (e.g., all events for a position)
   */
  async getAggregateEvents(aggregateId: string, aggregateType?: string): Promise<IEvent[]> {
    return this.queryEvents({
      aggregateId,
      aggregateType,
      sortOrder: 'asc',
      limit: 1000,
    });
  }

  /**
   * Get all events in a correlation (e.g., all events related to a single trade)
   */
  async getCorrelatedEvents(correlationId: string): Promise<IEvent[]> {
    return this.queryEvents({
      correlationId,
      sortOrder: 'asc',
      limit: 1000,
    });
  }

  /**
   * Replay events to rebuild state
   * Returns the final state after applying all events
   */
  async replayEvents(aggregateId: string): Promise<any> {
    try {
      const events = await this.getAggregateEvents(aggregateId);

      logger.info(`[EventStore] Replaying ${events.length} events for ${aggregateId}`);

      let state: any = {};

      for (const event of events) {
        state = this.applyEvent(state, event);
      }

      return state;
    } catch (error) {
      logger.error('[EventStore] Failed to replay events:', error);
      throw error;
    }
  }

  /**
   * Apply a single event to a state object
   */
  private applyEvent(state: any, event: IEvent): any {
    switch (event.type) {
      case 'PositionOpenedEvent':
        return {
          ...state,
          status: 'OPEN',
          symbol: event.data.symbol,
          quantity: event.data.quantity,
          entry_price: event.data.entry_price,
          opened_at: event.timestamp,
        };

      case 'PositionUpdatedEvent':
        return {
          ...state,
          ...event.data,
        };

      case 'PositionClosedEvent':
        return {
          ...state,
          status: 'CLOSED',
          close_reason: event.data.reason,
          closed_at: event.timestamp,
        };

      case 'OrderPlacedEvent':
        return {
          ...state,
          lastOrderId: event.data.orderId,
          lastOrderTime: event.timestamp,
        };

      case 'OrderFilledEvent':
        return {
          ...state,
          lastFillPrice: event.data.price,
          lastFillQuantity: event.data.quantity,
          lastFillTime: event.timestamp,
        };

      default:
        return state;
    }
  }

  /**
   * Set correlation context for subsequent events
   * All events recorded within this context will share the same correlationId
   */
  setCorrelationContext(correlationId: string, causationId?: string): void {
    this.currentCorrelationId = correlationId;
    this.currentCausationId = causationId || correlationId;
  }

  /**
   * Clear correlation context
   */
  clearCorrelationContext(): void {
    this.currentCorrelationId = null;
    this.currentCausationId = null;
  }

  /**
   * Get event statistics
   */
  async getStatistics(userId?: Types.ObjectId): Promise<any> {
    try {
      const query = userId ? { userId } : {};

      const [totalEvents, eventsByType, recentEvents] = await Promise.all([
        Event.countDocuments(query),
        Event.aggregate([
          { $match: query },
          { $group: { _id: '$type', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
        ]),
        Event.find(query).sort({ timestamp: -1 }).limit(10).lean(),
      ]);

      return {
        totalEvents,
        eventsByType,
        recentEvents,
      };
    } catch (error) {
      logger.error('[EventStore] Failed to get statistics:', error);
      throw error;
    }
  }

  /**
   * Clean up old events (optional, for storage management)
   * Only removes events older than specified days
   */
  async cleanupOldEvents(daysToKeep: number = 90): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      const result = await Event.deleteMany({
        timestamp: { $lt: cutoffDate },
      });

      logger.info(`[EventStore] Cleaned up ${result.deletedCount} events older than ${daysToKeep} days`);

      return result.deletedCount || 0;
    } catch (error) {
      logger.error('[EventStore] Failed to cleanup old events:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const eventStore = new EventStore();
export default eventStore;
