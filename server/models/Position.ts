import mongoose, { Document, Schema } from 'mongoose';

export interface IPosition extends Document {
  symbol: string;
  side: 'LONG' | 'SHORT';
  entry_price: number;
  quantity: number;
  stop_price: number;
  target_price?: number;
  trailing_stop_distance?: number;
  playbook: 'A' | 'B' | 'C' | 'D';
  status: 'OPEN' | 'CLOSED';
  opened_at: Date;
  closed_at?: Date;
  realized_pnl?: number;
  realized_r?: number;
  fees_paid?: number;
  current_price?: number;
  unrealized_pnl?: number;
  unrealized_r?: number;
  hold_time?: string;
  scaled_1?: boolean;
  scaled_2?: boolean;
  userId: mongoose.Types.ObjectId;
}

const schema = new Schema<IPosition>({
  symbol: {
    type: String,
    required: true,
    index: true,
  },
  side: {
    type: String,
    enum: ['LONG', 'SHORT'],
    required: true,
  },
  entry_price: {
    type: Number,
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
  },
  stop_price: {
    type: Number,
    required: true,
  },
  target_price: {
    type: Number,
  },
  trailing_stop_distance: {
    type: Number,
  },
  playbook: {
    type: String,
    enum: ['A', 'B', 'C', 'D'],
    required: true,
    index: true,
  },
  status: {
    type: String,
    enum: ['OPEN', 'CLOSED'],
    default: 'OPEN',
    required: true,
    index: true,
  },
  opened_at: {
    type: Date,
    default: Date.now,
    required: true,
  },
  closed_at: {
    type: Date,
  },
  realized_pnl: {
    type: Number,
  },
  realized_r: {
    type: Number,
  },
  fees_paid: {
    type: Number,
    default: 0,
  },
  current_price: {
    type: Number,
  },
  unrealized_pnl: {
    type: Number,
  },
  unrealized_r: {
    type: Number,
  },
  hold_time: {
    type: String,
  },
  scaled_1: {
    type: Boolean,
    default: false,
  },
  scaled_2: {
    type: Boolean,
    default: false,
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
}, {
  versionKey: false,
  timestamps: false,
});

// Index for efficient queries on active positions
schema.index({ userId: 1, status: 1 });

const Position = mongoose.model<IPosition>('Position', schema);

export default Position;
