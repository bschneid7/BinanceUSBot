import mongoose, { Document, Schema } from 'mongoose';

export interface IOrder extends Document {
  userId: mongoose.Types.ObjectId;
  positionId?: mongoose.Types.ObjectId;
  clientOrderId: string;
  exchangeOrderId?: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  type: 'LIMIT' | 'MARKET' | 'STOP_LOSS' | 'TRAILING_STOP' | 'OCO';
  price?: number;
  stopPrice?: number;
  quantity: number;
  filledQuantity: number;
  status: 'PENDING' | 'OPEN' | 'FILLED' | 'PARTIALLY_FILLED' | 'CANCELLED' | 'REJECTED';
  submittedAt: Date;
  filledAt?: Date;
  slippageBps?: number;
  fees?: number;
  fillPrice?: number;
  evidence?: {
    requestPayload?: unknown;
    responsePayload?: unknown;
    errorMessage?: string;
  };
  tradeIds?: string[];
  commissions?: Array<{
    asset: string;
    amount: number;
  }>;
  fills?: Array<{
    price: number;
    qty: number;
    commission: number;
    commissionAsset: string;
    tradeId: number;
  }>;
}

const schema = new Schema<IOrder>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  positionId: {
    type: Schema.Types.ObjectId,
    ref: 'Position',
    index: true,
  },
  clientOrderId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  exchangeOrderId: {
    type: String,
    index: true,
  },
  symbol: {
    type: String,
    required: true,
    index: true,
  },
  side: {
    type: String,
    enum: ['BUY', 'SELL'],
    required: true,
  },
  type: {
    type: String,
    enum: ['LIMIT', 'MARKET', 'STOP_LOSS', 'TRAILING_STOP', 'OCO'],
    required: true,
  },
  price: {
    type: Number,
  },
  stopPrice: {
    type: Number,
  },
  quantity: {
    type: Number,
    required: true,
  },
  filledQuantity: {
    type: Number,
    default: 0,
  },
  status: {
    type: String,
    enum: ['PENDING', 'OPEN', 'FILLED', 'PARTIALLY_FILLED', 'CANCELLED', 'REJECTED'],
    required: true,
    default: 'PENDING',
    index: true,
  },
  submittedAt: {
    type: Date,
    required: true,
    default: Date.now,
    index: true,
  },
  filledAt: {
    type: Date,
  },
  slippageBps: {
    type: Number,
  },
  fees: {
    type: Number,
    default: 0,
  },
  fillPrice: {
    type: Number,
  },
  evidence: {
    type: Schema.Types.Mixed,
  },
  tradeIds: {
    type: [String],
  },
  commissions: {
    type: [{
      asset: { type: String },
      amount: { type: Number },
    }],
  },
  fills: {
    type: [{
      price: { type: Number },
      qty: { type: Number },
      commission: { type: Number },
      commissionAsset: { type: String },
      tradeId: { type: Number },
    }],
  },
}, {
  timestamps: true,
  versionKey: false,
});

// Compound indexes for efficient queries
schema.index({ userId: 1, status: 1 });
schema.index({ userId: 1, submittedAt: -1 });

const Order = mongoose.model<IOrder>('Order', schema);

export default Order;
