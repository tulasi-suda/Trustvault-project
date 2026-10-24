// Authentication routes: register, login, logout, me
const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { pool } = require('../db/pool');
const { recordAudit } = require('../audit/record');
const { requireAuth, SESSION_COOKIE_NAME } = require('../auth/requireAuth');
const {
  registerRateLimiter,
  isLoginRateLimited,
  recordFailedLogin,
  clearFailedLogins,
} = require('../auth/rateLimiter');

const router = express.Router();

// Pre-computed dummy bcrypt hash (cost 10) to ensure constant-time comparison on unknown users
const DUMMY_BCRYPT_HASH = '$2b$10$wT8K4y8aL1m5W5f0K8iUge4J1xL7h1W/dI0E0H5B0G5V8E5A0B2C.';

// 1. POST /api/auth/register
router.post('/register', registerRateLimiter, async (req, res) => {
  const ip = req.ip || req.connection.remoteAddress || '127.0.0.1';
  const userAgent = req.get('user-agent') || 'unknown';

  // Explicit extraction: never accept role, is_active, or id from request body
  const { username, email, password, confirmPassword } = req.body || {};

  // Validation: username (letters, digits, underscore only; 3 to 30 chars)
  if (!username || !/^[a-zA-Z0-9_]{3,30}$/.test(username)) {
    return res.status(400).json({
      error: 'Username must be 3-30 characters long and contain only letters, numbers, and underscores',
    });
  }

  // Validation: email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    return res.status(400).json({ error: 'A valid email address is required' });
  }

  // Validation: password complexity (at least 10 chars with at least one letter and one number)
  if (!password || password.length < 10 || !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return res.status(400).json({
      error: 'Password must be at least 10 characters long and contain at least one letter and one number',
    });
  }

  if (password !== confirmPassword) {
    return res.status(400).json({ error: 'Passwords do not match' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const cleanUsername = username.trim();
    const cleanEmail = email.trim().toLowerCase();

    // Check for existing username or email
    const duplicateCheck = await client.query(
      'SELECT id FROM users WHERE LOWER(username) = LOWER($1) OR LOWER(email) = LOWER($2)',
      [cleanUsername, cleanEmail]
    );

    if (duplicateCheck.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Username or email already in use' });
    }

    // Hash password with bcrypt
    const passwordHash = await bcrypt.hash(password, 10);

    // Registration always creates role 'user' and is_active = true
    const userRes = await client.query(
      `INSERT INTO users (username, email, full_name, password_hash, role, is_active)
       VALUES ($1, $2, $3, $4, 'user', TRUE)
       RETURNING id, username, email, role, created_at`,
      [cleanUsername, cleanEmail, cleanUsername, passwordHash]
    );

    const newUser = userRes.rows[0];

    // Audit registration in the same transaction
    await recordAudit({
      client,
      actorId: newUser.id,
      actorLabel: newUser.username,
      action: 'register',
      result: 'success',
      ip,
      userAgent,
      details: { username: newUser.username, email: newUser.email },
    });

    await client.query('COMMIT');

    // 201 Created and does NOT log in
    return res.status(201).json({
      message: 'User registered successfully',
      user: {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
        role: newUser.role,
      },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Registration error:', err.message);
    return res.status(500).json({ error: 'Registration failed' });
  } finally {
    client.release();
  }
});

// 2. POST /api/auth/login
router.post('/login', async (req, res) => {
  const ip = req.ip || req.connection.remoteAddress || '127.0.0.1';
  const userAgent = req.get('user-agent') || 'unknown';

  // Check rate limit on failed attempts
  if (isLoginRateLimited(ip)) {
    return res.status(429).json({
      error: 'Too many failed login attempts. Please try again later.',
    });
  }

  const { username, email, login, password } = req.body || {};
  const identifier = (login || username || email || '').trim();

  if (!identifier || !password) {
    recordFailedLogin(ip);
    await recordAudit({
      actorLabel: identifier || 'anonymous',
      action: 'login',
      result: 'failure',
      ip,
      userAgent,
      details: { reason: 'missing_credentials' },
    });
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  try {
    // Find user by username or email
    const userRes = await pool.query(
      `SELECT id, username, email, full_name, password_hash, role, is_active
       FROM users
       WHERE LOWER(username) = LOWER($1) OR LOWER(email) = LOWER($1)`,
      [identifier]
    );

    const user = userRes.rows[0];

    if (!user) {
      // Run dummy bcrypt compare to prevent timing enumeration attacks
      await bcrypt.compare(password, DUMMY_BCRYPT_HASH);
      recordFailedLogin(ip);
      await recordAudit({
        actorLabel: identifier,
        action: 'login',
        result: 'failure',
        ip,
        userAgent,
        details: { reason: 'user_not_found' },
      });
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    // Compare actual password
    const passwordsMatch = await bcrypt.compare(password, user.password_hash);

    // Reject if password mismatch or account is disabled
    if (!passwordsMatch || !user.is_active) {
      recordFailedLogin(ip);
      await recordAudit({
        actorId: user.id,
        actorLabel: user.username,
        action: 'login',
        result: 'failure',
        ip,
        userAgent,
        details: { reason: !user.is_active ? 'account_disabled' : 'invalid_password' },
      });
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    // Authentication succeeded: clear failed login counter
    clearFailedLogins(ip);

    // Create session in database
    const sessionId = crypto.randomUUID();
    const sessionDurationMs = 24 * 60 * 60 * 1000; // 24 hours
    const expiresAt = new Date(Date.now() + sessionDurationMs);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        'INSERT INTO sessions (id, user_id, expires_at) VALUES ($1, $2, $3)',
        [sessionId, user.id, expiresAt]
      );

      // Audit login success
      await recordAudit({
        client,
        actorId: user.id,
        actorLabel: user.username,
        action: 'login',
        result: 'success',
        ip,
        userAgent,
        details: { role: user.role },
      });
      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

    // Set secure httpOnly cookie
    res.cookie(SESSION_COOKIE_NAME, sessionId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      expires: expiresAt,
      path: '/',
    });

    return res.status(200).json({
      message: 'Login successful',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
      },
    });
  } catch (err) {
    console.error('Login error:', err.message);
    return res.status(500).json({ error: 'Login failed' });
  }
});

// 3. POST /api/auth/logout
router.post('/logout', async (req, res) => {
  const sessionId = req.cookies ? req.cookies[SESSION_COOKIE_NAME] : null;
  const ip = req.ip || req.connection.remoteAddress || '127.0.0.1';
  const userAgent = req.get('user-agent') || 'unknown';

  if (sessionId) {
    try {
      // Find session owner before deleting to attribute the audit event
      const sessRes = await pool.query(
        `SELECT s.user_id, u.username
         FROM sessions s
         JOIN users u ON s.user_id = u.id
         WHERE s.id = $1`,
        [sessionId]
      );

      await pool.query('DELETE FROM sessions WHERE id = $1', [sessionId]);

      if (sessRes.rows.length > 0) {
        await recordAudit({
          actorId: sessRes.rows[0].user_id,
          actorLabel: sessRes.rows[0].username,
          action: 'logout',
          result: 'success',
          ip,
          userAgent,
        });
      }
    } catch (err) {
      console.error('Logout error:', err.message);
    }
  }

  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  });

  return res.status(200).json({ message: 'Logged out successfully' });
});

// 4. GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  return res.status(200).json({
    user: req.user,
  });
});

module.exports = router;
