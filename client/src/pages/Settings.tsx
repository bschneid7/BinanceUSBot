import React, { useState } from 'react';
import { changePassword } from '../api/api';
import './Settings.css';

const Settings: React.FC = () => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (newPassword.length < 8) {
      setMessage({ type: 'error', text: 'New password must be at least 8 characters long' });
      return;
    }

    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'New passwords do not match' });
      return;
    }

    setLoading(true);

    try {
      await changePassword(currentPassword, newPassword);
      setMessage({ type: 'success', text: '✅ Password changed successfully! Logging out...' });
      
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');

      setTimeout(() => {
        localStorage.clear();
        window.location.href = '/';
      }, 2000);
    } catch (error: any) {
      setMessage({ 
        type: 'error', 
        text: '❌ ' + (error.response?.data?.message || 'Failed to change password') 
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="settings-container">
      <h2>⚙️ Account Settings</h2>
      
      <div className="settings-section">
        <h3>🔐 Change Password</h3>
        <p className="section-description">Update your account password. You'll be logged out after changing it.</p>
        
        <form onSubmit={handlePasswordChange} className="password-form">
          <div className="form-group">
            <label htmlFor="currentPassword">Current Password</label>
            <input
              type="password"
              id="currentPassword"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              disabled={loading}
              placeholder="Enter current password"
            />
          </div>

          <div className="form-group">
            <label htmlFor="newPassword">New Password</label>
            <input
              type="password"
              id="newPassword"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              disabled={loading}
              minLength={8}
              placeholder="Enter new password (min 8 characters)"
            />
            <small>Must be at least 8 characters</small>
          </div>

          <div className="form-group">
            <label htmlFor="confirmPassword">Confirm New Password</label>
            <input
              type="password"
              id="confirmPassword"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              disabled={loading}
              placeholder="Re-enter new password"
            />
          </div>

          {message && (
            <div className={`message ${message.type}`}>
              {message.text}
            </div>
          )}

          <button type="submit" className="submit-button" disabled={loading}>
            {loading ? '⏳ Changing Password...' : '🔄 Change Password'}
          </button>
        </form>
      </div>

      <div className="settings-section">
        <h3>🛡️ Security Information</h3>
        <div className="info-box">
          <p><strong>🔒 Registration:</strong> DISABLED - Only you can log in</p>
          <p><strong>⏱️ Session Timeout:</strong> 15 minutes of inactivity</p>
          <p><strong>🎫 Token Expiration:</strong> 1 hour (auto-refreshed)</p>
          <p><strong>📅 Maximum Session:</strong> 7 days</p>
        </div>
      </div>
    </div>
  );
};

export default Settings;
