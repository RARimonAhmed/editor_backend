# `my_editor` Deployment & Operations Guide

## 1. Prerequisites
- **Node.js**: v20.x or v22.x LTS (tested on Node v24)
- **PostgreSQL**: v15 or v16
- **Redis**: v7.x
- **Object Storage**: S3-compliant store (AWS S3, MinIO, Cloudflare R2)
- **FFmpeg**: v6.x or newer (for media workers)
- **Docker & Docker Compose**: Recommended for containerized deployments

---

## 2. Local Development

### Running with Local Node.js
1. Clone repository and navigate to backend:
   ```bash
   cd backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy environment configuration:
   ```bash
   cp .env.example .env
   ```
4. Run static typecheck and test suite:
   ```bash
   npm run typecheck
   npm run test
   ```
5. Start API server in watch mode:
   ```bash
   npm run dev
   ```
6. Start background media worker in watch mode:
   ```bash
   npm run dev:worker
   ```

### Running Infrastructure via Docker
To spin up local PostgreSQL, Redis, and MinIO instances:
```bash
docker compose -f docker/docker-compose.dev.yml up -d
```
MinIO console is accessible at `http://localhost:9001` (User: `minioadmin`, Pass: `minioadmin`).

---

## 3. Production Deployment with Docker Compose

To deploy the entire production stack (PostgreSQL, Redis, MinIO, API Service, and Worker):
1. Configure production environment variables in `.env`.
2. Build and launch containers:
   ```bash
   docker compose -f docker/docker-compose.yml up -d --build
   ```
3. Check container statuses:
   ```bash
   docker compose -f docker/docker-compose.yml ps
   ```
4. View live logs:
   ```bash
   docker compose -f docker/docker-compose.yml logs -f api
   ```

---

## 4. Horizontal Scaling Strategy

### API Gateway Scaling
- The Fastify API service is **stateless**.
- Multiple API replicas can be deployed behind an ingress load balancer (NGINX, Traefik, AWS ALB).
- WebSocket sessions require sticky sessions / session affinity at the load balancer or a shared Redis pub/sub backplane for multi-instance broadcast.

### Worker Service Scaling
- Worker instances can be scaled horizontally according to queue depth:
  ```bash
  docker compose -f docker/docker-compose.yml up -d --scale worker=3
  ```
- Workers pull jobs independently from the Redis queue.
- Worker containers should have access to high-performance GPU or CPU resources with FFmpeg acceleration.

---

## 5. Security Checklist
- [x] Never commit real secrets or `.env` files to git.
- [x] Configure strong, random keys for `JWT_SECRET` and `JWT_REFRESH_SECRET` (minimum 32 characters).
- [x] Set restrictive CORS origins in production instead of `*`.
- [x] Enforce rate limiting (`RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW_MS`).
- [x] Run Docker containers as unprivileged non-root user (`node`).
