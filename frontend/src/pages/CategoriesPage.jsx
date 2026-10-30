import React, { useState } from 'react';
import { FolderTree, Folder, FileText, Download } from 'lucide-react';
import DocumentsView from './DocumentsView';

const CATEGORIES = [
  { id: 'General', name: 'General', desc: 'General company documentation and memos' },
  { id: 'Finance', name: 'Finance', desc: 'Financial reports, ledgers, and billing records' },
  { id: 'HR', name: 'HR', desc: 'Personnel, onboarding, and internal human resource records' },
  { id: 'Legal', name: 'Legal', desc: 'Contracts, compliance, and regulatory documentation' },
  { id: 'IT', name: 'IT', desc: 'Infrastructure configs, security keys, and system architecture' },
  { id: 'Education', name: 'Education', desc: 'Training guides, research papers, and tutorials' },
  { id: 'Personal', name: 'Personal', desc: 'Confidential personal files and private notes' },
];

export default function CategoriesPage({ isAdmin = false, onOpenUpload }) {
  const [selectedCategory, setSelectedCategory] = useState(null);

  if (selectedCategory) {
    return (
      <div>
        <div style={{ padding: '1rem 2rem 0 2rem' }}>
          <button
            onClick={() => setSelectedCategory(null)}
            className="btn btn-secondary btn-sm"
            style={{ marginBottom: '1rem' }}
          >
            ← Back to All Categories
          </button>
        </div>
        <DocumentsView
          scope="all"
          title={`Category: ${selectedCategory}`}
          isAdmin={isAdmin}
          onOpenUpload={onOpenUpload}
        />
      </div>
    );
  }

  return (
    <div className="page-wrapper">
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#f8fafc' }}>
          Document Categories
        </h2>
        <p style={{ color: '#94a3b8', fontSize: '0.875rem', marginTop: '0.25rem' }}>
          Explore compartmentalized folders organized by operational domain.
        </p>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: '1.25rem',
      }}>
        {CATEGORIES.map(cat => (
          <div
            key={cat.id}
            className="glass-panel"
            onClick={() => setSelectedCategory(cat.id)}
            style={{
              padding: '1.75rem',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              transition: 'transform 0.15s ease, border-color 0.15s ease',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.borderColor = 'rgba(56, 189, 248, 0.55)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.borderColor = 'rgba(56, 189, 248, 0.16)';
            }}
          >
            <div>
              <div style={{
                display: 'inline-flex',
                padding: '0.75rem',
                borderRadius: '12px',
                background: 'rgba(37, 99, 235, 0.14)',
                border: '1px solid rgba(56, 189, 248, 0.28)',
                marginBottom: '1rem',
              }}>
                <Folder size={24} color="#38bdf8" />
              </div>
              <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#f8fafc', marginBottom: '0.5rem' }}>
                {cat.name}
              </h3>
              <p style={{ fontSize: '0.8125rem', color: '#94a3b8', lineHeight: 1.5 }}>
                {cat.desc}
              </p>
            </div>

            <div style={{ marginTop: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className={`badge badge-${cat.id}`}>{cat.name}</span>
              <span style={{ fontSize: '0.8125rem', color: '#38bdf8', fontWeight: 600 }}>
                Explore →
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
