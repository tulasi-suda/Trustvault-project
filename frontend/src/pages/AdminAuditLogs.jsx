import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Check,
  RefreshCw,
  Search,
  Filter,
  Eye,
  FileDown,
  Lock,
} from 'lucide-react';
import { apiRequest } from '../utils/api';

export default function AdminAuditLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [actionFilter, setActionFilter] = useState('');
  const [actorFilter, setActorFilter] = useState('');
  const [resultFilter, setResultFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });

  // Verification & Head
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState(null);
  const [headHash, setHeadHash] = useState('');
  const [copiedHead, setCopiedHead] = useState(false);

  // Worth Noticing
  const [worthNoticing, setWorthNoticing] = useState({
    repeatedDenials: [],
    highDownloads: [],
    failedLoginsByIp: [],
  });
  const [loadingWorthNoticing, setLoadingWorthNoticing] = useState(true);

  useEffect(() => {
    fetchLogs();
    fetchHead();
    fetchWorthNoticing();
  }, [page]);

  async function fetchLogs() {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (actionFilter) q.set('action', actionFilter);
      if (actorFilter) q.set('actor', actorFilter);
      if (resultFilter) q.set('result', resultFilter);
      q.set('page', page);
      q.set('limit', 25);

      const res = await apiRequest(`/api/admin/audit?${q.toString()}`);
      setLogs(res.logs || []);
      setPagination(res.pagination || { page: 1, totalPages: 1, total: 0 });
    } catch (err) {
      setError(err.message || 'Failed to load audit trail');
    } finally {
      setLoading(false);
    }
  }

  async function fetchHead() {
    try {
      const res = await apiRequest('/api/admin/audit/head');
      setHeadHash(res.head || '');
    } catch (err) {
      console.error('Failed to load audit head:', err.message);
    }
  }

  async function fetchWorthNoticing() {
    setLoadingWorthNoticing(true);
    try {
      const res = await apiRequest('/api/admin/worth-noticing');
      setWorthNoticing(res);
    } catch (err) {
      console.error('Failed to load worth noticing:', err.message);
    } finally {
      setLoadingWorthNoticing(false);
    }
  }

  async function handleVerifyIntegrity() {
    setVerifying(true);
    setVerifyResult(null);
    try {
      const res = await apiRequest('/api/admin/audit/verify');
      setVerifyResult(res);
    } catch (err) {
      setVerifyResult({ ok: false, error: err.message });
    } finally {
      setVerifying(false);
    }
  }

  function copyHeadHash() {
    if (!headHash) return;
    navigator.clipboard.writeText(headHash);
    setCopiedHead(true);
    setTimeout(() => setCopiedHead(false), 2000);
  }

  return (
    <div className="page-wrapper">
      {/* Page Title */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '1.75rem',
        flexWrap: 'wrap',
        gap: '1rem',
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <ShieldAlert size={24} color="#38bdf8" />
            <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#f8fafc' }}>
              Cryptographic Audit Trail & Activity Logs
            </h2>
          </div>
          <p style={{ color: '#94a3b8', fontSize: '0.875rem', marginTop: '0.25rem' }}>
            Append-only, hash-chained ledger protected by database trigger exceptions and serialized advisory locks.
          </p>
        </div>

        <button
          onClick={handleVerifyIntegrity}
          disabled={verifying}
          className="btn btn-primary"
          style={{ padding: '0.75rem 1.25rem' }}
        >
          <RefreshCw size={16} className={verifying ? 'animate-spin' : ''} />
          <span>{verifying ? 'Recalculating Chain...' : 'Verify Chain Integrity'}</span>
        </button>
      </div>

      {/* Chain Status & Head Banner */}
      <div className="glass-panel" style={{
        padding: '1.25rem 1.75rem',
        marginBottom: '2rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '1rem',
        background: 'rgba(8, 20, 48, 0.7)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{
            padding: '0.625rem',
            borderRadius: '10px',
            background: 'rgba(37, 99, 235, 0.16)',
            border: '1px solid rgba(56, 189, 248, 0.3)',
          }}>
            <ShieldCheck size={24} color="#38bdf8" />
          </div>
          <div>
            <p style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#94a3b8', fontWeight: 700 }}>
              Audit Chain Head (Latest SHA-256 Hash)
            </p>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.875rem', color: '#38bdf8', wordBreak: 'break-all' }}>
              {headHash || 'Genesis (0'.padEnd(64, '0') + ')'}
            </p>
          </div>
        </div>

        <button
          onClick={copyHeadHash}
          className="btn btn-secondary btn-sm"
          title="Copy 64-char latest hash"
        >
          {copiedHead ? <Check size={14} color="#38bdf8" /> : <Copy size={14} />}
          <span>{copiedHead ? 'Copied' : 'Copy Head'}</span>
        </button>
      </div>

      {/* Verification Result Feedback */}
      {verifyResult && (
        <div style={{ marginBottom: '2rem' }}>
          {verifyResult.ok ? (
            <div className="alert alert-success" style={{ padding: '1rem 1.25rem' }}>
              <CheckCircle2 size={22} color="#38bdf8" />
              <div>
                <strong style={{ fontSize: '0.9375rem', display: 'block' }}>
                  Cryptographic Chain Verification Successful
                </strong>
                <p style={{ fontSize: '0.8125rem', color: '#cbd5e1', marginTop: '0.25rem' }}>
                  All {verifyResult.count} consecutive log entries were recomputed from genesis ('0'x64). No broken IDs, tampered payloads, or disconnected links detected.
                </p>
              </div>
            </div>
          ) : (
            <div className="alert alert-error" style={{ padding: '1rem 1.25rem' }}>
              <AlertTriangle size={22} color="#ef4444" />
              <div>
                <strong style={{ fontSize: '0.9375rem', display: 'block' }}>
                  Audit Chain Compromised! Tampering Detected
                </strong>
                <p style={{ fontSize: '0.8125rem', color: '#fca5a5', marginTop: '0.25rem' }}>
                  Reason: {verifyResult.error}. First broken row ID: {verifyResult.firstBrokenId}. The cryptographic chain failed validation.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Worth Noticing Security Panel */}
      <div className="glass-panel" style={{
        padding: '1.5rem',
        marginBottom: '2rem',
        border: '1px solid rgba(245, 158, 11, 0.3)',
        background: 'rgba(20, 20, 10, 0.45)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
          <AlertTriangle size={18} color="#f59e0b" />
          <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#fbbf24' }}>
            Security Watch: 'Worth Noticing' Activity (Last 1 Hour)
          </h3>
        </div>

        {loadingWorthNoticing ? (
          <p style={{ fontSize: '0.8125rem', color: '#94a3b8' }}>Checking security thresholds...</p>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: '1.25rem',
          }}>
            {/* 1. Repeated Denials (>= 5 in 1 hr) */}
            <div style={{
              background: 'rgba(6, 17, 13, 0.6)',
              padding: '1rem',
              borderRadius: '8px',
              border: '1px solid rgba(239, 68, 68, 0.2)',
            }}>
              <p style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#f87171', fontWeight: 700, marginBottom: '0.5rem' }}>
                Repeated Denials (≥ 5 / hr)
              </p>
              {worthNoticing.repeatedDenials.length === 0 ? (
                <p style={{ fontSize: '0.8125rem', color: '#64748b', fontStyle: 'italic' }}>
                  None detected. All access normal.
                </p>
              ) : (
                worthNoticing.repeatedDenials.map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', marginBottom: '0.25rem' }}>
                    <span style={{ color: '#f8fafc', fontWeight: 600 }}>{item.actor_label}</span>
                    <span style={{ color: '#ef4444', fontWeight: 700 }}>{item.count} denials</span>
                  </div>
                ))
              )}
            </div>

            {/* 2. High Downloads (>= 10 in 1 hr) */}
            <div style={{
              background: 'rgba(6, 17, 13, 0.6)',
              padding: '1rem',
              borderRadius: '8px',
              border: '1px solid rgba(59, 130, 246, 0.2)',
            }}>
              <p style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#60a5fa', fontWeight: 700, marginBottom: '0.5rem' }}>
                High Download Volume (≥ 10 / hr)
              </p>
              {worthNoticing.highDownloads.length === 0 ? (
                <p style={{ fontSize: '0.8125rem', color: '#64748b', fontStyle: 'italic' }}>
                  No bulk downloads in the past hour.
                </p>
              ) : (
                worthNoticing.highDownloads.map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', marginBottom: '0.25rem' }}>
                    <span style={{ color: '#f8fafc', fontWeight: 600 }}>{item.actor_label}</span>
                    <span style={{ color: '#60a5fa', fontWeight: 700 }}>{item.count} downloads</span>
                  </div>
                ))
              )}
            </div>

            {/* 3. Failed Logins by IP (> 10 in 1 hr) */}
            <div style={{
              background: 'rgba(6, 17, 13, 0.6)',
              padding: '1rem',
              borderRadius: '8px',
              border: '1px solid rgba(245, 158, 11, 0.2)',
            }}>
              <p style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#fbbf24', fontWeight: 700, marginBottom: '0.5rem' }}>
                Failed Login Spikes (&gt; 10 / hr by IP)
              </p>
              {worthNoticing.failedLoginsByIp.length === 0 ? (
                <p style={{ fontSize: '0.8125rem', color: '#64748b', fontStyle: 'italic' }}>
                  No brute-force spikes detected.
                </p>
              ) : (
                worthNoticing.failedLoginsByIp.map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', marginBottom: '0.25rem' }}>
                    <span style={{ color: '#f8fafc', fontFamily: 'var(--font-mono)' }}>{item.ip}</span>
                    <span style={{ color: '#f59e0b', fontWeight: 700 }}>{item.count} failed</span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Audit Log Filters */}
      <div className="glass-panel" style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
        <form onSubmit={e => { e.preventDefault(); setPage(1); fetchLogs(); }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '0.75rem',
            alignItems: 'flex-end',
          }}>
            <div>
              <label className="form-label">Action</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. login, download..."
                value={actionFilter}
                onChange={e => setActionFilter(e.target.value)}
              />
            </div>

            <div>
              <label className="form-label">Actor Username</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. alice_01"
                value={actorFilter}
                onChange={e => setActorFilter(e.target.value)}
              />
            </div>

            <div>
              <label className="form-label">Result</label>
              <select
                className="form-select"
                value={resultFilter}
                onChange={e => setResultFilter(e.target.value)}
              >
                <option value="">All Results</option>
                <option value="success">Success</option>
                <option value="failure">Failure</option>
                <option value="denied">Denied</option>
              </select>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={() => {
                  setActionFilter('');
                  setActorFilter('');
                  setResultFilter('');
                  setPage(1);
                  fetchLogs();
                }}
                className="btn btn-secondary"
                style={{ flex: 1 }}
              >
                Reset
              </button>
              <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                <Search size={16} />
                <span>Filter</span>
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Audit Logs Table */}
      <div className="glass-panel" style={{ overflow: 'hidden' }}>
        <div style={{
          padding: '1rem 1.5rem',
          borderBottom: '1px solid rgba(16, 185, 129, 0.15)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#f8fafc' }}>
            Event Log Entries ({pagination.total})
          </h3>
          <span style={{ fontSize: '0.8125rem', color: '#94a3b8' }}>
            Page {pagination.page} of {pagination.totalPages || 1}
          </span>
        </div>

        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
            <p>Loading audit ledger...</p>
          </div>
        ) : logs.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
            <p>No audit log entries matched your filter.</p>
          </div>
        ) : (
          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Timestamp</th>
                  <th>Actor</th>
                  <th>Action</th>
                  <th>Result</th>
                  <th>IP Address</th>
                  <th>Prev Hash</th>
                  <th>Current Hash</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => (
                  <tr key={log.id}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: '#94a3b8' }}>
                      #{log.id}
                    </td>
                    <td style={{ fontSize: '0.75rem', color: '#cbd5e1', whiteSpace: 'nowrap' }}>
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td style={{ fontWeight: 600, color: '#f8fafc' }}>
                      {log.actor_label}
                    </td>
                    <td>
                      <span style={{
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        padding: '0.2rem 0.5rem',
                        borderRadius: '4px',
                        background: 'rgba(37, 99, 235, 0.14)',
                        color: '#38bdf8',
                        fontFamily: 'var(--font-mono)',
                      }}>
                        {log.action}
                      </span>
                    </td>
                    <td>
                      <span style={{
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        padding: '0.125rem 0.375rem',
                        borderRadius: '4px',
                        background: log.result === 'success'
                          ? 'rgba(37, 99, 235, 0.18)'
                          : log.result === 'denied'
                          ? 'rgba(239, 68, 68, 0.15)'
                          : 'rgba(245, 158, 11, 0.15)',
                        color: log.result === 'success'
                          ? '#38bdf8'
                          : log.result === 'denied'
                          ? '#f87171'
                          : '#fbbf24',
                      }}>
                        {log.result}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.75rem', color: '#94a3b8', fontFamily: 'var(--font-mono)' }}>
                      {log.ip}
                    </td>
                    <td>
                      <span className="fingerprint-tag" title={log.prev_hash}>
                        {log.prev_hash ? log.prev_hash.slice(0, 8) + '...' : '—'}
                      </span>
                    </td>
                    <td>
                      <span className="fingerprint-tag" title={log.hash}>
                        {log.hash ? log.hash.slice(0, 8) + '...' : '—'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0.875rem 1.5rem',
            borderTop: '1px solid rgba(16, 185, 129, 0.1)',
          }}>
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className="btn btn-secondary btn-sm"
            >
              Previous
            </button>
            <span style={{ fontSize: '0.8125rem', color: '#94a3b8' }}>
              Page {page} of {pagination.totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
              disabled={page >= pagination.totalPages || loading}
              className="btn btn-secondary btn-sm"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
