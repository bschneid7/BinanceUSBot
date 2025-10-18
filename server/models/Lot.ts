import mongoose, { Document, Schema } from 'mongoose';

export interface ILot extends Document {
  userId: mongoose.Types.ObjectId;
  lotId: string;
  symbol: string;
  acquiredDate: Date;
  quantity: number;
  costPerUnit: number;
  totalCostBasis: number;
  feesAllocated: number;
  remainingQuantity: number;
  status: 'OPEN' | 'PARTIALLY_SOLD' | 'FULLY_SOLD';
  evidence?: {
    orderId?: mongoose.Types.ObjectId;
    exchangeOrderId?: string;
    note?: string;
  };
}

const schema = new Schema<ILot>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  lotId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  symbol: {
    type: String,
    required: true,
    index: true,
  },
  acquiredDate: {
    type: Date,
    required: true,
    index: true,
  },
  quantity: {
    type: Number,
    required: true,
  },
  costPerUnit: {
    type: Number,
    required: true,
  },
  totalCostBasis: {
    type: Number,
    required: true,
  },
  feesAllocated: {
    type: Number,
    required: true,
    default: 0,
  },
  remainingQuantity: {
    type: Number,
    required: true,
  },
  status: {
    type: String,
    enum: ['OPEN', 'PARTIALLY_SOLD', 'FULLY_SOLD'],
    required: true,
    default: 'OPEN',
    index: true,
  },
  evidence: {
    type: Schema.Types.Mixed,
  },
}, {
  timestamps: true,
  versionKey: false,
});

// Compound indexes for efficient HIFO queries
schema.index({ userId: 1, symbol: 1, costPerUnit: -1 });
schema.index({ userId: 1, status: 1 });

const Lot = mongoose.model<ILot>('Lot', schema);

export default Lot;
