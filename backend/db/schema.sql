-- TrustVault Database Schema
-- Designed to be idempotent and safe to execute repeatedly.

-- Enable pgcrypto extension for UUID generation if not already enabled
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Users table
-- username: unique case-insensitive, 3-30 chars, letters, digits, underscore only
-- email: lowercased unique
-- role: admin or user only
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(30) NOT NULL,
  email VARCHAR(255) NOT NULL,
  full_name VARCHAR(100) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(10) NOT NULL DEFAULT 'user',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_users_username_format CHECK (username ~ '^[a-zA-Z0-9_]{3,30}$'),
  CONSTRAINT chk_users_role CHECK (role IN ('admin', 'user'))
);

-- Case-insensitive unique indexes for username and email
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_username_lower ON users (LOWER(username));
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email_lower ON users (LOWER(email));

-- 2. Sessions table
-- Server-side session tracking using random UUID tokens
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions (expires_at);

-- 3. Documents table
-- Allowed categories: General, Finance, HR, Legal, IT, Education, Personal
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category VARCHAR(50) NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  storage_key VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  size_bytes BIGINT NOT NULL,
  sha256 CHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ DEFAULT NULL,
  CONSTRAINT chk_documents_category CHECK (
    category IN ('General', 'Finance', 'HR', 'Legal', 'IT', 'Education', 'Personal')
  )
);

CREATE INDEX IF NOT EXISTS idx_documents_owner_id ON documents (owner_id);
CREATE INDEX IF NOT EXISTS idx_documents_deleted_at ON documents (deleted_at);
CREATE INDEX IF NOT EXISTS idx_documents_category ON documents (category);

-- Partial unique index: duplicate file upload by the same owner rejected if active
CREATE UNIQUE INDEX IF NOT EXISTS uq_documents_owner_sha256_active
  ON documents (owner_id, sha256)
  WHERE deleted_at IS NULL;

-- 4. Grants table
-- Direct document permissions ('read' or 'edit')
CREATE TABLE IF NOT EXISTS grants (
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission VARCHAR(10) NOT NULL,
  granted_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (document_id, user_id),
  CONSTRAINT chk_grants_permission CHECK (permission IN ('read', 'edit'))
);

CREATE INDEX IF NOT EXISTS idx_grants_user_id ON grants (user_id);
CREATE INDEX IF NOT EXISTS idx_grants_document_id ON grants (document_id);

-- 5. Document files storage table
-- Bytea storage for database storage backend (default in production)
CREATE TABLE IF NOT EXISTS document_files (
  document_id UUID PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
  content BYTEA NOT NULL
);

-- 6. Audit log table
-- Append-only verifiable audit trail with cryptographic hash chaining
CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actor_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  actor_label VARCHAR(100) NOT NULL,
  action VARCHAR(100) NOT NULL,
  document_id UUID NULL REFERENCES documents(id) ON DELETE SET NULL,
  result VARCHAR(50) NOT NULL,
  ip VARCHAR(50) NOT NULL,
  user_agent VARCHAR(255) NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  prev_hash CHAR(64) NOT NULL,
  hash CHAR(64) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log (created_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor_id ON audit_log (actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log (action);
CREATE INDEX IF NOT EXISTS idx_audit_log_document_id ON audit_log (document_id);

-- Triggers to enforce immutability of audit_log
CREATE OR REPLACE FUNCTION audit_log_prevent_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Audit log entries cannot be modified or deleted';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION audit_log_prevent_truncate()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Audit log table cannot be truncated';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_log_no_update_delete ON audit_log;
CREATE TRIGGER trg_audit_log_no_update_delete
BEFORE UPDATE OR DELETE ON audit_log
FOR EACH ROW
EXECUTE FUNCTION audit_log_prevent_modification();

DROP TRIGGER IF EXISTS trg_audit_log_no_truncate ON audit_log;
CREATE TRIGGER trg_audit_log_no_truncate
BEFORE TRUNCATE ON audit_log
FOR EACH STATEMENT
EXECUTE FUNCTION audit_log_prevent_truncate();
