// Centralized document authorization function
// Invariant 1: ONE function, authorize(user, documentId, action), decides all document access.
// Every document route calls it FIRST.

const { pool } = require('../db/pool');
const { recordAudit } = require('../audit/record');
const { UUID_REGEX } = require('./requireAuth');

class NotFoundError extends Error {
  constructor(message = 'Document not found') {
    super(message);
    this.name = 'NotFoundError';
    this.status = 404;
  }
}

// Allowed actions matrix for document roles
const ALLOWED_ACTIONS = {
  owner: ['view_metadata', 'download', 'edit', 'delete', 'share', 'revoke', 'list_grants'],
  editor: ['view_metadata', 'download', 'edit'],
  viewer: ['view_metadata', 'download'],
  admin_unassigned: ['view_metadata'],
};

/**
 * Authorize document access.
 * Reads permissions from database on every request (no caching).
 * Denials, missing documents, soft-deleted documents, or invalid UUIDs
 * all throw NotFoundError answered as 404 with identical body.
 */
async function authorize(user, documentId, action, req = null) {
  const ip = req ? (req.ip || req.connection.remoteAddress || '127.0.0.1') : '127.0.0.1';
  const userAgent = req ? (req.get('user-agent') || 'unknown') : 'unknown';

  // Helper to record denial in its own short transaction before throwing 404
  async function recordDenialAndThrow(reason) {
    try {
      await recordAudit({
        actorId: user ? user.id : null,
        actorLabel: user ? user.username : 'anonymous',
        action: 'authorize_denied',
        documentId: UUID_REGEX.test(documentId) ? documentId : null,
        result: 'denied',
        ip,
        userAgent,
        details: {
          attemptedAction: action,
          reason,
        },
      });
    } catch (auditErr) {
      console.error('Failed to record audit denial:', auditErr.message);
    }

    // Always throw identical NotFoundError (prevents existence leaking)
    throw new NotFoundError('Document not found');
  }

  // 1. Validate user existence
  if (!user || !user.id) {
    await recordDenialAndThrow('unauthenticated');
  }

  // 2. Validate document UUID format
  if (!documentId || !UUID_REGEX.test(documentId)) {
    await recordDenialAndThrow('invalid_document_uuid');
  }

  // 3. Read permissions fresh from the database on every request (No caching)
  const query = `
    SELECT d.id, d.owner_id, d.title, d.description, d.category,
           d.original_filename, d.storage_key, d.mime_type, d.size_bytes,
           d.sha256, d.created_at, d.deleted_at,
           u.username AS owner_username,
           g.permission AS grant_permission
    FROM documents d
    JOIN users u ON d.owner_id = u.id
    LEFT JOIN grants g ON g.document_id = d.id AND g.user_id = $1
    WHERE d.id = $2
  `;

  const res = await pool.query(query, [user.id, documentId]);

  // 4. Missing document
  if (res.rows.length === 0) {
    await recordDenialAndThrow('document_not_found');
  }

  const doc = res.rows[0];

  // 5. Soft-deleted documents: denied to everyone (including owner and admin)
  if (doc.deleted_at !== null) {
    await recordDenialAndThrow('document_soft_deleted');
  }

  // 6. Determine caller role and permission
  let callerRole = null;
  if (doc.owner_id === user.id) {
    callerRole = 'owner';
  } else if (doc.grant_permission === 'edit') {
    callerRole = 'editor';
  } else if (doc.grant_permission === 'read') {
    callerRole = 'viewer';
  } else if (user.role === 'admin') {
    callerRole = 'admin_unassigned';
  }

  // If user has neither ownership, grant, nor admin role
  if (!callerRole) {
    await recordDenialAndThrow('no_permission');
  }

  const allowedActions = ALLOWED_ACTIONS[callerRole] || [];

  // Check if requested action is authorized for this role
  if (!allowedActions.includes(action)) {
    await recordDenialAndThrow(`action_forbidden_for_${callerRole}`);
  }

  // Return document and authorized context
  return {
    document: doc,
    role: callerRole,
    permission: doc.grant_permission || (callerRole === 'owner' ? 'owner' : 'view_metadata'),
  };
}

module.exports = {
  authorize,
  NotFoundError,
  ALLOWED_ACTIONS,
};
