import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { loginUser, registerUser, refreshAccessToken } from '../api/api'; // Assuming these are correctly defined
import api from '../api/api'; // Import api instance for interceptor cleanup

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
  isLoading: boolean; // <-- Add isLoading state
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const IDLE_TIMEOUT = 15 * 60 * 1000; // 15 minutes
const REFRESH_INTERVAL = 50 * 60 * 1000; // 50 minutes

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true); // <-- Initialize isLoading to true
  const [lastActivity, setLastActivity] = useState<number>(Date.now());

  const updateActivity = useCallback(() => {
    setLastActivity(Date.now());
  }, []);

  // --- Activity Tracking Effect ---
  useEffect(() => {
    const events: (keyof DocumentEventMap)[] = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
    events.forEach(event => {
      document.addEventListener(event, updateActivity);
    });
    return () => {
      events.forEach(event => {
        document.removeEventListener(event, updateActivity);
      });
    };
  }, [updateActivity]);

  // --- Logout Function ---
  const logout = useCallback(() => {
    console.log('[AuthContext] Logging out...');
    setUser(null);
    localStorage.removeItem('user');
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    // Clear Authorization header immediately for subsequent requests
    delete api.defaults.headers.common['Authorization'];
    // Redirect after state update and clearing header
    window.location.href = '/login'; // Redirect to login
  }, []);

  // --- Inactivity Logout Effect ---
  useEffect(() => {
    if (!user || isLoading) return; // Don't run inactivity timer if loading or logged out

    console.log('[AuthContext] Starting inactivity timer...');
    const interval = setInterval(() => {
      if (Date.now() - lastActivity > IDLE_TIMEOUT) {
        console.log('[AuthContext] Auto-logout due to inactivity');
        logout();
        alert('⏱️ You have been logged out due to 15 minutes of inactivity.');
      }
    }, 60000); // Check every minute

    return () => {
      console.log('[AuthContext] Clearing inactivity timer.');
      clearInterval(interval);
    };
  }, [user, isLoading, lastActivity, logout]);

  // --- Initial Auth State Loading Effect ---
  useEffect(() => {
    console.log('[AuthContext] Checking initial auth state...');
    setIsLoading(true); // Start loading
    try {
      const storedUser = localStorage.getItem('user');
      const accessToken = localStorage.getItem('accessToken');
      const refreshToken = localStorage.getItem('refreshToken');

      if (storedUser && accessToken && refreshToken) {
        console.log('[AuthContext] Found stored credentials.');
        setUser(JSON.parse(storedUser));
        // Set Authorization header for initial load
        api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;
      } else {
        console.log('[AuthContext] No stored credentials found.');
        // Ensure user state is null if credentials are missing
        setUser(null);
        delete api.defaults.headers.common['Authorization'];
      }
    } catch (e) {
      console.error('[AuthContext] Failed to parse stored user or invalid tokens:', e);
      // Clear potentially corrupted storage
      localStorage.removeItem('user');
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      setUser(null);
      delete api.defaults.headers.common['Authorization'];
    } finally {
      console.log('[AuthContext] Initial auth check complete.');
      setIsLoading(false); // Finish loading
    }
  }, []); // Run only once on mount

  // --- Token Refresh Effect ---
  useEffect(() => {
    if (isLoading || !user) return; // Don't run if loading or logged out

    console.log('[AuthContext] Setting up token refresh interval...');
    const intervalId = setInterval(async () => {
      console.log('[AuthContext] Attempting token refresh...');
      try {
        const currentRefreshToken = localStorage.getItem('refreshToken');
        if (currentRefreshToken) {
          const response = await refreshAccessToken(currentRefreshToken); // Use dedicated function
          console.log('[AuthContext] Token refresh successful.');
          const newAccessToken = response.data.accessToken; // Access nested data
          const newRefreshToken = response.data.refreshToken; // Access nested data
          localStorage.setItem('accessToken', newAccessToken);
          localStorage.setItem('refreshToken', newRefreshToken);
           // Update Authorization header for subsequent requests
          api.defaults.headers.common['Authorization'] = `Bearer ${newAccessToken}`;
        } else {
           console.warn('[AuthContext] No refresh token found during interval refresh.');
           logout(); // Logout if refresh token is missing
        }
      } catch (error) {
        console.error('[AuthContext] Failed to refresh token during interval:', error);
        logout(); // Logout on refresh failure
      }
    }, REFRESH_INTERVAL);

    return () => {
      console.log('[AuthContext] Clearing token refresh interval.');
      clearInterval(intervalId);
    };
  }, [isLoading, user, logout]); // Re-run if loading state or user changes

  // --- Login Function ---
  const login = async (email: string, password: string) => {
    try {
      console.log('[AuthContext] Attempting login...');
      const response = await loginUser(email, password); // Use dedicated function
      const userData: User = {
        id: response._id || response.id,
        email: response.email,
      };
      setUser(userData);
      localStorage.setItem('user', JSON.stringify(userData));
      localStorage.setItem('accessToken', response.accessToken);
      localStorage.setItem('refreshToken', response.refreshToken);
      // Set Authorization header immediately after login
      api.defaults.headers.common['Authorization'] = `Bearer ${response.accessToken}`;
      setLastActivity(Date.now()); // Reset activity timer on login
      console.log('[AuthContext] Login successful.');
    } catch (error) {
      console.error('[AuthContext] Login error:', error);
      // Clear any potentially partially set state
      logout(); // Use logout to ensure clean state
      throw error; // Re-throw error for the component to handle
    }
  };

  // --- Register Function ---
  const register = async (email: string, password: string) => {
     // NOTE: Registration is disabled on the backend (authRoutes.ts),
     // so this will likely always fail with a 403.
     // Keeping the function structure for completeness.
    try {
      console.log('[AuthContext] Attempting registration...');
      const response = await registerUser(email, password); // Use dedicated function
       // Assuming successful registration also logs the user in
      const userData: User = {
        id: response._id || response.id,
        email: response.email,
      };
      setUser(userData);
      localStorage.setItem('user', JSON.stringify(userData));
      localStorage.setItem('accessToken', response.accessToken);
      localStorage.setItem('refreshToken', response.refreshToken);
      api.defaults.headers.common['Authorization'] = `Bearer ${response.accessToken}`;
      setLastActivity(Date.now());
      console.log('[AuthContext] Registration successful (if enabled backend).');
    } catch (error) {
      console.error('[AuthContext] Register error:', error);
      logout(); // Clean up state on failure
      throw error;
    }
  };

  // Provide state and functions through context
  return (
    <AuthContext.Provider value={{ user, login, register, logout, isAuthenticated: !!user, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
};

// Custom hook to use the AuthContext
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

