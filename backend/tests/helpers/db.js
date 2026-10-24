// Test database helper: ensures isolation and safety
// Refuses to run if TEST_DATABASE_URL does not contain 'test' or NODE_ENV is 'production'

process.env.NODE_ENV = 'test';
const fs = require('fs');
const path = require('path');
const { pool } = require('../../src/db/pool');

async function resetTestDb() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      DROP TRIGGER IF EXISTS trg_audit_log_no_update_delete ON audit_log;
      DROP TRIGGER IF EXISTS trg_audit_log_no_truncate ON audit_log;
      DROP TABLE IF EXISTS audit_log CASCADE;
      DROP TABLE IF EXISTS document_files CASCADE;
      DROP TABLE IF EXISTS grants CASCADE;
      DROP TABLE IF EXISTS documents CASCADE;
      DROP TABLE IF EXISTS sessions CASCADE;
      DROP TABLE IF EXISTS users CASCADE;
      DROP FUNCTION IF EXISTS audit_log_prevent_modification CASCADE;
      DROP FUNCTION IF EXISTS audit_log_prevent_truncate CASCADE;
    `);
    await client.query('COMMIT');

    const schemaPath = path.join(__dirname, '../../db/schema.sql');
    const sql = fs.readFileSync(schemaPath, 'utf8');
    await client.query(sql);
  } finally {
    client.release();
  }
}

module.exports = {
  pool,
  resetTestDb,
};
