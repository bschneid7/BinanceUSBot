import mongoose, { Document, Schema } from 'mongoose';

export interface IAlert extends Document {
  level: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
  message: string;
  type: string;
  timestamp: Date;
  userId: mongoose.Types.ObjectId;
}

const schema = new Schema<IAlert>({
  level: {
    type: String,
    enum: ['INFO', 'WARNING', 'ERROR', 'CRITICAL'],
    required: true,
    index: true,
  },
  message: {
    type: String,
    required: true,
  },
  type: {
    type: String,
    required: true,
    index: true,
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
schema.index({ userId: 1, level: 1 });

const Alert = mongoose.model<IAlert>('Alert', schema);

export default Alert;
