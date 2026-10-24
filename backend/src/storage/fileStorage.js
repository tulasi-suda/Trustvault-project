// File storage abstraction: supports database bytea storage and local disk storage
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pool } = require('../db/pool');

function getStorageBackend() {
  if (process.env.STORAGE_BACKEND) {
    return process.env.STORAGE_BACKEND.toLowerCase();
  }
  // Production default is 'db', development default is 'disk'
  return process.env.NODE_ENV === 'production' ? 'db' : 'disk';
}

function getStorageDir() {
  const dir = process.env.STORAGE_DIR
    ? path.resolve(process.cwd(), process.env.STORAGE_DIR)
    : path.join(__dirname, '../../storage');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Store file content.
 * If client is passed, used for transactional DB storage.
 */
async function storeFile({ documentId, buffer, client }) {
  const backend = getStorageBackend();
  const storageKey = crypto.randomUUID();

  if (backend === 'db') {
    const dbClient = client || pool;
    await dbClient.query(
      'INSERT INTO document_files (document_id, content) VALUES ($1, $2)',
      [documentId, buffer]
    );
    return { storageKey: `db://${documentId}`, backend: 'db' };
  } else {
    // Disk storage
    const storageDir = getStorageDir();
    const filePath = path.join(storageDir, storageKey);
    fs.writeFileSync(filePath, buffer);
    return { storageKey, backend: 'disk' };
  }
}

/**
 * Retrieve file content buffer by documentId and storageKey.
 */
async function retrieveFile({ documentId, storageKey, client }) {
  const backend = getStorageBackend();

  if (backend === 'db' || (storageKey && storageKey.startsWith('db://'))) {
    const dbClient = client || pool;
    const res = await dbClient.query(
      'SELECT content FROM document_files WHERE document_id = $1',
      [documentId]
    );
    if (res.rows.length === 0) {
      return null;
    }
    return res.rows[0].content;
  } else {
    const storageDir = getStorageDir();
    const filePath = path.join(storageDir, storageKey);
    if (!fs.existsSync(filePath)) {
      return null;
    }
    return fs.readFileSync(filePath);
  }
}

/**
 * Delete stored file
 */
async function deleteStoredFile({ documentId, storageKey, client }) {
  const backend = getStorageBackend();
  if (backend === 'db' || (storageKey && storageKey.startsWith('db://'))) {
    const dbClient = client || pool;
    await dbClient.query('DELETE FROM document_files WHERE document_id = $1', [documentId]);
  } else {
    const storageDir = getStorageDir();
    const filePath = path.join(storageDir, storageKey);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
}

module.exports = {
  getStorageBackend,
  getStorageDir,
  storeFile,
  retrieveFile,
  deleteStoredFile,
};
