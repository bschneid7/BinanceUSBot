import mongoose, { Document } from 'mongoose';
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
    };
    createdAt: Date;
    updatedAt: Date;
}
declare const BotConfig: mongoose.Model<IBotConfig, {}, {}, {}, mongoose.Document<unknown, {}, IBotConfig, {}, {}> & IBotConfig & Required<{
    _id: unknown;
}> & {
    __v: number;
}, any>;
export default BotConfig;
//# sourceMappingURL=BotConfig.d.ts.map