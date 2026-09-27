# DAY 7 — BACKEND COMMAND 31 ACCEPTANCE
## Production AI Provider Gateway

### 1. Architectural Overview & Objective
Command 31 establishes the provider-neutral AI Gateway infrastructure for the cloud video editor. The gateway decouples frontend client requests from underlying foundation model providers (Gemini, OpenAI, Anthropic, ElevenLabs, Runway, and internal self-hosted inference adapters).

Crucially, **no AI API keys are ever transmitted or exposed to Flutter client applications**. All client requests dispatch to backend gateway endpoints, which validate requests, enforce token bucket rate limits, authenticate credentials internally, handle retries and timeouts with exponential backoff, log tamper-evident audit records, and manage credit reservation and deductions atomically.

---

### 2. Supported Core Capabilities
The AI Gateway exposes unified interfaces covering 7 core production capabilities:
1. **LLM (Text Generation)**: Script generation, prompt rewriting, chapter labeling, headline derivation.
2. **Vision**: Frame analysis, scene description, object & color tone identification.
3. **STT (Speech-to-Text)**: Audio transcription, word-level timestamps, speaker diarization.
4. **TTS (Text-to-Speech)**: Voiceover generation, speech synthesis, multiple voice profiles.
5. **Image Generation**: Thumbnails, graphics, background plates, sticker textures.
6. **Video Generation**: B-roll video generation, background scene synthesis, visual transitions.
7. **Embeddings**: Vector embeddings for semantic search, cross-modal video/transcript indexing.

---

### 3. Gateway Architecture & Resilience Features

```
Client (Flutter / Web)
         │  (JWT Authenticated)
         ▼
[POST /api/v1/ai/...]
         │
         ├── 1. Rate Limit Enforcement (Token Bucket per User: 60 rpm, 1 token/sec refill)
         ├── 2. Anti-SSRF Provider Validation (Registered provider whitelist check)
         ├── 3. Credit Reservation & Atomic Deduction (creditsService)
         ├── 4. Primary Provider Dispatch with Timeout (AbortController)
         │       └── On Network / 5xx Failure ──► Exponential Backoff & Retry
         │       └── On Upstream Exhaustion   ──► Automatic Fallback Provider Dispatch
         ├── 5. Audit Logging (User, Capability, Provider, Model, Tokens, Latency, Timestamp)
         └── 6. Safe Client Response (Zero API keys, sanitized payloads)
```

#### Provider Selection & Anti-SSRF
Users or system jobs may specify desired providers (`fake`, `mock`, `gemini`, `openai`, etc.) or fallback providers. To eliminate Server-Side Request Forgery (SSRF), arbitrary URLs or unregistered provider identifiers are rejected immediately with `HTTP 400 VALIDATION_ERROR`.

#### Resilient Timeout, Retry & Fallback
Calls to upstream model providers are bounded by configurable timeouts (default 30s for text/embeddings, 120s for media generation). Transient network failures trigger automated retries (up to 3 attempts with exponential backoff). If primary providers fail repeatedly or time out, the gateway transparently invokes fallback providers.

#### Rate Limiting (Token Bucket)
Every user is subject to a rate limiting bucket. When rate limit tokens are exhausted, the gateway responds with `HTTP 429 AI_RATE_LIMIT_EXCEEDED` before attempting external network I/O.

#### Credit & Cost Accounting
Usage calculations track input/output tokens, compute time, and estimated USD cost. Credits are deducted atomically from the user's wallet. On unrecoverable provider failures or client cancellations, credits are refunded immediately.

#### Privacy & Flutter API Key Isolation
`GET /api/v1/ai/providers` delivers only public provider capability metadata (`id`, `name`, `capabilities`, `defaultModels`). API keys, environment credentials, and secret headers are strictly hidden from Flutter and web clients.

#### Comprehensive Audit Logging
Every gateway transaction generates an `AIAuditRecord` containing:
* `id`: Unique audit identifier
* `userId`: Requesting user
* `capability`: AI capability invoked
* `provider` & `model`: Engine utilized
* `success`: Boolean status flag
* `inputTokens`, `outputTokens`, `estimatedCostUsd`: Usage and economics
* `latencyMs`: Execution duration
* `timestamp`: ISO-8601 creation time

Inspectable via `GET /api/v1/ai/audit` for compliance and billing verification.

---

### 4. REST API Endpoint Specifications

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/ai/text` | Prompt completion with model selection & fallback |
| `POST` | `/api/v1/ai/structured-json` | Schema-enforced JSON generation |
| `POST` | `/api/v1/ai/vision` | Multimodal frame and image understanding |
| `POST` | `/api/v1/ai/speech-to-text` | Audio transcription with word-level timestamps |
| `POST` | `/api/v1/ai/text-to-speech` | Speech synthesis returning binary audio buffer |
| `POST` | `/api/v1/ai/generate-image` | Synchronous/rapid image generation |
| `POST` | `/api/v1/ai/embeddings` | Vector embedding generation |
| `GET` | `/api/v1/ai/providers` | Public provider list (strictly zero credentials) |
| `GET` | `/api/v1/ai/audit` | Filterable gateway transaction audit log |

---

### 5. Verification & Acceptance Test Evidence
All capabilities verified in automated Vitest suite `backend/tests/day7-commands-acceptance.test.ts`:
* **All 7 Core Capabilities Verified**: LLM, Vision, STT, TTS, Image, Video, and Embeddings all executed cleanly through `AIGatewayService`.
* **Anti-SSRF Protection Verified**: Arbitrary URLs (`http://malicious-host.internal/api`) rejected with HTTP 400 and `VALIDATION_ERROR`.
* **Timeout & Fallback Execution Verified**: Primary provider failure transitions gracefully to fallback provider (`mock`).
* **Rate Limits Verified**: Bucket exhaustion triggers HTTP 429 `AI_RATE_LIMIT_EXCEEDED`.
* **Privacy Safeguard Verified**: Provider listing asserts zero occurrences of API keys, `sk-`, `password`, or `secret`.
* **Audit Trail Verified**: System logs every inference call with latency, tokens, cost, and timestamps.
