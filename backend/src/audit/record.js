// Audit log recording and cryptographic hash chain computation
// All chain hashing logic is centralized in this module.

const crypto = require('crypto');
const { pool } = require('../db/pool');

// Advisory lock identifier used for serializing audit log chain writes
const AUDIT_LOCK_ID = 424242;
const GENESIS_PREV_HASH = '0'.repeat(64);

// Sanitize user-provided strings: strip control characters, newlines, and truncate
function sanitizeString(str, maxLength = 255) {
  if (typeof str !== 'string') return '';
  // Replace control characters (ASCII 0-31, 127) and newlines with space
  const cleaned = str.replace(/[\x00-\x1F\x7F]/g, ' ').replace(/\s+/g, ' ').trim();
  return cleaned.slice(0, maxLength);
}

// Ensure sensitive details (passwords, tokens, cookies, raw binary) are never stored in audit_log
function sanitizeDetails(details) {
  if (!details || typeof details !== 'object') return {};
  const forbiddenKeys = ['password', 'confirmPassword', 'token', 'session', 'sessionId', 'content', 'file'];
  const sanitized = {};

  for (const [key, value] of Object.entries(details)) {
    if (forbiddenKeys.some(fk => key.toLowerCase().includes(fk.toLowerCase()))) {
      continue;
    }
    if (typeof value === 'string') {
      sanitized[key] = sanitizeString(value, 500);
    } else if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
      sanitized[key] = value;
    } else if (Array.isArray(value)) {
      sanitized[key] = value.map(item => (typeof item === 'string' ? sanitizeString(item, 255) : item));
    } else if (typeof value === 'object') {
      sanitized[key] = sanitizeDetails(value);
    }
  }

  return sanitized;
}

// Compute deterministic canonical JSON and hash for chain verification
function computeCanonicalHash(prevHash, entry) {
  // Deterministic fixed key order canonical representation
  const canonicalObj = {
    action: entry.action,
    actor_id: entry.actor_id || null,
    actor_label: entry.actor_label,
    details: entry.details || {},
    document_id: entry.document_id || null,
    ip: entry.ip,
    result: entry.result,
    user_agent: entry.user_agent,
  };

  // Sort keys alphabetically to guarantee exact canonical JSON serialization
  const sortedKeys = Object.keys(canonicalObj).sort();
  const sortedObj = {};
  for (const key of sortedKeys) {
    sortedObj[key] = canonicalObj[key];
  }

  const canonicalJson = JSON.stringify(sortedObj);
  return crypto.createHash('sha256').update(prevHash + canonicalJson).digest('hex');
}

/**
 * Record an audit log entry.
 * If client is passed, runs inside caller's existing transaction.
 * If client is omitted, runs in its own standalone transaction.
 */
async function recordAudit({
  client: externalClient,
  actorId = null,
  actorLabel = 'anonymous',
  action,
  documentId = null,
  result,
  ip = 'unknown',
  userAgent = 'unknown',
  details = {},
}) {
  const isInternalTx = !externalClient;
  const client = externalClient || await pool.connect();

  try {
    if (isInternalTx) {
      await client.query('BEGIN');
    }

    // Acquire transaction-scoped advisory lock to serialize audit entries and prevent race conditions
    await client.query('SELECT pg_advisory_xact_lock($1)', [AUDIT_LOCK_ID]);

    // Fetch the previous hash (highest ID)
    const prevRes = await client.query('SELECT hash FROM audit_log ORDER BY id DESC LIMIT 1');
    const prevHash = prevRes.rows.length > 0 ? prevRes.rows[0].hash : GENESIS_PREV_HASH;

    // Sanitize all inputs before saving
    const sanitizedActorLabel = sanitizeString(actorLabel, 100);
    const sanitizedAction = sanitizeString(action, 100);
    const sanitizedResult = sanitizeString(result, 50);
    const sanitizedIp = sanitizeString(ip, 50);
    const sanitizedUserAgent = sanitizeString(userAgent, 255);
    const sanitizedDetailsObj = sanitizeDetails(details);

    const entryToHash = {
      action: sanitizedAction,
      actor_id: actorId,
      actor_label: sanitizedActorLabel,
      details: sanitizedDetailsObj,
      document_id: documentId,
      ip: sanitizedIp,
      result: sanitizedResult,
      user_agent: sanitizedUserAgent,
    };

    const hash = computeCanonicalHash(prevHash, entryToHash);

    const insertRes = await client.query(
      `INSERT INTO audit_log (
        actor_id, actor_label, action, document_id, result, ip, user_agent, details, prev_hash, hash
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id, created_at, prev_hash, hash`,
      [
        actorId,
        sanitizedActorLabel,
        sanitizedAction,
        documentId,
        sanitizedResult,
        sanitizedIp,
        sanitizedUserAgent,
        sanitizedDetailsObj,
        prevHash,
        hash,
      ]
    );

    if (isInternalTx) {
      await client.query('COMMIT');
    }

    return insertRes.rows[0];
  } catch (err) {
    if (isInternalTx) {
      await client.query('ROLLBACK').catch(() => {});
    }
    throw err;
  } finally {
    if (isInternalTx) {
      client.release();
    }
  }
}

/**
 * Verify integrity of the audit log chain.
 * Checks contiguous IDs and recomputes hashes starting from genesis.
 */
async function verifyAuditChain() {
  const res = await pool.query('SELECT * FROM audit_log ORDER BY id ASC');
  const rows = res.rows;

  if (rows.length === 0) {
    return { ok: true, count: 0, head: GENESIS_PREV_HASH };
  }

  let expectedPrevHash = GENESIS_PREV_HASH;
  let expectedId = rows[0].id; // First row id

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    // Check contiguous IDs
    if (BigInt(row.id) !== BigInt(expectedId)) {
      return {
        ok: false,
        error: 'broken_sequence',
        expectedId: expectedId.toString(),
        actualId: row.id.toString(),
        firstBrokenId: row.id,
      };
    }

    // Check prev_hash link
    if (row.prev_hash !== expectedPrevHash) {
      return {
        ok: false,
        error: 'prev_hash_mismatch',
        firstBrokenId: row.id,
      };
    }

    // Recompute current hash
    const recomputedHash = computeCanonicalHash(row.prev_hash, {
      action: row.action,
      actor_id: row.actor_id,
      actor_label: row.actor_label,
      details: row.details,
      document_id: row.document_id,
      ip: row.ip,
      result: row.result,
      user_agent: row.user_agent,
    });

    if (recomputedHash !== row.hash) {
      return {
        ok: false,
        error: 'hash_mismatch',
        firstBrokenId: row.id,
      };
    }

    expectedPrevHash = row.hash;
    expectedId = BigInt(expectedId) + 1n;
  }

  return {
    ok: true,
    count: rows.length,
    head: rows[rows.length - 1].hash,
  };
}

module.exports = {
  recordAudit,
  verifyAuditChain,
  computeCanonicalHash,
  GENESIS_PREV_HASH,
};
