import mongoose, { Document, Schema } from 'mongoose';

/**
 * MLPerformanceLog
 * 
 * Tracks every signal generated, ML decision, and actual outcome
 * Used for ML model performance analysis and retraining
 */

export interface IMLPerformanceLog extends Document {
  userId: mongoose.Types.ObjectId;
  timestamp: Date;
  
  // Signal Information
  signal: {
    symbol: string;
    action: 'BUY' | 'SELL';
    playbook: 'A' | 'B' | 'C' | 'D';
    price: number;
    atr: number;
    volatility: number;
    volume: number;
    spread_bps: number;
  };
  
  // ML Decision
  ml: {
    modelId: mongoose.Types.ObjectId;
    modelVersion: string;
    prediction: 'buy' | 'sell' | 'hold';
    confidence: number;
    approved: boolean;
    rejectionReason?: string;
    processingTimeMs: number;
  };
  
  // Execution (if approved)
  execution?: {
    executed: boolean;
    orderId?: string;
    executionPrice?: number;
    executionTime?: Date;
    makerFirst?: boolean;
    priceAdjustmentBps?: number;
  };
  
  // Outcome (filled in later)
  outcome?: {
    closed: boolean;
    closeTime?: Date;
    closePrice?: number;
    pnl?: number;
    pnlR?: number;
    winLoss?: 'win' | 'loss' | 'breakeven';
    holdTimeMinutes?: number;
    exitReason?: string;
  };
  
  // Market Context
  marketContext: {
    priceAtSignal: number;
    vwap?: number;
    rsi?: number;
    macd?: number;
  };
  
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IMLPerformanceLog>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  timestamp: {
    type: Date,
    required: true,
    default: Date.now,
    index: true,
  },
  signal: {
    symbol: {
      type: String,
      required: true,
      index: true,
    },
    action: {
      type: String,
      enum: ['BUY', 'SELL'],
      required: true,
    },
    playbook: {
      type: String,
      enum: ['A', 'B', 'C', 'D'],
      required: true,
      index: true,
    },
    price: {
      type: Number,
      required: true,
    },
    atr: {
      type: Number,
      required: true,
    },
    volatility: {
      type: Number,
      required: true,
    },
    volume: {
      type: Number,
      required: true,
    },
    spread_bps: {
      type: Number,
      required: true,
    },
  },
  ml: {
    modelId: {
      type: Schema.Types.ObjectId,
      ref: 'MLModel',
      required: true,
    },
    modelVersion: {
      type: String,
      required: true,
    },
    prediction: {
      type: String,
      enum: ['buy', 'sell', 'hold'],
      required: true,
    },
    confidence: {
      type: Number,
      required: true,
      min: 0,
      max: 1,
    },
    approved: {
      type: Boolean,
      required: true,
      index: true,
    },
    rejectionReason: {
      type: String,
    },
    processingTimeMs: {
      type: Number,
      required: true,
    },
  },
  execution: {
    executed: {
      type: Boolean,
      default: false,
    },
    orderId: {
      type: String,
    },
    executionPrice: {
      type: Number,
    },
    executionTime: {
      type: Date,
    },
    makerFirst: {
      type: Boolean,
    },
    priceAdjustmentBps: {
      type: Number,
    },
  },
  outcome: {
    closed: {
      type: Boolean,
      default: false,
      index: true,
    },
    closeTime: {
      type: Date,
    },
    closePrice: {
      type: Number,
    },
    pnl: {
      type: Number,
    },
    pnlR: {
      type: Number,
    },
    winLoss: {
      type: String,
      enum: ['win', 'loss', 'breakeven'],
    },
    holdTimeMinutes: {
      type: Number,
    },
    exitReason: {
      type: String,
    },
  },
  marketContext: {
    priceAtSignal: {
      type: Number,
      required: true,
    },
    vwap: {
      type: Number,
    },
    rsi: {
      type: Number,
    },
    macd: {
      type: Number,
    },
  },
}, {
  timestamps: true,
  versionKey: false,
});

// Indexes for common queries
schema.index({ userId: 1, timestamp: -1 });
schema.index({ userId: 1, 'ml.approved': 1, 'outcome.closed': 1 });
schema.index({ userId: 1, 'signal.playbook': 1, timestamp: -1 });
schema.index({ userId: 1, 'outcome.winLoss': 1 });

const MLPerformanceLog = mongoose.model<IMLPerformanceLog>('MLPerformanceLog', schema);

export default MLPerformanceLog;

