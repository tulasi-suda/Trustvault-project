// Integration tests for authentication, sessions, rate limiting, and profile endpoints

const request = require('supertest');
const app = require('../src/app');
const { pool, resetTestDb } = require('./helpers/db');
const { resetRateLimiters } = require('../src/auth/rateLimiter');
const { SESSION_COOKIE_NAME } = require('../src/auth/requireAuth');

describe('Auth & Session Management', () => {
  beforeEach(async () => {
    await resetTestDb();
    resetRateLimiters();
  });

  afterAll(async () => {
    await pool.end();
  });

  test('POST /api/auth/register enforces validation, ignores role/id, returns 201, does not log in', async () => {
    // Attempt registration with mass assignment injection attempt (role: 'admin', is_active: false)
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        username: 'alice_01',
        email: 'alice@example.com',
        password: 'ValidPassword123!',
        confirmPassword: 'ValidPassword123!',
        role: 'admin',
        is_active: false,
        id: '00000000-0000-0000-0000-000000000000',
      });

    expect(res.status).toBe(201);
    expect(res.body.message).toMatch(/registered successfully/i);
    // Does not log in: no session cookie set
    expect(res.headers['set-cookie']).toBeUndefined();

    // Verify database record has role 'user' and is_active TRUE
    const dbRes = await pool.query('SELECT * FROM users WHERE username = $1', ['alice_01']);
    expect(dbRes.rows.length).toBe(1);
    const user = dbRes.rows[0];
    expect(user.role).toBe('user');
    expect(user.is_active).toBe(true);
    expect(user.id).not.toBe('00000000-0000-0000-0000-000000000000');
  });

  test('POST /api/auth/register validates password complexity and password matching', async () => {
    // Password too short
    const resShort = await request(app)
      .post('/api/auth/register')
      .send({
        username: 'bob_01',
        email: 'bob@example.com',
        password: 'Short1!',
        confirmPassword: 'Short1!',
      });
    expect(resShort.status).toBe(400);

    // Password without numbers
    const resNoNum = await request(app)
      .post('/api/auth/register')
      .send({
        username: 'bob_01',
        email: 'bob@example.com',
        password: 'NoNumbersHere!',
        confirmPassword: 'NoNumbersHere!',
      });
    expect(resNoNum.status).toBe(400);

    // Password mismatch
    const resMismatch = await request(app)
      .post('/api/auth/register')
      .send({
        username: 'bob_01',
        email: 'bob@example.com',
        password: 'ValidPassword123!',
        confirmPassword: 'DifferentPassword123!',
      });
    expect(resMismatch.status).toBe(400);
  });

  test('POST /api/auth/register returns 409 for duplicate username or email', async () => {
    // First registration
    await request(app)
      .post('/api/auth/register')
      .send({
        username: 'charlie',
        email: 'charlie@example.com',
        password: 'ValidPassword123!',
        confirmPassword: 'ValidPassword123!',
      });

    // Duplicate email
    const dupEmail = await request(app)
      .post('/api/auth/register')
      .send({
        username: 'charlie2',
        email: 'charlie@example.com',
        password: 'ValidPassword123!',
        confirmPassword: 'ValidPassword123!',
      });
    expect(dupEmail.status).toBe(409);
    expect(dupEmail.body.error).toBe('Username or email already in use');

    // Duplicate username case-insensitive
    const dupUser = await request(app)
      .post('/api/auth/register')
      .send({
        username: 'CHARLIE',
        email: 'charlie_other@example.com',
        password: 'ValidPassword123!',
        confirmPassword: 'ValidPassword123!',
      });
    expect(dupUser.status).toBe(409);
  });

  test('POST /api/auth/register rate limits after 5 attempts per IP per hour', async () => {
    for (let i = 0; i < 5; i++) {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          username: `user_${i}`,
          email: `user_${i}@example.com`,
          password: 'ValidPassword123!',
          confirmPassword: 'ValidPassword123!',
        });
      expect(res.status).toBe(201);
    }

    // 6th attempt should be rate limited
    const resBlocked = await request(app)
      .post('/api/auth/register')
      .send({
        username: 'user_6',
        email: 'user_6@example.com',
        password: 'ValidPassword123!',
        confirmPassword: 'ValidPassword123!',
      });
    expect(resBlocked.status).toBe(429);
  });

  test('POST /api/auth/login handles generic 401 for unknown user and wrong password', async () => {
    // Register user
    await request(app)
      .post('/api/auth/register')
      .send({
        username: 'david_01',
        email: 'david@example.com',
        password: 'ValidPassword123!',
        confirmPassword: 'ValidPassword123!',
      });

    // Unknown user
    const unknownRes = await request(app)
      .post('/api/auth/login')
      .send({
        login: 'nonexistent',
        password: 'ValidPassword123!',
      });
    expect(unknownRes.status).toBe(401);
    expect(unknownRes.body.error).toBe('Invalid username or password');

    // Wrong password
    const wrongPassRes = await request(app)
      .post('/api/auth/login')
      .send({
        login: 'david_01',
        password: 'WrongPassword123!',
      });
    expect(wrongPassRes.status).toBe(401);
    expect(wrongPassRes.body.error).toBe('Invalid username or password');
  });

  test('POST /api/auth/login rate limiting counts ONLY failed attempts', async () => {
    process.env.LOGIN_RATE_LIMIT_MAX = '3';

    // Register user
    await request(app)
      .post('/api/auth/register')
      .send({
        username: 'eve_01',
        email: 'eve@example.com',
        password: 'ValidPassword123!',
        confirmPassword: 'ValidPassword123!',
      });

    // 3 failed attempts
    for (let i = 0; i < 3; i++) {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ login: 'eve_01', password: 'wrong' });
      expect(res.status).toBe(401);
    }

    // 4th attempt blocked by rate limit
    const blockedRes = await request(app)
      .post('/api/auth/login')
      .send({ login: 'eve_01', password: 'ValidPassword123!' });
    expect(blockedRes.status).toBe(429);
  });

  test('POST /api/auth/login creates session cookie, GET /api/auth/me returns user, POST /logout deletes session', async () => {
    // Register user
    await request(app)
      .post('/api/auth/register')
      .send({
        username: 'frank_01',
        email: 'frank@example.com',
        password: 'ValidPassword123!',
        confirmPassword: 'ValidPassword123!',
      });

    // Login
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({
        login: 'frank_01',
        password: 'ValidPassword123!',
      });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.user.username).toBe('frank_01');

    // Extract cookie
    const cookies = loginRes.headers['set-cookie'];
    expect(cookies).toBeDefined();
    const sessionCookie = cookies.find(c => c.startsWith(`${SESSION_COOKIE_NAME}=`));
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie).toContain('HttpOnly');
    expect(sessionCookie).toContain('SameSite=Lax');

    // GET /api/auth/me
    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Cookie', sessionCookie);
    expect(meRes.status).toBe(200);
    expect(meRes.body.user.username).toBe('frank_01');

    // Logout
    const logoutRes = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', sessionCookie);
    expect(logoutRes.status).toBe(200);

    // Verify session row is deleted from database
    const sessCount = await pool.query('SELECT COUNT(*) FROM sessions');
    expect(parseInt(sessCount.rows[0].count, 10)).toBe(0);

    // After logout, accessing /me is 401
    const unauthRes = await request(app)
      .get('/api/auth/me')
      .set('Cookie', sessionCookie);
    expect(unauthRes.status).toBe(401);
  });

  test('Profile PATCH updates fields, POST /api/profile/password deletes all OTHER sessions', async () => {
    // Register user
    await request(app)
      .post('/api/auth/register')
      .send({
        username: 'grace_01',
        email: 'grace@example.com',
        password: 'OldPassword123!',
        confirmPassword: 'OldPassword123!',
      });

    // Login session 1
    const login1 = await request(app)
      .post('/api/auth/login')
      .send({ login: 'grace_01', password: 'OldPassword123!' });
    const cookie1 = login1.headers['set-cookie'].find(c => c.startsWith(`${SESSION_COOKIE_NAME}=`));

    // Login session 2
    const login2 = await request(app)
      .post('/api/auth/login')
      .send({ login: 'grace_01', password: 'OldPassword123!' });
    const cookie2 = login2.headers['set-cookie'].find(c => c.startsWith(`${SESSION_COOKIE_NAME}=`));

    // Both sessions exist in database
    const preCount = await pool.query('SELECT COUNT(*) FROM sessions');
    expect(parseInt(preCount.rows[0].count, 10)).toBe(2);

    // PATCH profile name
    const patchRes = await request(app)
      .patch('/api/profile')
      .set('Cookie', cookie1)
      .send({ full_name: 'Grace Hopper' });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.user.full_name).toBe('Grace Hopper');

    // Change password from session 1: must delete session 2 and keep session 1
    const passRes = await request(app)
      .post('/api/profile/password')
      .set('Cookie', cookie1)
      .send({
        currentPassword: 'OldPassword123!',
        newPassword: 'NewPassword456!',
        confirmNewPassword: 'NewPassword456!',
      });
    expect(passRes.status).toBe(200);

    // Session 1 is still authenticated
    const meRes1 = await request(app)
      .get('/api/auth/me')
      .set('Cookie', cookie1);
    expect(meRes1.status).toBe(200);

    // Session 2 is now invalidated (401)
    const meRes2 = await request(app)
      .get('/api/auth/me')
      .set('Cookie', cookie2);
    expect(meRes2.status).toBe(401);
  });
});
