import React from 'react';
import {
  LayoutDashboard,
  FileText,
  Users,
  Search,
  FolderTree,
  UploadCloud,
  ShieldAlert,
  Share2,
} from 'lucide-react';

export default function Sidebar({ role, activeTab, onSelectTab, onOpenUpload }) {
  const isAdmin = role === 'admin';

  // Navigation items based on role
  const userNavItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'my_documents', label: 'My Documents', icon: FileText },
    { id: 'shared_with_me', label: 'Shared with Me', icon: Share2 },
    { id: 'search', label: 'Search', icon: Search },
    { id: 'categories', label: 'Categories', icon: FolderTree },
  ];

  const adminNavItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'all_documents', label: 'All Documents', icon: FileText, sub: '(Metadata Only)' },
    { id: 'users', label: 'Users', icon: Users },
    { id: 'activity_logs', label: 'Activity Logs', icon: ShieldAlert },
    { id: 'search', label: 'Search', icon: Search },
    { id: 'categories', label: 'Categories', icon: FolderTree },
  ];

  const navItems = isAdmin ? adminNavItems : userNavItems;

  return (
    <aside style={{
      width: '260px',
      background: 'rgba(8, 20, 16, 0.95)',
      borderRight: '1px solid rgba(16, 185, 129, 0.15)',
      display: 'flex',
      flexDirection: 'column',
      padding: '1.5rem 1rem',
      flexShrink: 0,
    }}>
      {/* Upload button for regular users */}
      {!isAdmin && (
        <div style={{ marginBottom: '1.5rem' }}>
          <button
            onClick={onOpenUpload}
            className="btn btn-primary"
            style={{ width: '100%', padding: '0.75rem 1rem' }}
          >
            <UploadCloud size={18} />
            <span>Upload Document</span>
          </button>
        </div>
      )}

      {/* Navigation menu */}
      <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem', flex: 1 }}>
        <div style={{
          fontSize: '0.6875rem',
          textTransform: 'uppercase',
          letterSpacing: '0.075em',
          color: '#64748b',
          fontWeight: 700,
          padding: '0 0.75rem 0.5rem 0.75rem',
        }}>
          {isAdmin ? 'Admin Console' : 'Workspace'}
        </div>

        {navItems.map(item => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.625rem 0.875rem',
                borderRadius: '8px',
                border: '1px solid',
                borderColor: isActive ? 'rgba(16, 185, 129, 0.4)' : 'transparent',
                background: isActive ? 'rgba(16, 185, 129, 0.12)' : 'transparent',
                color: isActive ? '#34d399' : '#94a3b8',
                fontSize: '0.875rem',
                fontWeight: isActive ? 600 : 500,
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={e => {
                if (!isActive) {
                  e.currentTarget.style.background = 'rgba(16, 185, 129, 0.05)';
                  e.currentTarget.style.color = '#cbd5e1';
                }
              }}
              onMouseLeave={e => {
                if (!isActive) {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = '#94a3b8';
                }
              }}
            >
              <Icon size={18} color={isActive ? '#34d399' : '#64748b'} />
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span>{item.label}</span>
                {item.sub && (
                  <span style={{ fontSize: '0.6875rem', color: '#64748b', fontWeight: 400 }}>{item.sub}</span>
                )}
              </div>
            </button>
          );
        })}
      </nav>

      {/* Security badge footer */}
      <div style={{
        marginTop: 'auto',
        padding: '0.875rem',
        background: 'rgba(6, 17, 13, 0.6)',
        border: '1px solid rgba(16, 185, 129, 0.1)',
        borderRadius: '8px',
        fontSize: '0.75rem',
        color: '#64748b',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.25rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', color: '#34d399', fontWeight: 600 }}>
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }} />
          Audit Hash Chained
        </div>
        <span>Zero-Trust DB Authorization</span>
      </div>
    </aside>
  );
}
