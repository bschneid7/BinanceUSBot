import mongoose, { Document, Schema } from 'mongoose';

export interface IGridOrder extends Document {
  symbol: string;
  side: 'BUY' | 'SELL';
  price: number;
  orderId: string;
  pairOrderId?: string;
  status: 'OPEN' | 'FILLED' | 'CANCELLED';
  createdAt: Date;
  filledAt?: Date;
}

const GridOrderSchema = new Schema<IGridOrder>({
  symbol: {
    type: String,
    required: true,
    index: true
  },
  side: {
    type: String,
    enum: ['BUY', 'SELL'],
    required: true
  },
  price: {
    type: Number,
    required: true
  },
  orderId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  pairOrderId: {
    type: String,
    index: true
  },
  status: {
    type: String,
    enum: ['OPEN', 'FILLED', 'CANCELLED'],
    default: 'OPEN',
    index: true
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  filledAt: {
    type: Date
  }
});

// Index for querying filled orders
GridOrderSchema.index({ status: 1, createdAt: -1 });

// Index for finding pairs
GridOrderSchema.index({ pairOrderId: 1 });

export default mongoose.model<IGridOrder>('GridOrder', GridOrderSchema);

