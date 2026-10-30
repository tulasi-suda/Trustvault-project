import React, { useState, useEffect } from 'react';
import {
  FileText,
  Download,
  Edit3,
  Users,
  Trash2,
  Copy,
  Check,
  Shield,
  AlertCircle,
  Filter,
} from 'lucide-react';
import { apiRequest } from '../utils/api';
import ManageAccessModal from '../components/ManageAccessModal';
import EditMetadataModal from '../components/EditMetadataModal';

export default function DocumentsView({ scope = 'all', title = 'Documents', isAdmin = false, onOpenUpload }) {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copiedId, setCopiedId] = useState(null);

  // Active modals
  const [managingDoc, setManagingDoc] = useState(null);
  const [editingDoc, setEditingDoc] = useState(null);

  useEffect(() => {
    fetchDocuments();
  }, [scope]);

  async function fetchDocuments() {
    setLoading(true);
    setError('');
    try {
      const data = await apiRequest(`/api/documents?scope=${scope}`);
      setDocuments(data.documents || []);
    } catch (err) {
      setError(err.message || 'Failed to load documents');
    } finally {
      setLoading(false);
    }
  }

  function copyFingerprint(docId, sha256) {
    navigator.clipboard.writeText(sha256);
    setCopiedId(docId);
    setTimeout(() => setCopiedId(null), 2000);
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

  async function handleDelete(doc) {
    if (!window.confirm(`Are you sure you want to delete "${doc.title}"? This soft-deletes the document for all users.`)) {
      return;
    }

    try {
      await apiRequest(`/api/documents/${doc.id}`, { method: 'DELETE' });
      fetchDocuments();
    } catch (err) {
      alert(`Delete failed: ${err.message}`);
    }
  }

  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  return (
    <div className="page-wrapper">
      {/* Page Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '1.75rem',
        flexWrap: 'wrap',
        gap: '1rem',
      }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#f8fafc' }}>{title}</h2>
          <p style={{ color: '#94a3b8', fontSize: '0.875rem', marginTop: '0.25rem' }}>
            {isAdmin
              ? 'Global administrative view (Metadata only; file contents are cryptographically restricted)'
              : `Showing ${documents.length} secure document${documents.length === 1 ? '' : 's'}`}
          </p>
        </div>

        {!isAdmin && onOpenUpload && (
          <button onClick={onOpenUpload} className="btn btn-primary">
            Upload Document
          </button>
        )}
      </div>

      {error && (
        <div className="alert alert-error">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* Documents Table */}
      <div className="glass-panel" style={{ overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
            <p>Loading documents...</p>
          </div>
        ) : documents.length === 0 ? (
          <div style={{ padding: '4rem 2rem', textAlign: 'center' }}>
            <FileText size={40} color="#059669" style={{ margin: '0 auto 1rem auto', opacity: 0.6 }} />
            <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#f8fafc', marginBottom: '0.5rem' }}>
              No documents found
            </h3>
            <p style={{ color: '#64748b', fontSize: '0.875rem', maxWidth: '400px', margin: '0 auto' }}>
              {isAdmin
                ? 'No documents currently exist in the database.'
                : 'Upload your first secure document or ask a colleague to grant you access.'}
            </p>
          </div>
        ) : (
          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Document</th>
                  <th>Category</th>
                  <th>SHA-256 Fingerprint</th>
                  <th>Size</th>
                  <th>Owner</th>
                  <th>My Access</th>
                  {!isAdmin && <th style={{ textAlign: 'right' }}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {documents.map(doc => {
                  const fingerprint = doc.sha256 ? doc.sha256.slice(0, 12) : '—';
                  const isOwner = doc.is_owner || doc.my_permission === 'owner';
                  const canEdit = isOwner || doc.my_permission === 'edit';
                  const canDownload = !isAdmin && (isOwner || doc.my_permission === 'read' || doc.my_permission === 'edit');

                  return (
                    <tr key={doc.id}>
                      {/* Document title and filename */}
                      <td>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                          <div style={{
                            padding: '0.5rem',
                            borderRadius: '8px',
                            background: 'rgba(16, 185, 129, 0.1)',
                            border: '1px solid rgba(16, 185, 129, 0.2)',
                            marginTop: '0.125rem',
                          }}>
                            <FileText size={18} color="#10b981" />
                          </div>
                          <div>
                            <p style={{ fontWeight: 600, color: '#f8fafc' }}>{doc.title}</p>
                            <p style={{ fontSize: '0.75rem', color: '#64748b' }}>{doc.original_filename}</p>
                            {doc.description && (
                              <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.25rem' }}>
                                {doc.description}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Category */}
                      <td>
                        <span className={`badge badge-${doc.category || 'General'}`}>
                          {doc.category || 'General'}
                        </span>
                      </td>

                      {/* Cryptographic SHA-256 Fingerprint */}
                      <td>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem' }}>
                          <span className="fingerprint-tag">{fingerprint}</span>
                          <button
                            type="button"
                            onClick={() => copyFingerprint(doc.id, doc.sha256)}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: copiedId === doc.id ? '#10b981' : '#64748b',
                              cursor: 'pointer',
                              padding: '2px',
                            }}
                            title="Copy full 64-char SHA-256 hash"
                          >
                            {copiedId === doc.id ? <Check size={14} /> : <Copy size={14} />}
                          </button>
                        </div>
                      </td>

                      {/* Size */}
                      <td style={{ fontSize: '0.8125rem', color: '#94a3b8' }}>
                        {formatBytes(doc.size_bytes)}
                      </td>

                      {/* Owner */}
                      <td style={{ fontSize: '0.8125rem', color: '#cbd5e1' }}>
                        {doc.owner_username || 'Uploader'}
                      </td>

                      {/* Access level */}
                      <td>
                        <span style={{
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          padding: '0.125rem 0.5rem',
                          borderRadius: '4px',
                          background: isOwner
                            ? 'rgba(16, 185, 129, 0.15)'
                            : doc.my_permission === 'edit'
                            ? 'rgba(59, 130, 246, 0.15)'
                            : isAdmin
                            ? 'rgba(245, 158, 11, 0.15)'
                            : 'rgba(148, 163, 184, 0.15)',
                          color: isOwner
                            ? '#34d399'
                            : doc.my_permission === 'edit'
                            ? '#60a5fa'
                            : isAdmin
                            ? '#fbbf24'
                            : '#94a3b8',
                        }}>
                          {doc.my_permission}
                        </span>
                      </td>

                      {/* Actions (Hidden if user cannot use them; server enforces in authorize) */}
                      {!isAdmin && (
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem' }}>
                            {/* Download */}
                            {canDownload && (
                              <button
                                onClick={() => handleDownload(doc)}
                                className="btn btn-secondary btn-sm"
                                title="Download file"
                              >
                                <Download size={14} />
                                <span>Download</span>
                              </button>
                            )}

                            {/* Edit metadata */}
                            {canEdit && (
                              <button
                                onClick={() => setEditingDoc(doc)}
                                className="btn btn-secondary btn-sm"
                                title="Edit metadata"
                              >
                                <Edit3 size={14} />
                              </button>
                            )}

                            {/* Manage Access (Owner only) */}
                            {isOwner && (
                              <button
                                onClick={() => setManagingDoc(doc)}
                                className="btn btn-secondary btn-sm"
                                title="Manage access grants"
                              >
                                <Users size={14} />
                              </button>
                            )}

                            {/* Delete (Owner only) */}
                            {isOwner && (
                              <button
                                onClick={() => handleDelete(doc)}
                                className="btn btn-danger btn-sm"
                                title="Soft delete document"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Manage Access Modal */}
      {managingDoc && (
        <ManageAccessModal
          document={managingDoc}
          onClose={() => setManagingDoc(null)}
          onUpdated={fetchDocuments}
        />
      )}

      {/* Edit Metadata Modal */}
      {editingDoc && (
        <EditMetadataModal
          document={editingDoc}
          onClose={() => setEditingDoc(null)}
          onUpdated={fetchDocuments}
        />
      )}
    </div>
  );
}
