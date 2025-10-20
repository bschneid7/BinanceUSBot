import mongoose, { Document, Schema } from 'mongoose';

/**
 * EquitySnapshot - Daily equity tracking for analytics
 * Replaces hard-coded STARTING_EQUITY with dynamic snapshots
 */
export interface IEquitySnapshot extends Document {
  userId: mongoose.Types.ObjectId;
  date: Date;
  equity: number;
  cash: number;
  positions: number;
  reserve: number;
  dailyPnl: number;
  dailyPnlPct: number;
  weeklyPnl: number;
  weeklyPnlPct: number;
  totalPnl: number;
  totalPnlPct: number;
  openPositions: number;
  closedTrades: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  sharpeRatio?: number;
  maxDrawdown?: number;
}

const schema = new Schema<IEquitySnapshot>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  date: {
    type: Date,
    required: true,
    index: true,
  },
  equity: {
    type: Number,
    required: true,
  },
  cash: {
    type: Number,
    required: true,
  },
  positions: {
    type: Number,
    required: true,
  },
  reserve: {
    type: Number,
    required: true,
  },
  dailyPnl: {
    type: Number,
    required: true,
  },
  dailyPnlPct: {
    type: Number,
    required: true,
  },
  weeklyPnl: {
    type: Number,
    required: true,
  },
  weeklyPnlPct: {
    type: Number,
    required: true,
  },
  totalPnl: {
    type: Number,
    required: true,
  },
  totalPnlPct: {
    type: Number,
    required: true,
  },
  openPositions: {
    type: Number,
    required: true,
  },
  closedTrades: {
    type: Number,
    required: true,
  },
  winRate: {
    type: Number,
    required: true,
  },
  avgWin: {
    type: Number,
    required: true,
  },
  avgLoss: {
    type: Number,
    required: true,
  },
  profitFactor: {
    type: Number,
    required: true,
  },
  sharpeRatio: {
    type: Number,
  },
  maxDrawdown: {
    type: Number,
  },
}, {
  timestamps: true,
  versionKey: false,
});

// Compound indexes for efficient queries
schema.index({ userId: 1, date: -1 });
schema.index({ userId: 1, date: 1 }); // For time-series queries

// Unique constraint to prevent duplicate snapshots
schema.index({ userId: 1, date: 1 }, { unique: true });

const EquitySnapshot = mongoose.model<IEquitySnapshot>('EquitySnapshot', schema);

export default EquitySnapshot;

