import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * MLModel Schema
 * Tracks machine learning model metadata, training history, and performance
 */

export interface IMLModel extends Document {
  userId: Types.ObjectId;
  modelType: 'PPO' | 'DQN' | 'A3C' | 'CUSTOM';
  version: string;
  status: 'TRAINING' | 'ACTIVE' | 'ARCHIVED' | 'FAILED';

  // Training metadata
  trainingStarted: Date;
  trainingCompleted?: Date;
  trainingDuration?: number; // milliseconds
  episodes: number;
  avgReward: number;
  episodeRewards: number[];

  // Model configuration
  config: {
    stateDim: number;
    actionDim: number;
    learningRate: number;
    gamma: number;
    epsilon: number;
  };

  // Performance metrics
  performance: {
    backtestWinRate?: number;
    backtestProfitFactor?: number;
    backtestSharpeRatio?: number;
    backtestMaxDrawdown?: number;
    backtestTotalTrades?: number;

    // Live performance (if deployed)
    liveWinRate?: number;
    liveProfitFactor?: number;
    liveTotalTrades?: number;
    liveStartDate?: Date;
    liveEndDate?: Date;
  };

  // Model parameters
  actorParams: number;
  criticParams: number;
  totalParams: number;

  // Storage path
  modelPath?: string;

  // Deployment info
  isDeployed: boolean;
  deployedAt?: Date;

  // Metadata
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const MLModelSchema = new Schema<IMLModel>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    modelType: {
      type: String,
      enum: ['PPO', 'DQN', 'A3C', 'CUSTOM'],
      default: 'PPO',
      required: true,
    },
    version: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['TRAINING', 'ACTIVE', 'ARCHIVED', 'FAILED'],
      default: 'TRAINING',
      required: true,
    },
    trainingStarted: {
      type: Date,
      required: true,
      default: Date.now,
    },
    trainingCompleted: Date,
    trainingDuration: Number,
    episodes: {
      type: Number,
      required: true,
      default: 0,
    },
    avgReward: {
      type: Number,
      default: 0,
    },
    episodeRewards: {
      type: [Number],
      default: [],
    },
    config: {
      stateDim: {
        type: Number,
        required: true,
        default: 5,
      },
      actionDim: {
        type: Number,
        required: true,
        default: 3,
      },
      learningRate: {
        type: Number,
        required: true,
        default: 0.0003,
      },
      gamma: {
        type: Number,
        required: true,
        default: 0.99,
      },
      epsilon: {
        type: Number,
        required: true,
        default: 0.2,
      },
    },
    performance: {
      type: {
        backtestWinRate: Number,
        backtestProfitFactor: Number,
        backtestSharpeRatio: Number,
        backtestMaxDrawdown: Number,
        backtestTotalTrades: Number,
        liveWinRate: Number,
        liveProfitFactor: Number,
        liveTotalTrades: Number,
        liveStartDate: Date,
        liveEndDate: Date,
      },
      default: {},
    },
    actorParams: {
      type: Number,
      default: 0,
    },
    criticParams: {
      type: Number,
      default: 0,
    },
    totalParams: {
      type: Number,
      default: 0,
    },
    modelPath: String,
    isDeployed: {
      type: Boolean,
      default: false,
    },
    deployedAt: Date,
    notes: String,
  },
  {
    timestamps: true,
  }
);

// Compound index for user and version
MLModelSchema.index({ userId: 1, version: -1 });
MLModelSchema.index({ userId: 1, isDeployed: 1 });
MLModelSchema.index({ status: 1 });

const MLModel = mongoose.model<IMLModel>('MLModel', MLModelSchema);

export default MLModel;
