import api from './api';

// Description: Get all ML models for user
// Endpoint: GET /api/ml/models
// Request: { status?: 'TRAINING' | 'ACTIVE' | 'ARCHIVED' | 'FAILED', isDeployed?: boolean }
// Response: { models: Array<MLModel> }
export const getMLModels = async (filters?: {
  status?: 'TRAINING' | 'ACTIVE' | 'ARCHIVED' | 'FAILED';
  isDeployed?: boolean;
}) => {
  try {
    const params = new URLSearchParams();
    if (filters?.status) params.append('status', filters.status);
    if (filters?.isDeployed !== undefined)
      params.append('isDeployed', filters.isDeployed.toString());

    const response = await api.get(`/api/ml/models?${params.toString()}`);
    return response.data;
  } catch (error: unknown) {
    const err = error as { response?: { data?: { error?: string } }; message?: string };
    console.error('[ML API] Get models error:', err);
    throw new Error(err?.response?.data?.error || err.message || 'Failed to get models');
  }
};

// Description: Get deployed ML model for user
// Endpoint: GET /api/ml/deployed
// Request: {}
// Response: { model: MLModel | null }
export const getDeployedModel = async () => {
  try {
    const response = await api.get('/api/ml/deployed');
    return response.data;
  } catch (error: unknown) {
    const err = error as { response?: { data?: { error?: string } }; message?: string };
    console.error('[ML API] Get deployed model error:', err);
    throw new Error(err?.response?.data?.error || err.message || 'Failed to get deployed model');
  }
};

// Description: Get ML model by ID
// Endpoint: GET /api/ml/models/:id
// Request: {}
// Response: { model: MLModel }
export const getMLModelById = async (id: string) => {
  try {
    const response = await api.get(`/api/ml/models/${id}`);
    return response.data;
  } catch (error: unknown) {
    const err = error as { response?: { data?: { error?: string } }; message?: string };
    console.error('[ML API] Get model by ID error:', err);
    throw new Error(err?.response?.data?.error || err.message || 'Failed to get model');
  }
};

// Description: Deploy an ML model
// Endpoint: POST /api/ml/models/:id/deploy
// Request: {}
// Response: { success: boolean, model: MLModel }
export const deployMLModel = async (id: string) => {
  try {
    const response = await api.post(`/api/ml/models/${id}/deploy`);
    return response.data;
  } catch (error: unknown) {
    const err = error as { response?: { data?: { error?: string } }; message?: string };
    console.error('[ML API] Deploy model error:', err);
    throw new Error(err?.response?.data?.error || err.message || 'Failed to deploy model');
  }
};

// Description: Archive an ML model
// Endpoint: POST /api/ml/models/:id/archive
// Request: {}
// Response: { success: boolean, model: MLModel }
export const archiveMLModel = async (id: string) => {
  try {
    const response = await api.post(`/api/ml/models/${id}/archive`);
    return response.data;
  } catch (error: unknown) {
    const err = error as { response?: { data?: { error?: string } }; message?: string };
    console.error('[ML API] Archive model error:', err);
    throw new Error(err?.response?.data?.error || err.message || 'Failed to archive model');
  }
};

// Description: Update model backtest performance
// Endpoint: PUT /api/ml/models/:id/backtest
// Request: { backtestWinRate: number, backtestProfitFactor: number, backtestSharpeRatio: number, backtestMaxDrawdown: number, backtestTotalTrades: number }
// Response: { success: boolean, model: MLModel }
export const updateModelBacktest = async (
  id: string,
  performance: {
    backtestWinRate: number;
    backtestProfitFactor: number;
    backtestSharpeRatio: number;
    backtestMaxDrawdown: number;
    backtestTotalTrades: number;
  }
) => {
  try {
    const response = await api.put(`/api/ml/models/${id}/backtest`, performance);
    return response.data;
  } catch (error: unknown) {
    const err = error as { response?: { data?: { error?: string } }; message?: string };
    console.error('[ML API] Update backtest error:', err);
    throw new Error(err?.response?.data?.error || err.message || 'Failed to update backtest');
  }
};

// Description: Get ML model statistics
// Endpoint: GET /api/ml/stats
// Request: {}
// Response: { stats: { totalModels, activeModels, deployedModels, trainingModels, archivedModels, failedModels, bestModel } }
export const getMLStats = async () => {
  try {
    const response = await api.get('/api/ml/stats');
    return response.data;
  } catch (error: unknown) {
    const err = error as { response?: { data?: { error?: string } }; message?: string };
    console.error('[ML API] Get stats error:', err);
    throw new Error(err?.response?.data?.error || err.message || 'Failed to get stats');
  }
};

// Description: Update live performance for deployed model
// Endpoint: POST /api/ml/update-live-performance
// Request: {}
// Response: { success: boolean }
export const updateLivePerformance = async () => {
  try {
    const response = await api.post('/api/ml/update-live-performance');
    return response.data;
  } catch (error: unknown) {
    const err = error as { response?: { data?: { error?: string } }; message?: string };
    console.error('[ML API] Update live performance error:', err);
    throw new Error(
      err?.response?.data?.error || err.message || 'Failed to update live performance'
    );
  }
};
