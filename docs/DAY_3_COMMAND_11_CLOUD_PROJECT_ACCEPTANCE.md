# Production Cloud Project Management Acceptance

**Command:** Day 3 — Command 11: Production Cloud Project Management  
**System:** `my_editor` Cloud Media Platform  
**Target Clients:** Flutter Desktop (Windows), Flutter Mobile (Android), Web Editor & Admin Dashboard  
**Verification Level:** Tier-1 Enterprise Mission-Critical  
**Acceptance Status:** ✅ **PASSED (10/10 Core Lifecycle Capabilities Verified)**

---

## 1. Executive Summary & Acceptance Matrix

The cloud project lifecycle for `my_editor` has been implemented and validated against real production workflows, optimistic concurrency control, non-destructive versioning, safe autosave, multi-track timeline persistence, fine-grained RBAC, and real-time domain event dispatching.

| # | Lifecycle Capability | API Route | Concurrency / RBAC Constraint | Status |
|---|---|---|---|:---:|
| 1 | **Create Project** | `POST /v1/projects` | Validates canvas, timeline tracks, audio/text/effects, assets | ✅ **PASS** |
| 2 | **Retrieve / Reopen Project** | `GET /v1/projects/:id` | Enforces ownership or collaboration (`project:view`); enriches Flutter DTO | ✅ **PASS** |
| 3 | **Save Project (Incremental)** | `PATCH /v1/projects/:id`<br>`PUT /v1/projects/:id` | Validates `expectedVersion` / `If-Match`; increments version and emits `project:updated` | ✅ **PASS** |
| 4 | **Optimistic Concurrency** | `PATCH /v1/projects/:id`<br>`POST /v1/projects/:id/autosave` | Returns HTTP 409 `CONCURRENCY_CONFLICT` with structured conflict metadata on stale versions | ✅ **PASS** |
| 5 | **Safe Autosave** | `POST /v1/projects/:id/autosave` | Idempotent on `clientMutationId`, retry-safe, debounced, non-blocking | ✅ **PASS** |
| 6 | **Manual Backup Snapshot** | `POST /v1/projects/:id/snapshots`<br>`GET /v1/projects/:id/snapshots` | Captures point-in-time snapshot with custom change summary | ✅ **PASS** |
| 7 | **Non-Destructive Restore** | `POST /v1/projects/:id/versions/:v/restore` | Preserves full history; commits restored snapshot as new version $N+1$ | ✅ **PASS** |
| 8 | **Project Rename** | `PATCH /v1/projects/:id/rename` | Updates project title; records version history record | ✅ **PASS** |
| 9 | **Project Duplicate** | `POST /v1/projects/:id/duplicate` | Creates deep copy of tracks, clips, canvas, and assets with fresh version v1 | ✅ **PASS** |
| 10 | **Archive, Restore & Delete** | `POST /v1/projects/:id/archive`<br>`POST /v1/projects/:id/restore`<br>`DELETE /v1/projects/:id` | Supports soft archival, unarchiving, soft deletion, and permanent purge (`?permanent=true`) | ✅ **PASS** |

---

## 2. Real Cloud Project Lifecycle Walkthrough

```
+-----------------------------------------------------------------------------------------+
|                                    FLUTTER CLIENT                                       |
+-----------------------------------------------------------------------------------------+
       |
       | 1. Authenticate (JWT Bearer)
       v
+------------------+     2. POST /v1/projects      +--------------------------------------+
| Create Project   | ----------------------------> | Initial document v1, ETag computed   |
+------------------+                               +--------------------------------------+
       |
       | 3. Reopen / GET /v1/projects/:id
       v
+------------------+     4. PATCH /v1/projects/:id +--------------------------------------+
| Timeline Edit    | ----------------------------> | Validate expectedVersion=1           |
+------------------+       (expectedVersion=1)     | Save changes, increment to v2, ETag  |
       |                                           +--------------------------------------+
       | 5. Autosave in background
       v
+------------------+     6. POST /v1/projects/:id/autosave
| Autosave Engine  | ----------------------------> | Validate baseVersion=2               |
+------------------+       (clientMutationId)      | Deduplicate retries, increment to v3 |
       |
       | 7. Multiple devices edit simultaneously (conflict detection)
       v
+------------------+     8. Stale save (expectedVersion=2)
| Conflict Check   | ----------------------------> | HTTP 409 CONCURRENCY_CONFLICT        |
+------------------+                               | Returns serverVersion=3, serverETag  |
       |
       | 9. Restore historical snapshot
       v
+------------------+    10. POST /v1/projects/:id/versions/1/restore
| Version Restore  | ----------------------------> | Non-destructive: creates version 4   |
+------------------+                               | Prior versions (1, 2, 3) intact      |
       |
       | 11. Project lifecycle completion
       v
+------------------+    12. Archive -> Restore -> Soft Delete -> Permanent Purge
| Lifecycle Mgmt   | --------------------------------------------------------------------+
+------------------+
```

---

## 3. Project Data Architecture & Multi-Track Persistence

In accordance with enterprise cloud architecture principles, **no heavy media binaries (video/audio/images) are stored directly inside PostgreSQL**. Only references (S3 URLs, asset IDs, metadata) and structured timeline descriptions are persisted:

- **Metadata:** ID, owner ID, title, description, status (`active`, `archived`, `deleted`), thumbnail URL, timestamps.
- **Canvas:** Resolution width/height (1080p, 4K, 9:16 vertical), framerate (24, 30, 60 fps), color space, background color.
- **Timeline:** Multi-track arrangement with track hierarchy (`video`, `audio`, `text`, `effect`, `image`, `overlay`).
- **Clips:** Millisecond precision start, duration, source trim points, speed, volume, lock/mute states.
- **Text & Captions:** Rich typography (font, size, alignment, color, bold, italic), 2D coordinates, word-level timestamps, speaker identification.
- **Effects & Keyframes:** Parameter automation curves (time offset, property target, easing function).
- **Audio Mix:** Gain, pan balance, fade-in/fade-out curves, pitch shifting, equalization parameters.
- **Asset References:** Links to MinIO/S3 object store IDs, MIME types, durations, waveforms, and proxy streams.

---

## 4. Optimistic Concurrency Control Specification

To prevent silent overwrites in collaborative and multi-device environments, all project mutations require and validate version tokens.

### Protocol Mechanics
1. **Reads:** `GET /v1/projects/:id` returns `version`, `projectVersion`, and HTTP response header `ETag: "v<version>-<hash>"`.
2. **Writes:** Clients pass `expectedVersion` in request JSON or HTTP header `If-Match: "v<version>-<hash>"`.
3. **Success:** If `expectedVersion === currentVersion`, the state is applied, the version increments ($v \rightarrow v+1$), a new ETag is generated, and domain event `project:updated` is dispatched.
4. **Conflict:** If `expectedVersion !== currentVersion`, the mutation is rejected immediately with HTTP 409.

### Structured HTTP 409 Conflict Payload
```json
{
  "code": "CONCURRENCY_CONFLICT",
  "message": "Conflict: Project was modified by another session or device. Reload the project before making edits.",
  "details": {
    "currentVersion": 3,
    "expectedVersion": 1,
    "serverUpdatedAt": "2026-09-21T15:32:18.650Z",
    "serverETag": "\"v3-90d40523\"",
    "conflictingDevice": "Android Pixel 8"
  }
}
```

---

## 5. Safe & Idempotent Autosave Mechanics

The autosave pipeline (`POST /v1/projects/:id/autosave`) is engineered for intermittent mobile connections and high-frequency editor keystrokes:

1. **Idempotency via `clientMutationId`:** If a client experiences a network glitch and retries an autosave request with the same `clientMutationId`, the backend recognizes the repeated mutation, returns HTTP 200 with the existing version and ETag, and avoids false 409 conflicts.
2. **Payload Deduplication:** If the timeline and canvas payload is identical to the current revision, the operation succeeds idempotently without creating redundant version noise.
3. **Non-Blocking Execution:** Autosave operations write asynchronously to storage and avoid blocking the editor render loop.

---

## 6. Non-Destructive Version History & Snapshot Restoration

Every project mutation (manual save, autosave, snapshot, restore) is recorded in immutable version records:

- **Snapshots:** Explicit manual checkpoints (`POST /v1/projects/:id/snapshots`) capture project state with user-supplied summaries (e.g., `"Pre-color grading backup"`).
- **Non-Destructive Restoration:** Restoring a prior version $K$ (`POST /v1/projects/:id/versions/:v/restore`) never deletes or overwrites existing version rows. Instead, the snapshot from version $K$ is fetched and applied as a brand-new revision $N+1$.
- **Audit Lineage:** Full audit history is retained, allowing infinite undo/redo across collaborative client sessions.

---

## 7. Security & RBAC Enforcement Matrix

Project endpoints strictly enforce ownership and collaborator roles (`OWNER`, `EDITOR`, `COMMENTER`, `VIEWER`):

| Endpoint / Operation | Permission Required | OWNER | EDITOR | COMMENTER | VIEWER | Unrelated User |
|---|---|:---:|:---:|:---:|:---:|:---:|
| `GET /v1/projects/:id` | `project:view` | ✅ Allowed | ✅ Allowed | ✅ Allowed | ✅ Allowed | ❌ 403 Forbidden |
| `PATCH /v1/projects/:id` | `timeline:edit` | ✅ Allowed | ✅ Allowed | ❌ 403 Forbidden | ❌ 403 Forbidden | ❌ 403 Forbidden |
| `POST /v1/projects/:id/autosave` | `timeline:edit` | ✅ Allowed | ✅ Allowed | ❌ 403 Forbidden | ❌ 403 Forbidden | ❌ 403 Forbidden |
| `PATCH /v1/projects/:id/rename` | `project:edit` | ✅ Allowed | ✅ Allowed | ❌ 403 Forbidden | ❌ 403 Forbidden | ❌ 403 Forbidden |
| `POST /v1/projects/:id/duplicate` | `project:view` | ✅ Allowed | ✅ Allowed | ✅ Allowed | ✅ Allowed | ❌ 403 Forbidden |
| `POST /v1/projects/:id/archive` | `project:archive` | ✅ Allowed | ❌ 403 Forbidden | ❌ 403 Forbidden | ❌ 403 Forbidden | ❌ 403 Forbidden |
| `POST /v1/projects/:id/restore` | `project:archive` | ✅ Allowed | ❌ 403 Forbidden | ❌ 403 Forbidden | ❌ 403 Forbidden | ❌ 403 Forbidden |
| `DELETE /v1/projects/:id` | `project:delete` | ✅ Allowed | ❌ 403 Forbidden | ❌ 403 Forbidden | ❌ 403 Forbidden | ❌ 403 Forbidden |
| `POST /v1/projects/:id/snapshots` | `version:create` | ✅ Allowed | ✅ Allowed | ❌ 403 Forbidden | ❌ 403 Forbidden | ❌ 403 Forbidden |
| `POST /v1/projects/:id/versions/:v/restore` | `version:restore` | ✅ Allowed | ✅ Allowed | ❌ 403 Forbidden | ❌ 403 Forbidden | ❌ 403 Forbidden |

---

## 8. Verification Evidence

### Automated Test Suite
Test file: `backend/tests/cloud-project-management-acceptance.test.ts`  
Execution command: `npm test -- tests/cloud-project-management-acceptance.test.ts`

```
Test Files  1 passed (1)
     Tests  10 passed (10)
  Duration  4.14s

✓ Test 1: Full project creation with multi-track timeline, text, effects, keyframes, audio & captions
✓ Test 2: Project retrieval and reopening with Flutter DTO enrichment
✓ Test 3: Incremental project update with optimistic concurrency control
✓ Test 4: Concurrency conflict detection returning HTTP 409 with structured details
✓ Test 5: Idempotent and retry-safe background autosave with clientMutationId
✓ Test 6: Manual backup snapshot creation and snapshot listing
✓ Test 7: Non-destructive historical version restoration (v1 restored as v4)
✓ Test 8: Project search, sorting, filtering, and pagination
✓ Test 9: Fine-grained RBAC enforcement on project operations
✓ Test 10: Complete project lifecycle: Rename -> Duplicate -> Archive -> Restore -> Permanent Purge
```

### Full Regression Test Suite
- `tests/projects.test.ts`: **PASSED**
- `tests/review-workflow-comments.test.ts`: **PASSED**
- `tests/project-collaboration-rbac.test.ts`: **PASSED**
- `tests/admin`: **76/76 PASSED**
- `backend tsc --noEmit`: **0 errors**
- `admin tsc && vite build`: **0 errors, bundle 431 kB**

---

## 9. Architectural Sign-Off

The Production Cloud Project Management module satisfies all enterprise stability, concurrency, durability, and security requirements. It is fully ready for Flutter desktop, Flutter mobile, and Web production deployment.
