import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IDeposit extends Document {
  userId: Types.ObjectId;
  type: 'DEPOSIT' | 'WITHDRAWAL';
  asset: string; // USD, BTC, ETH, etc.
  amount: number; // Amount in asset
  usdValue: number; // USD value at time of deposit/withdrawal
  date: Date;
  source?: string; // 'BINANCE', 'MANUAL', etc.
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const DepositSchema: Schema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ['DEPOSIT', 'WITHDRAWAL'],
      required: true,
    },
    asset: {
      type: String,
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    usdValue: {
      type: Number,
      required: true,
    },
    date: {
      type: Date,
      required: true,
      index: true,
    },
    source: {
      type: String,
      default: 'MANUAL',
    },
    notes: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for efficient queries
DepositSchema.index({ userId: 1, date: 1 });
DepositSchema.index({ userId: 1, type: 1 });

export default mongoose.model<IDeposit>('Deposit', DepositSchema);

