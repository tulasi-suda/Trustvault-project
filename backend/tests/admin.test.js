// Integration tests for admin endpoints, audit verification, user management, and security summaries

const request = require('supertest');
const crypto = require('crypto');
const app = require('../src/app');
const { pool, resetTestDb } = require('./helpers/db');
const { SESSION_COOKIE_NAME } = require('../src/auth/requireAuth');
const { recordAudit } = require('../src/audit/record');

async function createTestUser(username, role = 'user') {
  const email = `${username}@example.com`;
  const hash = '$2b$10$wT8K4y8aL1m5W5f0K8iUge4J1xL7h1W/dI0E0H5B0G5V8E5A0B2C.';
  const userRes = await pool.query(
    `INSERT INTO users (username, email, full_name, password_hash, role, is_active)
     VALUES ($1, $2, $3, $4, $5, TRUE)
     RETURNING id, username, email, role`,
    [username, email, username, hash, role]
  );
  const user = userRes.rows[0];

  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await pool.query('INSERT INTO sessions (id, user_id, expires_at) VALUES ($1, $2, $3)', [
    sessionId,
    user.id,
    expiresAt,
  ]);

  const cookie = `${SESSION_COOKIE_NAME}=${sessionId}`;
  return { user, cookie, sessionId };
}

describe('Admin Endpoints & User Management', () => {
  let admin, regularUser;

  beforeEach(async () => {
    await resetTestDb();
    admin = await createTestUser('admin_user', 'admin');
    regularUser = await createTestUser('regular_user', 'user');
  });

  afterAll(async () => {
    await pool.end();
  });

  test('Non-admin and anonymous callers receive 404 for all /api/admin routes', async () => {
    const endpoints = [
      { method: 'get', url: '/api/admin/audit' },
      { method: 'get', url: '/api/admin/audit/verify' },
      { method: 'get', url: '/api/admin/audit/head' },
      { method: 'get', url: '/api/admin/users' },
      { method: 'get', url: '/api/admin/worth-noticing' },
      { method: 'patch', url: `/api/admin/users/${regularUser.user.id}/status` },
    ];

    for (const ep of endpoints) {
      // Anonymous
      const anonRes = await request(app)[ep.method](ep.url);
      expect(anonRes.status).toBe(404);

      // Regular user
      const userRes = await request(app)[ep.method](ep.url).set('Cookie', regularUser.cookie);
      expect(userRes.status).toBe(404);
    }
  });

  test('GET /api/admin/audit returns paginated logs and supports filters', async () => {
    // Generate some audit logs
    await recordAudit({
      actorId: admin.user.id,
      actorLabel: admin.user.username,
      action: 'admin_test_action',
      result: 'success',
      details: { sample: 'data' },
    });

    const res = await request(app).get('/api/admin/audit?action=admin_test').set('Cookie', admin.cookie);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.logs)).toBe(true);
    expect(res.body.logs.length).toBeGreaterThan(0);
    expect(res.body.logs[0].action).toBe('admin_test_action');
    expect(res.body.pagination).toBeDefined();
    expect(res.body.pagination.total).toBeGreaterThan(0);
  });

  test('GET /api/admin/audit/verify recomputes chain and GET /api/admin/audit/head returns latest hash', async () => {
    // Create audit events
    const entry = await recordAudit({
      actorLabel: 'system',
      action: 'system_check',
      result: 'success',
    });

    // Verify chain
    const verifyRes = await request(app).get('/api/admin/audit/verify').set('Cookie', admin.cookie);
    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.ok).toBe(true);
    expect(verifyRes.body.head).toBe(entry.hash);

    // Head
    const headRes = await request(app).get('/api/admin/audit/head').set('Cookie', admin.cookie);
    expect(headRes.status).toBe(200);
    expect(headRes.body.head).toBe(entry.hash);
  });

  test('PATCH /api/admin/users/:id/status disables user and ends their session immediately', async () => {
    // Attempt to disable self -> 400
    const selfRes = await request(app)
      .patch(`/api/admin/users/${admin.user.id}/status`)
      .set('Cookie', admin.cookie)
      .send({ is_active: false });
    expect(selfRes.status).toBe(400);
    expect(selfRes.body.error).toMatch(/cannot disable your own account/i);

    // Disable regularUser -> 200
    const disableRes = await request(app)
      .patch(`/api/admin/users/${regularUser.user.id}/status`)
      .set('Cookie', admin.cookie)
      .send({ is_active: false });
    expect(disableRes.status).toBe(200);
    expect(disableRes.body.user.is_active).toBe(false);

    // Verify sessions for regularUser were deleted from the database
    const sessRes = await pool.query('SELECT * FROM sessions WHERE user_id = $1', [regularUser.user.id]);
    expect(sessRes.rows.length).toBe(0);

    // regularUser attempting to use their old session cookie -> 401
    const meRes = await request(app).get('/api/auth/me').set('Cookie', regularUser.cookie);
    expect(meRes.status).toBe(401);

    // Re-enabling the user
    const enableRes = await request(app)
      .patch(`/api/admin/users/${regularUser.user.id}/status`)
      .set('Cookie', admin.cookie)
      .send({ is_active: true });
    expect(enableRes.status).toBe(200);
    expect(enableRes.body.user.is_active).toBe(true);
  });

  test('GET /api/admin/worth-noticing detects high denials, downloads, and failed logins', async () => {
    // Seed 5 denials by one user
    for (let i = 0; i < 5; i++) {
      await recordAudit({
        actorId: regularUser.user.id,
        actorLabel: regularUser.user.username,
        action: 'authorize_denied',
        result: 'denied',
      });
    }

    // Seed 10 downloads by admin
    for (let i = 0; i < 10; i++) {
      await recordAudit({
        actorId: admin.user.id,
        actorLabel: admin.user.username,
        action: 'download',
        result: 'success',
      });
    }

    // Seed 11 failed logins from IP 198.51.100.1
    for (let i = 0; i < 11; i++) {
      await recordAudit({
        actorLabel: 'attacker',
        action: 'login',
        result: 'failure',
        ip: '198.51.100.1',
      });
    }

    const res = await request(app).get('/api/admin/worth-noticing').set('Cookie', admin.cookie);

    expect(res.status).toBe(200);
    expect(res.body.repeatedDenials.length).toBeGreaterThan(0);
    expect(res.body.repeatedDenials[0].actor_label).toBe('regular_user');
    expect(parseInt(res.body.repeatedDenials[0].count, 10)).toBeGreaterThanOrEqual(5);

    expect(res.body.highDownloads.length).toBeGreaterThan(0);
    expect(res.body.highDownloads[0].actor_label).toBe('admin_user');
    expect(parseInt(res.body.highDownloads[0].count, 10)).toBeGreaterThanOrEqual(10);

    expect(res.body.failedLoginsByIp.length).toBeGreaterThan(0);
    expect(res.body.failedLoginsByIp[0].ip).toBe('198.51.100.1');
    expect(parseInt(res.body.failedLoginsByIp[0].count, 10)).toBeGreaterThanOrEqual(11);
  });
});
