import React, { useState, useEffect } from 'react';
import { X, Users, Plus, Trash2, AlertCircle, Check } from 'lucide-react';
import { apiRequest } from '../utils/api';

export default function ManageAccessModal({ document, onClose, onUpdated }) {
  const [grants, setGrants] = useState([]);
  const [newEmail, setNewEmail] = useState('');
  const [newPermission, setNewPermission] = useState('read');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    fetchGrants();
  }, [document.id]);

  async function fetchGrants() {
    setLoading(true);
    try {
      const data = await apiRequest(`/api/documents/${document.id}/grants`);
      setGrants(data.grants || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleAddGrant(e) {
    e.preventDefault();
    const email = newEmail.trim().toLowerCase();
    if (!email) return;

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const res = await apiRequest(`/api/documents/${document.id}/grants`, {
        method: 'POST',
        body: { email, permission: newPermission },
      });
      setSuccess(`Access granted to ${res.grant.username || email}`);
      setNewEmail('');
      await fetchGrants();
      if (onUpdated) onUpdated();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdatePermission(userId, permission) {
    setSaving(true);
    setError('');
    try {
      await apiRequest(`/api/documents/${document.id}/grants/${userId}`, {
        method: 'PATCH',
        body: { permission },
      });
      await fetchGrants();
      if (onUpdated) onUpdated();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleRevoke(userId, username) {
    if (!window.confirm(`Revoke document access from ${username}?`)) return;

    setSaving(true);
    setError('');
    try {
      await apiRequest(`/api/documents/${document.id}/grants/${userId}`, {
        method: 'DELETE',
      });
      setSuccess(`Access revoked from ${username}`);
      await fetchGrants();
      if (onUpdated) onUpdated();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '1.25rem 1.5rem',
          borderBottom: '1px solid rgba(56, 189, 248, 0.16)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            <Users size={20} color="#38bdf8" />
            <h3 style={{ fontSize: '1.125rem', fontWeight: 700 }}>Manage Document Access</h3>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ padding: '1.5rem' }}>
          <p style={{ fontSize: '0.875rem', color: '#cbd5e1', marginBottom: '1rem' }}>
            Managing access for: <strong style={{ color: '#f8fafc' }}>{document.title}</strong>
          </p>

          {error && (
            <div className="alert alert-error">
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="alert alert-success">
              <Check size={18} />
              <span>{success}</span>
            </div>
          )}

          {/* Add new grant */}
          <form onSubmit={handleAddGrant} style={{ marginBottom: '1.5rem' }}>
            <label className="form-label" style={{ marginBottom: '0.5rem', display: 'block' }}>
              Grant access to another user
            </label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                type="email"
                className="form-input"
                style={{ flex: 1 }}
                placeholder="colleague@example.com"
                value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
                required
              />
              <select
                className="form-select"
                style={{ width: '110px' }}
                value={newPermission}
                onChange={e => setNewPermission(e.target.value)}
              >
                <option value="read">Read</option>
                <option value="edit">Edit</option>
              </select>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                <Plus size={16} />
                <span>Share</span>
              </button>
            </div>
          </form>

          {/* Existing grants */}
          <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#94a3b8', marginBottom: '0.75rem' }}>
            Current Document Permissions
          </h4>

          {loading ? (
            <p style={{ color: '#64748b', fontSize: '0.875rem' }}>Loading permissions...</p>
          ) : grants.length === 0 ? (
            <p style={{ color: '#64748b', fontSize: '0.875rem', fontStyle: 'italic' }}>
              Only you currently have access to this document.
            </p>
          ) : (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
              maxHeight: '260px',
              overflowY: 'auto',
            }}>
              {grants.map(grant => (
                <div
                  key={grant.user_id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.75rem 1rem',
                    background: 'rgba(6, 14, 32, 0.65)',
                    border: '1px solid rgba(56, 189, 248, 0.16)',
                    borderRadius: '8px',
                  }}
                >
                  <div>
                    <p style={{ fontSize: '0.875rem', fontWeight: 600, color: '#f8fafc' }}>
                      {grant.username}
                    </p>
                    <p style={{ fontSize: '0.75rem', color: '#64748b' }}>{grant.email}</p>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <select
                      className="form-select"
                      style={{ padding: '0.35rem 0.65rem', fontSize: '0.8125rem', width: '100px' }}
                      value={grant.permission}
                      onChange={e => handleUpdatePermission(grant.user_id, e.target.value)}
                      disabled={saving}
                    >
                      <option value="read">Read</option>
                      <option value="edit">Edit</option>
                    </select>

                    <button
                      type="button"
                      onClick={() => handleRevoke(grant.user_id, grant.username)}
                      className="btn btn-danger btn-sm"
                      title="Revoke access"
                      disabled={saving}
                    >
                      <Trash2 size={14} />
                      <span>Revoke</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop: '1.75rem', display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={onClose} className="btn btn-secondary">
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
