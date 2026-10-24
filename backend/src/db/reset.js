// Reset script: drops all tables, re-runs migrations and seeds
// Strict guard: refuses to run in production.

const dotenv = require('dotenv');
const { pool } = require('./pool');
const { migrate } = require('./migrate');
const { seed } = require('./seed');

dotenv.config();

async function reset() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to run db:reset in production environment!');
  }

  console.log('Resetting database schema...');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Drop triggers and tables in reverse dependency order
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
    console.log('Schema dropped cleanly.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Reset failed during drop:', err.message);
    throw err;
  } finally {
    client.release();
  }

  // Re-run migration and seed
  await migrate();
  await seed();
  console.log('Database reset, migrated, and seeded successfully.');
}

if (require.main === module) {
  reset()
    .then(() => pool.end())
    .catch(() => {
      pool.end();
      process.exit(1);
    });
}

module.exports = { reset };
