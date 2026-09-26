import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { db, PostgresDatabaseClient } from '../src/database/client.js';
import { redisService, RealRedisService, createRedisService } from '../src/services/redis/index.js';
import { storageService, S3StorageService, MockStorageService, createStorageService } from '../src/services/storage/index.js';
import { jobQueue } from '../src/services/queue/index.js';
import { env } from '../src/config/env.js';

describe('DAY 5 COMMAND 21: Real Production Infrastructure (PostgreSQL + Redis + Storage)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('1. Production Fail-Fast & Safety Enforcement', () => {
    it('prevents mock storage in production environment', () => {
      const origEnv = process.env.NODE_ENV;
      const origDriver = process.env.STORAGE_DRIVER;
      try {
        // Temporarily mutate env to simulate production configuration error
        (env as any).NODE_ENV = 'production';
        (env as any).STORAGE_DRIVER = 'mock';

        expect(() => createStorageService()).toThrow(
          /Production mode requires real object storage/
        );
      } finally {
        (env as any).NODE_ENV = origEnv;
        (env as any).STORAGE_DRIVER = origDriver;
      }
    });

    it('prevents fallback Redis in production environment when misconfigured', () => {
      const origEnv = process.env.NODE_ENV;
      const origFallback = process.env.REDIS_ENABLE_FALLBACK;
      try {
        (env as any).NODE_ENV = 'production';
        (env as any).REDIS_ENABLE_FALLBACK = true;

        expect(() => createRedisService()).toThrow(
          /Production mode prohibits REDIS_ENABLE_FALLBACK/
        );
      } finally {
        (env as any).NODE_ENV = origEnv;
        (env as any).REDIS_ENABLE_FALLBACK = origFallback;
      }
    });
  });

  describe('2. PostgreSQL Production Pool & Migration Verification', () => {
    it('provides truthful database health check with latency and pool statistics', async () => {
      const health = await db.getHealthDetails();
      expect(health).toBeDefined();
      expect(health.healthy).toBe(true);
      expect(typeof health.latencyMs).toBe('number');
      expect(health.latencyMs).toBeGreaterThanOrEqual(0);
      expect(health.pool).toBeDefined();
      expect(typeof health.pool.totalCount).toBe('number');
      expect(typeof health.pool.idleCount).toBe('number');
      expect(typeof health.pool.waitingCount).toBe('number');
    });

    it('executes database query and validates connection stability', async () => {
      const res = await db.query('SELECT 1 as alive');
      expect(res.rows).toBeDefined();
      expect(res.rows[0].alive).toBe(1);
    });

    it('verifies migration integrity via verifyMigrations', async () => {
      const verification = await db.verifyMigrations();
      expect(verification).toBeDefined();
      expect(typeof verification.verified).toBe('boolean');
      expect(typeof verification.appliedCount).toBe('number');
      expect(Array.isArray(verification.pending)).toBe(true);
    });
  });

  describe('3. Redis Production Connectivity & BullMQ Compatibility', () => {
    it('provides truthful Redis health check with ping latency', async () => {
      const health = await redisService.getHealthDetails();
      expect(health).toBeDefined();
      expect(health.healthy).toBe(true);
      expect(typeof health.latencyMs).toBe('number');
      expect(health.latencyMs).toBeGreaterThanOrEqual(0);
      expect(health.clientStatus).toBeDefined();
    });

    it('performs real/mock set and get operations with TTL', async () => {
      const testKey = `test:infra:${Date.now()}`;
      await redisService.set(testKey, { test: 'infra_ok' }, 60);

      const val = await redisService.get<{ test: string }>(testKey);
      expect(val).toEqual({ test: 'infra_ok' });

      await redisService.del(testKey);
      const afterDel = await redisService.get(testKey);
      expect(afterDel).toBeNull();
    });

    it('verifies BullMQ queue health report', async () => {
      const qHealth = await jobQueue.getHealthDetails();
      expect(qHealth).toBeDefined();
      expect(qHealth.healthy).toBe(true);
      expect(typeof qHealth.activeWorkers).toBe('number');
      expect(typeof qHealth.totalQueues).toBe('number');
    });
  });

  describe('4. Storage Service: Content Validation, Two-Stage Staging & Finalization', () => {
    it('validates allowed MIME types for video editing platform', () => {
      expect(storageService.validateContentType('video/mp4')).toBe(true);
      expect(storageService.validateContentType('video/quicktime')).toBe(true);
      expect(storageService.validateContentType('audio/mpeg')).toBe(true);
      expect(storageService.validateContentType('image/png')).toBe(true);
      expect(storageService.validateContentType('application/json')).toBe(true);

      // Rejects dangerous or disallowed MIME types
      expect(storageService.validateContentType('application/x-msdownload')).toBe(false);
      expect(storageService.validateContentType('application/x-sh')).toBe(false);
      expect(storageService.validateContentType('application/x-bat')).toBe(false);
    });

    it('validates maximum object size constraints', () => {
      expect(storageService.validateObjectSize(1024)).toBe(true);
      expect(storageService.validateObjectSize(100 * 1024 * 1024)).toBe(true);
      // Exceeds max upload limit (e.g. 10GB when limit is 5GB)
      expect(storageService.validateObjectSize(env.STORAGE_MAX_UPLOAD_SIZE_BYTES + 1)).toBe(false);
      expect(storageService.validateObjectSize(0)).toBe(false);
    });

    it('generates partitioned keys for temp staging vs final project storage', () => {
      const tempKey = storageService.getTempKey('user_123', 'raw_footage.mp4');
      expect(tempKey).toContain('user_123');
      expect(tempKey).toContain('raw_footage.mp4');
      expect(tempKey.startsWith(env.STORAGE_TEMP_PREFIX) || tempKey.includes('temp')).toBe(true);

      const finalKey = storageService.getFinalKey('user_123', 'videos', 'final_cut.mp4');
      expect(finalKey).toContain('user_123');
      expect(finalKey).toContain('videos');
      expect(finalKey).toContain('final_cut.mp4');
      expect(finalKey.startsWith(env.STORAGE_FINAL_PREFIX) || finalKey.includes('projects')).toBe(true);
    });

    it('generates signed upload and download URLs', async () => {
      const key = storageService.getTempKey('test_user', 'clip.mp4');
      const upload = await storageService.getUploadPresignedUrl(key, 'video/mp4', undefined, 1800);
      expect(upload).toBeDefined();
      expect(upload.url).toContain(key);
      expect(upload.fileKey).toBe(key);
      expect(upload.expiresInSeconds).toBe(1800);

      const download = await storageService.getDownloadPresignedUrl(key, 3600, 'downloaded_clip.mp4');
      expect(download).toBeDefined();
      expect(download).toContain(key);
    });

    it('rejects presigned upload generation for forbidden content types', async () => {
      const key = storageService.getTempKey('test_user', 'malware.exe');
      await expect(
        storageService.getUploadPresignedUrl(key, 'application/x-msdownload')
      ).rejects.toThrow(/Invalid storage Content-Type/);
    });

    it('executes atomic upload finalization from temp staging to final destination', async () => {
      const tempKey = storageService.getTempKey('user_777', 'scene_take1.mp4');
      const finalKey = storageService.getFinalKey('user_777', 'footage', 'scene_take1.mp4');

      // Put object in temp staging
      const samplePayload = Buffer.from('TEST_VIDEO_FRAME_BYTES_ATOMIC_STAGE');
      await storageService.putObject(tempKey, samplePayload, 'video/mp4');

      // Verify temp object exists
      const tempHead = await storageService.headObject(tempKey);
      expect(tempHead).not.toBeNull();
      expect(tempHead?.contentLength).toBe(samplePayload.length);

      // Finalize upload atomically
      const finalResult = await storageService.finalizeUpload(tempKey, finalKey, 'video/mp4');
      expect(finalResult.finalKey).toBe(finalKey);
      expect(finalResult.contentLength).toBe(samplePayload.length);

      // Verify source temp object was purged
      const afterTempHead = await storageService.headObject(tempKey);
      expect(afterTempHead).toBeNull();

      // Verify final object exists and content matches
      const finalBytes = await storageService.getObject(finalKey);
      expect(finalBytes.toString()).toBe(samplePayload.toString());

      // Clean up final object
      await storageService.deleteObject(finalKey);
    });

    it('provides truthful storage health report', async () => {
      const health = await storageService.getHealthDetails();
      expect(health).toBeDefined();
      expect(health.healthy).toBe(true);
      expect(health.driver).toBeDefined();
      expect(health.bucket).toBe(env.STORAGE_BUCKET);
      expect(typeof health.latencyMs).toBe('number');
    });

    it('performs cleanup of expired temp objects without errors', async () => {
      const cleanup = await storageService.cleanupTempObjects(24);
      expect(cleanup).toBeDefined();
      expect(typeof cleanup.deletedCount).toBe('number');
      expect(Array.isArray(cleanup.errors)).toBe(true);
    });
  });

  describe('5. Truthful Health & Readiness Diagnostics Endpoints', () => {
    it('GET /health returns 200 with all 5 subsystems detailed', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.status).toBe('healthy');
      expect(body.data.uptimeSeconds).toBeGreaterThanOrEqual(0);

      // Components breakdown
      const { components } = body.data;
      expect(components).toBeDefined();

      // 1. Application
      expect(components.application).toBeDefined();
      expect(components.application.healthy).toBe(true);
      expect(components.application.version).toBe('1.0.0');
      expect(components.application.memoryUsageMb).toBeDefined();

      // 2. Database
      expect(components.database).toBeDefined();
      expect(components.database.healthy).toBe(true);
      expect(typeof components.database.latencyMs).toBe('number');

      // 3. Redis
      expect(components.redis).toBeDefined();
      expect(components.redis.healthy).toBe(true);
      expect(typeof components.redis.latencyMs).toBe('number');

      // 4. Storage
      expect(components.storage).toBeDefined();
      expect(components.storage.healthy).toBe(true);
      expect(components.storage.bucket).toBe(env.STORAGE_BUCKET);

      // 5. Queue
      expect(components.queue).toBeDefined();
      expect(components.queue.healthy).toBe(true);
    });

    it('GET /ready returns 200 with truthful readiness summary', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/ready',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.ready).toBe(true);

      expect(body.data.services).toBeDefined();
      expect(body.data.services.database).toBe('connected');
      expect(body.data.services.redis).toBe('connected');
      expect(body.data.services.storage).toBe('connected');
      expect(body.data.services.queue).toBe('ready');

      expect(body.data.details).toBeDefined();
      expect(body.data.details.database.healthy).toBe(true);
      expect(body.data.details.redis.healthy).toBe(true);
      expect(body.data.details.storage.healthy).toBe(true);
      expect(body.data.details.queue.healthy).toBe(true);
    });
  });
});
