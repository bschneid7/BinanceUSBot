import axios from 'axios';
import logger from '../utils/logger';

// Use current origin for API calls (works with nginx proxy)
const API_URL = import.meta.env.VITE_API_URL || window.location.origin;

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

export default api;

export const changePassword = async (currentPassword: string, newPassword: string) => {
  const response = await api.post('/auth/change-password', { currentPassword, newPassword });
  return response.data;
};
