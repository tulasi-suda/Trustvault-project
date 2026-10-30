import React, { useState, useEffect } from 'react';
import { Search, Filter, Calendar, FileText, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import { apiRequest } from '../utils/api';

const CATEGORIES = ['All', 'General', 'Finance', 'HR', 'Legal', 'IT', 'Education', 'Personal'];

export default function SearchPage({ isAdmin = false }) {
  const [name, setName] = useState('');
  const [owner, setOwner] = useState('');
  const [category, setCategory] = useState('All');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  const [results, setResults] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    handleSearch();
  }, [page, category]);

  async function handleSearch(e) {
    if (e) e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const queryParams = new URLSearchParams();
      if (name.trim()) queryParams.set('name', name.trim());
      if (owner.trim()) queryParams.set('owner', owner.trim());
      if (category !== 'All') queryParams.set('category', category);
      if (from) queryParams.set('from', from);
      if (to) queryParams.set('to', to);
      queryParams.set('page', page);
      queryParams.set('limit', 15);

      const res = await apiRequest(`/api/documents/search?${queryParams.toString()}`);
      setResults(res.documents || []);
      setPagination(res.pagination || { page: 1, totalPages: 1, total: 0 });
    } catch (err) {
      setError(err.message || 'Search failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleDownload(doc) {
    try {
      const res = await apiRequest(`/api/documents/${doc.id}/download`);
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.original_filename || 'document.bin';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert(`Download failed: ${err.message}`);
    }
  }

  return (
    <div className="page-wrapper">
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#f8fafc' }}>
          Secure Document Search
        </h2>
        <p style={{ color: '#94a3b8', fontSize: '0.875rem', marginTop: '0.25rem' }}>
          Filtered strictly in SQL based on your authenticated grants and ownership.
        </p>
      </div>

      {/* Filter panel */}
      <div className="glass-panel" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
        <form onSubmit={e => { setPage(1); handleSearch(e); }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '1rem',
            marginBottom: '1rem',
          }}>
            {/* Title / Name */}
            <div>
              <label className="form-label">Document Name / Title</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. Audit, Contract..."
                value={name}
                onChange={e => setName(e.target.value)}
              />
            </div>

            {/* Owner username */}
            <div>
              <label className="form-label">Owner Username</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. alice_01"
                value={owner}
                onChange={e => setOwner(e.target.value)}
              />
            </div>

            {/* Category dropdown */}
            <div>
              <label className="form-label">Category</label>
              <select
                className="form-select"
                value={category}
                onChange={e => { setCategory(e.target.value); setPage(1); }}
              >
                {CATEGORIES.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            {/* Date range from */}
            <div>
              <label className="form-label">From Date</label>
              <input
                type="date"
                className="form-input"
                value={from}
                onChange={e => setFrom(e.target.value)}
              />
            </div>

            {/* Date range to */}
            <div>
              <label className="form-label">To Date</label>
              <input
                type="date"
                className="form-input"
                value={to}
                onChange={e => setTo(e.target.value)}
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <button
              type="button"
              onClick={() => {
                setName('');
                setOwner('');
                setCategory('All');
                setFrom('');
                setTo('');
                setPage(1);
              }}
              className="btn btn-secondary"
            >
              Reset Filters
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              <Search size={16} />
              <span>{loading ? 'Searching...' : 'Search Documents'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Results Table */}
      <div className="glass-panel" style={{ overflow: 'hidden' }}>
        <div style={{
          padding: '1rem 1.5rem',
          borderBottom: '1px solid rgba(16, 185, 129, 0.15)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#f8fafc' }}>
            Search Results ({pagination.total})
          </h3>
          <span style={{ fontSize: '0.8125rem', color: '#94a3b8' }}>
            Page {pagination.page} of {pagination.totalPages || 1}
          </span>
        </div>

        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
            <p>Executing SQL-filtered search query...</p>
          </div>
        ) : results.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
            <p>No documents matched your search criteria.</p>
          </div>
        ) : (
          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Category</th>
                  <th>Fingerprint</th>
                  <th>Owner</th>
                  <th>Uploaded Date</th>
                  <th>Permission</th>
                  {!isAdmin && <th style={{ textAlign: 'right' }}>Download</th>}
                </tr>
              </thead>
              <tbody>
                {results.map(doc => (
                  <tr key={doc.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <FileText size={16} color="#10b981" />
                        <div>
                          <p style={{ fontWeight: 600, color: '#f8fafc' }}>{doc.title}</p>
                          <p style={{ fontSize: '0.75rem', color: '#64748b' }}>{doc.original_filename}</p>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`badge badge-${doc.category}`}>{doc.category}</span>
                    </td>
                    <td>
                      <span className="fingerprint-tag">{doc.sha256 ? doc.sha256.slice(0, 12) : '—'}</span>
                    </td>
                    <td style={{ color: '#cbd5e1' }}>{doc.owner_username}</td>
                    <td style={{ fontSize: '0.8125rem', color: '#94a3b8' }}>
                      {new Date(doc.created_at).toLocaleDateString()}
                    </td>
                    <td>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#34d399' }}>
                        {doc.my_permission}
                      </span>
                    </td>
                    {!isAdmin && (
                      <td style={{ textAlign: 'right' }}>
                        <button
                          onClick={() => handleDownload(doc)}
                          className="btn btn-secondary btn-sm"
                          title="Download document"
                        >
                          <Download size={14} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination controls */}
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
              <ChevronLeft size={16} />
              <span>Previous</span>
            </button>
            <span style={{ fontSize: '0.8125rem', color: '#94a3b8' }}>
              Page {page} of {pagination.totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
              disabled={page >= pagination.totalPages || loading}
              className="btn btn-secondary btn-sm"
            >
              <span>Next</span>
              <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
