# Production Infrastructure Architecture & Hardening Guide

This document specifies the real production infrastructure setup, fail-safe mechanisms, health verification, and operational guidelines for the **my_editor** backend service.

---

## 1. Architectural Philosophy: Fail-Fast vs. Dev Fallbacks

In development and local test environments (`NODE_ENV === 'development'` or `NODE_ENV === 'test'`), the platform may operate with in-memory SQLite emulation, local mock storage, and memory-backed job queues when `ALLOW_DEV_FALLBACKS=true`.

**In Production (`NODE_ENV === 'production'`)**:
- Development fallbacks are **strictly forbidden**.
- The backend will **FAIL FAST at bootstrap** if:
  1. `STORAGE_DRIVER` is configured to `mock` or missing real S3 credentials.
  2. `REDIS_ENABLE_FALLBACK` is `true`.
  3. `ALLOW_DEV_FALLBACKS` is `true`.
  4. Default credentials (such as MinIO default `minioadmin`, or default JWT secret placeholders) are detected.
  5. The PostgreSQL database is unreachable or has unapplied migrations.
  6. Real Redis broker is unreachable.

---

## 2. PostgreSQL Production Specification

### 2.1 Connection Pooling
- **Driver**: `pg` (node-postgres) Connection Pool.
- **Minimum Pool Size (`DATABASE_POOL_MIN`)**: Defaults to `5`. Keeps warm connections ready to serve immediate requests without handshake latency.
- **Maximum Pool Size (`DATABASE_POOL_MAX`)**: Defaults to `25` connections per backend process. Scaled according to available database instance connection limits ($N \times \text{backends} < \text{max\_connections}$).
- **Connection Acquisition Timeout (`DATABASE_POOL_CONN_TIMEOUT_MS`)**: `10,000 ms` (10 seconds). Fast rejection prevents thread starvation under high load.
- **Idle Timeout (`DATABASE_POOL_IDLE_TIMEOUT_MS`)**: `30,000 ms` (30 seconds). Unused connections beyond the minimum are closed to conserve server resources.
- **Statement Timeout (`DATABASE_STATEMENT_TIMEOUT_MS`)**: `30,000 ms` (30 seconds). Prevents rogue or runaway queries from locking tables or exhausting worker threads.

### 2.2 Security & SSL/TLS
- **Enforcement**: In production, `DATABASE_SSL=true` is recommended.
- **CA Verification (`DATABASE_SSL_REJECT_UNAUTHORIZED`)**: Set to `true` by default. Protects against man-in-the-middle attacks.
- **Custom Certificate Authority (`DATABASE_SSL_CA`)**: Supports PEM/base64 encoded CA bundles for AWS RDS, Google Cloud SQL, or Azure Database for PostgreSQL.

### 2.3 Migration Verification & Schema Validation
- On application boot in production, the service queries `schema_migrations` to verify that all migration scripts up to the latest revision have executed successfully.
- If pending migrations exist, the server halts startup with exit code `1` and descriptive logs, preventing runtime schema discrepancies.

### 2.4 Truthful Health & Metrics
- The `getHealthDetails()` method executes `SELECT 1` on the pool and records response latency in milliseconds.
- Reports active connection statistics:
  - `totalCount`: Total open connections in the pool.
  - `idleCount`: Idle connections ready to serve requests.
  - `waitingCount`: Requests currently queued waiting for an available connection.
  - `migrationsVerified`: Boolean indicating schema integrity.

### 2.5 Graceful Shutdown
- On `SIGTERM` / `SIGINT`, the backend stops accepting new queries and executes `db.close()`, which drains and releases all pool connections gracefully without aborting in-flight transactions.

---

## 3. Redis & BullMQ Queue Production Specification

### 3.1 Connection & Cluster Readiness
- **Client**: `ioredis` configured with BullMQ production requirements:
  - `maxRetriesPerRequest: null` (Mandatory for BullMQ blocking queue commands like `BRPOPLPUSH`).
  - `enableReadyCheck: true`.
  - `connectTimeout: 10000` (10 seconds).
  - `keepAlive: 30000` (TCP keepalive).
- **TLS/SSL Encryption**: Enabled via `REDIS_TLS=true` or by using the `rediss://` protocol prefix for secure transit encryption.

### 3.2 Exponential Retry Strategy with Jitter
- Reconnection attempts employ truncated exponential backoff with randomized jitter to prevent connection storms (thundering herd):
  $$\text{delay} = \min(100 \times 2^{\text{retries}}, 5000) + \text{random}(0, 500)$$
- Caps out at `REDIS_MAX_RETRIES` (default `10`) before marking the service degraded.

### 3.3 Truthful Health Check
- Executes an active `PING` against the Redis cluster and measures round-trip latency (`latencyMs`).
- Reports client status (`ready`, `connecting`, `reconnecting`, `close`, or `end`).

### 3.4 Graceful Queue Termination
- `jobQueue.close()` halts all active workers, finishes in-flight steps where feasible, and closes the BullMQ scheduler and queue instances before dropping the underlying Redis TCP sockets.

---

## 4. Object Storage (S3 / MinIO / Cloudflare R2)

### 4.1 Bucket & Region Configuration
- **Client**: AWS SDK for JavaScript v3 (`@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`).
- **Endpoint**: Configurable for native AWS S3 (`https://s3.<region>.amazonaws.com`), Cloudflare R2 (`https://<account_id>.r2.cloudflarestorage.com`), Google Cloud Storage, or MinIO.
- **Path Style**: `STORAGE_FORCE_PATH_STYLE=false` for standard DNS bucket routing; set `true` for MinIO or local test gateways.

### 4.2 Two-Stage Staging: Temp vs. Final Storage
1. **Direct Presigned Client Upload**:
   - Client requests presigned PUT URL for a temporary staging key: `temp/uploads/{userId}/{timestamp}_{nonce}_{filename}`.
   - Enforces `ContentType` validation and optional `ChecksumSHA256` integrity validation during URL generation.
2. **Atomic Finalization (`finalizeUpload`)**:
   - When the client confirms upload, the backend performs a `HeadObject` check to verify the file exists and its content length does not exceed `STORAGE_MAX_UPLOAD_SIZE_BYTES` (default 5GB).
   - Issues an atomic server-side `CopyObjectCommand` to destination: `projects/{userId}/{assetType}/{timestamp}_{nonce}_{filename}`.
   - Issues a `DeleteObjectCommand` on the temporary staging key.
   - Guarantees zero partially uploaded files pollute permanent project storage.

### 4.3 Stale Temporary Object Cleanup & Expired Multipart Aborts
- `cleanupTempObjects(olderThanHours = 24)`: Scans the `temp/uploads` prefix and batch-deletes abandoned uploads older than 24 hours.
- `abortExpiredMultipartUploads(olderThanHours = 24)`: Scans uncompleted multipart upload sessions initiated over 24 hours ago and calls `AbortMultipartUploadCommand` to recover orphaned storage bytes.

### 4.4 Allowed Content-Types & Size Enforcement
- Enforces strict MIME type whitelist across:
  - Video: `video/mp4`, `video/quicktime`, `video/x-matroska`, `video/webm`, `video/x-msvideo`, `video/mpeg`.
  - Audio: `audio/mpeg`, `audio/wav`, `audio/aac`, `audio/ogg`, `audio/flac`, `audio/mp4`, `audio/m4a`.
  - Images: `image/jpeg`, `image/png`, `image/webp`, `image/gif`, `image/svg+xml`.
  - Subtitles/Project data: `application/json`, `text/vtt`, `application/x-subrip`.
- Rejects any unauthorized MIME types or payload sizes exceeding `STORAGE_MAX_UPLOAD_SIZE_BYTES`.

---

## 5. Health & Readiness Diagnostics (`/health` & `/ready`)

Both endpoints report **truthful, real-time status** of all 5 core subsystems:
1. `application` (Process uptime, PID, memory usage RSS/heap).
2. `database` (PostgreSQL ping latency, pool counts, migration check).
3. `redis` (Redis ping latency, client status).
4. `storage` (S3 bucket connectivity via `HeadBucketCommand`, response latency).
5. `queue` (Active queue workers and job queue health).

- **Liveness (`/health`)**: Returns HTTP 200 when healthy, or HTTP 503 if any core component has degraded or disconnected.
- **Readiness (`/ready`)**: Evaluated by Kubernetes/container orchestrators. If any required dependency fails, returns HTTP 503 so traffic is immediately routed away from the failing replica.

---

## 6. Production Security Checklist

- [ ] `NODE_ENV=production` is set.
- [ ] `ALLOW_DEV_FALLBACKS=false` is set.
- [ ] `STORAGE_DRIVER=s3` with production bucket and IAM credentials configured.
- [ ] `REDIS_ENABLE_FALLBACK=false` is set.
- [ ] `DATABASE_SSL=true` and `DATABASE_SSL_REJECT_UNAUTHORIZED=true` configured.
- [ ] `JWT_SECRET` and `JWT_REFRESH_SECRET` are generated using cryptographically secure random 64-character tokens.
- [ ] Database credentials, Redis passwords, S3 secret keys, and Stripe keys are injected via secure secret managers (e.g. AWS Secrets Manager, Vault, Kubernetes Secrets) and NEVER committed to Git.
