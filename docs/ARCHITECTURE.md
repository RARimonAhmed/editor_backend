# `my_editor` Backend Architecture Blueprint

## 1. Executive Summary

**my_editor** is a professional video editing suite engineered for Windows and Android by **TechXayan Creative**. The backend serves as the distributed core orchestrating:
- Real-time multiplayer timeline collaboration and presence synchronization.
- High-performance asset cataloging and direct-to-storage presigned upload pipelines.
- Asynchronous video transcoding, proxy generation, and multi-track rendering exports.
- Pluggable AI capabilities (Whisper audio transcription, smart jump-cut silence removal, dynamic subtitles, and generative B-roll).
- Role-based access control, subscriptions (Free, Pro, Studio), and a transactional credit ledger.

---

## 2. High-Level Architecture Diagram

```
                     ┌───────────────────────────────────────────────┐
                     │   my_editor Client (Windows / Android)        │
                     └───────────────┬───────────────────────────────┘
                                     │
                     ┌───────────────┴───────────────┐
                     │ REST (HTTPS)   WebSocket (WSS)│
                     ▼                               ▼
       ┌─────────────────────────────────────────────────────────────┐
       │                   Fastify API Gateway                       │
       │  - Request ID & Pino Structured JSON Logging                │
       │  - JWT Bearer Authentication & Role-Based Access Control    │
       │  - Rate Limiting, CORS & Helmet Security Headers            │
       │  - OpenAPI / Swagger Interactive Documentation (/docs)      │
       │  - Realtime Collaboration Hub (ws/v1/collaboration/:id)    │
       └──────────────┬──────────────────────────────┬───────────────┘
                      │                              │
        ┌─────────────┴────────────┐   ┌─────────────┴─────────────┐
        ▼                          ▼   ▼                           ▼
┌──────────────┐          ┌────────────────┐              ┌────────────────┐
│  PostgreSQL  │          │ Redis & Broker │              │ S3 / MinIO     │
│  - Users     │          │ - Presence     │              │ - Raw Media    │
│  - Timelines │          │ - Track Locks  │              │ - Proxies      │
│  - Credits   │          │ - Job Queue    │              │ - Renders      │
└──────────────┘          └────────┬───────┘              └────────────────┘
                                   │
                                   ▼
       ┌─────────────────────────────────────────────────────────────┐
       │                   Worker Service                            │
       │  - FFmpeg Transcoding & 4K Proxy Generation                 │
       │  - Video Timeline Compositing & Export Assembly             │
       │  - AI Pipelines (Whisper Transcription & Auto-Subtitles)    │
       └─────────────────────────────────────────────────────────────┘
```

---

## 3. Subsystem Breakdown

### 3.1 API Service (`src/server.ts` & `src/app.ts`)
- **Engine**: Fastify v4 with TypeScript.
- **Request Tracing**: Generates or forwards `x-request-id` across logs and HTTP response headers.
- **Structured Error Handling**: All exceptions conform to RFC 7807 (Problem Details for HTTP APIs) with explicit machine-readable codes (`VALIDATION_ERROR`, `AUTHENTICATION_ERROR`, `INSUFFICIENT_CREDITS`, etc.).
- **Validation**: Schema-level request and response validation via **Zod**.

### 3.2 Real-time Collaboration Engine (`src/modules/collaboration/`)
- Handles multi-device project editing over persistent WebSockets (`/ws/v1/collaboration/:projectId`).
- Tracks live collaborator presence, viewport cursor coordinates, and timeline playhead scrubbing.
- Features **Track Locking** to avoid collision during multi-user clip slicing, trimming, or reordering.

### 3.3 AI Service Abstraction (`src/modules/ai/`)
- Unified interface `IAIProvider` decouples domain logic from AI vendors.
- Built-in adapters:
  1. `MockAIProvider`: Zero-cost, instantaneous responses for testing, offline development, and CI/CD pipelines.
  2. `OpenAIProvider`: Whisper speech-to-text with word-level timestamps and GPT-4o vision analysis.
  3. `GeminiProvider`: Google Gemini 1.5/2.0 Flash for high-speed multimodal video and audio comprehension.
- **Credit Integration**: Enforces atomic credit pre-authorization before dispatching expensive GPU/AI jobs, with automated refund guarantees on processing errors.

### 3.4 Storage Service (`src/services/storage/`)
- Standardized S3-compatible interface (`IStorageService`).
- Compatible with AWS S3, Cloudflare R2, and self-hosted MinIO.
- Direct Client Uploads: Clients request presigned `PUT` URLs to upload multi-gigabyte video files straight to object storage, bypassing API server memory bottlenecks.

### 3.5 Worker Service (`src/worker.ts`)
- Decoupled background service processing compute-intensive tasks without blocking API responsiveness.
- Supports concurrency tuning via `WORKER_CONCURRENCY`.
- Multi-stage rendering pipeline reporting granular progress (`0% -> 100%`) back to the client.

---

## 4. Database Schema Overview

| Table | Purpose |
|---|---|
| `users` | User credentials, roles (`user`, `pro`, `admin`), profile details |
| `refresh_tokens` | Track active refresh tokens and revocation state |
| `subscriptions` | Active tier (`free`, `pro`, `studio`), renewal dates, Stripe binding |
| `credit_wallets` | Real-time AI and export credit balances |
| `credit_transactions` | Immutable double-entry ledger of debits, grants, and refunds |
| `projects` | Video project definitions and JSON timeline track hierarchies |
| `project_collaborators` | Access control lists for shared projects |
| `media_assets` | Catalog of footage, audio, stills, and transcoded proxies |
| `jobs` | Background task tracking, status, progress, and output keys |
