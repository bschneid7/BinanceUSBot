import api from './api';
import { BotStatus, Position, Trade, Signal, Alert, PerformanceMetrics, BotConfig, TaxReport } from '@/types/trading';

// Description: Get bot status and overview
// Endpoint: GET /api/bot/status
// Request: {}
// Response: { status: BotStatus }
export const getBotStatus = async (): Promise<{ status: BotStatus }> => {
  // Mocking the response
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        status: {
          status: 'ACTIVE',
          equity: 7142.50,
          available_capital: 4285.50,
          daily_pnl: 28.50,
          daily_pnl_r: 0.68,
          weekly_pnl: -126.00,
          weekly_pnl_r: -3.0,
          reserve_pct: 28.5,
          reserve_target_pct: 30,
          open_positions: 2,
          total_open_risk_r: 1.8,
          total_exposure_pct: 45.2,
          uptime_seconds: 86400,
          last_signal_timestamp: new Date(Date.now() - 3600000).toISOString(),
          api_latency_ms: 120
        }
      });
    }, 500);
  });
  // try {
  //   return await api.get('/api/bot/status');
  // } catch (error: any) {
  //   throw new Error(error?.response?.data?.message || error.message);
  // }
};

// Description: Get active positions
// Endpoint: GET /api/positions/active
// Request: {}
// Response: { positions: Position[] }
export const getActivePositions = async (): Promise<{ positions: Position[] }> => {
  try {
    const response = await api.get('/api/positions/active');
    return response.data;
  } catch (error: any) {
    console.error(error);
    throw new Error(error?.response?.data?.error || error.message);
  }
};

// Description: Get trade history with filters
// Endpoint: GET /api/trades/history
// Request: { startDate?: string, endDate?: string, playbook?: string, outcome?: string, symbol?: string }
// Response: { trades: Trade[] }
export const getTradeHistory = async (filters?: {
  startDate?: string;
  endDate?: string;
  playbook?: string;
  outcome?: string;
  symbol?: string;
}): Promise<{ trades: Trade[] }> => {
  // Mocking the response
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        trades: [
          {
            _id: '1',
            date: new Date(Date.now() - 86400000).toISOString(),
            symbol: 'BTCUSDT',
            side: 'BUY',
            playbook: 'A',
            entry_price: 111200,
            exit_price: 112400,
            quantity: 0.032,
            pnl_usd: 38.40,
            pnl_r: 0.91,
            fees: 1.42,
            hold_time: '1h 45m',
            outcome: 'WIN',
            notes: 'Clean breakout, scaled at +1.5R'
          },
          {
            _id: '2',
            date: new Date(Date.now() - 172800000).toISOString(),
            symbol: 'ETHUSDT',
            side: 'BUY',
            playbook: 'B',
            entry_price: 3420,
            exit_price: 3500,
            quantity: 1.4,
            pnl_usd: 112.00,
            pnl_r: 2.67,
            fees: 0.95,
            hold_time: '38m',
            outcome: 'WIN',
            notes: 'VWAP fade, hit target'
          },
          {
            _id: '3',
            date: new Date(Date.now() - 259200000).toISOString(),
            symbol: 'SOLUSDT',
            side: 'BUY',
            playbook: 'C',
            entry_price: 145.50,
            exit_price: 143.20,
            quantity: 0.29,
            pnl_usd: -42.00,
            pnl_r: -1.0,
            fees: 0.84,
            hold_time: '22m',
            outcome: 'LOSS',
            notes: 'Event burst failed, stopped out'
          }
        ]
      });
    }, 500);
  });
  // try {
  //   return await api.get('/api/trades/history', { params: filters });
  // } catch (error: any) {
  //   throw new Error(error?.response?.data?.message || error.message);
  // }
};

// Description: Get recent signals
// Endpoint: GET /api/signals/recent
// Request: { limit?: number }
// Response: { signals: Signal[] }
export const getRecentSignals = async (limit: number = 10): Promise<{ signals: Signal[] }> => {
  // Mocking the response
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        signals: [
          {
            _id: '1',
            timestamp: new Date(Date.now() - 3600000).toISOString(),
            symbol: 'BTCUSDT',
            playbook: 'A',
            action: 'EXECUTED',
            entry_price: 111200
          },
          {
            _id: '2',
            timestamp: new Date(Date.now() - 4500000).toISOString(),
            symbol: 'ETHUSDT',
            playbook: 'B',
            action: 'EXECUTED',
            entry_price: 3420
          },
          {
            _id: '3',
            timestamp: new Date(Date.now() - 5400000).toISOString(),
            symbol: 'SOLUSDT',
            playbook: 'A',
            action: 'SKIPPED',
            reason: 'Max positions reached'
          }
        ]
      });
    }, 500);
  });
  // try {
  //   return await api.get('/api/signals/recent', { params: { limit } });
  // } catch (error: any) {
  //   throw new Error(error?.response?.data?.message || error.message);
  // }
};

// Description: Get system alerts
// Endpoint: GET /api/alerts
// Request: { limit?: number }
// Response: { alerts: Alert[] }
export const getAlerts = async (limit: number = 20): Promise<{ alerts: Alert[] }> => {
  // Mocking the response
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        alerts: [
          {
            _id: '1',
            timestamp: new Date(Date.now() - 7200000).toISOString(),
            level: 'WARNING',
            message: 'Daily loss approaching: -1.6R of -2.0R',
            type: 'RISK_LIMIT'
          },
          {
            _id: '2',
            timestamp: new Date(Date.now() - 9000000).toISOString(),
            level: 'WARNING',
            message: 'Slippage exceeded on ETHUSDT: 12.5 bps',
            type: 'SLIPPAGE'
          },
          {
            _id: '3',
            timestamp: new Date(Date.now() - 86400000).toISOString(),
            level: 'INFO',
            message: 'Month-end reconciliation complete for 2025-01',
            type: 'TAX'
          }
        ]
      });
    }, 500);
  });
  // try {
  //   return await api.get('/api/alerts', { params: { limit } });
  // } catch (error: any) {
  //   throw new Error(error?.response?.data?.message || error.message);
  // }
};

// Description: Get performance metrics
// Endpoint: GET /api/analytics/performance
// Request: {}
// Response: { metrics: PerformanceMetrics }
export const getPerformanceMetrics = async (): Promise<{ metrics: PerformanceMetrics }> => {
  // Mocking the response
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        metrics: {
          total_trades: 60,
          win_rate: 58,
          profit_factor: 1.42,
          average_r: 0.8,
          max_drawdown_r: -3.2,
          sharpe_ratio: 1.2,
          best_trade_r: 4.2,
          worst_trade_r: -1.0,
          today_trades: 5,
          today_wins: 3,
          today_losses: 2,
          week_trades: 18,
          week_wins: 10,
          week_losses: 8,
          month_trades: 60,
          month_wins: 35,
          month_losses: 25
        }
      });
    }, 500);
  });
  // try {
  //   return await api.get('/api/analytics/performance');
  // } catch (error: any) {
  //   throw new Error(error?.response?.data?.message || error.message);
  // }
};

// Description: Get bot configuration
// Endpoint: GET /api/config
// Request: {}
// Response: { config: BotConfig }
export const getBotConfig = async (): Promise<{ config: BotConfig }> => {
  // Mocking the response
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        config: {
          scanner: {
            pairs: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'],
            refresh_ms: 2000,
            min_volume_usd_24h: 2000000,
            max_spread_bps: 5,
            max_spread_bps_event: 10,
            tob_min_depth_usd: 50000,
            pair_signal_cooldown_min: 15
          },
          risk: {
            R_pct: 0.006,
            daily_stop_R: -2.0,
            weekly_stop_R: -6.0,
            max_open_R: 2.0,
            max_exposure_pct: 0.60,
            max_positions: 4,
            correlation_guard: true,
            slippage_guard_bps: 5,
            slippage_guard_bps_event: 10
          },
          reserve: {
            target_pct: 0.30,
            floor_pct: 0.20,
            refill_from_profits_pct: 0.30
          },
          playbook_A: {
            enable: true,
            volume_mult: 1.5,
            stop_atr_mult: 1.2,
            breakeven_R: 1.0,
            scale_R: 1.5,
            scale_pct: 0.5,
            trail_atr_mult: 1.0
          },
          playbook_B: {
            enable: true,
            deviation_atr_mult: 2.0,
            stop_atr_mult: 0.8,
            time_stop_min: 90,
            target_R: 1.2,
            max_trades_per_session: 2
          },
          playbook_C: {
            enable: true,
            event_window_min: 30,
            stop_atr_mult: 1.8,
            scale_1_R: 1.0,
            scale_1_pct: 0.33,
            scale_2_R: 2.0,
            scale_2_pct: 0.33,
            trail_atr_mult: 1.0
          },
          playbook_D: {
            enable: true
          }
        }
      });
    }, 500);
  });
  // try {
  //   return await api.get('/api/config');
  // } catch (error: any) {
  //   throw new Error(error?.response?.data?.message || error.message);
  // }
};

// Description: Update bot configuration
// Endpoint: PUT /api/config
// Request: { config: Partial<BotConfig> }
// Response: { success: boolean, message: string }
export const updateBotConfig = async (config: Partial<BotConfig>): Promise<{ success: boolean; message: string }> => {
  // Mocking the response
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({ success: true, message: 'Configuration updated successfully' });
    }, 500);
  });
  // try {
  //   return await api.put('/api/config', { config });
  // } catch (error: any) {
  //   throw new Error(error?.response?.data?.message || error.message);
  // }
};

// Description: Emergency kill switch - flatten all positions and halt
// Endpoint: POST /api/bot/emergency-stop
// Request: {}
// Response: { success: boolean, message: string }
export const emergencyStop = async (): Promise<{ success: boolean; message: string }> => {
  // Mocking the response
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({ success: true, message: 'Emergency stop executed. All positions flattened.' });
    }, 500);
  });
  // try {
  //   return await api.post('/api/bot/emergency-stop');
  // } catch (error: any) {
  //   throw new Error(error?.response?.data?.message || error.message);
  // }
};

// Description: Resume trading after halt
// Endpoint: POST /api/bot/resume
// Request: { justification?: string }
// Response: { success: boolean, message: string }
export const resumeTrading = async (justification?: string): Promise<{ success: boolean; message: string }> => {
  // Mocking the response
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({ success: true, message: 'Trading resumed successfully' });
    }, 500);
  });
  // try {
  //   return await api.post('/api/bot/resume', { justification });
  // } catch (error: any) {
  //   throw new Error(error?.response?.data?.message || error.message);
  // }
};

// Description: Get tax reports
// Endpoint: GET /api/tax/reports
// Request: {}
// Response: { reports: TaxReport[] }
export const getTaxReports = async (): Promise<{ reports: TaxReport[] }> => {
  // Mocking the response
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        reports: [
          {
            _id: '1',
            month: '2025-01',
            created_at: new Date(Date.now() - 86400000).toISOString(),
            equity: 7142.50,
            realized_pnl: 142.50,
            fees_paid: 18.20,
            balances: { BTC: 0.084, USDT: 1250.00 },
            content_hash: 'a1b2c3d4e5f6...',
            frozen: true,
            pdf_url: '/tax_documents/2025-01-Reconciliation.pdf'
          }
        ]
      });
    }, 500);
  });
  // try {
  //   return await api.get('/api/tax/reports');
  // } catch (error: any) {
  //   throw new Error(error?.response?.data?.message || error.message);
  // }
};

// Description: Get equity curve data for chart
// Endpoint: GET /api/analytics/equity-curve
// Request: { days?: number }
// Response: { data: Array<{ date: string, equity: number }> }
export const getEquityCurve = async (days: number = 30): Promise<{ data: Array<{ date: string; equity: number }> }> => {
  // Mocking the response
  return new Promise((resolve) => {
    setTimeout(() => {
      const data = [];
      const startEquity = 7000;
      for (let i = days; i >= 0; i--) {
        const date = new Date(Date.now() - i * 86400000);
        const equity = startEquity + (Math.random() - 0.4) * 200 + (days - i) * 5;
        data.push({
          date: date.toISOString().split('T')[0],
          equity: Math.round(equity * 100) / 100
        });
      }
      resolve({ data });
    }, 500);
  });
  // try {
  //   return await api.get('/api/analytics/equity-curve', { params: { days } });
  // } catch (error: any) {
  //   throw new Error(error?.response?.data?.message || error.message);
  // }
};