import React, { useState } from 'react';
import { ShieldCheck, Lock, User, Mail, AlertCircle, CheckCircle2, ArrowRight } from 'lucide-react';
import { apiRequest } from '../utils/api';

export default function Register({ onRegisterSuccess, onSwitchToSignIn }) {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [registered, setRegistered] = useState(false);

  // Inline validations
  const usernameValid = /^[a-zA-Z0-9_]{3,30}$/.test(username);
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const passwordLengthValid = password.length >= 10;
  const passwordLetterValid = /[a-zA-Z]/.test(password);
  const passwordNumberValid = /[0-9]/.test(password);
  const passwordComplex = passwordLengthValid && passwordLetterValid && passwordNumberValid;
  const passwordsMatch = password && confirmPassword && password === confirmPassword;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!usernameValid) {
      setError('Username must be 3-30 characters with letters, numbers, or underscores only');
      return;
    }
    if (!emailValid) {
      setError('Please provide a valid email address');
      return;
    }
    if (!passwordComplex) {
      setError('Password must be at least 10 characters long and include both letters and numbers');
      return;
    }
    if (!passwordsMatch) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);

    try {
      await apiRequest('/api/auth/register', {
        method: 'POST',
        body: {
          username: username.trim(),
          email: email.trim().toLowerCase(),
          password,
          confirmPassword,
        },
      });

      setRegistered(true);
    } catch (err) {
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  if (registered) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
        background: 'radial-gradient(circle at 50% 30%, rgba(16, 185, 129, 0.12) 0%, transparent 60%), #06110d',
      }}>
        <div className="glass-panel" style={{ maxWidth: '440px', width: '100%', padding: '2.5rem 2rem', textAlign: 'center' }}>
          <div style={{
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            background: 'rgba(16, 185, 129, 0.15)',
            border: '2px solid #10b981',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1.25rem auto',
          }}>
            <CheckCircle2 size={32} color="#10b981" />
          </div>

          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#f8fafc', marginBottom: '0.5rem' }}>
            Account Created
          </h2>
          <p style={{ color: '#94a3b8', fontSize: '0.875rem', marginBottom: '1.75rem', lineHeight: 1.6 }}>
            Your account <strong style={{ color: '#34d399' }}>{username}</strong> has been registered successfully with role <strong>user</strong>.
          </p>

          <button onClick={onSwitchToSignIn} className="btn btn-primary" style={{ width: '100%', padding: '0.75rem' }}>
            Proceed to Sign In
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1.5rem',
      background: 'radial-gradient(circle at 50% 30%, rgba(16, 185, 129, 0.12) 0%, transparent 60%), #06110d',
    }}>
      <div className="glass-panel" style={{ maxWidth: '460px', width: '100%', padding: '2.5rem 2rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
          <div style={{
            width: '44px',
            height: '44px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #10b981, #047857)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 0.75rem auto',
            boxShadow: '0 0 20px rgba(16, 185, 129, 0.35)',
          }}>
            <ShieldCheck size={24} color="#ffffff" />
          </div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#f8fafc' }}>
            Create TrustVault Account
          </h1>
          <p style={{ color: '#94a3b8', fontSize: '0.8125rem', marginTop: '0.25rem' }}>
            Audited, zero-trust cryptographic access
          </p>
        </div>

        {error && (
          <div className="alert alert-error">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Username */}
          <div className="form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label className="form-label">Username</label>
              {username && (
                <span style={{ fontSize: '0.75rem', color: usernameValid ? '#34d399' : '#f87171' }}>
                  {usernameValid ? '✓ Valid' : '3-30 chars, letters/digits/_'}
                </span>
              )}
            </div>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                className="form-input"
                style={{ paddingLeft: '2.5rem' }}
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="alice_01"
                required
              />
              <User size={16} color="#64748b" style={{ position: 'absolute', left: '0.875rem', top: '50%', transform: 'translateY(-50%)' }} />
            </div>
          </div>

          {/* Email */}
          <div className="form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label className="form-label">Email Address</label>
              {email && (
                <span style={{ fontSize: '0.75rem', color: emailValid ? '#34d399' : '#f87171' }}>
                  {emailValid ? '✓ Valid' : 'Invalid email'}
                </span>
              )}
            </div>
            <div style={{ position: 'relative' }}>
              <input
                type="email"
                className="form-input"
                style={{ paddingLeft: '2.5rem' }}
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="alice@example.com"
                required
              />
              <Mail size={16} color="#64748b" style={{ position: 'absolute', left: '0.875rem', top: '50%', transform: 'translateY(-50%)' }} />
            </div>
          </div>

          {/* Password */}
          <div className="form-group">
            <label className="form-label">Password</label>
            <div style={{ position: 'relative' }}>
              <input
                type="password"
                className="form-input"
                style={{ paddingLeft: '2.5rem' }}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••••••"
                required
              />
              <Lock size={16} color="#64748b" style={{ position: 'absolute', left: '0.875rem', top: '50%', transform: 'translateY(-50%)' }} />
            </div>

            {/* Inline Password Requirements Checklist */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '0.25rem',
              marginTop: '0.5rem',
              fontSize: '0.75rem',
            }}>
              <span style={{ color: passwordLengthValid ? '#34d399' : '#64748b' }}>
                {passwordLengthValid ? '✓' : '•'} At least 10 chars
              </span>
              <span style={{ color: passwordLetterValid ? '#34d399' : '#64748b' }}>
                {passwordLetterValid ? '✓' : '•'} At least 1 letter
              </span>
              <span style={{ color: passwordNumberValid ? '#34d399' : '#64748b' }}>
                {passwordNumberValid ? '✓' : '•'} At least 1 number
              </span>
              <span style={{ color: passwordsMatch ? '#34d399' : '#64748b' }}>
                {passwordsMatch ? '✓' : '•'} Passwords match
              </span>
            </div>
          </div>

          {/* Confirm Password */}
          <div className="form-group">
            <label className="form-label">Confirm Password</label>
            <div style={{ position: 'relative' }}>
              <input
                type="password"
                className="form-input"
                style={{ paddingLeft: '2.5rem' }}
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="••••••••••••"
                required
              />
              <Lock size={16} color="#64748b" style={{ position: 'absolute', left: '0.875rem', top: '50%', transform: 'translateY(-50%)' }} />
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', marginTop: '0.75rem', padding: '0.75rem' }}
            disabled={loading || !usernameValid || !emailValid || !passwordComplex || !passwordsMatch}
          >
            {loading ? 'Creating Account...' : 'Register Account'}
            {!loading && <ArrowRight size={16} />}
          </button>
        </form>

        <div style={{ marginTop: '1.75rem', textAlign: 'center', paddingTop: '1.25rem', borderTop: '1px solid rgba(16, 185, 129, 0.12)' }}>
          <p style={{ fontSize: '0.875rem', color: '#94a3b8' }}>
            Already have an account?{' '}
            <button
              onClick={onSwitchToSignIn}
              style={{
                background: 'none',
                border: 'none',
                color: '#34d399',
                fontWeight: 600,
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              Sign In
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
