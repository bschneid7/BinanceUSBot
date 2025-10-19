import mongoose, { Document, Schema } from 'mongoose';

export interface IBotConfig extends Document {
  userId: mongoose.Types.ObjectId;
  botStatus: 'ACTIVE' | 'HALTED_DAILY' | 'HALTED_WEEKLY' | 'STOPPED';
  haltMetadata?: {
    reason?: string;
    timestamp?: Date;
    justification?: string;
    positionsFlattened?: number;
  };
  scanner: {
    pairs: string[];
    refresh_ms: number;
    min_volume_usd_24h: number;
    max_spread_bps: number;
    max_spread_bps_event: number;
    tob_min_depth_usd: number;
    pair_signal_cooldown_min: number;
  };
  risk: {
    R_pct: number;
    daily_stop_R: number;
    weekly_stop_R: number;
    max_open_R: number;
    max_exposure_pct: number;
    max_positions: number;
    correlation_guard: boolean;
    slippage_guard_bps: number;
    slippage_guard_bps_event: number;
  };
  reserve: {
    target_pct: number;
    floor_pct: number;
    refill_from_profits_pct: number;
  };
  playbook_A: {
    enable: boolean;
    volume_mult: number;
    stop_atr_mult: number;
    breakeven_R: number;
    scale_R: number;
    scale_pct: number;
    trail_atr_mult: number;
  };
  playbook_B: {
    enable: boolean;
    deviation_atr_mult: number;
    stop_atr_mult: number;
    time_stop_min: number;
    target_R: number;
    max_trades_per_session: number;
  };
  playbook_C: {
    enable: boolean;
    event_window_min: number;
    stop_atr_mult: number;
    scale_1_R: number;
    scale_1_pct: number;
    scale_2_R: number;
    scale_2_pct: number;
    trail_atr_mult: number;
  };
  playbook_D: {
    enable: boolean;
    stop_atr_mult: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IBotConfig>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true,
  },
  botStatus: {
    type: String,
    enum: ['ACTIVE', 'HALTED_DAILY', 'HALTED_WEEKLY', 'STOPPED'],
    default: 'ACTIVE',
    required: true,
    index: true,
  },
  haltMetadata: {
    reason: {
      type: String,
    },
    timestamp: {
      type: Date,
    },
    justification: {
      type: String,
    },
    positionsFlattened: {
      type: Number,
    },
  },
  scanner: {
    pairs: {
      type: [String],
      required: true,
      default: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'],
    },
    refresh_ms: {
      type: Number,
      required: true,
      default: 2000,
    },
    min_volume_usd_24h: {
      type: Number,
      required: true,
      default: 2000000,
    },
    max_spread_bps: {
      type: Number,
      required: true,
      default: 5,
    },
    max_spread_bps_event: {
      type: Number,
      required: true,
      default: 10,
    },
    tob_min_depth_usd: {
      type: Number,
      required: true,
      default: 50000,
    },
    pair_signal_cooldown_min: {
      type: Number,
      required: true,
      default: 15,
    },
  },
  risk: {
    R_pct: {
      type: Number,
      required: true,
      default: 0.006,
    },
    daily_stop_R: {
      type: Number,
      required: true,
      default: -2.0,
    },
    weekly_stop_R: {
      type: Number,
      required: true,
      default: -6.0,
    },
    max_open_R: {
      type: Number,
      required: true,
      default: 2.0,
    },
    max_exposure_pct: {
      type: Number,
      required: true,
      default: 0.60,
    },
    max_positions: {
      type: Number,
      required: true,
      default: 4,
    },
    correlation_guard: {
      type: Boolean,
      required: true,
      default: true,
    },
    slippage_guard_bps: {
      type: Number,
      required: true,
      default: 5,
    },
    slippage_guard_bps_event: {
      type: Number,
      required: true,
      default: 10,
    },
  },
  reserve: {
    target_pct: {
      type: Number,
      required: true,
      default: 0.30,
    },
    floor_pct: {
      type: Number,
      required: true,
      default: 0.20,
    },
    refill_from_profits_pct: {
      type: Number,
      required: true,
      default: 0.30,
    },
  },
  playbook_A: {
    enable: {
      type: Boolean,
      required: true,
      default: true,
    },
    volume_mult: {
      type: Number,
      required: true,
      default: 1.5,
    },
    stop_atr_mult: {
      type: Number,
      required: true,
      default: 1.2,
    },
    breakeven_R: {
      type: Number,
      required: true,
      default: 1.0,
    },
    scale_R: {
      type: Number,
      required: true,
      default: 1.5,
    },
    scale_pct: {
      type: Number,
      required: true,
      default: 0.5,
    },
    trail_atr_mult: {
      type: Number,
      required: true,
      default: 1.0,
    },
  },
  playbook_B: {
    enable: {
      type: Boolean,
      required: true,
      default: true,
    },
    deviation_atr_mult: {
      type: Number,
      required: true,
      default: 2.0,
    },
    stop_atr_mult: {
      type: Number,
      required: true,
      default: 0.8,
    },
    time_stop_min: {
      type: Number,
      required: true,
      default: 90,
    },
    target_R: {
      type: Number,
      required: true,
      default: 1.2,
    },
    max_trades_per_session: {
      type: Number,
      required: true,
      default: 2,
    },
  },
  playbook_C: {
    enable: {
      type: Boolean,
      required: true,
      default: true,
    },
    event_window_min: {
      type: Number,
      required: true,
      default: 30,
    },
    stop_atr_mult: {
      type: Number,
      required: true,
      default: 1.8,
    },
    scale_1_R: {
      type: Number,
      required: true,
      default: 1.0,
    },
    scale_1_pct: {
      type: Number,
      required: true,
      default: 0.33,
    },
    scale_2_R: {
      type: Number,
      required: true,
      default: 2.0,
    },
    scale_2_pct: {
      type: Number,
      required: true,
      default: 0.33,
    },
    trail_atr_mult: {
      type: Number,
      required: true,
      default: 1.0,
    },
  },
  playbook_D: {
    enable: {
      type: Boolean,
      required: true,
      default: true,
    },
    stop_atr_mult: {
      type: Number,
      required: true,
      default: 1.0,
    },
  },
}, {
  timestamps: true,
  versionKey: false,
});

const BotConfig = mongoose.model<IBotConfig>('BotConfig', schema);

export default BotConfig;
