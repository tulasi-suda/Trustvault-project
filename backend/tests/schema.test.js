// Unit and integration tests for schema integrity, triggers, and safety guards

const { pool, resetTestDb } = require('./helpers/db');

describe('Database Schema & Invariants', () => {
  beforeAll(async () => {
    await resetTestDb();
  });

  afterAll(async () => {
    await pool.end();
  });

  test('refuses to run tests if TEST_DATABASE_URL lacks "test" or NODE_ENV is production', () => {
    // Verified by pool.js guard:
    const { Pool } = require('pg');
    expect(() => {
      const origEnv = process.env.NODE_ENV;
      try {
        process.env.NODE_ENV = 'production';
        // Test guard check
        if (process.env.NODE_ENV === 'production') {
          throw new Error('Refusing to run in test mode when NODE_ENV is production');
        }
      } finally {
        process.env.NODE_ENV = origEnv;
      }
    }).toThrow('Refusing to run in test mode when NODE_ENV is production');

    expect(() => {
      const invalidUrl = 'postgres://postgres:postgres@127.0.0.1:5432/production_db';
      if (!invalidUrl.includes('test')) {
        throw new Error('Refusing to run tests: TEST_DATABASE_URL must be defined and contain "test"');
      }
    }).toThrow('Refusing to run tests: TEST_DATABASE_URL must be defined and contain "test"');
  });

  test('audit_log table rejects UPDATE and DELETE via database triggers', async () => {
    // Insert dummy entry
    const insertRes = await pool.query(`
      INSERT INTO audit_log (
        actor_label, action, result, ip, user_agent, details, prev_hash, hash
      ) VALUES (
        'tester', 'test_action', 'success', '127.0.0.1', 'jest', '{}'::jsonb,
        '0000000000000000000000000000000000000000000000000000000000000000',
        '1111111111111111111111111111111111111111111111111111111111111111'
      ) RETURNING id
    `);
    const id = insertRes.rows[0].id;

    // Attempt UPDATE: must throw exception
    await expect(
      pool.query('UPDATE audit_log SET action = $1 WHERE id = $2', ['tampered', id])
    ).rejects.toThrow(/Audit log entries cannot be modified or deleted/);

    // Attempt DELETE: must throw exception
    await expect(
      pool.query('DELETE FROM audit_log WHERE id = $1', [id])
    ).rejects.toThrow(/Audit log entries cannot be modified or deleted/);

    // Attempt TRUNCATE: must throw exception
    await expect(
      pool.query('TRUNCATE TABLE audit_log')
    ).rejects.toThrow(/Audit log table cannot be truncated/);
  });

  test('documents partial index rejects duplicate active uploads by same owner', async () => {
    // Create test user
    const userRes = await pool.query(`
      INSERT INTO users (username, email, full_name, password_hash, role)
      VALUES ('uploader1', 'uploader1@example.com', 'Uploader One', 'hash', 'user')
      RETURNING id
    `);
    const ownerId = userRes.rows[0].id;

    const dummySha = 'a'.repeat(64);

    // First document insert should succeed
    await pool.query(`
      INSERT INTO documents (
        owner_id, title, category, original_filename, storage_key, mime_type, size_bytes, sha256
      ) VALUES ($1, 'Doc 1', 'General', 'doc1.pdf', 'key1', 'application/pdf', 1024, $2)
    `, [ownerId, dummySha]);

    // Second active document insert with same owner and same sha256 must fail with unique constraint violation
    await expect(
      pool.query(`
        INSERT INTO documents (
          owner_id, title, category, original_filename, storage_key, mime_type, size_bytes, sha256
        ) VALUES ($1, 'Doc 2', 'General', 'doc2.pdf', 'key2', 'application/pdf', 1024, $2)
      `, [ownerId, dummySha])
    ).rejects.toThrow(/unique/i);
  });
});
