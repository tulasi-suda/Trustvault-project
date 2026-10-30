import React, { useState, useEffect } from 'react';
import {
  FileText,
  Share2,
  ShieldCheck,
  UploadCloud,
  CheckCircle2,
  Clock,
  ArrowRight,
} from 'lucide-react';
import { apiRequest } from '../utils/api';

export default function Dashboard({ user, onNavigate, onOpenUpload }) {
  const [stats, setStats] = useState({
    myDocsCount: 0,
    sharedCount: 0,
    recentDocs: [],
  });
  const [loading, setLoading] = useState(true);

  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    async function loadStats() {
      try {
        const [docsRes, sharedRes] = await Promise.all([
          apiRequest('/api/documents?scope=mine'),
          apiRequest('/api/documents?scope=shared'),
        ]);

        const myDocs = docsRes.documents || [];
        const sharedDocs = sharedRes.documents || [];

        setStats({
          myDocsCount: myDocs.length,
          sharedCount: sharedDocs.length,
          recentDocs: [...myDocs, ...sharedDocs].slice(0, 5),
        });
      } catch (err) {
        console.error('Dashboard stats error:', err.message);
      } finally {
        setLoading(false);
      }
    }

    loadStats();
  }, []);

  return (
    <div className="page-wrapper">
      {/* Welcome Banner */}
      <div className="glass-panel" style={{
        padding: '2rem 2.5rem',
        marginBottom: '2rem',
        background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.16), rgba(8, 18, 42, 0.85))',
        border: '1px solid rgba(56, 189, 248, 0.28)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '1.5rem',
      }}>
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <span style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: '#38bdf8',
              boxShadow: '0 0 10px #38bdf8',
            }} />
            <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#38bdf8', letterSpacing: '0.05em' }}>
              System Integrity Verified
            </span>
          </div>
          <h1 style={{ fontSize: '1.875rem', fontWeight: 800, color: '#f8fafc', letterSpacing: '-0.02em' }}>
            Welcome back, {user?.full_name || user?.username}!
          </h1>
          <p style={{ color: '#94a3b8', fontSize: '0.9375rem', marginTop: '0.25rem' }}>
            TrustVault secures all documents with raw SQL parameters, transactional hash-chaining, and strict access controls.
          </p>
        </div>

        {!isAdmin && (
          <button onClick={onOpenUpload} className="btn btn-primary" style={{ padding: '0.75rem 1.25rem' }}>
            <UploadCloud size={18} />
            <span>Upload New Document</span>
          </button>
        )}
      </div>

      {/* Metric Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: '1.5rem',
        marginBottom: '2.5rem',
      }}>
        {/* Card 1: Documents */}
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
            <div>
              <p style={{ fontSize: '0.8125rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>
                {isAdmin ? 'All Stored Documents' : 'My Documents'}
              </p>
              <h3 style={{ fontSize: '2rem', fontWeight: 800, color: '#f8fafc', marginTop: '0.25rem' }}>
                {loading ? '—' : stats.myDocsCount}
              </h3>
            </div>
            <div style={{
              padding: '0.75rem',
              borderRadius: '10px',
              background: 'rgba(37, 99, 235, 0.12)',
              border: '1px solid rgba(56, 189, 248, 0.22)',
            }}>
              <FileText size={22} color="#38bdf8" />
            </div>
          </div>
          <button
            onClick={() => onNavigate(isAdmin ? 'all_documents' : 'my_documents')}
            style={{
              background: 'none',
              border: 'none',
              color: '#38bdf8',
              fontSize: '0.8125rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.375rem',
            }}
          >
            <span>View repository</span>
            <ArrowRight size={14} />
          </button>
        </div>

        {/* Card 2: Shared Documents */}
        {!isAdmin && (
          <div className="glass-panel" style={{ padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
              <div>
                <p style={{ fontSize: '0.8125rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>
                  Shared With Me
                </p>
                <h3 style={{ fontSize: '2rem', fontWeight: 800, color: '#f8fafc', marginTop: '0.25rem' }}>
                  {loading ? '—' : stats.sharedCount}
                </h3>
              </div>
              <div style={{
                padding: '0.75rem',
                borderRadius: '10px',
                background: 'rgba(59, 130, 246, 0.12)',
                border: '1px solid rgba(59, 130, 246, 0.25)',
              }}>
                <Share2 size={22} color="#60a5fa" />
              </div>
            </div>
            <button
              onClick={() => onNavigate('shared_with_me')}
              style={{
                background: 'none',
                border: 'none',
                color: '#60a5fa',
                fontSize: '0.8125rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.375rem',
              }}
            >
              <span>View shared access</span>
              <ArrowRight size={14} />
            </button>
          </div>
        )}

        {/* Card 3: Cryptographic Status */}
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
            <div>
              <p style={{ fontSize: '0.8125rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>
                Audit Integrity
              </p>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#38bdf8', marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <CheckCircle2 size={20} />
                <span>SHA-256 Chained</span>
              </h3>
            </div>
            <div style={{
              padding: '0.75rem',
              borderRadius: '10px',
              background: 'rgba(37, 99, 235, 0.12)',
              border: '1px solid rgba(56, 189, 248, 0.22)',
            }}>
              <ShieldCheck size={22} color="#38bdf8" />
            </div>
          </div>
          <p style={{ fontSize: '0.75rem', color: '#64748b' }}>
            Advisory locks prevent concurrency races on tamper-evident log rows.
          </p>
        </div>
      </div>

      {/* Recent Documents Table */}
      <div className="glass-panel" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Clock size={18} color="#38bdf8" />
            <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#f8fafc' }}>
              Recently Active Documents
            </h3>
          </div>
          <button
            onClick={() => onNavigate(isAdmin ? 'all_documents' : 'my_documents')}
            className="btn btn-secondary btn-sm"
          >
            View All
          </button>
        </div>

        {loading ? (
          <p style={{ color: '#64748b', fontSize: '0.875rem' }}>Loading recent activity...</p>
        ) : stats.recentDocs.length === 0 ? (
          <p style={{ color: '#64748b', fontSize: '0.875rem', fontStyle: 'italic' }}>
            No recent documents uploaded yet.
          </p>
        ) : (
          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Category</th>
                  <th>Fingerprint</th>
                  <th>Owner</th>
                  <th>Permission</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentDocs.map(doc => (
                  <tr key={doc.id}>
                    <td style={{ fontWeight: 600, color: '#f8fafc' }}>{doc.title}</td>
                    <td>
                      <span className={`badge badge-${doc.category}`}>{doc.category}</span>
                    </td>
                    <td>
                      <span className="fingerprint-tag">{doc.sha256 ? doc.sha256.slice(0, 12) : '—'}</span>
                    </td>
                    <td style={{ color: '#94a3b8' }}>{doc.owner_username}</td>
                    <td>
                      <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 700, color: '#38bdf8' }}>
                        {doc.my_permission}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
