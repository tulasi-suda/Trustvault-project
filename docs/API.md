# TrustVault API Documentation

This documentation reflects the actual implementation in `backend/src/routes/`.
All API routes are served under the `/api` prefix.

---

## 1. Authentication Endpoints (`backend/src/routes/auth.js`)

| Endpoint | Method | Permitted Callers | Authorize Action | Behavior on Refusal / Error |
|---|---|---|---|---|
| `/api/auth/register` | `POST` | Anyone (unauthenticated) | None (public registration) | `400 Bad Request` (password < 10 chars, lacks letters/numbers, mismatched passwords, invalid username/email); `409 Conflict` (username or email already in use); `429 Too Many Requests` (exceeds 5 attempts/hour/IP). |
| `/api/auth/login` | `POST` | Anyone | None (credential check) | `401 Unauthorized` (generic response for unknown user, incorrect password, or disabled account; executes constant-time dummy bcrypt on unknown users); `429 Too Many Requests` (exceeds `LOGIN_RATE_LIMIT_MAX` failed attempts/15min/IP). |
| `/api/auth/logout` | `POST` | Any caller with session cookie | None | Clears session cookie; deletes session record from DB. Always returns `200 OK`. |
| `/api/auth/me` | `GET` | Authenticated users | `requireAuth` | `401 Unauthorized` (missing/invalid UUID session cookie, expired session, or disabled account). |

---

## 2. Profile Endpoints (`backend/src/routes/profile.js`)

All profile endpoints require active session authentication (`requireAuth`).

| Endpoint | Method | Permitted Callers | Authorize Action | Behavior on Refusal / Error |
|---|---|---|---|---|
| `/api/profile` | `GET` | Authenticated user | `requireAuth` | `401 Unauthorized` (unauthenticated); `404 Not Found` (user record missing). |
| `/api/profile` | `PATCH` | Authenticated user | `requireAuth` | `400 Bad Request` (invalid username format or empty full name); `401 Unauthorized` (unauthenticated); `409 Conflict` (username already in use by another user). Role/id cannot be modified. |
| `/api/profile/password` | `POST` | Authenticated user | `requireAuth` | `400 Bad Request` (incorrect current password, new password < 10 chars, lacking letters/numbers, mismatched passwords); `401 Unauthorized` (unauthenticated). On success, terminates all other active sessions for that user. |

---

## 3. Document Endpoints (`backend/src/routes/documents.js`)

All document endpoints require active session authentication (`requireAuth`).
Document routes access control is decided by `authorize(user, documentId, action)` in `backend/src/auth/authorize.js`.

| Endpoint | Method | Permitted Callers | Authorize Action | Line in `documents.js` | Behavior on Refusal / Error |
|---|---|---|---|---|---|
| `/api/documents` | `POST` | Any active authenticated user | Creation (Pre-auth in route) | N/A | `400 Bad Request` (missing title, category not in allowlist, spoofed magic bytes, size > 10MB, clientSha256 mismatch, unknown recipient email in sharedWith); `401 Unauthorized`; `409 Conflict` (duplicate active upload by same owner). |
| `/api/documents` | `GET` | Authenticated users & Admin | SQL-level permission filtering | N/A | `401 Unauthorized`. Users only see owned or granted documents; Admin sees all non-deleted metadata only. |
| `/api/documents/search` | `GET` | Authenticated users & Admin | SQL-level permission filtering | N/A | `401 Unauthorized`. Filters by name, owner, category, date range; restricted in SQL to accessible documents. |
| `/api/documents/:id` | `GET` | Owner, Reader, Editor, Admin | `view_metadata` | Line 435 | `401 Unauthorized` (anonymous); `404 Not Found` with identical body (ungranted user, revoked user, soft-deleted document, invalid UUID, missing document). |
| `/api/documents/:id/download` | `GET` | Owner, Reader, Editor | `download` | Line 482 | `401 Unauthorized` (anonymous); `404 Not Found` (Admin without grant, ungranted user, revoked user, soft-deleted document); `500 Internal Server Error` (file integrity verification mismatch). |
| `/api/documents/:id` | `PATCH` | Owner, Editor | `edit` | Line 553 | `400 Bad Request` (invalid category or empty title); `401 Unauthorized`; `404 Not Found` (Reader, Admin, ungranted user, revoked user, soft-deleted document). |
| `/api/documents/:id` | `DELETE` | Owner only | `delete` | Line 634 | `401 Unauthorized`; `404 Not Found` (Editor, Reader, Admin, ungranted user, revoked user, soft-deleted document). |
| `/api/documents/:id/grants` | `GET` | Owner only | `list_grants` | Line 676 | `401 Unauthorized`; `404 Not Found` (Editor, Reader, Admin, ungranted user, revoked user, soft-deleted document). |
| `/api/documents/:id/grants` | `POST` | Owner only | `share` | Line 700 | `400 Bad Request` (unknown email, self-share, invalid permission); `401 Unauthorized`; `404 Not Found` (non-owner callers). |
| `/api/documents/:id/grants/:userId` | `PATCH` | Owner only | `share` | Line 787 | `400 Bad Request` (invalid permission); `401 Unauthorized`; `404 Not Found` (grant not found or non-owner caller). |
| `/api/documents/:id/grants/:userId` | `DELETE` | Owner only | `revoke` | Line 850 | `401 Unauthorized`; `404 Not Found` (grant not found or non-owner caller). Takes effect on the very next request. |

---

## 4. Admin Endpoints (`backend/src/routes/admin.js`)

All admin routes are strictly guarded. Any non-admin or unauthenticated caller receives a clean `404 Not Found` (`{"error": "Endpoint not found"}`) to prevent endpoint enumeration.

| Endpoint | Method | Permitted Callers | Authorize Action | Behavior on Refusal / Error |
|---|---|---|---|---|
| `/api/admin/audit` | `GET` | Admin only | Admin Role Check | `404 Not Found` (all non-admins and anonymous callers). |
| `/api/admin/audit/verify` | `GET` | Admin only | Admin Role Check | `404 Not Found` (non-admins). Recomputes cryptographic hash chain across all log entries. |
| `/api/admin/audit/head` | `GET` | Admin only | Admin Role Check | `404 Not Found` (non-admins). Returns latest SHA-256 head hash. |
| `/api/admin/worth-noticing` | `GET` | Admin only | Admin Role Check | `404 Not Found` (non-admins). Aggregates security events: ≥5 denials/hr, ≥10 downloads/hr, >10 failed logins/IP/hr. |
| `/api/admin/users` | `GET` | Admin only | Admin Role Check | `404 Not Found` (non-admins). Lists users with document counts. |
| `/api/admin/users/:id/status` | `PATCH` | Admin only | Admin Role Check | `400 Bad Request` (attempting to disable self or another admin, non-boolean status); `404 Not Found` (user not found or non-admin caller). Deletes target user sessions upon disablement. |
