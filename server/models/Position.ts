import mongoose, { Document, Schema } from 'mongoose';

export interface IPosition extends Document {
  symbol: string;
  side: 'LONG' | 'SHORT';
  entry_price: number;
  quantity: number;
  stop_price?: number;
  target_price?: number;
  trailing_stop_distance?: number;
  playbook: 'A' | 'B' | 'C' | 'D' | 'GRID' | 'MANUAL';
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
  
  // Enhanced position management fields
  position_size?: number; // Quantity (same as quantity, for compatibility)
  position_size_usd?: number; // Position size in USD
  entry_time?: Date; // Entry time (same as opened_at, for compatibility)
  exit_time?: Date; // Exit time (same as closed_at, for compatibility)
  exit_price?: number; // Exit price
  exit_reason?: string; // Reason for exit
  stop_loss?: number; // Current stop loss price
  trailing_stop_active?: boolean; // Whether trailing stop is active
  peak_price?: number; // Peak price reached (for trailing stops)
  
  // Partial close tracking
  partial_close_1?: boolean; // First partial close executed
  partial_close_1_price?: number; // Price of first partial close
  partial_close_1_time?: Date; // Time of first partial close
  partial_close_1_reason?: string; // Reason for first partial close
  partial_close_2?: boolean; // Second partial close executed
  partial_close_2_price?: number; // Price of second partial close
  partial_close_2_time?: Date; // Time of second partial close
  partial_close_2_reason?: string; // Reason for second partial close
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
    required: false,
  },
  target_price: {
    type: Number,
  },
  trailing_stop_distance: {
    type: Number,
  },
  playbook: {
    type: String,
    enum: ['A', 'B', 'C', 'D', 'GRID', 'MANUAL'],
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
  
  // Enhanced position management fields
  position_size: {
    type: Number,
  },
  position_size_usd: {
    type: Number,
  },
  entry_time: {
    type: Date,
  },
  exit_time: {
    type: Date,
  },
  exit_price: {
    type: Number,
  },
  exit_reason: {
    type: String,
  },
  stop_loss: {
    type: Number,
  },
  trailing_stop_active: {
    type: Boolean,
    default: false,
  },
  peak_price: {
    type: Number,
  },
  
  // Partial close tracking
  partial_close_1: {
    type: Boolean,
    default: false,
  },
  partial_close_1_price: {
    type: Number,
  },
  partial_close_1_time: {
    type: Date,
  },
  partial_close_1_reason: {
    type: String,
  },
  partial_close_2: {
    type: Boolean,
    default: false,
  },
  partial_close_2_price: {
    type: Number,
  },
  partial_close_2_time: {
    type: Date,
  },
  partial_close_2_reason: {
    type: String,
  },
}, {
  versionKey: false,
  timestamps: false,
});

// Index for efficient queries on active positions
schema.index({ userId: 1, status: 1 });

const Position = mongoose.model<IPosition>('Position', schema);

export default Position;
