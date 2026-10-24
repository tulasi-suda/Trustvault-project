// Session authentication middleware
// Enforces server-side session validation from httpOnly cookie only.

const { pool } = require('../db/pool');

// Strict RFC 4122 UUID v4 regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SESSION_COOKIE_NAME = 'trustvault_session';

async function requireAuth(req, res, next) {
  // Cookie is the ONLY allowed session source (reject headers/query parameters)
  const sessionId = req.cookies ? req.cookies[SESSION_COOKIE_NAME] : null;

  if (!sessionId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // Validate UUID format strictly before querying database
  if (!UUID_REGEX.test(sessionId)) {
    return res.status(401).json({ error: 'Invalid session format' });
  }

  try {
    // Delete expired sessions from the database
    await pool.query('DELETE FROM sessions WHERE expires_at < CURRENT_TIMESTAMP');

    // Load active session and user from database (never trust client-supplied identity)
    const result = await pool.query(
      `SELECT s.id AS session_id, s.expires_at,
              u.id AS user_id, u.username, u.email, u.full_name, u.role, u.is_active
       FROM sessions s
       JOIN users u ON s.user_id = u.id
       WHERE s.id = $1`,
      [sessionId]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Session expired or not found' });
    }

    const row = result.rows[0];

    // Reject disabled users immediately and delete their lingering session
    if (!row.is_active) {
      await pool.query('DELETE FROM sessions WHERE id = $1', [sessionId]);
      return res.status(401).json({ error: 'User account is disabled' });
    }

    // Attach authenticated user identity sourced strictly from the database session
    req.user = {
      id: row.user_id,
      username: row.username,
      email: row.email,
      full_name: row.full_name,
      role: row.role,
    };
    req.sessionId = row.session_id;

    next();
  } catch (err) {
    console.error('requireAuth database error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = {
  requireAuth,
  SESSION_COOKIE_NAME,
  UUID_REGEX,
};
