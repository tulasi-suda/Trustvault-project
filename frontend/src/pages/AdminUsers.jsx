import React, { useState, useEffect } from 'react';
import { Users, Shield, UserX, UserCheck, AlertCircle, Check } from 'lucide-react';
import { apiRequest } from '../utils/api';

export default function AdminUsers({ currentUser }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [updatingId, setUpdatingId] = useState(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  async function fetchUsers() {
    setLoading(true);
    try {
      const res = await apiRequest('/api/admin/users');
      setUsers(res.users || []);
    } catch (err) {
      setError(err.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }

  async function handleToggleStatus(targetUser) {
    const newStatus = !targetUser.is_active;
    const actionLabel = newStatus ? 'enable' : 'disable';

    if (!window.confirm(`Are you sure you want to ${actionLabel} account "${targetUser.username}"?`)) {
      return;
    }

    setUpdatingId(targetUser.id);
    setError('');
    setSuccess('');

    try {
      const res = await apiRequest(`/api/admin/users/${targetUser.id}/status`, {
        method: 'PATCH',
        body: { is_active: newStatus },
      });

      setSuccess(res.message || `User ${targetUser.username} updated`);
      await fetchUsers();
    } catch (err) {
      setError(err.message || 'Failed to update user status');
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <div className="page-wrapper">
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Users size={24} color="#10b981" />
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#f8fafc' }}>
            System User Management
          </h2>
        </div>
        <p style={{ color: '#94a3b8', fontSize: '0.875rem', marginTop: '0.25rem' }}>
          Authorized administrative access control. Disabling an account immediately terminates active sessions in the database.
        </p>
      </div>

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

      <div className="glass-panel" style={{ overflow: 'hidden' }}>
        <div style={{
          padding: '1rem 1.5rem',
          borderBottom: '1px solid rgba(16, 185, 129, 0.15)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#f8fafc' }}>
            Registered Users ({users.length})
          </h3>
        </div>

        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
            <p>Loading users...</p>
          </div>
        ) : users.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
            <p>No users found in database.</p>
          </div>
        ) : (
          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Active Documents</th>
                  <th>Joined Date</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => {
                  const isSelf = u.id === currentUser?.id;
                  const isTargetAdmin = u.role === 'admin';
                  const canToggle = !isSelf && !isTargetAdmin;

                  return (
                    <tr key={u.id}>
                      <td>
                        <div>
                          <p style={{ fontWeight: 600, color: '#f8fafc' }}>{u.username}</p>
                          <p style={{ fontSize: '0.75rem', color: '#64748b' }}>{u.full_name}</p>
                        </div>
                      </td>
                      <td style={{ color: '#cbd5e1', fontSize: '0.8125rem' }}>{u.email}</td>
                      <td>
                        <span style={{
                          fontSize: '0.6875rem',
                          textTransform: 'uppercase',
                          fontWeight: 700,
                          padding: '0.125rem 0.5rem',
                          borderRadius: '9999px',
                          background: u.role === 'admin' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                          color: u.role === 'admin' ? '#fbbf24' : '#34d399',
                        }}>
                          {u.role}
                        </span>
                      </td>
                      <td>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.375rem',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          color: u.is_active ? '#34d399' : '#f87171',
                        }}>
                          <span style={{
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            background: u.is_active ? '#10b981' : '#ef4444',
                          }} />
                          {u.is_active ? 'Active' : 'Disabled'}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.8125rem', color: '#94a3b8' }}>
                        {u.document_count || 0}
                      </td>
                      <td style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                        {new Date(u.created_at).toLocaleDateString()}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {isSelf ? (
                          <span style={{ fontSize: '0.75rem', color: '#64748b', fontStyle: 'italic' }}>
                            Current User
                          </span>
                        ) : isTargetAdmin ? (
                          <span style={{ fontSize: '0.75rem', color: '#64748b', fontStyle: 'italic' }}>
                            Protected Admin
                          </span>
                        ) : (
                          <button
                            onClick={() => handleToggleStatus(u)}
                            disabled={updatingId === u.id}
                            className={`btn btn-sm ${u.is_active ? 'btn-danger' : 'btn-primary'}`}
                          >
                            {u.is_active ? <UserX size={14} /> : <UserCheck size={14} />}
                            <span>{u.is_active ? 'Disable' : 'Enable'}</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
