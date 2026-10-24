// Profile routes: view profile, update profile, change password
const express = require('express');
const bcrypt = require('bcrypt');
const { pool } = require('../db/pool');
const { requireAuth } = require('../auth/requireAuth');
const { recordAudit } = require('../audit/record');

const router = express.Router();

// All profile routes require authentication
router.use(requireAuth);

// 1. GET /api/profile
router.get('/', async (req, res) => {
  try {
    const userRes = await pool.query(
      'SELECT id, username, email, full_name, role, created_at FROM users WHERE id = $1',
      [req.user.id]
    );

    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.status(200).json({ user: userRes.rows[0] });
  } catch (err) {
    console.error('Get profile error:', err.message);
    return res.status(500).json({ error: 'Failed to retrieve profile' });
  }
});

// 2. PATCH /api/profile (username and full_name only)
router.patch('/', async (req, res) => {
  const ip = req.ip || req.connection.remoteAddress || '127.0.0.1';
  const userAgent = req.get('user-agent') || 'unknown';

  // Only allow updating username and full_name; ignore any role/id/email in body
  const { username, full_name } = req.body || {};

  if (!username && !full_name) {
    return res.status(400).json({ error: 'No profile fields provided to update' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let newUsername = req.user.username;
    if (username !== undefined) {
      const cleanUsername = String(username).trim();
      if (!/^[a-zA-Z0-9_]{3,30}$/.test(cleanUsername)) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: 'Username must be 3-30 characters long and contain only letters, numbers, and underscores',
        });
      }

      // Check if username is taken by another user
      const dupCheck = await client.query(
        'SELECT id FROM users WHERE LOWER(username) = LOWER($1) AND id != $2',
        [cleanUsername, req.user.id]
      );

      if (dupCheck.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Username already in use' });
      }

      newUsername = cleanUsername;
    }

    let newFullName = req.user.full_name;
    if (full_name !== undefined) {
      newFullName = String(full_name).trim().slice(0, 100);
      if (!newFullName) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Full name cannot be blank' });
      }
    }

    const updateRes = await client.query(
      `UPDATE users
       SET username = $1, full_name = $2
       WHERE id = $3
       RETURNING id, username, email, full_name, role, created_at`,
      [newUsername, newFullName, req.user.id]
    );

    const updatedUser = updateRes.rows[0];

    // Audit profile update in the same transaction
    await recordAudit({
      client,
      actorId: req.user.id,
      actorLabel: updatedUser.username,
      action: 'profile_updated',
      result: 'success',
      ip,
      userAgent,
      details: { username: updatedUser.username, full_name: updatedUser.full_name },
    });

    await client.query('COMMIT');

    return res.status(200).json({
      message: 'Profile updated successfully',
      user: updatedUser,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Update profile error:', err.message);
    return res.status(500).json({ error: 'Failed to update profile' });
  } finally {
    client.release();
  }
});

// 3. POST /api/profile/password (changes password, invalidates all OTHER sessions)
router.post('/password', async (req, res) => {
  const ip = req.ip || req.connection.remoteAddress || '127.0.0.1';
  const userAgent = req.get('user-agent') || 'unknown';

  const { currentPassword, newPassword, confirmNewPassword } = req.body || {};

  if (!currentPassword) {
    return res.status(400).json({ error: 'Current password is required' });
  }

  if (!newPassword || newPassword.length < 10 || !/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
    return res.status(400).json({
      error: 'New password must be at least 10 characters long and contain at least one letter and one number',
    });
  }

  if (newPassword !== confirmNewPassword) {
    return res.status(400).json({ error: 'New passwords do not match' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Fetch stored password hash
    const userRes = await client.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    if (userRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'User not found' });
    }

    const currentHash = userRes.rows[0].password_hash;
    const match = await bcrypt.compare(currentPassword, currentHash);

    if (!match) {
      await client.query('ROLLBACK');
      await recordAudit({
        actorId: req.user.id,
        actorLabel: req.user.username,
        action: 'password_change',
        result: 'failure',
        ip,
        userAgent,
        details: { reason: 'wrong_current_password' },
      });
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, 10);

    // Update password hash in users table
    await client.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newPasswordHash, req.user.id]);

    // Invalidate all OTHER sessions for this user, keeping the current session active
    await client.query('DELETE FROM sessions WHERE user_id = $1 AND id != $2', [req.user.id, req.sessionId]);

    // Audit password change in the same transaction
    await recordAudit({
      client,
      actorId: req.user.id,
      actorLabel: req.user.username,
      action: 'password_change',
      result: 'success',
      ip,
      userAgent,
    });

    await client.query('COMMIT');

    return res.status(200).json({ message: 'Password updated successfully' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Password change error:', err.message);
    return res.status(500).json({ error: 'Failed to update password' });
  } finally {
    client.release();
  }
});

module.exports = router;
