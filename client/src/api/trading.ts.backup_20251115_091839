import api from './api';
import { BotStatus, Position, Trade, Signal, Alert, PerformanceMetrics, BotConfig, TaxReport } from '@/types/trading';
import logger from '../utils/logger';

// Description: Get bot status and overview
// Endpoint: GET /api/bot/status
// Request: {}
// Response: BotStatus
export const getBotStatus = async (): Promise<BotStatus> => {
  try {
    const response = await api.get('/bot/status');
    return response.data;
  } catch (error: unknown) {
    logger.error('API request failed', error);
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
    const response = await api.get('/positions/active');
    return response.data;
  } catch (error: unknown) {
    logger.error('API request failed', error);
    const err = error as { response?: { data?: { error?: string } }; message?: string };
    throw new Error(err?.response?.data?.error || err?.message || 'Failed to fetch active positions');
  }
};

// Description: Get trade history with filters
// Endpoint: GET /api/dashboard/trades
// Request: { startDate?: string, endDate?: string, playbook?: string, outcome?: string, symbol?: string, limit?: number }
// Response: { success: boolean, data: Trade[] }
export const getTradeHistory = async (filters?: {
  startDate?: string;
  endDate?: string;
  playbook?: string;
  outcome?: string;
  symbol?: string;
  limit?: number;
}): Promise<{ trades: Trade[] }> => {
  try {
    const response = await api.get('/dashboard/trades', { params: filters });
    // Backend returns { success: true, data: [...] }, normalize to { trades: [...] }
    return { trades: response.data.data || [] };
  } catch (error: unknown) {
    logger.error('API request failed', error);
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
    const response = await api.get('/signals/recent', { params: { limit } });
    return response.data;
  } catch (error: unknown) {
    logger.error('API request failed', error);
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
    const response = await api.get('/alerts', { params: { limit } });
    return response.data;
  } catch (error: unknown) {
    logger.error('API request failed', error);
    const err = error as { response?: { data?: { error?: string } }; message?: string };
    throw new Error(err?.response?.data?.error || err?.message || 'Failed to fetch alerts');
  }
};

// Description: Get performance metrics
// Endpoint: GET /api/analytics/performance
// Request: {}
// Response: { metrics: PerformanceMetrics }
export const getPerformanceMetrics = async (): Promise<{ metrics: PerformanceMetrics }> => {
  try {
    const response = await api.get('/analytics/performance');
    return response.data;
  } catch (error: unknown) {
    logger.error('API request failed', error);
    const err = error as { response?: { data?: { error?: string } }; message?: string };
    throw new Error(err?.response?.data?.error || err?.message || 'Failed to fetch performance metrics');
  }
};

// Description: Get bot configuration
// Endpoint: GET /api/config
// Request: {}
// Response: { config: BotConfig }
export const getBotConfig = async (): Promise<{ config: BotConfig }> => {
  try {
    const response = await api.get('/config');
    return response.data;
  } catch (error: unknown) {
    logger.error('API request failed', error);
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
    const response = await api.put('/config', config);
    return response.data;
  } catch (error: unknown) {
    logger.error('API request failed', error);
    const err = error as { response?: { data?: { error?: string; message?: string } }; message?: string };
    throw new Error(err?.response?.data?.message || err?.response?.data?.error || err?.message || 'Failed to update bot configuration');
  }
};

// Description: Emergency kill switch - flatten all positions and halt
// Endpoint: POST /api/bot/emergency-stop
// Request: {}
// Response: { success: boolean, message: string }
export const emergencyStop = async (): Promise<{ success: boolean; message: string }> => {
  try {
    const response = await api.post('/bot/emergency-stop');
    return response.data;
  } catch (error: unknown) {
    logger.error('API request failed', error);
    const err = error as { response?: { data?: { message?: string; error?: string } }; message?: string };
    throw new Error(err?.response?.data?.message || err?.response?.data?.error || err?.message || 'Failed to execute emergency stop');
  }
};

// Description: Resume trading after halt
// Endpoint: POST /api/bot/resume
// Request: { justification?: string }
// Response: { success: boolean, message: string }
export const resumeTrading = async (justification?: string): Promise<{ success: boolean; message: string }> => {
  try {
    const response = await api.post('/bot/resume', { justification });
    return response.data;
  } catch (error: unknown) {
    logger.error('API request failed', error);
    const err = error as { response?: { data?: { message?: string; error?: string } }; message?: string };
    throw new Error(err?.response?.data?.message || err?.response?.data?.error || err?.message || 'Failed to resume trading');
  }
};

// Description: Get tax reports
// Endpoint: GET /api/tax/reports
// Request: { year?: number, status?: string } (query params)
// Response: { reports: TaxReport[] }
export const getTaxReports = async (filters?: { year?: number; status?: string }): Promise<{ reports: TaxReport[] }> => {
  try {
    const response = await api.get('/tax/reports', { params: filters });
    return response.data;
  } catch (error: unknown) {
    logger.error('API request failed', error);
    const err = error as { response?: { data?: { error?: string } }; message?: string };
    throw new Error(err?.response?.data?.error || err?.message || 'Failed to fetch tax reports');
  }
};

// Description: Get equity curve data for chart
// Endpoint: GET /api/analytics/equity-curve
// Request: { days?: number }
// Response: { data: Array<{ date: string, equity: number }> }
export const getEquityCurve = async (days: number = 30): Promise<{ data: Array<{ date: string; equity: number }> }> => {
  try {
    const response = await api.get('/analytics/equity-curve', { params: { days } });
    return response.data;
  } catch (error: unknown) {
    logger.error('API request failed', error);
    const err = error as { response?: { data?: { error?: string } }; message?: string };
    throw new Error(err?.response?.data?.error || err?.message || 'Failed to fetch equity curve');
  }
};

// Description: Start the trading engine
// Endpoint: POST /api/engine/start
// Request: {}
// Response: { success: boolean, message: string, status: object }
export const startEngine = async (): Promise<{ success: boolean; message: string; status: object }> => {
  try {
    const response = await api.post('/engine/start');
    return response.data;
  } catch (error: unknown) {
    logger.error('API request failed', error);
    const err = error as { response?: { data?: { error?: string } }; message?: string };
    throw new Error(err?.response?.data?.error || err?.message || 'Failed to start engine');
  }
};

// Description: Stop the trading engine
// Endpoint: POST /api/engine/stop
// Request: {}
// Response: { success: boolean, message: string, status: object }
export const stopEngine = async (): Promise<{ success: boolean; message: string; status: object }> => {
  try {
    const response = await api.post('/engine/stop');
    return response.data;
  } catch (error: unknown) {
    logger.error('API request failed', error);
    const err = error as { response?: { data?: { error?: string } }; message?: string };
    throw new Error(err?.response?.data?.error || err?.message || 'Failed to stop engine');
  }
};

// Description: Get trading engine status
// Endpoint: GET /api/engine/status
// Request: {}
// Response: { isRunning: boolean, lastScanTimestamp?: Date, lastSignalTimestamp?: Date }
export const getEngineStatus = async (): Promise<{ isRunning: boolean; lastScanTimestamp?: Date; lastSignalTimestamp?: Date }> => {
  try {
    const response = await api.get('/engine/status');
    return response.data;
  } catch (error: unknown) {
    logger.error('API request failed', error);
    const err = error as { response?: { data?: { error?: string } }; message?: string };
    throw new Error(err?.response?.data?.error || err?.message || 'Failed to get engine status');
  }
};