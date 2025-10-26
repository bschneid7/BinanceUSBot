import mongoose, { Document, Schema } from 'mongoose';

/**
 * Transaction Model
 * 
 * Records individual order executions for tax reporting purposes.
 * Unlike Trade (which represents complete round-trip positions),
 * Transaction records every BUY/SELL execution separately.
 * 
 * This is essential for accurate tax reporting as the IRS requires
 * detailed records of every transaction.
 */

export interface ITransaction extends Document {
  userId: mongoose.Types.ObjectId;
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  total: number; // quantity * price
  fees: number;
  type: 'GRID' | 'MANUAL' | 'PLAYBOOK' | 'STOP_LOSS' | 'TAKE_PROFIT';
  orderId?: string; // Binance order ID
  positionId?: mongoose.Types.ObjectId; // Associated position if applicable
  timestamp: Date; // When the order was executed
  notes?: string;
}

const TransactionSchema = new Schema<ITransaction>({
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
  side: {
    type: String,
    enum: ['BUY', 'SELL'],
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
  },
  price: {
    type: Number,
    required: true,
  },
  total: {
    type: Number,
    required: true,
  },
  fees: {
    type: Number,
    required: true,
    default: 0,
  },
  type: {
    type: String,
    enum: ['GRID', 'MANUAL', 'PLAYBOOK', 'STOP_LOSS', 'TAKE_PROFIT'],
    required: true,
    index: true,
  },
  orderId: {
    type: String,
    index: true,
  },
  positionId: {
    type: Schema.Types.ObjectId,
    ref: 'Position',
    index: true,
  },
  timestamp: {
    type: Date,
    required: true,
    default: Date.now,
    index: true,
  },
  notes: {
    type: String,
  },
}, {
  timestamps: true, // Adds createdAt and updatedAt
  versionKey: false,
});

// Compound indexes for efficient queries
TransactionSchema.index({ userId: 1, timestamp: -1 });
TransactionSchema.index({ userId: 1, symbol: 1 });
TransactionSchema.index({ userId: 1, type: 1 });
TransactionSchema.index({ orderId: 1 }, { unique: true, sparse: true }); // Prevent duplicate records

const Transaction = mongoose.model<ITransaction>('Transaction', TransactionSchema);

export default Transaction;

