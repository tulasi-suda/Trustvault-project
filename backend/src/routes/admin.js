const express = require('express');
const { pool } = require('../db/pool');
const { SESSION_COOKIE_NAME, UUID_REGEX } = require('../auth/requireAuth');
const { recordAudit, verifyAuditChain, GENESIS_PREV_HASH } = require('../audit/record');

const router = express.Router();

// Strict security: Admin endpoints are admin only; anyone else (anonymous or regular user) gets 404
router.use(async (req, res, next) => {
  const sessionId = req.cookies ? req.cookies[SESSION_COOKIE_NAME] : null;
  if (!sessionId || !UUID_REGEX.test(sessionId)) {
    return res.status(404).json({ error: 'Endpoint not found' });
  }

  try {
    const result = await pool.query(
      `SELECT s.id AS session_id, s.expires_at,
              u.id AS user_id, u.username, u.email, u.full_name, u.role, u.is_active
       FROM sessions s
       JOIN users u ON s.user_id = u.id
       WHERE s.id = $1 AND s.expires_at > CURRENT_TIMESTAMP AND u.is_active = TRUE`,
      [sessionId]
    );

    if (result.rows.length === 0 || result.rows[0].role !== 'admin') {
      return res.status(404).json({ error: 'Endpoint not found' });
    }

    const row = result.rows[0];
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
    console.error('Admin middleware error:', err.message);
    return res.status(404).json({ error: 'Endpoint not found' });
  }
});

// 1. GET /api/admin/audit (Filters and pagination)
router.get('/audit', async (req, res) => {
  const { action, actor, result, from, to } = req.query;
  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '50', 10)));
  const offset = (page - 1) * limit;

  try {
    let whereConditions = [];
    let params = [];
    let pIdx = 1;

    if (action) {
      whereConditions.push(`action ILIKE $${pIdx}`);
      params.push(`%${action}%`);
      pIdx++;
    }

    if (actor) {
      whereConditions.push(`actor_label ILIKE $${pIdx}`);
      params.push(`%${actor}%`);
      pIdx++;
    }

    if (result) {
      whereConditions.push(`result = $${pIdx}`);
      params.push(result);
      pIdx++;
    }

    if (from) {
      whereConditions.push(`created_at >= $${pIdx}`);
      params.push(new Date(from));
      pIdx++;
    }

    if (to) {
      whereConditions.push(`created_at <= $${pIdx}`);
      params.push(new Date(to));
      pIdx++;
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const countRes = await pool.query(`SELECT COUNT(*) AS total FROM audit_log ${whereClause}`, params);
    const total = parseInt(countRes.rows[0].total, 10);

    const dataQuery = `
      SELECT id, created_at, actor_id, actor_label, action, document_id,
             result, ip, user_agent, details, prev_hash, hash
      FROM audit_log
      ${whereClause}
      ORDER BY id DESC
      LIMIT $${pIdx} OFFSET $${pIdx + 1}
    `;

    const dataRes = await pool.query(dataQuery, [...params, limit, offset]);

    return res.status(200).json({
      logs: dataRes.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error('Admin audit error:', err.message);
    return res.status(500).json({ error: 'Failed to retrieve audit logs' });
  }
});

// 2. GET /api/admin/audit/verify (Cryptographic chain verification)
router.get('/audit/verify', async (req, res) => {
  try {
    const result = await verifyAuditChain();
    return res.status(200).json(result);
  } catch (err) {
    console.error('Audit verify error:', err.message);
    return res.status(500).json({ error: 'Chain verification failed' });
  }
});

// 3. GET /api/admin/audit/head (Latest hash)
router.get('/audit/head', async (req, res) => {
  try {
    const headRes = await pool.query('SELECT id, hash, created_at FROM audit_log ORDER BY id DESC LIMIT 1');
    if (headRes.rows.length === 0) {
      return res.status(200).json({
        id: 0,
        hash: GENESIS_PREV_HASH,
        head: GENESIS_PREV_HASH,
        created_at: null,
      });
    }

    const row = headRes.rows[0];
    return res.status(200).json({
      id: row.id,
      hash: row.hash,
      head: row.hash,
      created_at: row.created_at,
    });
  } catch (err) {
    console.error('Audit head error:', err.message);
    return res.status(500).json({ error: 'Failed to retrieve audit head' });
  }
});

// 4. GET /api/admin/worth-noticing ('Worth noticing' security summary)
// 5+ denials by one user in an hour, 10+ downloads in an hour, >10 failed logins from one IP in an hour
router.get('/worth-noticing', async (req, res) => {
  try {
    // 1. Users with >= 5 denials in the last hour
    const denialsRes = await pool.query(`
      SELECT actor_id, actor_label, COUNT(*) AS count
      FROM audit_log
      WHERE action = 'authorize_denied'
        AND created_at >= NOW() - INTERVAL '1 hour'
      GROUP BY actor_id, actor_label
      HAVING COUNT(*) >= 5
      ORDER BY count DESC
    `);

    // 2. Users with >= 10 downloads in the last hour
    const downloadsRes = await pool.query(`
      SELECT actor_id, actor_label, COUNT(*) AS count
      FROM audit_log
      WHERE action = 'download'
        AND result = 'success'
        AND created_at >= NOW() - INTERVAL '1 hour'
      GROUP BY actor_id, actor_label
      HAVING COUNT(*) >= 10
      ORDER BY count DESC
    `);

    // 3. IPs with > 10 failed logins in the last hour
    const failedLoginsRes = await pool.query(`
      SELECT ip, COUNT(*) AS count
      FROM audit_log
      WHERE action = 'login'
        AND result = 'failure'
        AND created_at >= NOW() - INTERVAL '1 hour'
      GROUP BY ip
      HAVING COUNT(*) > 10
      ORDER BY count DESC
    `);

    return res.status(200).json({
      repeatedDenials: denialsRes.rows,
      highDownloads: downloadsRes.rows,
      failedLoginsByIp: failedLoginsRes.rows,
    });
  } catch (err) {
    console.error('Worth noticing error:', err.message);
    return res.status(500).json({ error: 'Failed to retrieve security summary' });
  }
});

// 5. GET /api/admin/users (List all users)
router.get('/users', async (req, res) => {
  try {
    const usersRes = await pool.query(`
      SELECT u.id, u.username, u.email, u.full_name, u.role, u.is_active, u.created_at,
             COUNT(DISTINCT d.id) AS document_count
      FROM users u
      LEFT JOIN documents d ON d.owner_id = u.id AND d.deleted_at IS NULL
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `);

    return res.status(200).json({ users: usersRes.rows });
  } catch (err) {
    console.error('Admin list users error:', err.message);
    return res.status(500).json({ error: 'Failed to retrieve users' });
  }
});

// 6. PATCH /api/admin/users/:id/status (Enable/disable user)
// Cannot disable yourself or an admin; disabling deletes that user's sessions in the same transaction and is audited; role can never change.
router.patch('/users/:id/status', async (req, res) => {
  const ip = req.ip || req.connection.remoteAddress || '127.0.0.1';
  const userAgent = req.get('user-agent') || 'unknown';
  const targetUserId = req.params.id;
  const { is_active } = req.body || {};

  if (typeof is_active !== 'boolean') {
    return res.status(400).json({ error: 'is_active must be a boolean (true or false)' });
  }

  // Cannot disable yourself
  if (targetUserId === req.user.id) {
    return res.status(400).json({ error: 'Cannot disable your own account' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Fetch target user
    const targetRes = await client.query('SELECT id, username, email, role, is_active FROM users WHERE id = $1', [
      targetUserId,
    ]);

    if (targetRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'User not found' });
    }

    const targetUser = targetRes.rows[0];

    // Cannot disable an admin
    if (targetUser.role === 'admin' && !is_active) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Cannot disable an administrator' });
    }

    // Role can never change: only update is_active
    await client.query('UPDATE users SET is_active = $1 WHERE id = $2', [is_active, targetUserId]);

    // If disabling user: delete that user's sessions in the same transaction
    if (!is_active) {
      await client.query('DELETE FROM sessions WHERE user_id = $1', [targetUserId]);
    }

    // Audit user status change in the same transaction
    const action = is_active ? 'user_enabled' : 'user_disabled';
    await recordAudit({
      client,
      actorId: req.user.id,
      actorLabel: req.user.username,
      action,
      result: 'success',
      ip,
      userAgent,
      details: {
        targetUserId: targetUser.id,
        targetUsername: targetUser.username,
        is_active,
      },
    });

    await client.query('COMMIT');

    return res.status(200).json({
      message: `User ${targetUser.username} has been ${is_active ? 'enabled' : 'disabled'}`,
      user: {
        id: targetUser.id,
        username: targetUser.username,
        email: targetUser.email,
        role: targetUser.role,
        is_active,
      },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Update user status error:', err.message);
    return res.status(500).json({ error: 'Failed to update user status' });
  } finally {
    client.release();
  }
});

module.exports = router;
