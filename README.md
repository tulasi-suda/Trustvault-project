# TrustVault 🔐

TrustVault is a secure, zero-trust-inspired document-sharing web application engineered for organizations that require strong access governance and tamper-evident cryptographic auditing. Built with a unified authorization engine, serialized hash-chain audit logging, dual-backend storage (PostgreSQL binary storage or disk), and a high-performance modern React interface.

---

## 🌐 Live Deployment & Demo Credentials

- **Live URL**: [https://trustvault-web.onrender.com](https://trustvault-web.onrender.com) *(Render Web Service)*
- **Default Seeded Admin**:
  - **Email**: `admin@trustvault.local`
  - **Username**: `admin`
  - **Password**: `AdminPass123!`
- **Sample User Account**:
  - Register a new account via the UI or seed additional test users.

---

## 👥 Account Roles & Document Permissions

TrustVault enforces a strict separation of concerns. Access decisions are resolved dynamically on every request through a single centralized authorization gate (`authorize(user, documentId, action)`).

### User Roles (`users.role`)
| Role | Description | Capabilities |
|---|---|---|
| `admin` | System Administrator (Single account created strictly via seed script). | Can review cryptographic audit logs, verify hash chain integrity, view document metadata overview, and enable/disable user accounts. **Never permitted to view, stream, or download document file contents.** |
| `user` | Standard Platform User. | Can upload documents, organize by category, share granular permissions with other active users, and manage access to their own documents. |

### Document Permissions & Roles
| Role | Granted Via | Capabilities |
|---|---|---|
| **Owner** | User who uploaded the file (`documents.owner_id`). | Full control: view metadata, download file, edit details/category, grant access (`read` / `edit`), revoke access, soft-delete document. |
| **Editor** | Explicit `edit` grant in `grants` table. | View metadata, download file content, edit title/description/category. Cannot delete or alter access grants. |
| **Viewer** | Explicit `read` grant in `grants` table. | View metadata and download file content. Cannot edit, delete, or alter access grants. |
| **Ungranted User** | Default state for all other users. | Receives a generic `404 Not Found` identical to a missing file on any document query or action. Denials are audited. |

---

## ⚙️ Environment Variables

TrustVault is configured via environment variables. Create a `.env` file in `backend/` for local execution:

| Variable | Description | Required / Default |
|---|---|---|
| `PORT` | HTTP server port for Express backend | Default: `5000` (Render sets to `10000`) |
| `NODE_ENV` | Runtime environment (`development`, `test`, `production`) | Default: `development` |
| `DATABASE_URL` | PostgreSQL connection URI for application data | e.g. `postgres://postgres:postgres@localhost:5432/trustvault` |
| `TEST_DATABASE_URL` | PostgreSQL connection URI for test suite (must contain `"test"`) | e.g. `postgres://postgres:postgres@localhost:5432/trustvault_test` |
| `STORAGE_BACKEND` | Storage driver (`db` for PostgreSQL `bytea`, `disk` for local filesystem) | Default: `db` |
| `STORAGE_DIR` | Local disk folder when `STORAGE_BACKEND=disk` | Default: `backend/storage/uploads` |
| `CLIENT_URL` | Allowed frontend origin for CORS | Default: `http://localhost:5173` |
| `LOGIN_RATE_LIMIT_MAX` | Maximum failed login attempts per IP per 15 minutes | Default: `10` |
| `SEED_ADMIN_USERNAME` | Username for seeded sole administrator | Default: `admin` |
| `SEED_ADMIN_EMAIL` | Email address for seeded sole administrator | Default: `admin@trustvault.local` |
| `SEED_ADMIN_PASSWORD` | Password for seeded sole administrator | Default: `AdminPass123!` |

---

## 🚀 Local Development & Setup

### Prerequisites
- **Node.js**: v20 or v22
- **PostgreSQL**: v14+ running locally on port 5432

### Step-by-Step Setup

1. **Clone repository and install dependencies**:
   ```bash
   git clone <repo-url>
   cd "Tulasi suda"
   npm run install:all
   ```
   *(Or individually: `npm install --prefix backend` and `npm install --prefix frontend`)*

2. **Prepare PostgreSQL databases**:
   Create the primary and test databases in PostgreSQL:
   ```sql
   CREATE DATABASE trustvault;
   CREATE DATABASE trustvault_test;
   ```

3. **Configure environment**:
   Create `backend/.env` with your PostgreSQL credentials:
   ```env
   PORT=5000
   NODE_ENV=development
   DATABASE_URL=postgres://postgres:postgres@localhost:5432/trustvault
   TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/trustvault_test
   STORAGE_BACKEND=db
   CLIENT_URL=http://localhost:5000
   SEED_ADMIN_USERNAME=admin
   SEED_ADMIN_EMAIL=admin@trustvault.local
   SEED_ADMIN_PASSWORD=AdminPass123!
   ```

4. **Run migrations and seed the sole administrator**:
   ```bash
   npm run db:migrate --prefix backend
   npm run db:seed --prefix backend
   ```

5. **Build the frontend**:
   ```bash
   npm run build --prefix frontend
   ```
   *The frontend is compiled using esbuild into unminified, readable client code located in `frontend/dist/`.*

6. **Start the application**:
   ```bash
   npm start --prefix backend
   ```
   Open your browser at `http://localhost:5000` to access TrustVault.

---

## 🧪 Running the Test Suite

TrustVault comes with an automated Jest + Supertest test suite that verifies database triggers, hash chaining, authentication, authorization matrices, and admin endpoints against the isolated test database:

```bash
cd backend
npm test
```

Expected output:
- **5 test suites passed** (`schema.test.js`, `audit.test.js`, `auth.test.js`, `documents.test.js`, `admin.test.js`)
- **31 passing tests**, 0 failures

---

## 🔒 Security Architecture Highlights

1. **Single Centralized Authorization Gate**:
   Every document request passes through `authorize(user, documentId, action)` as its very first operation. Denials result in identical `404 Not Found` responses with audited records.
2. **Cryptographic Audit Log**:
   Every entry is chained using SHA-256 over deterministic canonical JSON, serialized by PostgreSQL advisory transaction locks (`pg_advisory_xact_lock(424242)`). Database triggers reject any `UPDATE`, `DELETE`, or `TRUNCATE` operations on the log. Administrators can verify chain integrity via `/api/admin/audit/verify`.
3. **Defense Against File Tampering**:
   Client computes SHA-256 in browser (`crypto.subtle`); backend validates before persisting. Upon file download, backend re-computes SHA-256 against the recorded fingerprint. Mismatches trigger an audit alert and abort delivery.
4. **Leak-Proof Admin Surface**:
   Anonymous callers or standard users requesting `/api/admin/*` receive uniform 404 responses to prevent administrative endpoint discovery.
5. **No Blind Trust in MIME Types**:
   File uploads inspect true magic bytes (PDF, PNG, JPEG, ZIP/DOCX/XLSX, Text) and enforce path-sanitization on original filenames.

---

## 🚧 Not Built (Future Scope)

The following items were identified during design and intentionally left for future enterprise iterations:
- **Distributed Redis Rate Limiter**: The current rate limiters run in process memory with sliding windows. Multi-node clusters will require Redis-backed shared counters.
- **Asynchronous Antivirus Scanning**: Real-time ClamAV pipeline integration for uploaded binaries.
- **Hardware Security Module (HSM) Key Signing**: Audit log hash anchoring against external verifiable timestamp authorities (RFC 3161).
- **Time-bound Access Grants**: Expiring grants that automatically lapse after a set duration.
