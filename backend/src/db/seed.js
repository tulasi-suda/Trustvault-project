// Seed script: creates the sole initial admin account if not already present
// Skips if the email exists, never overwrites an existing password.

const bcrypt = require('bcrypt');
const dotenv = require('dotenv');
const { pool } = require('./pool');
const { recordAudit } = require('../audit/record');

dotenv.config();

async function seed() {
  const username = process.env.SEED_ADMIN_USERNAME || 'admin';
  const email = (process.env.SEED_ADMIN_EMAIL || 'admin@trustvault.local').toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD || 'AdminPass123!';

  if (!username || !email || !password) {
    throw new Error('Missing required seed environment variables: SEED_ADMIN_USERNAME, SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Check if an account with this email already exists
    const existing = await client.query('SELECT id, email, role FROM users WHERE LOWER(email) = LOWER($1)', [email]);

    if (existing.rows.length > 0) {
      console.log(`Admin account with email ${email} already exists. Skipping seed.`);
      await client.query('COMMIT');
      return;
    }

    // Hash password with bcrypt cost factor 10
    const passwordHash = await bcrypt.hash(password, 10);

    const userRes = await client.query(
      `INSERT INTO users (username, email, full_name, password_hash, role, is_active)
       VALUES ($1, $2, $3, $4, 'admin', TRUE)
       RETURNING id, username, email, role`,
      [username, email, 'System Administrator', passwordHash]
    );

    const adminUser = userRes.rows[0];

    // Record audit event for seed admin creation
    await recordAudit({
      client,
      actorId: adminUser.id,
      actorLabel: adminUser.username,
      action: 'seed_admin_created',
      result: 'success',
      ip: '127.0.0.1',
      userAgent: 'system_seed_script',
      details: { username: adminUser.username, email: adminUser.email },
    });

    await client.query('COMMIT');
    console.log(`Admin account seeded successfully: ${adminUser.username} (${adminUser.email})`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seed failed:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  seed()
    .then(() => pool.end())
    .catch(() => {
      pool.end();
      process.exit(1);
    });
}

module.exports = { seed };
