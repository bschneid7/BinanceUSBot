import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const api = axios.create({
  baseURL: `${API_URL}/api`,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const loginUser = async (email: string, password: string) => {
  const response = await api.post('/auth/login', { email, password });
  return response.data;
};

export const registerUser = async (email: string, password: string) => {
  const response = await api.post('/auth/register', { email, password });
  return response.data;
};

export const refreshAccessToken = async (refreshToken: string) => {
  const response = await api.post('/auth/refresh', { refreshToken });
  return response.data;
};

export const changePassword = async (currentPassword: string, newPassword: string) => {
  const response = await api.post('/auth/change-password', {
    currentPassword,
    newPassword
  });
  return response.data;
};

export const getBotStatus = async () => {
  const response = await api.get('/bot/status');
  return response.data;
};

export const startBot = async () => {
  const response = await api.post('/bot/start');
  return response.data;
};

export const stopBot = async () => {
  const response = await api.post('/bot/stop');
  return response.data;
};

export const getPositions = async () => {
  const response = await api.get('/positions');
  return response.data;
};

// Default export for compatibility with trading.ts
export default api;
