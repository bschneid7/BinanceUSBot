import mongoose, { Document, Schema } from 'mongoose';

export interface IBotState extends Document {
  userId: mongoose.Types.ObjectId;
  isRunning: boolean;
  lastScanTimestamp?: Date;
  lastSignalTimestamp?: Date;
  startingEquity: number;
  equity: number;
  currentR: number;
  dailyPnl: number;
  dailyPnlR: number;
  weeklyPnl: number;
  weeklyPnlR: number;
  sessionStartDate: Date;
  weekStartDate: Date;
  lastPairSignalTimes: Map<string, Date>;
  playbookBCounters: Map<string, number>;
  marketData: Map<string, {
    price: number;
    volume24h: number;
    spreadBps: number;
    atr: number;
    vwap?: number;
    lastUpdate: Date;
  }>;
}

const schema = new Schema<IBotState>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true,
  },
  isRunning: {
    type: Boolean,
    required: true,
    default: false,
  },
  lastScanTimestamp: {
    type: Date,
  },
  lastSignalTimestamp: {
    type: Date,
  },
  startingEquity: {
    type: Number,
    required: true,
    // No default - must be set during initialization
  },
  equity: {
    type: Number,
    required: true,
    // No default - calculated from positions and P&L
  },
  currentR: {
    type: Number,
    required: true,
    // No default - calculated from equity and risk percentage
  },
  dailyPnl: {
    type: Number,
    required: true,
    default: 0,
  },
  dailyPnlR: {
    type: Number,
    required: true,
    default: 0,
  },
  weeklyPnl: {
    type: Number,
    required: true,
    default: 0,
  },
  weeklyPnlR: {
    type: Number,
    required: true,
    default: 0,
  },
  sessionStartDate: {
    type: Date,
    required: true,
    default: () => {
      const now = new Date();
      return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    },
  },
  weekStartDate: {
    type: Date,
    required: true,
    default: () => {
      const now = new Date();
      const dayOfWeek = now.getDay();
      const diff = now.getDate() - dayOfWeek;
      return new Date(now.getFullYear(), now.getMonth(), diff, 0, 0, 0, 0);
    },
  },
  lastPairSignalTimes: {
    type: Map,
    of: Date,
    default: new Map(),
  },
  playbookBCounters: {
    type: Map,
    of: Number,
    default: new Map(),
  },
  marketData: {
    type: Map,
    of: Schema.Types.Mixed,
    default: new Map(),
  },
}, {
  timestamps: true,
  versionKey: false,
});

const BotState = mongoose.model<IBotState>('BotState', schema);

export default BotState;
