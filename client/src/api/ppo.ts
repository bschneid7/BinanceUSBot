import api from './api';
import logger from '../utils/logger';

// Description: Train PPO agent (starts background job)
// Endpoint: POST /ppo/train
// Request: { episodes: number, historicalData?: Array<{price: number, volume: number, volatility: number}> }
// Response: { success: boolean, message: string, jobStatus: string, modelId: string }
export const trainPPO = async (data: {
  episodes: number;
  historicalData?: Array<{ price: number; volume: number; volatility: number }>;
}) => {
  try {
    const response = await api.post('/ppo/train', data);
    return response.data;
  } catch (error: unknown) {
    const err = error as {response?: {data?: {error?: string}}, message?: string};
    logger.apiError('Training error', err);
    throw new Error(err?.response?.data?.error || err.message || 'Training failed');
  }
};

// Description: Get training job status
// Endpoint: GET /ppo/training-status
// Request: {}
// Response: { status: string, progress: number, avgReward?: number, stats?: object, duration?: number, error?: string, modelId?: string, elapsedTime?: number }
export const getTrainingStatus = async () => {
  try {
    const response = await api.get('/ppo/training-status');
    return response.data;
  } catch (error: unknown) {
    const err = error as {response?: {data?: {error?: string}}, message?: string};
    logger.apiError('Training status error', err);
    throw new Error(err?.response?.data?.error || err.message || 'Get training status failed');
  }
};

// Description: Get action from PPO agent
// Endpoint: POST /ppo/action
// Request: { state: number[] } (5-element array: [price, volume, volatility, sentiment, position])
// Response: { action: number, actionName: string } (0=hold, 1=buy, 2=sell)
export const getPPOAction = async (state: number[]) => {
  try {
    const response = await api.post('/ppo/action', { state });
    return response.data;
  } catch (error: unknown) {
    const err = error as {response?: {data?: {error?: string}}, message?: string};
    logger.apiError('Action error', err);
    throw new Error(err?.response?.data?.error || err.message || 'Get action failed');
  }
};

// Description: Get PPO agent stats
// Endpoint: GET /ppo/stats
// Request: {}
// Response: { exists: boolean, stats: { memorySize: number, actorParams: number, criticParams: number } }
export const getPPOStats = async () => {
  try {
    const response = await api.get('/ppo/stats');
    return response.data;
  } catch (error: unknown) {
    const err = error as {response?: {data?: {error?: string}}, message?: string};
    logger.apiError('Stats error', err);
    throw new Error(err?.response?.data?.error || err.message || 'Get stats failed');
  }
};

// Description: Reset PPO agent
// Endpoint: POST /ppo/reset
// Request: {}
// Response: { success: boolean, message: string }
export const resetPPO = async () => {
  try {
    const response = await api.post('/ppo/reset');
    return response.data;
  } catch (error: unknown) {
    const err = error as {response?: {data?: {error?: string}}, message?: string};
    logger.apiError('Reset error', err);
    throw new Error(err?.response?.data?.error || err.message || 'Reset failed');
  }
};
