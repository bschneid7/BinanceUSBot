import mongoose, { Document, Schema } from 'mongoose';

export interface ISignal extends Document {
  symbol: string;
  playbook: 'A' | 'B' | 'C' | 'D';
  action: 'EXECUTED' | 'SKIPPED';
  reason?: string;
  entry_price?: number;
  timestamp: Date;
  userId: mongoose.Types.ObjectId;
}

const schema = new Schema<ISignal>({
  symbol: {
    type: String,
    required: true,
    index: true,
  },
  playbook: {
    type: String,
    enum: ['A', 'B', 'C', 'D'],
    required: true,
    index: true,
  },
  action: {
    type: String,
    enum: ['EXECUTED', 'SKIPPED'],
    required: true,
    index: true,
  },
  reason: {
    type: String,
  },
  entry_price: {
    type: Number,
  },
  timestamp: {
    type: Date,
    required: true,
    default: Date.now,
    index: true,
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
}, {
  versionKey: false,
  timestamps: false,
});

// Compound index for efficient time-based queries
schema.index({ userId: 1, timestamp: -1 });

const Signal = mongoose.model<ISignal>('Signal', schema);

export default Signal;
