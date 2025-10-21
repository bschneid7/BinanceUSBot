import mongoose, { Schema, Document } from 'mongoose';

export interface IHistoricalCandle extends Document {
  symbol: string;
  interval: string;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  createdAt: Date;
}

const HistoricalCandleSchema: Schema = new Schema(
  {
    symbol: {
      type: String,
      required: true,
      index: true,
    },
    interval: {
      type: String,
      required: true,
      index: true,
    },
    timestamp: {
      type: Number,
      required: true,
      index: true,
    },
    open: {
      type: Number,
      required: true,
    },
    high: {
      type: Number,
      required: true,
    },
    low: {
      type: Number,
      required: true,
    },
    close: {
      type: Number,
      required: true,
    },
    volume: {
      type: Number,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for efficient queries
HistoricalCandleSchema.index({ symbol: 1, interval: 1, timestamp: 1 }, { unique: true });

export default mongoose.model<IHistoricalCandle>('HistoricalCandle', HistoricalCandleSchema);

