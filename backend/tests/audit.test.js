// Tests for cryptographic audit logging, chain hashing, sanitization, and verification

const { pool, resetTestDb } = require('./helpers/db');
const { recordAudit, verifyAuditChain, GENESIS_PREV_HASH } = require('../src/audit/record');

describe('Cryptographic Audit Trail', () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  afterAll(async () => {
    await pool.end();
  });

  test('creates a valid genesis entry and consecutive chained entries', async () => {
    // Record first audit entry
    const entry1 = await recordAudit({
      actorLabel: 'user_one',
      action: 'login',
      result: 'success',
      ip: '192.168.1.1',
      userAgent: 'Mozilla/5.0',
      details: { method: 'password' },
    });

    expect(entry1.prev_hash).toBe(GENESIS_PREV_HASH);
    expect(entry1.hash).toHaveLength(64);

    // Record second audit entry
    const entry2 = await recordAudit({
      actorLabel: 'user_one',
      action: 'upload',
      result: 'success',
      ip: '192.168.1.1',
      userAgent: 'Mozilla/5.0',
      details: { title: 'Secret Doc' },
    });

    expect(entry2.prev_hash).toBe(entry1.hash);
    expect(entry2.hash).toHaveLength(64);
    expect(entry2.hash).not.toBe(entry1.hash);

    // Verify chain integrity
    const verifyResult = await verifyAuditChain();
    expect(verifyResult.ok).toBe(true);
    expect(verifyResult.count).toBe(2);
    expect(verifyResult.head).toBe(entry2.hash);
  });

  test('sanitizes strings: strips newlines, control characters, and truncates', async () => {
    const dirtyActor = 'evil\nuser\x00with\x1Bcontrol\r\nchars';
    const longAction = 'a'.repeat(200);

    const entry = await recordAudit({
      actorLabel: dirtyActor,
      action: longAction,
      result: 'success',
      ip: '10.0.0.1',
      userAgent: 'Test\nAgent',
      details: {
        rawInput: 'value\x08with\x09tabs\nand\rnewlines',
      },
    });

    const res = await pool.query('SELECT * FROM audit_log WHERE id = $1', [entry.id]);
    const row = res.rows[0];

    // Check that control characters and newlines are stripped/spaced
    expect(row.actor_label).not.toContain('\n');
    expect(row.actor_label).not.toContain('\r');
    expect(row.actor_label).not.toContain('\x00');
    expect(row.action).toHaveLength(100); // Truncated to max 100
    expect(row.details.rawInput).not.toContain('\n');
  });

  test('never stores sensitive keys such as password or sessionId in details', async () => {
    const entry = await recordAudit({
      actorLabel: 'testuser',
      action: 'register',
      result: 'success',
      ip: '127.0.0.1',
      userAgent: 'Jest',
      details: {
        username: 'testuser',
        password: 'SuperSecretPassword123!',
        confirmPassword: 'SuperSecretPassword123!',
        sessionId: '550e8400-e29b-41d4-a716-446655440000',
        token: 'secret-bearer-token',
        email: 'test@example.com',
      },
    });

    const res = await pool.query('SELECT * FROM audit_log WHERE id = $1', [entry.id]);
    const details = res.rows[0].details;

    expect(details.password).toBeUndefined();
    expect(details.confirmPassword).toBeUndefined();
    expect(details.sessionId).toBeUndefined();
    expect(details.token).toBeUndefined();
    expect(details.username).toBe('testuser');
    expect(details.email).toBe('test@example.com');
  });

  test('reports tampering when a row hash is corrupted', async () => {
    // Record two valid entries
    await recordAudit({
      actorLabel: 'user1',
      action: 'action1',
      result: 'success',
    });
    const entry2 = await recordAudit({
      actorLabel: 'user2',
      action: 'action2',
      result: 'success',
    });

    // Temporarily disable the row trigger to simulate tampering
    await pool.query('ALTER TABLE audit_log DISABLE TRIGGER trg_audit_log_no_update_delete');
    try {
      await pool.query(
        'UPDATE audit_log SET hash = $1 WHERE id = $2',
        ['f'.repeat(64), entry2.id]
      );
    } finally {
      await pool.query('ALTER TABLE audit_log ENABLE TRIGGER trg_audit_log_no_update_delete');
    }

    // Verify should fail and identify broken id
    const verifyResult = await verifyAuditChain();
    expect(verifyResult.ok).toBe(false);
    expect(verifyResult.firstBrokenId).toBe(entry2.id);
  });
});
