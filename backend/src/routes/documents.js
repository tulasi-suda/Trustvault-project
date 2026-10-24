// Document routes: upload, metadata, download, edit, delete, search, grants
const express = require('express');
const crypto = require('crypto');
const multer = require('multer');
const { pool } = require('../db/pool');
const { requireAuth } = require('../auth/requireAuth');
const { authorize, NotFoundError } = require('../auth/authorize');
const { recordAudit } = require('../audit/record');
const { storeFile, retrieveFile } = require('../storage/fileStorage');
const {
  validateFile,
  ALLOWED_CATEGORIES,
  MAX_FILE_SIZE,
} = require('../utils/fileValidation');

const router = express.Router();

// Memory storage for multer so we can check magic bytes, compute SHA-256, and validate before persisting
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
});

// All document routes require authentication
router.use(requireAuth);

// Helper for error handling in document routes
function handleRouteError(err, res) {
  if (err instanceof NotFoundError || err.name === 'NotFoundError') {
    return res.status(404).json({ error: 'Document not found' });
  }
  console.error('Document route error:', err.message);
  return res.status(500).json({ error: 'Internal server error' });
}

// 1. POST /api/documents (Upload document)
router.post('/', upload.single('file'), async (req, res) => {
  const ip = req.ip || req.connection.remoteAddress || '127.0.0.1';
  const userAgent = req.get('user-agent') || 'unknown';

  const { title, description, category, sharedWith, clientSha256 } = req.body || {};

  // Title validation
  const cleanTitle = (title || '').trim().slice(0, 255);
  if (!cleanTitle) {
    return res.status(400).json({ error: 'Title is required' });
  }

  // Category validation (allowlist)
  if (!category || !ALLOWED_CATEGORIES.includes(category)) {
    return res.status(400).json({
      error: `Category must be one of: ${ALLOWED_CATEGORIES.join(', ')}`,
    });
  }

  // File validation
  const fileValidation = validateFile(req.file);
  if (!fileValidation.valid) {
    return res.status(400).json({ error: fileValidation.error });
  }

  // Compute server-side SHA-256
  const serverSha256 = crypto
    .createHash('sha256')
    .update(req.file.buffer)
    .digest('hex');

  // Compare with clientSha256 if provided
  if (clientSha256 && clientSha256.toLowerCase() !== serverSha256.toLowerCase()) {
    return res.status(400).json({ error: 'File was altered during upload' });
  }

  // Parse and validate sharedWith recipients
  let shareList = [];
  if (sharedWith) {
    try {
      shareList = typeof sharedWith === 'string' ? JSON.parse(sharedWith) : sharedWith;
      if (!Array.isArray(shareList)) {
        return res.status(400).json({ error: 'sharedWith must be a JSON array of {email, permission}' });
      }
    } catch (e) {
      return res.status(400).json({ error: 'Invalid sharedWith JSON format' });
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Check for duplicate active upload by the same owner
    const dupCheck = await client.query(
      `SELECT id FROM documents
       WHERE owner_id = $1 AND sha256 = $2 AND deleted_at IS NULL`,
      [req.user.id, serverSha256]
    );

    if (dupCheck.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: 'A document with identical content has already been uploaded by you',
      });
    }

    // Resolve every sharedWith email to an active user with role 'user' who is not the uploader
    const resolvedGrants = [];
    if (shareList.length > 0) {
      const unknownEmails = [];

      for (const item of shareList) {
        const targetEmail = (item.email || '').trim().toLowerCase();
        const perm = (item.permission || 'read').toLowerCase();

        if (!['read', 'edit'].includes(perm)) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: `Invalid permission "${perm}". Must be "read" or "edit"` });
        }

        // Cannot share with oneself
        if (targetEmail === req.user.email.toLowerCase()) {
          continue;
        }

        // Query user by email: must be active and role 'user'
        const recipientRes = await client.query(
          `SELECT id, username, email FROM users
           WHERE LOWER(email) = LOWER($1) AND is_active = TRUE AND role = 'user'`,
          [targetEmail]
        );

        if (recipientRes.rows.length === 0) {
          unknownEmails.push(targetEmail);
        } else {
          resolvedGrants.push({
            userId: recipientRes.rows[0].id,
            permission: perm,
          });
        }
      }

      // Any unknown email fails the whole upload
      if (unknownEmails.length > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: `The following recipient emails could not be found or are ineligible: ${unknownEmails.join(', ')}`,
        });
      }
    }

    // Insert document record
    const docId = crypto.randomUUID();
    const docRes = await client.query(
      `INSERT INTO documents (
        id, owner_id, title, description, category, original_filename,
        storage_key, mime_type, size_bytes, sha256
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [
        docId,
        req.user.id,
        cleanTitle,
        (description || '').trim(),
        category,
        fileValidation.cleanFilename,
        docId, // Initial key, updated below by storeFile
        fileValidation.mimeType,
        fileValidation.sizeBytes,
        serverSha256,
      ]
    );

    const document = docRes.rows[0];

    // Store file content in transactional storage
    const storageResult = await storeFile({
      documentId: document.id,
      buffer: req.file.buffer,
      client,
    });

    // Update storage_key if changed
    if (storageResult.storageKey !== document.storage_key) {
      await client.query('UPDATE documents SET storage_key = $1 WHERE id = $2', [
        storageResult.storageKey,
        document.id,
      ]);
      document.storage_key = storageResult.storageKey;
    }

    // Insert grants
    for (const grant of resolvedGrants) {
      await client.query(
        `INSERT INTO grants (document_id, user_id, permission, granted_by)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (document_id, user_id) DO UPDATE SET permission = EXCLUDED.permission`,
        [document.id, grant.userId, grant.permission, req.user.id]
      );
    }

    // Record audit row in the same transaction
    await recordAudit({
      client,
      actorId: req.user.id,
      actorLabel: req.user.username,
      action: 'upload',
      documentId: document.id,
      result: 'success',
      ip,
      userAgent,
      details: {
        title: document.title,
        category: document.category,
        sha256: document.sha256,
        sizeBytes: document.size_bytes,
        grantCount: resolvedGrants.length,
      },
    });

    await client.query('COMMIT');

    return res.status(201).json({
      message: 'Document uploaded successfully',
      document: {
        ...document,
        is_owner: true,
        my_permission: 'owner',
      },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Upload error:', err.message);
    return res.status(500).json({ error: 'Upload failed' });
  } finally {
    client.release();
  }
});

// 2. GET /api/documents (List documents)
// Filtered by ownership or grant IN SQL
router.get('/', async (req, res) => {
  const scope = (req.query.scope || 'all').toLowerCase();
  const isAdmin = req.user.role === 'admin';

  try {
    let sql = '';
    let params = [];

    if (isAdmin) {
      // Admin sees all non-deleted metadata only
      sql = `
        SELECT d.id, d.owner_id, d.title, d.description, d.category,
               d.original_filename, d.mime_type, d.size_bytes, d.sha256,
               d.created_at,
               u.username AS owner_username,
               (d.owner_id = $1) AS is_owner,
               CASE
                 WHEN d.owner_id = $1 THEN 'owner'
                 ELSE 'admin_metadata'
               END AS my_permission
        FROM documents d
        JOIN users u ON d.owner_id = u.id
        WHERE d.deleted_at IS NULL
        ORDER BY d.created_at DESC
      `;
      params = [req.user.id];
    } else {
      // Regular user queries filter strictly by ownership or grants IN SQL
      if (scope === 'mine') {
        sql = `
          SELECT d.id, d.owner_id, d.title, d.description, d.category,
                 d.original_filename, d.mime_type, d.size_bytes, d.sha256,
                 d.created_at,
                 u.username AS owner_username,
                 TRUE AS is_owner,
                 'owner' AS my_permission
          FROM documents d
          JOIN users u ON d.owner_id = u.id
          WHERE d.owner_id = $1 AND d.deleted_at IS NULL
          ORDER BY d.created_at DESC
        `;
        params = [req.user.id];
      } else if (scope === 'shared') {
        sql = `
          SELECT d.id, d.owner_id, d.title, d.description, d.category,
                 d.original_filename, d.mime_type, d.size_bytes, d.sha256,
                 d.created_at,
                 u.username AS owner_username,
                 FALSE AS is_owner,
                 g.permission AS my_permission
          FROM documents d
          JOIN users u ON d.owner_id = u.id
          JOIN grants g ON g.document_id = d.id AND g.user_id = $1
          WHERE d.owner_id != $1 AND d.deleted_at IS NULL
          ORDER BY d.created_at DESC
        `;
        params = [req.user.id];
      } else {
        // scope === 'all'
        sql = `
          SELECT d.id, d.owner_id, d.title, d.description, d.category,
                 d.original_filename, d.mime_type, d.size_bytes, d.sha256,
                 d.created_at,
                 u.username AS owner_username,
                 (d.owner_id = $1) AS is_owner,
                 CASE
                   WHEN d.owner_id = $1 THEN 'owner'
                   ELSE g.permission
                 END AS my_permission
          FROM documents d
          JOIN users u ON d.owner_id = u.id
          LEFT JOIN grants g ON g.document_id = d.id AND g.user_id = $1
          WHERE (d.owner_id = $1 OR g.user_id = $1) AND d.deleted_at IS NULL
          ORDER BY d.created_at DESC
        `;
        params = [req.user.id];
      }
    }

    const result = await pool.query(sql, params);
    return res.status(200).json({ documents: result.rows });
  } catch (err) {
    console.error('List documents error:', err.message);
    return res.status(500).json({ error: 'Failed to list documents' });
  }
});

// 3. GET /api/documents/search (Search documents)
// SQL-filtered by access rights with name, owner, category, date filters
router.get('/search', async (req, res) => {
  const { name, owner, category, from, to } = req.query;
  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || '20', 10)));
  const offset = (page - 1) * limit;

  const isAdmin = req.user.role === 'admin';

  try {
    let whereConditions = ['d.deleted_at IS NULL'];
    let whereParams = [];
    let pIdx = 1;

    // Filter by ownership or grant IN SQL
    if (!isAdmin) {
      whereConditions.push(`(d.owner_id = $${pIdx} OR g.user_id = $${pIdx})`);
      whereParams.push(req.user.id);
      pIdx++;
    }

    // Filter by title / original filename
    if (name) {
      whereConditions.push(`(d.title ILIKE $${pIdx} OR d.original_filename ILIKE $${pIdx})`);
      whereParams.push(`%${name}%`);
      pIdx++;
    }

    // Filter by owner username
    if (owner) {
      whereConditions.push(`u.username ILIKE $${pIdx}`);
      whereParams.push(`%${owner}%`);
      pIdx++;
    }

    // Filter by category
    if (category) {
      whereConditions.push(`d.category = $${pIdx}`);
      whereParams.push(category);
      pIdx++;
    }

    // Filter by created_at range
    if (from) {
      whereConditions.push(`d.created_at >= $${pIdx}`);
      whereParams.push(new Date(from));
      pIdx++;
    }
    if (to) {
      whereConditions.push(`d.created_at <= $${pIdx}`);
      whereParams.push(new Date(to));
      pIdx++;
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // Count total query
    const countQuery = `
      SELECT COUNT(DISTINCT d.id) AS total
      FROM documents d
      JOIN users u ON d.owner_id = u.id
      ${!isAdmin ? 'LEFT JOIN grants g ON g.document_id = d.id AND g.user_id = $1' : ''}
      ${whereClause}
    `;

    const countRes = await pool.query(countQuery, whereParams);
    const total = parseInt(countRes.rows[0].total, 10);

    // Data query
    const dataQuery = `
      SELECT d.id, d.owner_id, d.title, d.description, d.category,
             d.original_filename, d.mime_type, d.size_bytes, d.sha256,
             d.created_at,
             u.username AS owner_username,
             (d.owner_id = $${pIdx}::uuid) AS is_owner,
             CASE
               WHEN d.owner_id = $${pIdx}::uuid THEN 'owner'
               ${isAdmin ? "ELSE 'admin_metadata'" : 'ELSE g.permission'}
             END AS my_permission
      FROM documents d
      JOIN users u ON d.owner_id = u.id
      ${!isAdmin ? 'LEFT JOIN grants g ON g.document_id = d.id AND g.user_id = $1' : ''}
      ${whereClause}
      ORDER BY d.created_at DESC
      LIMIT $${pIdx + 1} OFFSET $${pIdx + 2}
    `;

    const dataParams = [...whereParams, req.user.id, limit, offset];
    const dataRes = await pool.query(dataQuery, dataParams);

    return res.status(200).json({
      documents: dataRes.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error('Search documents error:', err.message);
    return res.status(500).json({ error: 'Search failed' });
  }
});

// 4. GET /api/documents/:id (View metadata)
router.get('/:id', async (req, res) => {
  try {
    const authContext = await authorize(req.user, req.params.id, 'view_metadata', req);
    const doc = authContext.document;

    // If owner, include active grants
    let grants = [];
    if (authContext.role === 'owner') {
      const grantRes = await pool.query(
        `SELECT g.user_id, g.permission, g.created_at, u.username, u.email
         FROM grants g
         JOIN users u ON g.user_id = u.id
         WHERE g.document_id = $1
         ORDER BY g.created_at ASC`,
        [doc.id]
      );
      grants = grantRes.rows;
    }

    return res.status(200).json({
      document: {
        id: doc.id,
        owner_id: doc.owner_id,
        owner_username: doc.owner_username,
        title: doc.title,
        description: doc.description,
        category: doc.category,
        original_filename: doc.original_filename,
        mime_type: doc.mime_type,
        size_bytes: doc.size_bytes,
        sha256: doc.sha256,
        created_at: doc.created_at,
        is_owner: authContext.role === 'owner',
        my_permission: authContext.permission,
        grants,
      },
    });
  } catch (err) {
    return handleRouteError(err, res);
  }
});

// 5. GET /api/documents/:id/download (Download file)
router.get('/:id/download', async (req, res) => {
  const ip = req.ip || req.connection.remoteAddress || '127.0.0.1';
  const userAgent = req.get('user-agent') || 'unknown';

  try {
    // 1. Authorize download action
    const authContext = await authorize(req.user, req.params.id, 'download', req);
    const doc = authContext.document;

    // 2. Retrieve file content
    const fileBuffer = await retrieveFile({
      documentId: doc.id,
      storageKey: doc.storage_key,
    });

    if (!fileBuffer) {
      return res.status(404).json({ error: 'Document file content not found' });
    }

    // 3. Recompute SHA-256 and compare with database record
    const currentSha256 = crypto
      .createHash('sha256')
      .update(fileBuffer)
      .digest('hex');

    if (currentSha256.toLowerCase() !== doc.sha256.toLowerCase()) {
      // Integrity failed: audit failure and return generic 500 without sending file
      await recordAudit({
        actorId: req.user.id,
        actorLabel: req.user.username,
        action: 'integrity_failure',
        documentId: doc.id,
        result: 'failure',
        ip,
        userAgent,
        details: {
          expectedSha256: doc.sha256,
          computedSha256: currentSha256,
        },
      });
      return res.status(500).json({ error: 'File integrity check failed' });
    }

    // 4. Audit successful download
    await recordAudit({
      actorId: req.user.id,
      actorLabel: req.user.username,
      action: 'download',
      documentId: doc.id,
      result: 'success',
      ip,
      userAgent,
      details: { originalFilename: doc.original_filename, sizeBytes: doc.size_bytes },
    });

    // 5. Send file with strict security download headers
    // Sanitise filename for Content-Disposition header
    const cleanHeaderFilename = doc.original_filename.replace(/[^\w.-]/g, '_');

    res.setHeader('Content-Disposition', `attachment; filename="${cleanHeaderFilename}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', doc.mime_type || 'application/octet-stream');
    res.setHeader('Content-Length', fileBuffer.length);

    return res.status(200).send(fileBuffer);
  } catch (err) {
    return handleRouteError(err, res);
  }
});

// 6. PATCH /api/documents/:id (Edit metadata: title, description, category only)
router.patch('/:id', async (req, res) => {
  const ip = req.ip || req.connection.remoteAddress || '127.0.0.1';
  const userAgent = req.get('user-agent') || 'unknown';

  try {
    const authContext = await authorize(req.user, req.params.id, 'edit', req);
    const doc = authContext.document;

    const { title, description, category } = req.body || {};

    let newTitle = doc.title;
    if (title !== undefined) {
      newTitle = String(title).trim().slice(0, 255);
      if (!newTitle) {
        return res.status(400).json({ error: 'Title cannot be empty' });
      }
    }

    let newCategory = doc.category;
    if (category !== undefined) {
      if (!ALLOWED_CATEGORIES.includes(category)) {
        return res.status(400).json({
          error: `Category must be one of: ${ALLOWED_CATEGORIES.join(', ')}`,
        });
      }
      newCategory = category;
    }

    let newDescription = doc.description;
    if (description !== undefined) {
      newDescription = String(description).trim();
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const updateRes = await client.query(
        `UPDATE documents
         SET title = $1, description = $2, category = $3
         WHERE id = $4
         RETURNING *`,
        [newTitle, newDescription, newCategory, doc.id]
      );

      const updated = updateRes.rows[0];

      // Audit edit in the same transaction
      await recordAudit({
        client,
        actorId: req.user.id,
        actorLabel: req.user.username,
        action: 'edit',
        documentId: doc.id,
        result: 'success',
        ip,
        userAgent,
        details: {
          title: updated.title,
          category: updated.category,
        },
      });

      await client.query('COMMIT');

      return res.status(200).json({
        message: 'Document updated successfully',
        document: updated,
      });
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }
  } catch (err) {
    return handleRouteError(err, res);
  }
});

// 7. DELETE /api/documents/:id (Soft delete)
router.delete('/:id', async (req, res) => {
  const ip = req.ip || req.connection.remoteAddress || '127.0.0.1';
  const userAgent = req.get('user-agent') || 'unknown';

  try {
    const authContext = await authorize(req.user, req.params.id, 'delete', req);
    const doc = authContext.document;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        'UPDATE documents SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1',
        [doc.id]
      );

      // Audit soft delete in the same transaction
      await recordAudit({
        client,
        actorId: req.user.id,
        actorLabel: req.user.username,
        action: 'delete',
        documentId: doc.id,
        result: 'success',
        ip,
        userAgent,
        details: { title: doc.title },
      });

      await client.query('COMMIT');

      return res.status(200).json({ message: 'Document deleted successfully' });
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }
  } catch (err) {
    return handleRouteError(err, res);
  }
});

// 8. GET /api/documents/:id/grants (List document grants)
router.get('/:id/grants', async (req, res) => {
  try {
    const authContext = await authorize(req.user, req.params.id, 'list_grants', req);
    const doc = authContext.document;

    const grantRes = await pool.query(
      `SELECT g.user_id, g.permission, g.created_at, u.username, u.email
       FROM grants g
       JOIN users u ON g.user_id = u.id
       WHERE g.document_id = $1
       ORDER BY g.created_at ASC`,
      [doc.id]
    );

    return res.status(200).json({ grants: grantRes.rows });
  } catch (err) {
    return handleRouteError(err, res);
  }
});

// 9. POST /api/documents/:id/grants (Add or update grant)
router.post('/:id/grants', async (req, res) => {
  const ip = req.ip || req.connection.remoteAddress || '127.0.0.1';
  const userAgent = req.get('user-agent') || 'unknown';

  try {
    const authContext = await authorize(req.user, req.params.id, 'share', req);
    const doc = authContext.document;

    const { email, permission } = req.body || {};
    const targetEmail = (email || '').trim().toLowerCase();
    const perm = (permission || 'read').toLowerCase();

    if (!['read', 'edit'].includes(perm)) {
      return res.status(400).json({ error: 'Permission must be "read" or "edit"' });
    }

    if (targetEmail === req.user.email.toLowerCase()) {
      return res.status(400).json({ error: 'Cannot share document with yourself' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Resolve email to active user with role 'user'
      const recipientRes = await client.query(
        `SELECT id, username, email FROM users
         WHERE LOWER(email) = LOWER($1) AND is_active = TRUE AND role = 'user'`,
        [targetEmail]
      );

      if (recipientRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: `User with email "${targetEmail}" was not found or is ineligible for sharing`,
        });
      }

      const recipient = recipientRes.rows[0];

      await client.query(
        `INSERT INTO grants (document_id, user_id, permission, granted_by)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (document_id, user_id) DO UPDATE SET permission = EXCLUDED.permission`,
        [doc.id, recipient.id, perm, req.user.id]
      );

      // Audit grant addition in the same transaction
      await recordAudit({
        client,
        actorId: req.user.id,
        actorLabel: req.user.username,
        action: 'grant_added',
        documentId: doc.id,
        result: 'success',
        ip,
        userAgent,
        details: {
          recipientId: recipient.id,
          recipientUsername: recipient.username,
          permission: perm,
        },
      });

      await client.query('COMMIT');

      return res.status(200).json({
        message: 'Grant updated successfully',
        grant: {
          user_id: recipient.id,
          username: recipient.username,
          email: recipient.email,
          permission: perm,
        },
      });
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }
  } catch (err) {
    return handleRouteError(err, res);
  }
});

// 10. PATCH /api/documents/:id/grants/:userId (Update grant permission)
router.patch('/:id/grants/:userId', async (req, res) => {
  const ip = req.ip || req.connection.remoteAddress || '127.0.0.1';
  const userAgent = req.get('user-agent') || 'unknown';

  try {
    const authContext = await authorize(req.user, req.params.id, 'share', req);
    const doc = authContext.document;
    const targetUserId = req.params.userId;

    const { permission } = req.body || {};
    const perm = (permission || '').toLowerCase();

    if (!['read', 'edit'].includes(perm)) {
      return res.status(400).json({ error: 'Permission must be "read" or "edit"' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const updateRes = await client.query(
        `UPDATE grants
         SET permission = $1
         WHERE document_id = $2 AND user_id = $3
         RETURNING *`,
        [perm, doc.id, targetUserId]
      );

      if (updateRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Grant not found' });
      }

      await recordAudit({
        client,
        actorId: req.user.id,
        actorLabel: req.user.username,
        action: 'grant_changed',
        documentId: doc.id,
        result: 'success',
        ip,
        userAgent,
        details: { targetUserId, permission: perm },
      });

      await client.query('COMMIT');

      return res.status(200).json({
        message: 'Grant updated successfully',
        grant: updateRes.rows[0],
      });
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }
  } catch (err) {
    return handleRouteError(err, res);
  }
});

// 11. DELETE /api/documents/:id/grants/:userId (Revoke grant)
router.delete('/:id/grants/:userId', async (req, res) => {
  const ip = req.ip || req.connection.remoteAddress || '127.0.0.1';
  const userAgent = req.get('user-agent') || 'unknown';

  try {
    const authContext = await authorize(req.user, req.params.id, 'revoke', req);
    const doc = authContext.document;
    const targetUserId = req.params.userId;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const delRes = await client.query(
        'DELETE FROM grants WHERE document_id = $1 AND user_id = $2 RETURNING *',
        [doc.id, targetUserId]
      );

      if (delRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Grant not found' });
      }

      await recordAudit({
        client,
        actorId: req.user.id,
        actorLabel: req.user.username,
        action: 'grant_revoked',
        documentId: doc.id,
        result: 'success',
        ip,
        userAgent,
        details: { targetUserId },
      });

      await client.query('COMMIT');

      return res.status(200).json({ message: 'Grant revoked successfully' });
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }
  } catch (err) {
    return handleRouteError(err, res);
  }
});

module.exports = router;
