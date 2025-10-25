import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IGridPerformanceLog extends Document {
  userId: Types.ObjectId;
  symbol: string;
  timestamp: Date;
  
  // Grid Configuration at time of log
  gridConfig: {
    lowerBound: number;
    upperBound: number;
    gridLevels: number;
    orderSize: number;
    gridSpacing: number;
  };
  
  // Market State
  marketState: {
    price: number;
    volume24h: number;
    volatility: number; // ATR or std dev
    trendStrength: number; // -1 to 1, negative = downtrend
    rsi: number;
    bollingerBandWidth: number;
    priceVsMA20: number; // % deviation
  };
  
  // Grid Performance Metrics
  performance: {
    activeOrders: number;
    buyOrders: number;
    sellOrders: number;
    fillsLast24h: number;
    profitLast24h: number;
    avgProfitPerCycle: number;
    fillRate: number; // fills / total orders
    capitalUtilization: number; // deployed / allocated
  };
  
  // ML State Vector (for training)
  stateVector: number[];
  
  // ML Action Taken (if any)
  mlAction?: {
    spacingMultiplier: number;
    sizeMultiplier: number;
    pairEnabled: boolean;
    gridActive: boolean;
  };
  
  // Reward (calculated after action)
  reward?: number;
  
  // Cross-Strategy Context
  portfolioContext: {
    playbookActivityLevel: number; // 0-1
    totalExposure: number;
    reserveCashPct: number;
  };
}

const schema = new Schema<IGridPerformanceLog>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  symbol: {
    type: String,
    required: true,
    index: true,
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true,
  },
  gridConfig: {
    lowerBound: { type: Number, required: true },
    upperBound: { type: Number, required: true },
    gridLevels: { type: Number, required: true },
    orderSize: { type: Number, required: true },
    gridSpacing: { type: Number, required: true },
  },
  marketState: {
    price: { type: Number, required: true },
    volume24h: { type: Number, required: true },
    volatility: { type: Number, required: true },
    trendStrength: { type: Number, required: true },
    rsi: { type: Number, required: true },
    bollingerBandWidth: { type: Number, required: true },
    priceVsMA20: { type: Number, required: true },
  },
  performance: {
    activeOrders: { type: Number, required: true },
    buyOrders: { type: Number, required: true },
    sellOrders: { type: Number, required: true },
    fillsLast24h: { type: Number, required: true },
    profitLast24h: { type: Number, required: true },
    avgProfitPerCycle: { type: Number, required: true },
    fillRate: { type: Number, required: true },
    capitalUtilization: { type: Number, required: true },
  },
  stateVector: {
    type: [Number],
    required: true,
  },
  mlAction: {
    spacingMultiplier: { type: Number },
    sizeMultiplier: { type: Number },
    pairEnabled: { type: Boolean },
    gridActive: { type: Boolean },
  },
  reward: {
    type: Number,
  },
  portfolioContext: {
    playbookActivityLevel: { type: Number, required: true },
    totalExposure: { type: Number, required: true },
    reserveCashPct: { type: Number, required: true },
  },
});

// Indexes for efficient queries
schema.index({ userId: 1, symbol: 1, timestamp: -1 });
schema.index({ timestamp: -1 });

export default mongoose.model<IGridPerformanceLog>('GridPerformanceLog', schema);

