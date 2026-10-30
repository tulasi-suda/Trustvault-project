import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';
import UploadModal from './components/UploadModal';
import ProfileModal from './components/ProfileModal';

import SignIn from './pages/SignIn';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import DocumentsView from './pages/DocumentsView';
import SearchPage from './pages/SearchPage';
import CategoriesPage from './pages/CategoriesPage';
import AdminAuditLogs from './pages/AdminAuditLogs';
import AdminUsers from './pages/AdminUsers';

import { apiRequest } from './utils/api';

export default function App() {
  const [user, setUser] = useState(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [authView, setAuthView] = useState('signin'); // 'signin' or 'register'

  const [activeTab, setActiveTab] = useState('dashboard');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);

  useEffect(() => {
    checkCurrentUser();
  }, []);

  async function checkCurrentUser() {
    setAuthChecking(true);
    try {
      const data = await apiRequest('/api/auth/me');
      setUser(data.user);
    } catch (err) {
      setUser(null);
    } finally {
      setAuthChecking(false);
    }
  }

  async function handleSignOut() {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' });
    } catch (err) {
      console.error('Logout error:', err.message);
    } finally {
      setUser(null);
      setActiveTab('dashboard');
      setAuthView('signin');
    }
  }

  if (authChecking) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#030712',
        color: '#38bdf8',
        fontSize: '1rem',
        fontWeight: 600,
        letterSpacing: '0.05em',
      }}>
        Initializing TrustVault Security Session...
      </div>
    );
  }

  // Unauthenticated views
  if (!user) {
    if (authView === 'register') {
      return (
        <Register
          onRegisterSuccess={() => setAuthView('signin')}
          onSwitchToSignIn={() => setAuthView('signin')}
        />
      );
    }
    return (
      <SignIn
        onLoginSuccess={loggedInUser => setUser(loggedInUser)}
        onSwitchToRegister={() => setAuthView('register')}
      />
    );
  }

  const isAdmin = user.role === 'admin';

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <Sidebar
        role={user.role}
        activeTab={activeTab}
        onSelectTab={tab => setActiveTab(tab)}
        onOpenUpload={() => setShowUploadModal(true)}
      />

      {/* Main Content Area */}
      <div className="main-content">
        <Navbar
          user={user}
          onOpenProfile={() => setShowProfileModal(true)}
          onSignOut={handleSignOut}
        />

        {/* View Routing */}
        <main style={{ flex: 1 }}>
          {activeTab === 'dashboard' && (
            <Dashboard
              user={user}
              onNavigate={tab => setActiveTab(tab)}
              onOpenUpload={() => setShowUploadModal(true)}
            />
          )}

          {activeTab === 'my_documents' && !isAdmin && (
            <DocumentsView
              scope="mine"
              title="My Documents"
              onOpenUpload={() => setShowUploadModal(true)}
            />
          )}

          {activeTab === 'shared_with_me' && !isAdmin && (
            <DocumentsView
              scope="shared"
              title="Shared with Me"
              onOpenUpload={() => setShowUploadModal(true)}
            />
          )}

          {activeTab === 'all_documents' && isAdmin && (
            <DocumentsView
              scope="all"
              title="All Documents (Administrative View)"
              isAdmin={true}
            />
          )}

          {activeTab === 'users' && isAdmin && (
            <AdminUsers currentUser={user} />
          )}

          {activeTab === 'activity_logs' && isAdmin && (
            <AdminAuditLogs />
          )}

          {activeTab === 'search' && (
            <SearchPage isAdmin={isAdmin} />
          )}

          {activeTab === 'categories' && (
            <CategoriesPage
              isAdmin={isAdmin}
              onOpenUpload={() => setShowUploadModal(true)}
            />
          )}
        </main>
      </div>

      {/* Upload Document Modal */}
      {showUploadModal && (
        <UploadModal
          onClose={() => setShowUploadModal(false)}
          onUploaded={() => {
            setShowUploadModal(false);
            if (activeTab === 'my_documents' || activeTab === 'dashboard') {
              // Trigger reload by switching tab momentarily or state
              setActiveTab('my_documents');
            }
          }}
        />
      )}

      {/* Profile & Password Modal */}
      {showProfileModal && (
        <ProfileModal
          user={user}
          onClose={() => setShowProfileModal(false)}
          onUserUpdated={updated => setUser(updated)}
        />
      )}
    </div>
  );
}
