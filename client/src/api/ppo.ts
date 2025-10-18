import api from './api';

// Description: Train PPO agent
// Endpoint: POST /api/ppo/train
// Request: { episodes: number, historicalData?: Array<{price: number, volume: number, volatility: number}> }
// Response: { success: boolean, avgReward: number, episodeRewards: number[], stats: object, duration: number }
export const trainPPO = async (data: {
  episodes: number;
  historicalData?: Array<{ price: number; volume: number; volatility: number }>;
}) => {
  try {
    const response = await api.post('/api/ppo/train', data);
    return response.data;
  } catch (error: unknown) {
    const err = error as {response?: {data?: {error?: string}}, message?: string};
    console.error('[PPO API] Training error:', err);
    throw new Error(err?.response?.data?.error || err.message || 'Training failed');
  }
};

// Description: Get action from PPO agent
// Endpoint: POST /api/ppo/action
// Request: { state: number[] } (5-element array: [price, volume, volatility, sentiment, position])
// Response: { action: number, actionName: string } (0=hold, 1=buy, 2=sell)
export const getPPOAction = async (state: number[]) => {
  try {
    const response = await api.post('/api/ppo/action', { state });
    return response.data;
  } catch (error: unknown) {
    const err = error as {response?: {data?: {error?: string}}, message?: string};
    console.error('[PPO API] Action error:', err);
    throw new Error(err?.response?.data?.error || err.message || 'Get action failed');
  }
};

// Description: Get PPO agent stats
// Endpoint: GET /api/ppo/stats
// Request: {}
// Response: { exists: boolean, stats: { memorySize: number, actorParams: number, criticParams: number } }
export const getPPOStats = async () => {
  try {
    const response = await api.get('/api/ppo/stats');
    return response.data;
  } catch (error: unknown) {
    const err = error as {response?: {data?: {error?: string}}, message?: string};
    console.error('[PPO API] Stats error:', err);
    throw new Error(err?.response?.data?.error || err.message || 'Get stats failed');
  }
};

// Description: Reset PPO agent
// Endpoint: POST /api/ppo/reset
// Request: {}
// Response: { success: boolean, message: string }
export const resetPPO = async () => {
  try {
    const response = await api.post('/api/ppo/reset');
    return response.data;
  } catch (error: unknown) {
    const err = error as {response?: {data?: {error?: string}}, message?: string};
    console.error('[PPO API] Reset error:', err);
    throw new Error(err?.response?.data?.error || err.message || 'Reset failed');
  }
};
