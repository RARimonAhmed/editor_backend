# Cloud Render Job Pipeline: Phases 1–3 Acceptance & Domain Contract

> **Implementation Status: PHASE 1–3 COMPLETE**  
> **Phase 1 (Database) | Phase 2 (Render Job Service) | Phase 3 (Controller & Routes)**  
> 
> ⚠️ **CRITICAL ARCHITECTURAL BOUNDARY:**  
> - **REAL FFmpeg WORKER = NOT YET IMPLEMENTED**  
> - **REAL ffprobe VALIDATION = NOT YET IMPLEMENTED**  
> - **REAL STORAGE OUTPUT PIPELINE = NOT YET IMPLEMENTED**  
> *Cloud rendering is NOT claimed to be complete. The real distributed FFmpeg rendering engine will be implemented in Phase 4.*

---

## 1. Database Migration & Schema

### Migration File
- Path: `backend/src/database/migrations/003_render_jobs.sql`
- Convention: Sequential prefix adhering to `001_core_schema.sql` and `002_ai_jobs_system.sql`.
- Reversible: Includes standard SQL trigger, index declarations, and documented rollback DOWN script.

### Table: `render_jobs`
```sql
CREATE TABLE IF NOT EXISTS render_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    project_version_id UUID REFERENCES project_versions(id) ON DELETE SET NULL,
    status VARCHAR(32) DEFAULT 'queued' NOT NULL,
    settings JSONB DEFAULT '{}'::jsonb NOT NULL,
    progress NUMERIC(5,2) DEFAULT 0.00 NOT NULL,
    stage VARCHAR(64) DEFAULT 'queued' NOT NULL,
    error_code VARCHAR(64),
    error_message TEXT,
    output_object JSONB,
    worker_metadata JSONB DEFAULT '{}'::jsonb NOT NULL,
    attempts INTEGER DEFAULT 0 NOT NULL,
    max_attempts INTEGER DEFAULT 3 NOT NULL,
    credit_reservation_id UUID,
    credit_cost INTEGER DEFAULT 0 NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,

    CONSTRAINT chk_render_job_status CHECK (
        status IN (
            'queued', 'starting', 'running', 'cancelling',
            'cancelled', 'validating', 'uploading', 'completed', 'failed'
        )
    ),
    CONSTRAINT chk_render_job_progress CHECK (progress >= 0.00 AND progress <= 100.00),
    CONSTRAINT chk_render_job_attempts CHECK (attempts >= 0),
    CONSTRAINT chk_render_job_max_attempts CHECK (max_attempts > 0),
    CONSTRAINT chk_render_job_credit_cost CHECK (credit_cost >= 0)
);
```

### Automatic Timestamp Trigger
`render_jobs` is wired to the database's existing trigger function `trigger_set_updated_at()`, updating `updated_at` automatically on every row modification.

### Performance & User Isolation Indexes
- `idx_render_jobs_user_id` on `(user_id)`
- `idx_render_jobs_project_id` on `(project_id)`
- `idx_render_jobs_status` on `(status)`
- `idx_render_jobs_created_at` on `(created_at DESC)`
- `idx_render_jobs_user_status` on `(user_id, status)`
- `idx_render_jobs_project_status` on `(project_id, status)`
- `idx_render_jobs_credit_res` on `(credit_reservation_id)`

---

## 2. API Endpoints Contract

All endpoints are registered under `/api/v1/jobs/render` and `/v1/jobs/render` with Bearer JWT authentication:

| Method | Endpoint | Description | Auth / RBAC |
|---|---|---|---|
| `POST` | `/api/v1/jobs/render` | Submit asynchronous render job | Owner or Project Member with export capability |
| `GET` | `/api/v1/jobs/render/:id` | Get job status, progress & telemetry | Owner only (Admins can view any) |
| `GET` | `/api/v1/jobs/render` | List render jobs with pagination/filters | Scoped to caller's own jobs (Admin can filter `allUsers`) |
| `POST` | `/api/v1/jobs/render/:id/cancel` | Cancel queued or running job | Owner or Admin |
| `POST` | `/api/v1/jobs/render/:id/retry` | Retry failed job within max attempts | Owner or Admin |

---

## 3. Request & Response Examples

### A. Submit Render Job
**Request:**
`POST /api/v1/jobs/render`
```json
{
  "projectId": "9e1cbd01-5289-4923-8f46-fe49551fc16f",
  "settings": {
    "format": "mp4",
    "resolutionWidth": 3840,
    "resolutionHeight": 2160,
    "framerate": 60,
    "videoCodec": "h264",
    "audioCodec": "aac",
    "bitrateKbps": 25000,
    "preset": "fast"
  }
}
```

**Response (202 Accepted):**
```json
{
  "success": true,
  "data": {
    "id": "145daba3-541b-484f-935b-5df21f1a4361",
    "userId": "b5fe3e90-6941-4b95-a81b-b477da2a3dae",
    "projectId": "9e1cbd01-5289-4923-8f46-fe49551fc16f",
    "projectVersionId": null,
    "status": "queued",
    "settings": {
      "format": "mp4",
      "resolutionWidth": 3840,
      "resolutionHeight": 2160,
      "framerate": 60,
      "videoCodec": "h264",
      "audioCodec": "aac",
      "bitrateKbps": 25000,
      "audioBitrateKbps": 192,
      "preset": "fast"
    },
    "progress": 0,
    "stage": "queued",
    "errorCode": null,
    "errorMessage": null,
    "outputObject": null,
    "workerMetadata": {},
    "attempts": 0,
    "maxAttempts": 3,
    "creditReservationId": "9b8d96b1-0f77-448c-b034-75476a59b6cb",
    "creditCost": 25,
    "createdAt": "2026-09-25T15:26:21.528Z",
    "startedAt": null,
    "completedAt": null,
    "cancelledAt": null,
    "updatedAt": "2026-09-25T15:26:21.528Z"
  },
  "meta": {
    "timestamp": "2026-09-25T15:26:21.529Z"
  }
}
```

### B. List Render Jobs
**Request:**
`GET /api/v1/jobs/render?page=1&limit=20&projectId=9e1cbd01-5289-4923-8f46-fe49551fc16f`

**Response (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "id": "145daba3-541b-484f-935b-5df21f1a4361",
      "userId": "b5fe3e90-6941-4b95-a81b-b477da2a3dae",
      "projectId": "9e1cbd01-5289-4923-8f46-fe49551fc16f",
      "status": "queued",
      "progress": 0,
      "stage": "queued",
      "creditCost": 25,
      "createdAt": "2026-09-25T15:26:21.528Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1,
    "pagination": {
      "total": 1,
      "page": 1,
      "limit": 20,
      "totalPages": 1
    },
    "timestamp": "2026-09-25T15:26:21.600Z"
  }
}
```

### C. Cancel Render Job
**Request:**
`POST /api/v1/jobs/render/145daba3-541b-484f-935b-5df21f1a4361/cancel`

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": "145daba3-541b-484f-935b-5df21f1a4361",
    "status": "cancelled",
    "stage": "cancelled",
    "cancelledAt": "2026-09-25T15:26:21.529Z",
    "updatedAt": "2026-09-25T15:26:21.529Z"
  },
  "meta": {
    "timestamp": "2026-09-25T15:26:21.530Z"
  }
}
```

---

## 4. Status Lifecycle State Machine

```
              ┌─────────┐
              │ queued  ├──────────────┐
              └────┬────┘              │
                   │                   ▼
              ┌────▼────┐        ┌───────────┐
       ┌──────┤starting │        │ cancelled │◄────────┐
       │      └────┬────┘        └───────────┘         │
       │           │                   ▲               │
       │      ┌────▼────┐              │               │
       │      │ running ├──────────────┼───────────────┤
       │      └────┬────┘              │               │
       │           │                   │               │
       │      ┌────▼─────┐             │               │
       │      │validating│             │ (when queued) │
       │      └────┬─────┘             │               │
       │           │                   │               │
       │      ┌────▼─────┐       ┌─────┴─────┐         │
       │      │uploading │       │cancelling ├─────────┘
       │      └────┬─────┘       └───────────┘
       │           │             (when running)
       │      ┌────▼─────┐
       │      │completed │ (terminal)
       │      └──────────┘
       │
       ▼
 ┌──────────┐
 │  failed  ├────────► (retry) ──► queued
 └──────────┘
```

### Transition Validation Rules (`isValidStatusTransition`)
1. `queued` ➔ `starting`, `cancelled`, `failed`
2. `starting` ➔ `running`, `cancelling`, `failed`, `cancelled`
3. `running` ➔ `validating`, `cancelling`, `failed`
4. `cancelling` ➔ `cancelled`, `failed`
5. `validating` ➔ `uploading`, `failed`
6. `uploading` ➔ `completed`, `failed`
7. `completed` ➔ Terminal (no outgoing transitions allowed)
8. `cancelled` ➔ Terminal (no outgoing transitions allowed)
9. `failed` ➔ `queued` (retry only)

---

## 5. Credit & Queue Consistency Model

### The Challenge
BullMQ is external to the PostgreSQL transaction. A naive `BEGIN -> reserve -> insert -> enqueue -> COMMIT` would expose Redis to phantom jobs if PostgreSQL rollbacks, or leak credits if queue submission fails.

### Implemented Safe Sequence
1. **Validate Project Ownership & Render Settings** (fail fast before financial side effects).
2. **Calculate Credit Cost & Deduct Reservation** via `creditsService.deductCredits(...)`.
3. **Persist Render Job** in PostgreSQL with transaction commit via `withTransaction(...)`.
4. **Enqueue to BullMQ AFTER Successful DB Commit**.
5. **Compensation Strategy**:
   - If Redis/BullMQ enqueue throws an exception:
     - Mark `render_jobs` row as `status = 'failed'`, `error_code = 'QUEUE_SUBMISSION_FAILED'`.
     - Refund reserved credits immediately via `creditsService.grantCredits(..., 'job_refund')`.
     - Emit `render_job_failed` realtime event.
     - Throw a clean `503 Service Unavailable` (`AppError`).
   - Job is never left in an unworked, permanently queued state.

---

## 6. Cancellation & Retry Semantics

### Cancellation
- **When `status === 'queued'`**:
  - Transition immediately to `cancelled`.
  - Cancel job token in BullMQ (`jobQueue.cancelJob`).
  - Refund reserved credits exactly once.
  - Emit `render_job_cancelled` realtime event.
- **When `status === 'running' | 'starting'`**:
  - Transition to `cancelling`.
  - Signal BullMQ cancellation.
  - Process termination and financial settlement deferred to worker (Phase 4).
- **When `status === 'completed'`**:
  - Rejected with `400 Validation Error`.
- **Duplicate Cancel**:
  - Idempotent return; credits are strictly refunded once.

### Retry
- **Allowed States**: Only `failed` jobs can be retried.
- **Max Attempts**: Must satisfy `attempts < max_attempts`.
- **Credit Logic**: Previous failure was refunded, so retry re-reserves credits for the new run.
- **State Reset**: `status ➔ 'queued'`, `progress ➔ 0.0`, `stage ➔ 'queued'`, `attempts ➔ attempts + 1`.
- **Queue Dispatch**: New job ID `${job.id}-retry-${attempts}` enqueued to BullMQ.

---

## 7. BullMQ Queue Integration
- **Queue Name**: `'render_jobs'`
- **Payload Schema**: Immutable identifiers only:
  ```typescript
  export interface RenderQueuePayload {
    renderJobId: string;
    projectId: string;
    projectVersionId?: string | null;
  }
  ```
  *(Zero media blobs, zero multi-megabyte timeline JSON in Redis).*
- **Job Options**: Idempotent BullMQ job ID matching `renderJobId`, exponential backoff, max attempts: 3.

---

## 8. Current Limitations & Phase 4 Handoff

| Component | Status | Phase Handled |
|---|---|---|
| Persistent `render_jobs` Table & Migration | ✅ Completed | Phase 1 |
| Strongly Typed Domain & State Machine | ✅ Completed | Phase 2 |
| RenderJob Service & Compensations | ✅ Completed | Phase 2 |
| REST Controller & Fastify Routes | ✅ Completed | Phase 3 |
| Realtime Event Hooks | ✅ Completed | Phase 3 |
| **Real FFmpeg Worker Process** | ❌ **NOT YET IMPLEMENTED** | **Phase 4** |
| **Real ffprobe Validation Pipeline** | ❌ **NOT YET IMPLEMENTED** | **Phase 4** |
| **Real Object Storage Upload Pipeline** | ❌ **NOT YET IMPLEMENTED** | **Phase 4** |

### Exact Next Implementation Point for Phase 4:
Register the production worker on `'render_jobs'` inside `src/services/queue/processors.ts`:
```typescript
jobQueue.process('render_jobs', async (job: Job<RenderQueuePayload>) => {
  // Phase 4 implementation point:
  // 1. Fetch renderJob & project timeline snapshot from DB
  // 2. Spawn native FFmpeg process with spawn/execFile
  // 3. Parse FFmpeg stderr progress into DB & Realtime
  // 4. Validate output with ffprobe-static
  // 5. Stream output to StorageService (S3/MinIO/R2)
  // 6. Update status -> completed, outputObject, duration, and credit settlement
});
```
