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
[Client Presign] ──► UPLOADING ──► [Client Complete] ──► PROCESSING (Queue Worker Job) ──► READY
                           │                                          │
                           ▼                                          ▼
                         CANCELLED / FAILED                        FAILED (DLQ)
                                      │
                                      ▼
                                   DELETED (Soft-delete & S3 purge)
```

#### Media Processing Pipeline (Worker Jobs)
```
Upload Complete ──► Probe (15%) ──► Metadata (30%) ──► Thumbnail & Strip (50%) ──► Waveform (70%) ──► Proxy (85%) ──► Search Index (95%) ──► READY (100%)
```

- **Extracted Telemetry**: `duration`, `resolution` (width, height, aspect ratio), `fps`, `codec`, `audioCodec`, `channels`, `sampleRate`, `rotation`, `bitrateKbps`, `colorInformation` (colorSpace, colorPrimaries, colorTransfer, bitDepth).
- **Generated Artifacts**: Cover thumbnail, 5+ frame timestamped thumbnail strip for scrubbing, 128-peak audio waveform array, 720p H.264 timeline edit proxy.
- **Queue Features**: Exponential backoff retries (3 attempts), Dead-Letter Queue (DLQ), and job cancellation.

#### Media Endpoints
- `POST /v1/media/presign` - Request single-part or multipart upload session.
  - Automatically activates multipart chunking (5MB minimum part size) for files $\ge$ 50MB or when `uploadType: 'multipart'`.
  - Request body: `{ fileName, mimeType, fileSizeBytes, category?, projectId?, checksumSha256?, uploadType?, partCount? }`
  - Returns: `{ assetId, uploadId, uploadType, partSize, parts: [{ partNumber, uploadUrl }], uploadUrl }`
- `POST /v1/media/complete` - Finalize upload, verify checksum, execute security scan hook, and enqueue asynchronous processing worker job.
  - Returns immediately with `{ id, status: 'PROCESSING', processingJobId: '...' }` without blocking API requests.
  - Request body: `{ mediaId, uploadId?, parts?: [{ partNumber, eTag }], checksumSha256?, width?, height?, durationSeconds? }`
- `GET /v1/media/:id/processing-job` - Query real-time processing progress (0-100%), current pipeline stage, telemetry, and artifacts.
- `POST /v1/media/:id/cancel-processing` - Cancel ongoing processing job and mark asset as `FAILED`.
- `POST /v1/media/upload` - Direct API upload for small creative assets (LUTs, fonts, stickers, audio up to 50MB).
- `GET /v1/media/:id` - Fetch asset metadata and fresh presigned download URL (valid for 1 hour).
- `DELETE /v1/media/:id` - Soft-delete asset metadata and remove underlying binary object from storage bucket.
- `POST /v1/media/:id/cancel` - Cancel active upload and abort S3 multipart session.
- `POST /v1/media/:id/retry` - Re-initialize failed or cancelled upload session.
- `GET /v1/media` - List & search user media assets (`projectId`, `category`, `status`, `search`, `limit`, `offset`).
- `POST /v1/media/upload-url` & `POST /v1/media/confirm` - Backward-compatible legacy endpoints.

#### Media Intelligence & Multi-Modal Semantic Search (`/v1/media/search/semantic`, `/v1/media/:id/intelligence`)

TechXayan Creative's media intelligence engine analyzes imported media assets across multiple modalities (visual objects, anonymous faces, speech transcript & diarized speakers, scene cut boundaries, EXIF GPS locations, audio acoustic events, and vector embeddings) to power natural language semantic search with frame-accurate timeline range recommendations.

##### Semantic Search Pipeline
```
Natural Query ("person speaking beside a car")
         │
         ▼
[Embedding & Semantic Intent Parser] ──► [Multi-Modal Vector & Hybrid Index]
                                                      │
                                                      ▼
                       Ranked Results: Source Assets + Exact Timeline Ranges
                       [{ assetId, score, matchingRanges: [{ start: 12.0, end: 18.5 }] }]
```

##### Privacy & Ethical Safeguards
- **Strict Anonymity**: Face detection extracts purely geometric bounding boxes (`[ymin, xmin, ymax, xmax]`), presence intervals, and face counts. Personal attribute inferences (race, gender, emotion, age, biometric templates) are strictly forbidden and omitted.
- **Explicit-Only Geo Locations**: Geographical GPS coordinates are indexed *only if* explicitly embedded in source metadata / EXIF tags. Coordinates are never hallucinated or predicted.
- **Multi-Tenant Isolation**: Users only query and discover their own media assets.

##### Endpoints
- `POST /v1/media/search/semantic` - Natural language multi-modal semantic search.
  - Request body:
    ```json
    {
      "query": "Find clips where a person is speaking beside a car",
      "mode": "hybrid",
      "objects": ["car", "person"],
      "speechText": "welcome",
      "minDuration": 5.0,
      "maxDuration": 120.0,
      "mediaTypes": ["video"],
      "projectId": "optional-project-uuid",
      "fromDate": "2026-01-01T00:00:00.000Z",
      "toDate": "2026-12-31T23:59:59.999Z",
      "minScore": 0.3,
      "limit": 20,
      "offset": 0
    }
    ```
  - Response (HTTP 200):
    ```json
    {
      "success": true,
      "data": {
        "results": [
          {
            "assetId": "media-uuid",
            "assetName": "car_interview.mp4",
            "mediaType": "video",
            "duration": 45.2,
            "score": 0.88,
            "matchingRanges": [
              {
                "start": 10.0,
                "end": 20.0,
                "score": 0.91,
                "snippet": "person speaking beside a car",
                "matchedObjects": ["person", "car"],
                "matchedSpeech": "Let's examine the electric engine"
              }
            ],
            "visualObjects": ["person", "car", "microphone"],
            "sceneSummary": "Exterior automotive showcase interview",
            "hasSpeech": true,
            "hasFaces": true,
            "location": { "latitude": 37.7749, "longitude": -122.4194 }
          }
        ],
        "total": 1,
        "query": "Find clips where a person is speaking beside a car",
        "mode": "hybrid"
      }
    }
    ```
- `POST /v1/media/:id/intelligence` - Force-generate or re-analyze intelligence metadata and index into active search provider.
  - Request body: `{ forceReindex?: boolean, options?: { detectObjects?: boolean, detectFaces?: boolean, detectScenes?: boolean, transcribeSpeech?: boolean, detectAudioEvents?: boolean, computeEmbeddings?: boolean } }`
  - Response: returns generated `MediaIntelligenceMetadata` record.
- `GET /v1/media/:id/intelligence` - Fetch full multi-modal intelligence document for an asset.
  - Response: `{ success: true, data: { assetId, visualObjects: [...], faces: [...], speech: { transcript, words, speakers }, scenes: [...], location, audioEvents: [...], segmentEmbeddings: [...] } }`


### 6. Provider-Agnostic AI Gateway (`/v1/ai` & `/api/v1/ai`)

TechXayan Creative's AI subsystem operates as an enterprise AI Gateway proxying inference between client applications and backend AI model providers.

> **CRITICAL SECURITY NOTE**: No provider API keys (OpenAI, Google Gemini, Anthropic, etc.) are ever distributed inside Windows or Android client application binaries. All authentication and credential storage is strictly handled server-side via environment variables (`GEMINI_API_KEY`, `OPENAI_API_KEY`). Arbitrary user-supplied provider URLs are strictly disallowed to prevent SSRF attacks.

#### AI Gateway Architecture
```
AIRequest ──► AI Gateway ──► Rate Limiting ──► Credits Check ──► Provider Adapter ──► Normalized AI Response
                                                                          │
                                                               (On Failure: Auto Fallback)
```

#### Gateway Endpoints
- `GET /v1/ai/providers` - Discover available server-side providers and supported capabilities.
- `POST /v1/ai/text` - Normalized text generation with provider/model selection (Cost: 1 credit).
  - Request: `{ prompt, systemPrompt?, messages?, model?, provider?, fallbackProvider?, temperature?, maxTokens?, timeoutMs? }`
- `POST /v1/ai/structured-json` - Schema-enforced structured JSON generation (Cost: 1 credit).
  - Request: `{ prompt, schema, schemaName?, systemPrompt?, model?, provider?, fallbackProvider?, temperature? }`
- `POST /v1/ai/speech-to-text` - Audio/video transcription with word-level timestamps (Cost: 5 credits).
  - Request: `{ audioUrl?, audioBase64?, language?, wordTimestamps?, model?, provider?, fallbackProvider? }`
- `POST /v1/ai/text-to-speech` - Voiceover synthesis from text (Cost: 3 credits).
  - Request: `{ text, voiceId?, voiceGender?, speed?, format?, model?, provider?, fallbackProvider? }`
- `POST /v1/ai/image` - Text-to-image visual asset generation (Cost: 2 credits/image).
  - Request: `{ prompt, negativePrompt?, width?, height?, aspectRatio?, count?, model?, provider?, fallbackProvider? }`
- `POST /v1/ai/video` - Synthetic B-roll footage generation (Cost: 15 credits).
  - Request: `{ prompt, imageUrl?, durationSeconds?, fps?, resolution?, model?, provider?, fallbackProvider? }`
- `POST /v1/ai/embedding` - Vector embeddings for semantic search and tagging (Cost: 1 credit).
  - Request: `{ input: string | string[], dimensions?, model?, provider?, fallbackProvider? }`
- `POST /v1/ai/vision` - Multimodal frame analysis and bounding box detection (Cost: 2 credits).
  - Request: `{ images: [{ url?, base64?, mimeType }], prompt, maxTokens?, model?, provider?, fallbackProvider? }`
- `POST /v1/ai/audio-analysis` - Silence interval detection, jump-cut markers, and beat detection (Cost: 2 credits).
  - Request: `{ audioUrl?, audioBase64?, minSilenceSeconds?, detectBeats?, model?, provider?, fallbackProvider? }`

#### AI Speech-to-Text & Subtitle Pipeline (`/v1/ai/transcribe`, `/v1/ai/transcriptions`)

TechXayan Creative's speech-to-text pipeline extracts audio from imported video/audio assets or direct URLs, transcribes speech with word-level timing (0.000s precision), performs multi-speaker diarization (`spk_1`, `spk_2`), and formats results directly into SubRip (`.srt`), WebVTT (`.vtt`), and native timeline `Caption` clips ready to drag-and-drop onto the video editor track.

- **Pipeline Flow**: `Media (URL / MediaAssetId / AudioBase64) ──► Audio Extraction / Ingestion ──► AI Gateway (Speech-to-Text) ──► Word Timings & Diarization ──► Caption Segments ──► SRT / VTT Formats ──► Timeline Caption Clips`
- `POST /v1/ai/transcribe` - Transcribe audio/video and generate transcription document (Cost: 5 credits).
  - Request body:
    ```json
    {
      "mediaUrl": "https://example.com/interview.mp4",
      "mediaAssetId": "optional-uuid-from-media-storage",
      "audioBase64": "optional-base64-audio",
      "projectId": "optional-project-uuid",
      "language": "en",
      "prompt": "Technical context or jargon hints",
      "diarize": true,
      "style": {
        "fontSize": 48,
        "fontFamily": "Inter",
        "textColor": "#FFFFFF",
        "backgroundColor": "#00000080",
        "highlightColor": "#FFD700",
        "position": "bottom"
      }
    }
    ```
  - Response (HTTP 200):
    ```json
    {
      "success": true,
      "data": {
        "id": "transcription-uuid",
        "userId": "user-uuid",
        "projectId": "project-uuid",
        "transcript": "Full text transcript...",
        "language": "en",
        "duration": 42.5,
        "words": [
          { "word": "Welcome", "start": 0.0, "end": 0.4, "confidence": 0.98, "speakerId": "spk_1" }
        ],
        "speakers": [
          { "id": "spk_1", "name": "Speaker 1", "color": "#4A90E2", "totalWords": 85 }
        ],
        "segments": [
          {
            "id": "segment-uuid",
            "start": 0.0,
            "end": 3.3,
            "text": "Welcome back to TechXayan Creative.",
            "speakerId": "spk_1",
            "speakerName": "Speaker 1",
            "words": [...]
          }
        ],
        "captionObjects": [
          {
            "id": "clip-uuid",
            "trackId": "captions-track",
            "type": "text",
            "start": 0.0,
            "duration": 3.3,
            "content": "Welcome back to TechXayan Creative.",
            "style": { "fontSize": 48, "color": "#FFFFFF", "position": "bottom" },
            "words": [...]
          }
        ],
        "srt": "1\n00:00:00,000 --> 00:00:03,300\n[Speaker 1] Welcome back to TechXayan Creative.\n\n",
        "vtt": "WEBVTT\n\n1\n00:00:00.000 --> 00:00:03.300\n<v Speaker 1>Welcome back to TechXayan Creative.\n\n",
        "createdAt": "2026-09-20T00:00:00.000Z"
      }
    }
    ```
- `GET /v1/ai/transcriptions/:id` - Retrieve full transcription document with segments, words, speakers, and timeline caption clips.
- `GET /v1/ai/transcriptions/:id/srt` - Download/stream raw SubRip subtitle file (`Content-Type: text/plain; charset=utf-8`).
- `GET /v1/ai/transcriptions/:id/vtt` - Download/stream raw WebVTT subtitle file (`Content-Type: text/vtt; charset=utf-8`).
- `POST /v1/ai/captions` - Generate dynamic animated subtitles (Cost: 3 credits)
- `POST /v1/ai/smart-cut` - Detect voiceover silences for jump cuts (Cost: 2 credits)
- `POST /v1/ai/broll` - Generate synthetic B-roll visual footage (Cost: 15 credits)

#### AI-Assisted Editing Analysis & Editor Commands (`/v1/ai/editing-analysis`)

TechXayan Creative's AI-assisted editing engine analyzes talking-head footage, podcasts, interviews, and raw footage for dead air silences, filler words, awkward pauses, speech cadence/WPM, visual scene boundaries, and viral highlight moments.

> **CRITICAL ARCHITECTURAL INVARIANT**: AI **never directly mutates project data**. AI operates purely as an analytical advisor returning validated `EditorCommand` objects (`DELETE_RANGE`, `REMOVE_FILLER`, `SHORTEN_PAUSE`, `SCENE_SPLIT`, `CREATE_HIGHLIGHT_CLIP`, `ADD_MARKER`). The commands are previewed and toggled by the creator in `my_editor`'s UI, and then applied explicitly by the frontend's `ProjectBloc` with optimistic concurrency control (`expectedVersion`), ripple editing, and version snapshotting.

- **Pipeline Flow**: `AI Analysis ──► Normalized Commands ──► Backend Validation ──► Frontend Preview ──► ProjectBloc ──► Timeline Mutation`
- `POST /v1/ai/editing-analysis` - Execute multi-feature editing analysis (Cost: 3 credits).
  - Request body:
    ```json
    {
      "projectId": "optional-project-uuid",
      "mediaAssetId": "optional-media-uuid",
      "mediaUrl": "optional-url",
      "transcriptionId": "optional-transcription-uuid",
      "audioBase64": "optional-base64",
      "options": {
        "detectSilences": true,
        "minSilenceDuration": 0.6,
        "detectFillerWords": true,
        "fillerWordsList": ["um", "uh", "like", "you know", "er", "ah", "hmm"],
        "detectPauses": true,
        "minPauseDuration": 1.2,
        "detectScenes": true,
        "detectHighlights": true
      }
    }
    ```
  - Response: returns `AIEditingAnalysisResult` containing `features` (silences, fillerWords, pauses, speechSegments, sceneBoundaries, highlightCandidates), `summary`, `commands` (normalized editor operations), and `previewMetrics` (time saved, projected duration).
- `POST /v1/ai/editing-analysis/validate` - Validate custom or user-modified editor commands and preview timeline diff without modifying project data.
  - Request body: `{ projectId?, duration?, commands: EditorCommand[] }`
  - Response: `{ isValid: boolean, errors: string[], normalizedCommands: EditorCommand[], previewMetrics: TimelinePreviewDiff }`
- `POST /v1/ai/editing-analysis/apply` - Explicit user-initiated application of approved commands via `ProjectBloc`.
  - Request body: `{ projectId, expectedVersion, commands?: EditorCommand[], commandIds?: string[], rippleEditing?: boolean }`
  - Response: returns updated `ProjectDocument` with incremented version, updated timeline duration, and broadcasted `TIMELINE_MUTATION`.
- `GET /v1/ai/editing-analysis/:id` - Fetch previously computed editing analysis document.

#### Asynchronous AI Job System (`/v1/ai/jobs` & `/api/v1/ai/jobs`)
- `POST /v1/ai/jobs` - Enqueue an asynchronous AI job with idempotency and deduplication (HTTP 202 Accepted).
  - Header: `Idempotency-Key: <string>` (optional, prevents duplicate queueing and double billing)
  - Request: `{ type, input, projectId?, provider?, model?, idempotencyKey?, timeoutMs? }`
  - Response: `{ job: AIJobRecord, isReplay: boolean }`
- `GET /v1/ai/jobs/:id` - Fetch job status, progress, input, output, usage, and cost (strictly sanitized; zero secrets leaked).
- `POST /v1/ai/jobs/:id/cancel` - Cancel active/queued job, abort ongoing inference, and refund reserved credits.
- `POST /v1/ai/jobs/:id/retry` - Re-enqueue a failed or cancelled AI job.
- `GET /v1/ai/jobs` - List user AI jobs with filtering (`status`, `type`, `projectId`) and pagination (`limit`, `offset`).
- `GET /v1/ai/jobs/:id/events` - Server-Sent Events (SSE) stream for real-time progress updates.

##### AI Job Field Schema
| Field | Type | Description |
|---|---|---|
| `id` | `UUID` | Unique AI Job identifier |
| `userId` | `UUID` | Owner user ID |
| `projectId` | `UUID?` | Associated video project ID (if attached) |
| `type` | `string` | Job modality (`text_generation`, `speech_to_text`, `image_generation`, `video_generation`, `structured_json`, `vision`, `audio_analysis`, etc.) |
| `status` | `enum` | Uppercase state machine: `QUEUED`, `RUNNING`, `COMPLETED`, `FAILED`, `CANCELLED` |
| `progress` | `integer` | Current progress percentage (`0` to `100`) |
| `input` | `object` | Input parameters and prompts |
| `output` | `object?` | Normalized output payload upon completion |
| `provider` | `string` | Selected provider identifier (`fake`, `gemini`, `openai`, etc.) |
| `model` | `string?` | Model version executed |
| `usage` | `object?` | Normalized tokens, audio seconds, and image metrics |
| `cost` | `integer` | Credits deducted for execution |
| `error` | `string?` | Error description if status is `FAILED` |
| `createdAt` | `string` | ISO timestamp of enqueueing |
| `startedAt` | `string?` | ISO timestamp of worker processing initiation |
| `completedAt` | `string?` | ISO timestamp of job completion or failure |

### 7. Video Rendering & Processing Jobs (`/api/v1/jobs`)
- `POST /render` - Submit video timeline rendering export job (Cost: 10 credits)
- `GET /dead-letter` - List failed jobs currently in the Dead-Letter Queue (DLQ)
- `GET /:id` - Poll job rendering or processing progress (`0%` to `100%`) and status
- `POST /:id/cancel` - Cancel active background job
- `POST /:id/retry` - Retry a failed or dead-lettered job

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

## Real-Time WebSockets & Streams

### 1. Collaboration WebSocket
- **Endpoint**: `ws://localhost:4000/ws/v1/collaboration/:projectId?token=<access_token>`
- **Supported Actions**: `JOIN_PROJECT`, `LEAVE_PROJECT`, `CURSOR_MOVE`, `SEEK_PLAYHEAD`, `TIMELINE_MUTATION`, `LOCK_TRACK`, `UNLOCK_TRACK`, `MEDIA_PROCESSING_PROGRESS`, `MEDIA_PROCESSING_COMPLETED`, `AI_JOB_UPDATE`.

### 2. Media Processing Real-Time Progress WebSocket
- **Job Subscription**: `ws://localhost:4000/ws/v1/jobs/:jobId/progress?token=<access_token>`
- **Media Subscription**: `ws://localhost:4000/ws/v1/media/:mediaId/progress?token=<access_token>`
- **Events Emitted**: `SUBSCRIBED`, `JOB_PROGRESS`, `JOB_COMPLETED`, `JOB_FAILED`.

### 3. Asynchronous AI Jobs Real-Time Progress WebSocket
- **Single Job Subscription**: `ws://localhost:4000/ws/v1/ai/jobs/:id/progress?token=<access_token>`
- **User Feed Subscription**: `ws://localhost:4000/ws/v1/ai/progress?token=<access_token>`
- **Server-Sent Events (SSE)**: `GET /v1/ai/jobs/:id/events` (with `Authorization: Bearer <token>`)
- **Events Emitted**:
  - `SUBSCRIBED`: `{ event: "SUBSCRIBED", jobId: "..." }`
  - `JOB_QUEUED`: `{ event: "JOB_QUEUED", jobId, type, status: "QUEUED", progress: 0, cost }`
  - `JOB_STARTED`: `{ event: "JOB_STARTED", jobId, status: "RUNNING", progress: 15 }`
  - `JOB_PROGRESS`: `{ event: "JOB_PROGRESS", jobId, status: "RUNNING", progress: 45, currentStep: "..." }`
  - `JOB_COMPLETED`: `{ event: "JOB_COMPLETED", jobId, status: "COMPLETED", progress: 100, output: { ... }, usage: { ... }, cost }`
  - `JOB_FAILED`: `{ event: "JOB_FAILED", jobId, status: "FAILED", error: "..." }`
  - `JOB_CANCELLED`: `{ event: "JOB_CANCELLED", jobId, status: "CANCELLED" }`

