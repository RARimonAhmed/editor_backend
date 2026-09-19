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

### 3. Video Projects (`/api/v1/projects`)
- `POST /` - Create a new video project (`title`, `resolutionWidth`, `resolutionHeight`, `framerate`, `aspectRatio`, `timelineData`)
- `GET /` - List all projects belonging to the authenticated user
- `GET /:id` - Retrieve full project timeline tree, tracks, clips, and markers
- `PUT /:id` - Update project timeline tracks, title, or video configuration
- `DELETE /:id` - Archive or delete project

### 4. Media Storage (`/api/v1/media`)
- `POST /upload-url` - Request presigned direct-to-S3 upload URL (`fileName`, `mimeType`, `fileSizeBytes`)
- `POST /confirm` - Confirm completed S3 upload and index metadata into media catalog
- `GET /` - List user media assets (supports query parameter `?projectId=<id>`)

### 5. AI Video Services (`/api/v1/ai`)
- `POST /transcribe` - Transcribe audio with word-level timestamps (Cost: 5 credits)
- `POST /captions` - Generate dynamic animated subtitles (Cost: 3 credits)
- `POST /smart-cut` - Detect voiceover silences for jump cuts (Cost: 2 credits)
- `POST /broll` - Generate synthetic B-roll visual footage (Cost: 15 credits)

### 6. Video Rendering & Processing Jobs (`/api/v1/jobs`)
- `POST /render` - Submit video timeline rendering export job (Cost: 10 credits)
- `GET /:id` - Poll job rendering progress (`0%` to `100%`) and download URL
- `POST /:id/cancel` - Cancel active rendering job

### 7. Credits & Billing (`/api/v1/credits`)
- `GET /balance` - Retrieve current credit balance
- `GET /history` - Retrieve credit transaction ledger

### 8. Subscriptions (`/api/v1/subscriptions`)
- `GET /plans` - View available subscription tiers (`Free`, `Pro`, `Studio`)
- `GET /current` - View current user subscription status and renewal date

### 9. Webhooks (`/api/v1/webhooks`)
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
