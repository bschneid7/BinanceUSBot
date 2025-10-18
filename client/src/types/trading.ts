export interface Position {
  _id: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  entry_price: number;
  quantity: number;
  stop_price: number;
  target_price?: number;
  trailing_stop_distance?: number;
  playbook: 'A' | 'B' | 'C' | 'D';
  status: 'OPEN' | 'CLOSED';
  opened_at: string;
  closed_at?: string;
  realized_pnl?: number;
  realized_r?: number;
  fees_paid?: number;
  current_price?: number;
  unrealized_pnl?: number;
  unrealized_r?: number;
  hold_time?: string;
}

export interface Trade {
  _id: string;
  date: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  playbook: 'A' | 'B' | 'C' | 'D';
  entry_price: number;
  exit_price: number;
  quantity: number;
  pnl_usd: number;
  pnl_r: number;
  fees: number;
  hold_time: string;
  outcome: 'WIN' | 'LOSS' | 'BREAKEVEN';
  notes?: string;
}

export interface Signal {
  _id: string;
  timestamp: string;
  symbol: string;
  playbook: 'A' | 'B' | 'C' | 'D';
  action: 'EXECUTED' | 'SKIPPED';
  reason?: string;
  entry_price?: number;
}

export interface Alert {
  _id: string;
  timestamp: string;
  level: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
  message: string;
  type: string;
}

export interface BotStatus {
  status: 'ACTIVE' | 'HALTED_DAILY' | 'HALTED_WEEKLY' | 'STOPPED';
  equity: number;
  availableCapital: number;
  dailyPnl: number;
  dailyPnlR: number;
  weeklyPnl: number;
  weeklyPnlR: number;
  reserveLevel: number;
  openPositions: number;
  totalOpenRiskR: number;
  totalExposurePct: number;
}

export interface PerformanceMetrics {
  total_trades: number;
  win_rate: number;
  profit_factor: number;
  average_r: number;
  max_drawdown_r: number;
  sharpe_ratio: number;
  best_trade_r: number;
  worst_trade_r: number;
  today_trades: number;
  today_wins: number;
  today_losses: number;
  week_trades: number;
  week_wins: number;
  week_losses: number;
  month_trades: number;
  month_wins: number;
  month_losses: number;
}

export interface BotConfig {
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
}

export interface TaxReport {
  _id: string;
  month: string;
  created_at: string;
  equity: number;
  realized_pnl: number;
  fees_paid: number;
  balances: Record<string, number>;
  content_hash: string;
  frozen: boolean;
  pdf_url?: string;
  reconciliationStatus?: 'pending' | 'balanced' | 'discrepancy';
  notes?: string;
}