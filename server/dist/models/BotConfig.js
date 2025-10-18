import mongoose, { Schema } from 'mongoose';
const schema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true,
        index: true,
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
    },
}, {
    timestamps: true,
    versionKey: false,
});
const BotConfig = mongoose.model('BotConfig', schema);
export default BotConfig;
//# sourceMappingURL=BotConfig.js.map