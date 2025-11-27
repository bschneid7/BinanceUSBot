import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * Event Store Model
 * Immutable append-only log of all system events
 * Used for audit trail, debugging, and state replay
 */

export interface IEvent extends Document {
  id: string;
  type: string;
  aggregateId: string;
  aggregateType: string;
  timestamp: Date;
  userId: Types.ObjectId;
  data: any;
  metadata: {
    correlationId: string;
    causationId: string;
    source: string;
    version: number;
  };
}

const EventSchema = new Schema<IEvent>(
  {
    id: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    type: {
      type: String,
      required: true,
      index: true,
    },
    aggregateId: {
      type: String,
      required: true,
      index: true,
    },
    aggregateType: {
      type: String,
      required: true,
      index: true,
      enum: ['Position', 'Order', 'Signal', 'System', 'Reconciliation'],
    },
    timestamp: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    data: {
      type: Schema.Types.Mixed,
      required: true,
    },
    metadata: {
      correlationId: {
        type: String,
        required: true,
        index: true,
      },
      causationId: {
        type: String,
        required: true,
      },
      source: {
        type: String,
        required: true,
        enum: ['TradingEngine', 'Reconciliation', 'Manual', 'System', 'API'],
      },
      version: {
        type: Number,
        required: true,
        default: 1,
      },
    },
  },
  {
    timestamps: false, // We use our own timestamp field
    collection: 'events',
  }
);

// Compound indexes for common queries
EventSchema.index({ aggregateId: 1, timestamp: 1 });
EventSchema.index({ type: 1, timestamp: -1 });
EventSchema.index({ userId: 1, timestamp: -1 });
EventSchema.index({ 'metadata.correlationId': 1 });

// Prevent updates and deletes (append-only)
EventSchema.pre('updateOne', function (next) {
  next(new Error('Events are immutable and cannot be updated'));
});

EventSchema.pre('deleteOne', function (next) {
  next(new Error('Events are immutable and cannot be deleted'));
});

EventSchema.pre('findOneAndUpdate', function (next) {
  next(new Error('Events are immutable and cannot be updated'));
});

EventSchema.pre('findOneAndDelete', function (next) {
  next(new Error('Events are immutable and cannot be deleted'));
});

const Event = mongoose.model<IEvent>('Event', EventSchema);

export default Event;
