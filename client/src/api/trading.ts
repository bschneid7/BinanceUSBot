import api from './api';
import { BotStatus, Position, Trade, Signal, Alert, PerformanceMetrics, BotConfig, TaxReport } from '@/types/trading';

// Description: Get bot status and overview
// Endpoint: GET /api/bot/status
// Request: {}
// Response: BotStatus
export const getBotStatus = async (): Promise<BotStatus> => {
  try {
    const response = await api.get('/api/bot/status');
    return response.data;
  } catch (error: unknown) {
    console.error(error);
    const err = error as { response?: { data?: { error?: string } }; message?: string };
    throw new Error(err?.response?.data?.error || err?.message || 'Failed to fetch bot status');
  }
};

// Description: Get active positions
// Endpoint: GET /api/positions/active
// Request: {}
// Response: { positions: Position[] }
export const getActivePositions = async (): Promise<{ positions: Position[] }> => {
  try {
    const response = await api.get('/api/positions/active');
    return response.data;
  } catch (error: unknown) {
    console.error(error);
    const err = error as { response?: { data?: { error?: string } }; message?: string };
    throw new Error(err?.response?.data?.error || err?.message || 'Failed to fetch active positions');
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
  try {
    const response = await api.get('/api/trades/history', { params: filters });
    return response.data;
  } catch (error: unknown) {
    console.error(error);
    const err = error as { response?: { data?: { error?: string } }; message?: string };
    throw new Error(err?.response?.data?.error || err?.message || 'Failed to fetch trade history');
  }
};

// Description: Get recent signals
// Endpoint: GET /api/signals/recent
// Request: { limit?: number }
// Response: { signals: Signal[] }
export const getRecentSignals = async (limit: number = 10): Promise<{ signals: Signal[] }> => {
  try {
    const response = await api.get('/api/signals/recent', { params: { limit } });
    return response.data;
  } catch (error: unknown) {
    console.error(error);
    const err = error as { response?: { data?: { error?: string } }; message?: string };
    throw new Error(err?.response?.data?.error || err?.message || 'Failed to fetch recent signals');
  }
};

// Description: Get system alerts
// Endpoint: GET /api/alerts
// Request: { limit?: number }
// Response: { alerts: Alert[] }
export const getAlerts = async (limit: number = 20): Promise<{ alerts: Alert[] }> => {
  try {
    const response = await api.get('/api/alerts', { params: { limit } });
    return response.data;
  } catch (error: unknown) {
    console.error(error);
    const err = error as { response?: { data?: { error?: string } }; message?: string };
    throw new Error(err?.response?.data?.error || err?.message || 'Failed to fetch alerts');
  }
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
  try {
    const response = await api.get('/api/config');
    return response.data;
  } catch (error: unknown) {
    console.error(error);
    const err = error as { response?: { data?: { error?: string } }; message?: string };
    throw new Error(err?.response?.data?.error || err?.message || 'Failed to fetch bot configuration');
  }
};

// Description: Update bot configuration
// Endpoint: PUT /api/config
// Request: Partial<BotConfig>
// Response: { success: boolean, message: string, config: BotConfig }
export const updateBotConfig = async (config: Partial<BotConfig>): Promise<{ success: boolean; message: string; config: BotConfig }> => {
  try {
    const response = await api.put('/api/config', config);
    return response.data;
  } catch (error: unknown) {
    console.error(error);
    const err = error as { response?: { data?: { error?: string; message?: string } }; message?: string };
    throw new Error(err?.response?.data?.message || err?.response?.data?.error || err?.message || 'Failed to update bot configuration');
  }
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