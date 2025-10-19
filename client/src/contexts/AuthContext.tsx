import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { loginUser, registerUser, refreshAccessToken } from '../api/api';

interface User {
  id: string;
  email: string;
}

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const IDLE_TIMEOUT = 15 * 60 * 1000; // 15 minutes

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [lastActivity, setLastActivity] = useState<number>(Date.now());

  const updateActivity = useCallback(() => {
    setLastActivity(Date.now());
  }, []);

  useEffect(() => {
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
    
    events.forEach(event => {
      document.addEventListener(event, updateActivity);
    });

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, updateActivity);
      });
    };
  }, [updateActivity]);

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem('user');
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    window.location.href = '/';
  }, []);

  useEffect(() => {
    if (!user) return;

    const interval = setInterval(() => {
      if (Date.now() - lastActivity > IDLE_TIMEOUT) {
        console.log('Auto-logout due to inactivity');
        logout();
        alert('⏱️ You have been logged out due to 15 minutes of inactivity.');
      }
    }, 60000);

    return () => clearInterval(interval);
  }, [user, lastActivity, logout]);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    const accessToken = localStorage.getItem('accessToken');
    
    if (storedUser && accessToken) {
      try {
        setUser(JSON.parse(storedUser));
      } catch (e) {
        console.error('Failed to parse stored user:', e);
        localStorage.clear();
      }
    }
  }, []);

  useEffect(() => {
    if (!user) return;

    const refreshInterval = setInterval(async () => {
      try {
        const refreshToken = localStorage.getItem('refreshToken');
        if (refreshToken) {
          const response = await refreshAccessToken(refreshToken);
          localStorage.setItem('accessToken', response.accessToken);
        }
      } catch (error) {
        console.error('Failed to refresh token:', error);
        logout();
      }
    }, 50 * 60 * 1000);

    return () => clearInterval(refreshInterval);
  }, [user, logout]);

  const login = async (email: string, password: string) => {
    try {
      const response = await loginUser(email, password);
      
      // Response format: { _id, email, accessToken, refreshToken, ... }
      // The entire response IS the user data plus tokens
      const userData: User = {
        id: response._id || response.id,
        email: response.email
      };
      
      setUser(userData);
      localStorage.setItem('user', JSON.stringify(userData));
      localStorage.setItem('accessToken', response.accessToken);
      localStorage.setItem('refreshToken', response.refreshToken);
      setLastActivity(Date.now());
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  };

  const register = async (email: string, password: string) => {
    try {
      const response = await registerUser(email, password);
      
      const userData: User = {
        id: response._id || response.id,
        email: response.email
      };
      
      setUser(userData);
      localStorage.setItem('user', JSON.stringify(userData));
      localStorage.setItem('accessToken', response.accessToken);
      localStorage.setItem('refreshToken', response.refreshToken);
    } catch (error) {
      console.error('Register error:', error);
      throw error;
    }
  };

  return (
    <AuthContext.Provider value={{ user, login, register, logout, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
