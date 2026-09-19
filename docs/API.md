# `my_editor` Backend API Reference

## Base URL
- Local Development: `http://localhost:4000/api/v1`
- Swagger UI (Interactive Docs): `http://localhost:4000/docs`

---

## Authentication

All protected endpoints require a Bearer token in the `Authorization` header:
```http
Authorization: Bearer <access_token>
```

---

## Standard Response Format

### Success Response
```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "timestamp": "2026-09-19T23:30:00.000Z",
    "total": 1
  }
}
```

### Error Response (RFC 7807 Problem Details)
```json
{
  "success": false,
  "error": {
    "code": "INSUFFICIENT_CREDITS",
    "message": "Required 5 credits, but current balance is only 2 credits",
    "details": null,
    "requestId": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d"
  },
  "meta": {
    "timestamp": "2026-09-19T23:30:00.000Z"
  }
}
```

---

## Key Endpoints

### 1. System Health
- `GET /health` - Liveness check (status, uptime)
- `GET /ready` - Readiness check (verifies database, redis, and storage dependencies)

### 2. Authentication & Identity (`/v1/auth` & `/api/v1/auth`)
- `POST /register` - Register a new account (`email`, `password`, `displayName`, `device`)
- `POST /login` - Authenticate with email/password (brute-force protected, returns tokens & session)
- `POST /oauth/:provider` - Authenticate via OAuth (`google`, `apple`) with ID Token
- `POST /refresh` - Single-use refresh token rotation (with automated reuse detection)
- `POST /logout` - Revoke current active session
- `POST /logout-all` - Terminate all active sessions across all devices
- `POST /forgot-password` - Request a secure password reset link token
- `POST /reset-password` - Reset password with token (invalidates all existing sessions)
- `POST /verify-email` - Verify email address with single-use verification token
- `POST /resend-verification` - Resend email verification token for pending account

### 3. User Profile & Account (`/v1/me` & `/api/v1/me`)
- `GET /me` - Retrieve current authenticated user profile, devices, and preferences
- `PATCH /me` - Update profile (`displayName`, `avatarUrl`, `bio`, `timezone`, `preferences`)
- `DELETE /me` - Soft-delete user account and immediately terminate all active sessions

### 4. Cloud Video Projects (`/v1/projects` & `/api/v1/projects`)
- `POST /` - Create a new video project (`title`, `description`, `canvas`, `timeline`, `assets`, `settings`)
- `GET /` - List & search projects (`search`, `status: active|archived|deleted|all`, `limit`, `offset`, `sortBy`, `sortOrder`)
- `GET /:id` - Open project (returns `metadata`, `canvas`, `timeline`, `assets`, `versions`, `settings`; supports `ETag` and `If-None-Match: 304`)
- `PATCH /:id` - Update or rename project with optimistic concurrency control (`expectedVersion`, `If-Match` header)
- `POST /:id/autosave` - Non-destructive autosave cloud sync endpoint with multi-device conflict checking (`baseVersion`, `device`, `canvas`, `timeline`, `assets`, `settings`)
- `POST /:id/duplicate` - Duplicate project into a fresh project starting at version 1
- `POST /:id/archive` - Archive video project
- `POST /:id/restore` - Restore archived or soft-deleted project
- `DELETE /:id` - Soft-delete video project (recoverable)
- `GET /:id/versions` - Retrieve immutable version history snapshots

#### Optimistic Concurrency Control
When updating via `PATCH /v1/projects/:id` or `POST /v1/projects/:id/autosave`:
- Pass `expectedVersion: <number>` or HTTP `If-Match: W/"<etag>"`.
- If another device has modified the project on the cloud (server version > expected version), the API returns HTTP 409 `CONCURRENCY_CONFLICT` with current server version details, preventing silent data overwrite.

### 5. Media Storage (`/v1/media` & `/api/v1/media`)

TechXayan Creative's media subsystem provides an enterprise-grade object storage abstraction (supporting AWS S3, Cloudflare R2, and MinIO) with strict separation between binary payloads and PostgreSQL metadata.

#### Asset Categories & Size Limits
- `video`: Up to 50 GB (supports single-part or multipart resumable uploads)
- `audio`: Up to 2 GB
- `image`: Up to 100 MB
- `font`: Up to 50 MB (.ttf, .otf, .woff, .woff2)
- `lut`: Up to 100 MB (.cube, .3dl)
- `sticker`: Up to 20 MB (.png, .webp, .svg, .gif)
- `template`: Up to 500 MB (.zip, .json, .tar.gz)

#### Lifecycle State Machine
```
[Client Presign] ──► UPLOADING ──► [Client Complete] ──► PROCESSING (Security Scan) ──► READY
                           │                                          │
                           ▼                                          ▼
                         CANCELLED / FAILED                        FAILED
                                      │
                                      ▼
                                   DELETED (Soft-delete & S3 purge)
```

#### Media Endpoints
- `POST /v1/media/presign` - Request single-part or multipart upload session.
  - Automatically activates multipart chunking (5MB minimum part size) for files $\ge$ 50MB or when `uploadType: 'multipart'`.
  - Request body: `{ fileName, mimeType, fileSizeBytes, category?, projectId?, checksumSha256?, uploadType?, partCount? }`
  - Returns: `{ assetId, uploadId, uploadType, partSize, parts: [{ partNumber, uploadUrl }], uploadUrl }`
- `POST /v1/media/complete` - Finalize upload, verify checksum, execute security scan hook, and transition asset to `READY`.
  - Request body: `{ assetId, uploadId?, parts?: [{ partNumber, eTag }], checksumSha256? }`
- `POST /v1/media/upload` - Direct API upload for small creative assets (LUTs, fonts, stickers, audio up to 50MB).
  - Request body: `{ fileName, mimeType, fileSizeBytes, dataBase64, category?, projectId?, checksumSha256? }`
- `GET /v1/media/:id` - Fetch asset metadata and fresh presigned download URL (valid for 1 hour).
- `DELETE /v1/media/:id` - Soft-delete asset metadata and remove underlying binary object from storage bucket.
- `POST /v1/media/:id/cancel` - Cancel active upload and abort S3 multipart session.
- `POST /v1/media/:id/retry` - Re-initialize failed or cancelled upload session.
- `GET /v1/media` - List & search user media assets (`projectId`, `category`, `status`, `search`, `limit`, `offset`).
- `POST /v1/media/upload-url` & `POST /v1/media/confirm` - Backward-compatible legacy endpoints.

### 6. AI Video Services (`/api/v1/ai`)
- `POST /transcribe` - Transcribe audio with word-level timestamps (Cost: 5 credits)
- `POST /captions` - Generate dynamic animated subtitles (Cost: 3 credits)
- `POST /smart-cut` - Detect voiceover silences for jump cuts (Cost: 2 credits)
- `POST /broll` - Generate synthetic B-roll visual footage (Cost: 15 credits)

### 7. Video Rendering & Processing Jobs (`/api/v1/jobs`)
- `POST /render` - Submit video timeline rendering export job (Cost: 10 credits)
- `GET /:id` - Poll job rendering progress (`0%` to `100%`) and download URL
- `POST /:id/cancel` - Cancel active rendering job

### 8. Credits & Billing (`/api/v1/credits`)
- `GET /balance` - Retrieve current credit balance
- `GET /history` - Retrieve credit transaction ledger

### 9. Subscriptions (`/api/v1/subscriptions`)
- `GET /plans` - View available subscription tiers (`Free`, `Pro`, `Studio`)
- `GET /current` - View current user subscription status and renewal date

### 10. Webhooks (`/api/v1/webhooks`)
- `POST /stripe` - Ingest Stripe subscription billing events
- `POST /worker-callback` - Ingest internal transcoding worker completion notices

---

## Real-Time Collaboration WebSocket

- **Endpoint**: `ws://localhost:4000/ws/v1/collaboration/:projectId?token=<access_token>`
- **Supported Actions**:
  - `JOIN_PROJECT`, `LEAVE_PROJECT`
  - `CURSOR_MOVE` (live editor pointer broadcast)
  - `SEEK_PLAYHEAD` (timeline scrub sync)
  - `TIMELINE_MUTATION` (multiplayer track and clip edit broadcast)
  - `LOCK_TRACK` / `UNLOCK_TRACK` (concurrency protection)
