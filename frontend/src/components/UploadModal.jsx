import React, { useState } from 'react';
import { X, UploadCloud, Copy, Check, Plus, Trash2, ShieldCheck, AlertCircle } from 'lucide-react';
import { computeFileSha256, apiRequest } from '../utils/api';

const CATEGORIES = ['General', 'Finance', 'HR', 'Legal', 'IT', 'Education', 'Personal'];

export default function UploadModal({ onClose, onUploaded }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('General');
  const [file, setFile] = useState(null);
  const [fileSha256, setFileSha256] = useState('');
  const [computingHash, setComputingHash] = useState(false);
  const [copiedFingerprint, setCopiedFingerprint] = useState(false);

  // Recipient list: [{ email, permission }]
  const [sharedWith, setSharedWith] = useState([]);
  const [newEmail, setNewEmail] = useState('');
  const [newPermission, setNewPermission] = useState('read');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Handle file selection and compute cryptographic SHA-256 in browser via crypto.subtle
  async function handleFileChange(e) {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;

    if (selectedFile.size > 10 * 1024 * 1024) {
      setError('File exceeds maximum allowed size of 10 MB');
      return;
    }

    setFile(selectedFile);
    setError('');
    setComputingHash(true);

    try {
      // Automatic title pre-fill if blank
      if (!title) {
        setTitle(selectedFile.name.replace(/\.[^/.]+$/, ''));
      }

      const sha = await computeFileSha256(selectedFile);
      setFileSha256(sha);
    } catch (err) {
      setError('Failed to compute file SHA-256 hash in browser');
    } finally {
      setComputingHash(false);
    }
  }

  function handleAddRecipient() {
    const email = newEmail.trim().toLowerCase();
    if (!email) return;

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter a valid email address');
      return;
    }

    if (sharedWith.some(r => r.email === email)) {
      setError('This email is already in the access list');
      return;
    }

    setSharedWith([...sharedWith, { email, permission: newPermission }]);
    setNewEmail('');
    setError('');
  }

  function handleRemoveRecipient(email) {
    setSharedWith(sharedWith.filter(r => r.email !== email));
  }

  function copyFingerprint() {
    if (!fileSha256) return;
    navigator.clipboard.writeText(fileSha256);
    setCopiedFingerprint(true);
    setTimeout(() => setCopiedFingerprint(false), 2000);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!file) {
      setError('Please select a file to upload');
      return;
    }
    if (!title.trim()) {
      setError('Document title is required');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('title', title.trim());
      formData.append('description', description.trim());
      formData.append('category', category);
      formData.append('clientSha256', fileSha256);
      formData.append('file', file);
      if (sharedWith.length > 0) {
        formData.append('sharedWith', JSON.stringify(sharedWith));
      }

      const response = await fetch('/api/documents', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Upload failed');
      }

      onUploaded(data.document);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const fingerprint = fileSha256 ? fileSha256.slice(0, 12) : null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '640px' }}>
        {/* Modal Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '1.25rem 1.5rem',
          borderBottom: '1px solid rgba(16, 185, 129, 0.15)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            <UploadCloud size={20} color="#38bdf8" />
            <h3 style={{ fontSize: '1.125rem', fontWeight: 700 }}>Upload Secure Document</h3>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} style={{ padding: '1.5rem', maxHeight: '75vh', overflowY: 'auto' }}>
          {error && (
            <div className="alert alert-error">
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          )}

          {/* File Picker */}
          <div className="form-group">
            <label className="form-label">Document File (Max 10 MB)</label>
            <div style={{
              border: '2px dashed rgba(56, 189, 248, 0.35)',
              borderRadius: '12px',
              padding: '1.25rem',
              textAlign: 'center',
              background: 'rgba(5, 14, 32, 0.45)',
              cursor: 'pointer',
            }}>
              <input
                type="file"
                id="docFileInput"
                style={{ display: 'none' }}
                onChange={handleFileChange}
                accept=".pdf,.txt,.docx,.xlsx,.csv,.png,.jpg,.jpeg"
              />
              <label htmlFor="docFileInput" style={{ cursor: 'pointer', display: 'block' }}>
                <UploadCloud size={32} color="#38bdf8" style={{ margin: '0 auto 0.5rem auto' }} />
                <p style={{ fontSize: '0.875rem', fontWeight: 600, color: '#f8fafc' }}>
                  {file ? file.name : 'Click to browse or drop document here'}
                </p>
                <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
                  Allowed: PDF, TXT, DOCX, XLSX, CSV, PNG, JPG
                </p>
              </label>
            </div>
          </div>

          {/* Fingerprint preview if computed */}
          {computingHash && (
            <p style={{ fontSize: '0.8125rem', color: '#38bdf8', marginBottom: '1rem' }}>
              Computing SHA-256 fingerprint in browser...
            </p>
          )}

          {fingerprint && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0.625rem 0.875rem',
              background: '#040d22',
              border: '1px solid rgba(56, 189, 248, 0.28)',
              borderRadius: '8px',
              marginBottom: '1.25rem',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <ShieldCheck size={16} color="#38bdf8" />
                <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Client Fingerprint:</span>
                <span className="fingerprint-tag">{fingerprint}...</span>
              </div>
              <button
                type="button"
                onClick={copyFingerprint}
                className="btn btn-secondary btn-sm"
                title="Copy full 64-char SHA-256"
              >
                {copiedFingerprint ? <Check size={14} color="#38bdf8" /> : <Copy size={14} />}
                <span>{copiedFingerprint ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          )}

          {/* Title */}
          <div className="form-group">
            <label className="form-label">Document Title *</label>
            <input
              type="text"
              className="form-input"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Q4 Financial Audit Report"
              required
            />
          </div>

          {/* Description */}
          <div className="form-group">
            <label className="form-label">Description (Optional)</label>
            <textarea
              className="form-textarea"
              rows={2}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Brief context or notes about this document..."
            />
          </div>

          {/* Category */}
          <div className="form-group">
            <label className="form-label">Category</label>
            <select
              className="form-select"
              value={category}
              onChange={e => setCategory(e.target.value)}
            >
              {CATEGORIES.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          {/* Who can access this document */}
          <div className="form-group" style={{ marginTop: '1.5rem' }}>
            <label className="form-label">Who can access this document?</label>
            <p style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '0.75rem' }}>
              Assign explicit read or edit grants to registered users by email.
            </p>

            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <input
                type="email"
                className="form-input"
                style={{ flex: 1 }}
                placeholder="colleague@example.com"
                value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
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
              <button
                type="button"
                onClick={handleAddRecipient}
                className="btn btn-secondary"
              >
                <Plus size={16} />
                <span>Add</span>
              </button>
            </div>

            {sharedWith.length > 0 && (
              <div style={{
                background: 'rgba(6, 17, 13, 0.5)',
                border: '1px solid rgba(16, 185, 129, 0.15)',
                borderRadius: '8px',
                padding: '0.5rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.375rem',
              }}>
                {sharedWith.map(recipient => (
                  <div
                    key={recipient.email}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.375rem 0.625rem',
                      background: 'rgba(17, 41, 32, 0.6)',
                      borderRadius: '6px',
                    }}
                  >
                    <div>
                      <span style={{ fontSize: '0.8125rem', color: '#f8fafc', fontWeight: 500 }}>
                        {recipient.email}
                      </span>
                      <span style={{
                        fontSize: '0.6875rem',
                        marginLeft: '0.5rem',
                        padding: '0.125rem 0.375rem',
                        borderRadius: '4px',
                        background: recipient.permission === 'edit' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(37, 99, 235, 0.2)',
                        color: recipient.permission === 'edit' ? '#60a5fa' : '#38bdf8',
                        textTransform: 'uppercase',
                        fontWeight: 700,
                      }}>
                        {recipient.permission}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveRecipient(recipient.email)}
                      style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Modal Actions */}
          <div style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '0.75rem',
            marginTop: '2rem',
            paddingTop: '1rem',
            borderTop: '1px solid rgba(16, 185, 129, 0.15)',
          }}>
            <button type="button" onClick={onClose} className="btn btn-secondary" disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading || !file || computingHash}>
              {loading ? 'Encrypting & Uploading...' : 'Upload & Grant Access'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
