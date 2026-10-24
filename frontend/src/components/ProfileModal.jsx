import React, { useState } from 'react';
import { X, User, Lock, AlertCircle, Check, Shield } from 'lucide-react';
import { apiRequest } from '../utils/api';

export default function ProfileModal({ user, onClose, onUserUpdated }) {
  const [activeTab, setActiveTab] = useState('profile');

  // Profile fields
  const [username, setUsername] = useState(user?.username || '');
  const [fullName, setFullName] = useState(user?.full_name || '');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState('');
  const [profileError, setProfileError] = useState('');

  // Password fields
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [passwordError, setPasswordError] = useState('');

  async function handleUpdateProfile(e) {
    e.preventDefault();
    setProfileSaving(true);
    setProfileError('');
    setProfileSuccess('');

    try {
      const res = await apiRequest('/api/profile', {
        method: 'PATCH',
        body: {
          username: username.trim(),
          full_name: fullName.trim(),
        },
      });

      setProfileSuccess('Profile updated successfully');
      if (onUserUpdated) onUserUpdated(res.user);
    } catch (err) {
      setProfileError(err.message);
    } finally {
      setProfileSaving(false);
    }
  }

  async function handleUpdatePassword(e) {
    e.preventDefault();
    if (newPassword.length < 10 || !/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      setPasswordError('New password must be at least 10 characters long with a letter and a number');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setPasswordError('New passwords do not match');
      return;
    }

    setPasswordSaving(true);
    setPasswordError('');
    setPasswordSuccess('');

    try {
      await apiRequest('/api/profile/password', {
        method: 'POST',
        body: {
          currentPassword,
          newPassword,
          confirmNewPassword,
        },
      });

      setPasswordSuccess('Password updated. All other active sessions have been invalidated.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
    } catch (err) {
      setPasswordError(err.message);
    } finally {
      setPasswordSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '520px' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '1.25rem 1.5rem',
          borderBottom: '1px solid rgba(16, 185, 129, 0.15)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            <User size={20} color="#10b981" />
            <h3 style={{ fontSize: '1.125rem', fontWeight: 700 }}>Account & Profile</h3>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
            <X size={20} />
          </button>
        </div>

        {/* Tab switch */}
        <div style={{
          display: 'flex',
          borderBottom: '1px solid rgba(16, 185, 129, 0.15)',
          background: 'rgba(6, 17, 13, 0.4)',
        }}>
          <button
            onClick={() => setActiveTab('profile')}
            style={{
              flex: 1,
              padding: '0.75rem',
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'profile' ? '2px solid #10b981' : 'none',
              color: activeTab === 'profile' ? '#34d399' : '#94a3b8',
              fontWeight: 600,
              fontSize: '0.875rem',
              cursor: 'pointer',
            }}
          >
            Profile Information
          </button>
          <button
            onClick={() => setActiveTab('password')}
            style={{
              flex: 1,
              padding: '0.75rem',
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'password' ? '2px solid #10b981' : 'none',
              color: activeTab === 'password' ? '#34d399' : '#94a3b8',
              fontWeight: 600,
              fontSize: '0.875rem',
              cursor: 'pointer',
            }}
          >
            Change Password
          </button>
        </div>

        <div style={{ padding: '1.5rem' }}>
          {activeTab === 'profile' && (
            <form onSubmit={handleUpdateProfile}>
              {profileError && (
                <div className="alert alert-error">
                  <AlertCircle size={18} />
                  <span>{profileError}</span>
                </div>
              )}
              {profileSuccess && (
                <div className="alert alert-success">
                  <Check size={18} />
                  <span>{profileSuccess}</span>
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Email Address (Non-changeable)</label>
                <input
                  type="email"
                  className="form-input"
                  value={user?.email || ''}
                  disabled
                  style={{ opacity: 0.65, cursor: 'not-allowed' }}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Username</label>
                <input
                  type="text"
                  className="form-input"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Full Name</label>
                <input
                  type="text"
                  className="form-input"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  required
                />
              </div>

              <div style={{
                padding: '0.75rem',
                borderRadius: '8px',
                background: 'rgba(6, 17, 13, 0.6)',
                border: '1px solid rgba(16, 185, 129, 0.1)',
                marginBottom: '1.5rem',
                fontSize: '0.8125rem',
                color: '#94a3b8',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}>
                <Shield size={16} color="#10b981" />
                <span>Account Role: <strong style={{ color: '#f8fafc', textTransform: 'uppercase' }}>{user?.role}</strong></span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button type="button" onClick={onClose} className="btn btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={profileSaving}>
                  {profileSaving ? 'Saving...' : 'Save Profile'}
                </button>
              </div>
            </form>
          )}

          {activeTab === 'password' && (
            <form onSubmit={handleUpdatePassword}>
              {passwordError && (
                <div className="alert alert-error">
                  <AlertCircle size={18} />
                  <span>{passwordError}</span>
                </div>
              )}
              {passwordSuccess && (
                <div className="alert alert-success">
                  <Check size={18} />
                  <span>{passwordSuccess}</span>
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Current Password *</label>
                <input
                  type="password"
                  className="form-input"
                  value={currentPassword}
                  onChange={e => setCurrentPassword(e.target.value)}
                  placeholder="••••••••••••"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">New Password * (Min 10 chars, letter + number)</label>
                <input
                  type="password"
                  className="form-input"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="••••••••••••"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Confirm New Password *</label>
                <input
                  type="password"
                  className="form-input"
                  value={confirmNewPassword}
                  onChange={e => setConfirmNewPassword(e.target.value)}
                  placeholder="••••••••••••"
                  required
                />
              </div>

              <p style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '1.5rem' }}>
                Note: Updating your password will immediately terminate all other active login sessions.
              </p>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button type="button" onClick={onClose} className="btn btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={passwordSaving}>
                  {passwordSaving ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
