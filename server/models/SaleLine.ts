import mongoose, { Document, Schema } from 'mongoose';

/**
 * SaleLine - Tracks individual lot dispositions for tax reporting
 * Each SELL order can consume multiple lots (HIFO)
 */
export interface ISaleLine extends Document {
  userId: mongoose.Types.ObjectId;
  saleOrderId: mongoose.Types.ObjectId;
  lotId: mongoose.Types.ObjectId;
  symbol: string;
  quantitySold: number;
  costBasis: number;
  proceeds: number;
  gainLoss: number;
  acquiredDate: Date;
  soldDate: Date;
  holdingPeriod: 'SHORT' | 'LONG'; // <1 year = SHORT, >=1 year = LONG
  evidence?: {
    exchangeOrderId?: string;
    tradeId?: string;
    note?: string;
  };
}

const schema = new Schema<ISaleLine>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  saleOrderId: {
    type: Schema.Types.ObjectId,
    ref: 'Order',
    required: true,
    index: true,
  },
  lotId: {
    type: Schema.Types.ObjectId,
    ref: 'Lot',
    required: true,
    index: true,
  },
  symbol: {
    type: String,
    required: true,
    index: true,
  },
  quantitySold: {
    type: Number,
    required: true,
  },
  costBasis: {
    type: Number,
    required: true,
  },
  proceeds: {
    type: Number,
    required: true,
  },
  gainLoss: {
    type: Number,
    required: true,
  },
  acquiredDate: {
    type: Date,
    required: true,
  },
  soldDate: {
    type: Date,
    required: true,
    index: true,
  },
  holdingPeriod: {
    type: String,
    enum: ['SHORT', 'LONG'],
    required: true,
  },
  evidence: {
    type: Schema.Types.Mixed,
  },
}, {
  timestamps: true,
  versionKey: false,
});

// Compound indexes for tax reporting
schema.index({ userId: 1, soldDate: 1 });
schema.index({ userId: 1, holdingPeriod: 1 });
schema.index({ userId: 1, symbol: 1, soldDate: 1 });

const SaleLine = mongoose.model<ISaleLine>('SaleLine', schema);

export default SaleLine;

