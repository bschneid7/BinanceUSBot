import { useState } from 'react';
import { changePassword } from '../api/api';

export function Account() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
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
      setMessage({ type: 'success', text: '✅ Password changed! Logging out in 2 seconds...' });
      
      setTimeout(() => {
        localStorage.clear();
        window.location.href = '/';
      }, 2000);
    } catch (error: any) {
      setMessage({ 
        type: 'error', 
        text: error.response?.data?.message || 'Failed to change password' 
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '600px', margin: '2rem auto', padding: '2rem' }}>
      <h1 style={{ fontSize: '2rem', marginBottom: '2rem' }}>⚙️ Account Settings</h1>
      
      <div style={{ background: 'white', padding: '2rem', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
        <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>🔐 Change Password</h2>
        <p style={{ color: '#666', marginBottom: '1.5rem' }}>
          Update your account password. You'll be logged out after changing it.
        </p>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
              Current Password
            </label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              disabled={loading}
              style={{ 
                width: '100%', 
                padding: '0.75rem', 
                border: '1px solid #ddd', 
                borderRadius: '4px',
                fontSize: '1rem'
              }}
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
              New Password
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              disabled={loading}
              minLength={8}
              style={{ 
                width: '100%', 
                padding: '0.75rem', 
                border: '1px solid #ddd', 
                borderRadius: '4px',
                fontSize: '1rem'
              }}
            />
            <small style={{ color: '#888', fontSize: '0.875rem' }}>Must be at least 8 characters</small>
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
              Confirm New Password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              disabled={loading}
              style={{ 
                width: '100%', 
                padding: '0.75rem', 
                border: '1px solid #ddd', 
                borderRadius: '4px',
                fontSize: '1rem'
              }}
            />
          </div>

          {message && (
            <div style={{
              padding: '1rem',
              borderRadius: '4px',
              marginBottom: '1rem',
              background: message.type === 'success' ? '#d4edda' : '#f8d7da',
              color: message.type === 'success' ? '#155724' : '#721c24',
              border: `1px solid ${message.type === 'success' ? '#c3e6cb' : '#f5c6cb'}`
            }}>
              {message.text}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '0.75rem',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '1rem',
              fontWeight: '500',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1
            }}
          >
            {loading ? '⏳ Changing Password...' : '🔄 Change Password'}
          </button>
        </form>

        <div style={{ 
          marginTop: '1.5rem', 
          padding: '1rem', 
          background: '#f8f9fa', 
          borderRadius: '6px',
          borderLeft: '4px solid #667eea'
        }}>
          <h4 style={{ fontWeight: '600', marginBottom: '0.5rem' }}>🛡️ Security Information</h4>
          <ul style={{ fontSize: '0.875rem', color: '#555', lineHeight: '1.8', paddingLeft: '1.5rem' }}>
            <li><strong>🔒 Registration:</strong> DISABLED - Only you can log in</li>
            <li><strong>⏱️ Session Timeout:</strong> 15 minutes of inactivity</li>
            <li><strong>🎫 Token Expiration:</strong> 1 hour (auto-refreshed)</li>
            <li><strong>📅 Maximum Session:</strong> 7 days</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
