# DAY 7 — BACKEND COMMAND 35 ACCEPTANCE
## AI Generation Job Platform

### 1. Architectural Overview & Objective
Command 35 implements the asynchronous AI Generation Job Platform. It handles computationally intensive generative AI tasks (video generation, image generation, sound effects, musical beds, contextual B-roll, video extension, and audio extension).

Every generation job executes through an 8-stage transactional lifecycle with credit reservation, automated retry with exponential backoff, client-initiated cancellation, timeout enforcement, immediate credit refunds on failure/cancel, audit logging, and automated persistence into the user's `MediaAsset` library and object storage.

---

### 2. Supported Generation Modalities
The platform provides endpoints and background workers for 7 generative modalities:
1. **Image Generation** (`POST /api/v1/ai/generate/image`): Generates graphics, thumbnails, and textures according to aspect ratio and style prompts.
2. **Video Generation** (`POST /api/v1/ai/generate/video`): Generates motion clips from text or image prompts.
3. **Sound Effects (SFX)** (`POST /api/v1/ai/generate/sfx`): Synthesizes foley, swooshes, impacts, and ambient effects.
4. **Music Generation** (`POST /api/v1/ai/generate/music`): Synthesizes background instrumental music beds with specified mood, genre, and duration.
5. **B-Roll Generation** (`POST /api/v1/ai/generate/broll`): Analyzes project context or prompt to generate relevant cutaway footage.
6. **Video Extend** (`POST /api/v1/ai/generate/video-extend`): Extends an existing video clip seamlessly forward or backward in time.
7. **Audio Extend** (`POST /api/v1/ai/generate/audio-extend`): Loops or continues an audio stem while maintaining rhythm and harmonic key.

---

### 3. Transactional Pipeline Flow

```
[Client Request]
       │
       ▼
1. Request Ingestion       ──► Authenticate user & accept generation parameters
       │
       ▼
2. Schema Validation       ──► Zod parsing: prompt length, aspect ratio, duration limits
       │
       ▼
3. Credit Reservation      ──► Atomically reserve estimated credits in creditsService
       │
       ▼
4. Provider Execution      ──► Dispatch to AI Gateway adapter with timeout boundary
       │
       ▼
5. Result Validation       ──► Verify byte headers, dimensions, duration, format
       │
       ▼
6. Storage Ingestion       ──► Persist generated buffer to StorageService via putObject
       │
       ▼
7. MediaAsset Creation     ──► Register asset in media library with dimensions & metadata
       │
       ▼
8. Completion & Broadcast  ──► Update job status to COMPLETED & broadcast via WebSocket/SSE
```

---

### 4. Resilience, Failure & Refund Semantics

#### 1. Cancellation & Instant Refund
Clients can cancel pending or processing jobs via `POST /api/v1/ai/jobs/:id/cancel`. The worker halts upstream processing and immediately triggers `creditsService.refund(...)`, restoring the reserved credits to the user's wallet.

#### 2. Upstream Timeout Handling
If a generative model provider hangs or exceeds the deadline (e.g. 120s for video generation), the gateway aborts the HTTP connection. The job transitions to `FAILED`, an alert is logged to the audit log, and credits are refunded automatically.

#### 3. Transient Error Retry
Network drops, 502/503 HTTP responses, or rate limit backoff triggers automatic retries (up to 3 attempts with exponential backoff: 1s, 2s, 4s).

#### 4. Audit Logging
Every attempt (initial, retry, success, failure) writes an immutable record to the AI gateway audit trail containing execution timestamp, model name, provider ID, tokens/compute consumed, and cost.

---

### 5. Verification & Acceptance Test Evidence
Verified in Vitest suite `backend/tests/day7-commands-acceptance.test.ts` (Command 35):
* **All 7 Modalities Generated Successfully**: Image, video, SFX, music, B-roll, video extend, and audio extend all execute through the worker and transition to `COMPLETED`.
* **MediaAsset & Storage Persistence Verified**: Every completed job emits a valid `output.assetId` and `output.mediaAsset` record persisted in the user's media library.
* **Cancellation & Credit Refund Verified**: Cancelling an in-flight video generation job transitions status to `CANCELLED` and triggers credit refund.
* **Timeout & Provider Failure Handling Verified**: Simulated upstream timeout causes job to fail gracefully and refunds the reserved credits.
* **Automated Retry Verified**: Transient error triggers retry attempt up to max limits before resolution.
