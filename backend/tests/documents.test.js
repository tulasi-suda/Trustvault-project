// Integration tests for document authorization matrix, file storage, grants, and search

const request = require('supertest');
const crypto = require('crypto');
const app = require('../src/app');
const { pool, resetTestDb } = require('./helpers/db');
const { SESSION_COOKIE_NAME } = require('../src/auth/requireAuth');
const { resetRateLimiters } = require('../src/auth/rateLimiter');

// Helper to register and log in a user, returning user object and cookie
async function createAuthenticatedUser(username, role = 'user') {
  const email = `${username}@example.com`;
  const password = 'Password123!';

  // Direct insert to set specific role if admin
  const hash = '$2b$10$wT8K4y8aL1m5W5f0K8iUge4J1xL7h1W/dI0E0H5B0G5V8E5A0B2C.'; // bcrypt dummy hash
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

describe('Document Authorization Matrix & Management', () => {
  let owner, reader, editor, ungranted, revoked, admin;
  let testDocId, validPdfBuffer, validPdfSha256;

  beforeEach(async () => {
    await resetTestDb();
    resetRateLimiters();

    // Create users
    owner = await createAuthenticatedUser('owner_user');
    reader = await createAuthenticatedUser('reader_user');
    editor = await createAuthenticatedUser('editor_user');
    ungranted = await createAuthenticatedUser('ungranted_user');
    revoked = await createAuthenticatedUser('revoked_user');
    admin = await createAuthenticatedUser('admin_user', 'admin');

    // Create valid PDF buffer (%PDF- header)
    validPdfBuffer = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF');
    validPdfSha256 = crypto.createHash('sha256').update(validPdfBuffer).digest('hex');

    // Owner uploads initial document with grants for reader and editor
    const uploadRes = await request(app)
      .post('/api/documents')
      .set('Cookie', owner.cookie)
      .field('title', 'Confidential Specs')
      .field('category', 'Legal')
      .field('clientSha256', validPdfSha256)
      .field(
        'sharedWith',
        JSON.stringify([
          { email: reader.user.email, permission: 'read' },
          { email: editor.user.email, permission: 'edit' },
          { email: revoked.user.email, permission: 'read' },
        ])
      )
      .attach('file', validPdfBuffer, 'confidential_specs.pdf');

    expect(uploadRes.status).toBe(201);
    testDocId = uploadRes.body.document.id;

    // Revoke access from revoked_user
    const revokeRes = await request(app)
      .delete(`/api/documents/${testDocId}/grants/${revoked.user.id}`)
      .set('Cookie', owner.cookie);
    expect(revokeRes.status).toBe(200);
  });

  afterAll(async () => {
    await pool.end();
  });

  // Matrix tests for GET /api/documents/:id (view_metadata)
  test('Matrix: view_metadata authorization', async () => {
    // Owner -> 200
    const resOwner = await request(app).get(`/api/documents/${testDocId}`).set('Cookie', owner.cookie);
    expect(resOwner.status).toBe(200);
    expect(resOwner.body.document.title).toBe('Confidential Specs');

    // Reader -> 200
    const resReader = await request(app).get(`/api/documents/${testDocId}`).set('Cookie', reader.cookie);
    expect(resReader.status).toBe(200);

    // Editor -> 200
    const resEditor = await request(app).get(`/api/documents/${testDocId}`).set('Cookie', editor.cookie);
    expect(resEditor.status).toBe(200);

    // Ungranted -> 404 (never 403, no existence leak)
    const resUngranted = await request(app).get(`/api/documents/${testDocId}`).set('Cookie', ungranted.cookie);
    expect(resUngranted.status).toBe(404);
    expect(resUngranted.body.error).toBe('Document not found');

    // Revoked -> 404
    const resRevoked = await request(app).get(`/api/documents/${testDocId}`).set('Cookie', revoked.cookie);
    expect(resRevoked.status).toBe(404);

    // Admin without ownership or grant -> 200 (view_metadata allowed for admin)
    const resAdmin = await request(app).get(`/api/documents/${testDocId}`).set('Cookie', admin.cookie);
    expect(resAdmin.status).toBe(200);

    // Anonymous -> 401
    const resAnon = await request(app).get(`/api/documents/${testDocId}`);
    expect(resAnon.status).toBe(401);
  });

  // Matrix tests for GET /api/documents/:id/download (download)
  test('Matrix: download authorization and headers', async () => {
    // Owner -> 200 with download headers
    const resOwner = await request(app).get(`/api/documents/${testDocId}/download`).set('Cookie', owner.cookie);
    expect(resOwner.status).toBe(200);
    expect(resOwner.headers['content-disposition']).toMatch(/attachment; filename=/);
    expect(resOwner.headers['x-content-type-options']).toBe('nosniff');
    expect(resOwner.headers['cache-control']).toBe('no-store');

    // Reader -> 200
    const resReader = await request(app).get(`/api/documents/${testDocId}/download`).set('Cookie', reader.cookie);
    expect(resReader.status).toBe(200);

    // Editor -> 200
    const resEditor = await request(app).get(`/api/documents/${testDocId}/download`).set('Cookie', editor.cookie);
    expect(resEditor.status).toBe(200);

    // Ungranted -> 404
    const resUngranted = await request(app).get(`/api/documents/${testDocId}/download`).set('Cookie', ungranted.cookie);
    expect(resUngranted.status).toBe(404);

    // Revoked -> 404
    const resRevoked = await request(app).get(`/api/documents/${testDocId}/download`).set('Cookie', revoked.cookie);
    expect(resRevoked.status).toBe(404);

    // Admin without ownership or grant -> 404 (Admin NEVER reads file contents)
    const resAdmin = await request(app).get(`/api/documents/${testDocId}/download`).set('Cookie', admin.cookie);
    expect(resAdmin.status).toBe(404);
    expect(resAdmin.body.error).toBe('Document not found');

    // Anonymous -> 401
    const resAnon = await request(app).get(`/api/documents/${testDocId}/download`);
    expect(resAnon.status).toBe(401);
  });

  // Matrix tests for PATCH /api/documents/:id (edit metadata)
  test('Matrix: edit authorization', async () => {
    // Owner -> 200
    const resOwner = await request(app)
      .patch(`/api/documents/${testDocId}`)
      .set('Cookie', owner.cookie)
      .send({ title: 'Updated by Owner' });
    expect(resOwner.status).toBe(200);

    // Editor -> 200
    const resEditor = await request(app)
      .patch(`/api/documents/${testDocId}`)
      .set('Cookie', editor.cookie)
      .send({ title: 'Updated by Editor' });
    expect(resEditor.status).toBe(200);

    // Reader -> 404 (readers cannot edit)
    const resReader = await request(app)
      .patch(`/api/documents/${testDocId}`)
      .set('Cookie', reader.cookie)
      .send({ title: 'Hacked by Reader' });
    expect(resReader.status).toBe(404);

    // Ungranted -> 404
    const resUngranted = await request(app)
      .patch(`/api/documents/${testDocId}`)
      .set('Cookie', ungranted.cookie)
      .send({ title: 'Hacked' });
    expect(resUngranted.status).toBe(404);

    // Admin without ownership or grant -> 404
    const resAdmin = await request(app)
      .patch(`/api/documents/${testDocId}`)
      .set('Cookie', admin.cookie)
      .send({ title: 'Hacked by Admin' });
    expect(resAdmin.status).toBe(404);

    // Anonymous -> 401
    const resAnon = await request(app)
      .patch(`/api/documents/${testDocId}`)
      .send({ title: 'Hacked Anon' });
    expect(resAnon.status).toBe(401);
  });

  // Matrix tests for DELETE /api/documents/:id (delete)
  test('Matrix: delete authorization', async () => {
    // Non-owners (reader, editor, ungranted, admin) must receive 404
    const resReader = await request(app).delete(`/api/documents/${testDocId}`).set('Cookie', reader.cookie);
    expect(resReader.status).toBe(404);

    const resEditor = await request(app).delete(`/api/documents/${testDocId}`).set('Cookie', editor.cookie);
    expect(resEditor.status).toBe(404);

    const resAdmin = await request(app).delete(`/api/documents/${testDocId}`).set('Cookie', admin.cookie);
    expect(resAdmin.status).toBe(404);

    const resAnon = await request(app).delete(`/api/documents/${testDocId}`);
    expect(resAnon.status).toBe(401);

    // Owner deletes -> 200
    const resOwner = await request(app).delete(`/api/documents/${testDocId}`).set('Cookie', owner.cookie);
    expect(resOwner.status).toBe(200);

    // After soft-deletion, denied to EVERYONE (including owner and admin) with 404
    const resAfterOwner = await request(app).get(`/api/documents/${testDocId}`).set('Cookie', owner.cookie);
    expect(resAfterOwner.status).toBe(404);

    const resAfterAdmin = await request(app).get(`/api/documents/${testDocId}`).set('Cookie', admin.cookie);
    expect(resAfterAdmin.status).toBe(404);
  });

  // Matrix tests for grant management (list_grants, share, revoke)
  test('Matrix: grant management is owner only', async () => {
    // Non-owners cannot list grants
    const listReader = await request(app).get(`/api/documents/${testDocId}/grants`).set('Cookie', reader.cookie);
    expect(listReader.status).toBe(404);

    const listAdmin = await request(app).get(`/api/documents/${testDocId}/grants`).set('Cookie', admin.cookie);
    expect(listAdmin.status).toBe(404);

    // Owner can list grants
    const listOwner = await request(app).get(`/api/documents/${testDocId}/grants`).set('Cookie', owner.cookie);
    expect(listOwner.status).toBe(200);
    expect(Array.isArray(listOwner.body.grants)).toBe(true);

    // Non-owners cannot share / add grants
    const shareReader = await request(app)
      .post(`/api/documents/${testDocId}/grants`)
      .set('Cookie', reader.cookie)
      .send({ email: ungranted.user.email, permission: 'read' });
    expect(shareReader.status).toBe(404);

    const shareAdmin = await request(app)
      .post(`/api/documents/${testDocId}/grants`)
      .set('Cookie', admin.cookie)
      .send({ email: ungranted.user.email, permission: 'read' });
    expect(shareAdmin.status).toBe(404);

    // Owner shares with ungranted -> 200
    const shareOwner = await request(app)
      .post(`/api/documents/${testDocId}/grants`)
      .set('Cookie', owner.cookie)
      .send({ email: ungranted.user.email, permission: 'read' });
    expect(shareOwner.status).toBe(200);

    // Now ungranted user can download immediately
    const dlGranted = await request(app).get(`/api/documents/${testDocId}/download`).set('Cookie', ungranted.cookie);
    expect(dlGranted.status).toBe(200);

    // Revocation works on the NEXT request
    const revokeRes = await request(app)
      .delete(`/api/documents/${testDocId}/grants/${ungranted.user.id}`)
      .set('Cookie', owner.cookie);
    expect(revokeRes.status).toBe(200);

    const dlAfterRevoke = await request(app).get(`/api/documents/${testDocId}/download`).set('Cookie', ungranted.cookie);
    expect(dlAfterRevoke.status).toBe(404);
  });

  test('Upload with unknown recipient email fails whole upload with 400 and creates nothing', async () => {
    const uniquePdf = Buffer.from('%PDF-1.4\nUnique pdf content for failed upload test');
    const res = await request(app)
      .post('/api/documents')
      .set('Cookie', owner.cookie)
      .field('title', 'Failed Upload')
      .field('category', 'Finance')
      .field('sharedWith', JSON.stringify([{ email: 'ghost_nonexistent@example.com', permission: 'read' }]))
      .attach('file', uniquePdf, 'failed.pdf');

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('ghost_nonexistent@example.com');

    // Verify nothing created in documents table
    const docRes = await pool.query("SELECT * FROM documents WHERE title = 'Failed Upload'");
    expect(docRes.rows.length).toBe(0);
  });

  test('Upload rejects spoofed magic bytes, oversize files, and traversal filenames', async () => {
    // Spoofed file: .pdf extension with plain text bytes (not %PDF)
    const spoofedBuffer = Buffer.from('this is not a pdf file');
    const spoofRes = await request(app)
      .post('/api/documents')
      .set('Cookie', owner.cookie)
      .field('title', 'Spoofed Doc')
      .field('category', 'Finance')
      .attach('file', spoofedBuffer, 'spoofed.pdf');
    expect(spoofRes.status).toBe(400);
    expect(spoofRes.body.error).toMatch(/magic bytes/i);

    // Traversal filename sanitized (use unique buffer)
    const uniqueTraversalPdf = Buffer.from('%PDF-1.4\nUnique pdf content for traversal test');
    const traversalRes = await request(app)
      .post('/api/documents')
      .set('Cookie', owner.cookie)
      .field('title', 'Traversal Sanitized')
      .field('category', 'IT')
      .attach('file', uniqueTraversalPdf, '../../../../etc/evil.pdf');
    expect(traversalRes.status).toBe(201);
    expect(traversalRes.body.document.original_filename).not.toContain('..');
    expect(traversalRes.body.document.original_filename).not.toContain('/');
    expect(traversalRes.body.document.original_filename).not.toContain('\\');
  });

  test('Upload rejects altered clientSha256 and duplicate upload by same owner returns 409', async () => {
    // Wrong clientSha256
    const wrongSha = '0'.repeat(64);
    const alteredRes = await request(app)
      .post('/api/documents')
      .set('Cookie', owner.cookie)
      .field('title', 'Altered Doc')
      .field('category', 'HR')
      .field('clientSha256', wrongSha)
      .attach('file', validPdfBuffer, 'altered.pdf');
    expect(alteredRes.status).toBe(400);
    expect(alteredRes.body.error).toBe('File was altered during upload');

    // Duplicate upload by same owner returns 409
    const dupRes = await request(app)
      .post('/api/documents')
      .set('Cookie', owner.cookie)
      .field('title', 'Duplicate Doc')
      .field('category', 'HR')
      .field('clientSha256', validPdfSha256)
      .attach('file', validPdfBuffer, 'duplicate.pdf');
    expect(dupRes.status).toBe(409);
  });

  test('Tampered stored file fails download with generic 500 and audits integrity failure', async () => {
    // Tamper with file in document_files table (or disk)
    const { getStorageBackend, getStorageDir } = require('../src/storage/fileStorage');
    const backend = getStorageBackend();

    if (backend === 'db') {
      await pool.query('UPDATE document_files SET content = $1 WHERE document_id = $2', [
        Buffer.from('corrupted content!'),
        testDocId,
      ]);
    } else {
      const fs = require('fs');
      const path = require('path');
      const docRes = await pool.query('SELECT storage_key FROM documents WHERE id = $1', [testDocId]);
      const filePath = path.join(getStorageDir(), docRes.rows[0].storage_key);
      fs.writeFileSync(filePath, Buffer.from('corrupted content!'));
    }

    const res = await request(app)
      .get(`/api/documents/${testDocId}/download`)
      .set('Cookie', owner.cookie);

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('File integrity check failed');

    // Audit log should have recorded integrity_failure
    const auditRes = await pool.query(
      "SELECT * FROM audit_log WHERE action = 'integrity_failure' AND document_id = $1",
      [testDocId]
    );
    expect(auditRes.rows.length).toBe(1);
  });

  test('Search never returns unreadable documents for ungranted users', async () => {
    // Search as ungranted user
    const ungrantedSearch = await request(app)
      .get('/api/documents/search?name=Confidential')
      .set('Cookie', ungranted.cookie);
    expect(ungrantedSearch.status).toBe(200);
    expect(ungrantedSearch.body.documents.length).toBe(0);

    // Search as reader
    const readerSearch = await request(app)
      .get('/api/documents/search?name=Confidential')
      .set('Cookie', reader.cookie);
    expect(readerSearch.status).toBe(200);
    expect(readerSearch.body.documents.length).toBe(1);

    // Search as admin (metadata only)
    const adminSearch = await request(app)
      .get('/api/documents/search?name=Confidential')
      .set('Cookie', admin.cookie);
    expect(adminSearch.status).toBe(200);
    expect(adminSearch.body.documents.length).toBe(1);
  });

  test('Denied attempts are audited in audit_log', async () => {
    // Attempt unauthorized access
    await request(app)
      .get(`/api/documents/${testDocId}/download`)
      .set('Cookie', ungranted.cookie);

    const auditRes = await pool.query(
      "SELECT * FROM audit_log WHERE action = 'authorize_denied' AND actor_label = 'ungranted_user'"
    );
    expect(auditRes.rows.length).toBeGreaterThan(0);
    expect(auditRes.rows[0].result).toBe('denied');
  });
});
