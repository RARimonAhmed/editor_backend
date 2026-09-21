# my_editor Enterprise Web Admin Dashboard & Control Panel

A production-grade, authenticated Web Administration Console for the **my_editor** cloud video creation SaaS platform, architected for high-concurrency cloud operations comparable to Adobe Creative Cloud, Google Cloud Platform, and Stripe.

---

## 1. Architectural Overview

The Admin Dashboard provides unified operational visibility, RBAC user management, cloud storage asset inspection, multi-modal AI cost tracking, and real-time infrastructure health monitoring.

```
┌─────────────────────────────────────────────────────────────┐
│                 my_editor Admin Dashboard                   │
│            React 18 + TypeScript + Vite 5                   │
│      (Located in /admin, served statically at /admin/)       │
└──────────────────────────────┬──────────────────────────────┘
                               │
            REST API & JWT / x-admin-key Headers
                               │
┌──────────────────────────────▼──────────────────────────────┐
│                    Fastify Backend (:4000)                  │
│  - @fastify/static: Serves SPA bundle at /admin/            │
│  - SPA Fallback: Rewrites /admin/* requests to index.html   │
│  - Admin Routes: /v1/admin/* (Protected by requireAdmin)    │
└──────────────┬──────────────────────────────┬───────────────┘
               │                              │
    ┌──────────▼──────────┐        ┌──────────▼──────────┐
    │   PostgreSQL / DB   │        │ Redis 7 / BullMQ 5  │
    │ (Users, Balances,   │        │ (Distributed Jobs,  │
    │   Audit Trail)      │        │  Progress Events)   │
    └─────────────────────┘        └─────────────────────┘
```

---

## 2. Default Administrative Credentials

For initial setup and local development, the platform automatically provisions a default Super Administrator account and supports a Master Security API Key:

| Authentication Method | Identifier | Secret / Password | Role |
| :--- | :--- | :--- | :--- |
| **Email & Password** | `admin@techxayan.com` | `Admin123!` | `SUPERADMIN` |
| **Master Security Key** | Header `x-admin-key` | `adm_super_secret_production_key_32bytes` | `SUPERADMIN` |

> [!NOTE]
> The Master Security Key can be customized in production by setting the `ADMIN_API_KEY` environment variable.

---

## 3. Dedicated Modules & Navigation Routes

The Admin Console implements 14 authenticated routes grouped into 4 functional domains:

### Domain A: Platform Core
1. **Executive Overview (`#/dashboard`)**:
   - 8 Real-Time KPI Stat Cards: Platform Users, Active Projects, Media Assets, Cloud Storage (MB/GB), AI Inference Executions, Video Render Exports, Credits Consumed, Active Subscriptions.
   - Interactive SVG Telemetry Charts: User growth velocity, AI processing volume, render exports, and storage utilization.
   - Live platform event stream.
2. **Users & RBAC (`#/users`)**:
   - Paginated customer directory with search by name, email, or role.
   - Dynamic Role Assignment modal (`user`, `pro`, `admin`, `superadmin`).
   - Account Status controls (`active`, `suspended`, `pending_verification`).
   - Quick bonus credit grants directly from user rows.
3. **Projects & Timelines (`#/projects`)**:
   - Canvas resolution (e.g. 1920x1080, 4K), frame rate (FPS), duration, and tracks count.
   - Timeline inspector modal with ownership and metadata verification.
4. **Media Asset Catalog (`#/media`)**:
   - Ingested files processed via FFprobe/FFmpeg.
   - Multi-category classification: Video, Audio, Image, Other.
   - Exact byte sizes, durations, dimensions, and transcoding pipeline status (`ready`, `processing`, `failed`).

### Domain B: Processing Engine
5. **Unified Background Jobs (`#/jobs`)**:
   - BullMQ distributed task engine monitor across all queues: `media_processing`, `render_export`, `ai_transcribe`, `ai_job`.
   - Live progress bars (0-100%), retry counts, and dead-letter job tracking.
   - Full JSON payload and execution output result inspector.
6. **Multi-Modal AI Gateway (`#/ai`)**:
   - Google Gemini Pro/Flash & OpenAI GPT-4o execution logs.
   - Capabilities: `text_generation`, `structured_json`, `vision_analysis`, `speech_to_text`.
   - Token accounting (prompt tokens, completion tokens) and real-time USD cost estimations.
7. **Render & Export Queue (`#/render`)**:
   - Video timeline compositing and FFmpeg rendering queue.
   - Codec, target resolution, format (MP4, WebM, ProRes), and export artifact links.

### Domain C: Monetization & Social
8. **Credits & Wallets (`#/credits`)**:
   - User wallet balance ledger with real-time balance tracking.
   - Immutable transaction audits (debits for AI/render usage, credits for subscriptions/grants).
   - "Grant Credits" administrative modal with audit reasoning.
9. **Subscriptions & Revenue (`#/subscriptions`)**:
   - Tiered plans: Starter ($0/mo), Creator Pro ($19/mo), Studio Enterprise ($49/mo).
   - Active subscriber list, billing period renewal dates, auto-renewal flags.
10. **Timeline Collaboration Comments (`#/comments`)**:
    - Multi-user video review annotations.
    - Timecode offsets (`MM:SS:FF`), target track references, author profiles, and resolution status.

### Domain D: Infrastructure & Security
11. **Security Audit Trail (`#/audit-logs`)**:
    - Immutable tamper-evident audit ledger recording all privileged events: `USER_ROLE_UPDATED`, `CREDITS_GRANTED`, `ADMIN_API_KEY_LOGIN`, `JOB_RETRIED`.
    - Actor ID, Target ID, timestamp, and JSON metadata inspector.
12. **Live System Health Probes (`#/system`)**:
    - Real-time latency and status probes (`HEALTHY`, `DEGRADED`, `DOWN`) across 7 microservices:
      - `api`: Fastify HTTP & WebSocket Gateway
      - `postgresql`: Relational database pool
      - `redis`: In-memory cache & Pub/Sub
      - `bullmq`: Distributed job queue
      - `storage`: S3/MinIO Object Storage driver
      - `workers`: Background FFmpeg & transcoding workers
      - `ai_providers`: Gemini & OpenAI adapter configurations
    - Node.js runtime process metrics: Heap used, Heap total, RSS memory, Uptime.
    - "Run Probes Now" interactive trigger.
13. **Architecture & Settings (`#/settings`)**:
    - Environment variables summary, CORS rules, DDoS rate limiting thresholds, storage driver parameters.

---

## 4. API Specification

All Admin API endpoints are prefixed under `/v1/admin/*` and require administrative credentials:

| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| `POST` | `/v1/admin/login` | Authenticate with credentials or master API key | No |
| `GET` | `/v1/admin/stats` | Executive telemetry overview and recent events | Yes (`ADMIN`+) |
| `GET` | `/v1/admin/charts` | 7 time-series telemetry datasets for charts | Yes (`ADMIN`+) |
| `GET` | `/v1/admin/health` | Live microservice health probes and memory usage | Yes (`ADMIN`+) |
| `GET` | `/v1/admin/users` | List platform users with balances & filters | Yes (`ADMIN`+) |
| `PATCH` | `/v1/admin/users/:id/role` | Update user role and status (with audit entry) | Yes (`ADMIN`+) |
| `POST` | `/v1/admin/users/:id/credits/grant` | Grant bonus credits to user (with audit entry) | Yes (`ADMIN`+) |
| `GET` | `/v1/admin/projects` | List projects with canvas dimensions and tracks | Yes (`ADMIN`+) |
| `GET` | `/v1/admin/media` | List ingested media catalog | Yes (`ADMIN`+) |
| `GET` | `/v1/admin/jobs` | List unified BullMQ background jobs | Yes (`ADMIN`+) |
| `GET` | `/v1/admin/ai/jobs` | List multi-modal AI executions and token costs | Yes (`ADMIN`+) |
| `GET` | `/v1/admin/subscriptions` | List customer subscription tiers and renewal dates | Yes (`ADMIN`+) |
| `GET` | `/v1/admin/comments` | List video timeline review annotations | Yes (`ADMIN`+) |
| `GET` | `/v1/admin/audit-logs` | Retrieve security and administrative audit log | Yes (`ADMIN`+) |

---

## 5. Development & Build Commands

From the workspace root (`d:\Tech\editor_backend`):

```bash
# 1. Build Admin Web Application
npm run build:admin

# 2. Run Admin Web Application in Vite Dev Server (Hot Module Reloading)
npm run dev:admin

# 3. Build Both Admin and Backend
npm run build:all

# 4. Run Backend Server (Automatically serves Admin at http://localhost:4000/admin/)
npm run dev

# 5. Run Admin Operational Automated Tests
npm --prefix backend test tests/admin-operational.test.ts
```
