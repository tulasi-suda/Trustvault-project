// Database connection pool using node-postgres (pg)
// Enforces separate test database guards when running in test environment.

const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

const isTest = process.env.NODE_ENV === 'test';
const isProd = process.env.NODE_ENV === 'production';

let connectionString = process.env.DATABASE_URL;

if (isTest) {
  if (isProd) {
    throw new Error('Refusing to run in test mode when NODE_ENV is production');
  }

  const testDbUrl = process.env.TEST_DATABASE_URL;
  if (!testDbUrl || !testDbUrl.includes('test')) {
    throw new Error('Refusing to run tests: TEST_DATABASE_URL must be defined and contain "test"');
  }

  connectionString = testDbUrl;
}

if (!connectionString) {
  connectionString = 'postgres://postgres:postgres@127.0.0.1:5432/trustvault';
}

const pool = new Pool({
  connectionString,
  ssl: isProd ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

module.exports = {
  pool,
  query: (text, params) => pool.query(text, params),
  getClient: () => pool.connect(),
};
