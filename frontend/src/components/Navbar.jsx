import React, { useState, useRef, useEffect } from 'react';
import { ShieldCheck, User, LogOut, ChevronDown } from 'lucide-react';

export default function Navbar({ user, onOpenProfile, onSignOut }) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const initial = user?.username ? user.username.charAt(0).toUpperCase() : 'U';

  return (
    <header style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0.875rem 2rem',
      background: 'rgba(6, 17, 13, 0.85)',
      backdropFilter: 'blur(16px)',
      borderBottom: '1px solid rgba(16, 185, 129, 0.15)',
      position: 'sticky',
      top: 0,
      zIndex: 100,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <div style={{
          width: '36px',
          height: '36px',
          borderRadius: '10px',
          background: 'linear-gradient(135deg, #2563eb, #1e40af)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 0 15px rgba(37, 99, 235, 0.45)',
        }}>
          <ShieldCheck size={20} color="#ffffff" />
        </div>
        <div>
          <span style={{ fontSize: '1.25rem', fontWeight: 800, letterSpacing: '-0.02em', color: '#f8fafc' }}>
            Trust<span style={{ color: '#38bdf8' }}>Vault</span>
          </span>
          <span style={{
            fontSize: '0.6875rem',
            marginLeft: '0.5rem',
            padding: '0.125rem 0.375rem',
            borderRadius: '4px',
            background: 'rgba(56, 189, 248, 0.15)',
            color: '#38bdf8',
            border: '1px solid rgba(56, 189, 248, 0.28)',
            textTransform: 'uppercase',
            fontWeight: 700,
            letterSpacing: '0.05em'
          }}>
            Zero-Trust
          </span>
        </div>
      </div>

      {user && (
        <div style={{ position: 'relative' }} ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.625rem',
              background: 'rgba(15, 30, 68, 0.7)',
              border: '1px solid rgba(56, 189, 248, 0.25)',
              borderRadius: '9999px',
              padding: '0.25rem 0.75rem 0.25rem 0.375rem',
              cursor: 'pointer',
              color: '#f8fafc',
            }}
          >
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #1d4ed8, #38bdf8)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: '0.875rem',
            }}>
              {initial}
            </div>
            <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>{user.username}</span>
            <ChevronDown size={14} color="#94a3b8" />
          </button>

          {dropdownOpen && (
            <div style={{
              position: 'absolute',
              right: 0,
              top: 'calc(100% + 0.5rem)',
              width: '230px',
              background: '#071328',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              borderRadius: '12px',
              boxShadow: '0 10px 30px rgba(0, 0, 0, 0.75)',
              padding: '0.5rem',
              zIndex: 1000,
            }}>
              <div style={{ padding: '0.75rem', borderBottom: '1px solid rgba(56, 189, 248, 0.12)', marginBottom: '0.375rem' }}>
                <p style={{ fontSize: '0.875rem', fontWeight: 700, color: '#f8fafc' }}>{user.username}</p>
                <p style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{user.email}</p>
                <div style={{ marginTop: '0.375rem' }}>
                  <span style={{
                    fontSize: '0.6875rem',
                    textTransform: 'uppercase',
                    fontWeight: 700,
                    padding: '0.125rem 0.5rem',
                    borderRadius: '9999px',
                    background: user.role === 'admin' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(37, 99, 235, 0.2)',
                    color: user.role === 'admin' ? '#fbbf24' : '#38bdf8',
                  }}>
                    Role: {user.role}
                  </span>
                </div>
              </div>

              <button
                onClick={() => {
                  setDropdownOpen(false);
                  onOpenProfile();
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.625rem',
                  width: '100%',
                  padding: '0.625rem 0.75rem',
                  background: 'transparent',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#cbd5e1',
                  fontSize: '0.875rem',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(56, 189, 248, 0.12)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <User size={16} />
                My Profile
              </button>

              <button
                onClick={() => {
                  setDropdownOpen(false);
                  onSignOut();
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.625rem',
                  width: '100%',
                  padding: '0.625rem 0.75rem',
                  background: 'transparent',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#f87171',
                  fontSize: '0.875rem',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <LogOut size={16} />
                Sign out
              </button>
            </div>
          )}
        </div>
      )}
    </header>
  );
}
