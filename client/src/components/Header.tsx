import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import './Header.css';

export const Header: React.FC = () => {
  const { user, logout } = useAuth();

  return (
    <header className="app-header">
      <div className="header-content">
        <div className="header-left">
          <h1>🤖 BinanceUS Trading Bot</h1>
        </div>
        
        <div className="header-right">
          {user && (
            <>
              <span className="user-email">👤 {user.email}</span>
              <button className="logout-button" onClick={logout}>
                🚪 Logout
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
