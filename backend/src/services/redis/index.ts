import { Redis } from 'ioredis';
import { env } from '../../config/env.js';
import { logger } from '../../core/logger.js';

export interface RedisHealthResult {
  healthy: boolean;
  driver: 'redis' | 'memory';
  latencyMs?: number;
  status?: string;
  clientStatus?: string;
  error?: string;
}

export interface IRedisService {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
  publish(channel: string, message: string): Promise<number>;
  isHealthy(): Promise<boolean>;
  getHealthDetails(): Promise<RedisHealthResult>;
  getClient?(): Redis;
  close(): Promise<void>;
}

export class MemoryRedisService implements IRedisService {
  private store = new Map<string, { value: string; expiresAt?: number }>();

  async get(key: string): Promise<string | null> {
    const item = this.store.get(key);
    if (!item) return null;
    if (item.expiresAt && Date.now() > item.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return item.value;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined;
    this.store.set(key, { value, expiresAt });
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }

  async publish(channel: string, message: string): Promise<number> {
    logger.debug({ channel, message }, 'Memory Redis PubSub published message');
    return 1;
  }

  async isHealthy(): Promise<boolean> {
    return true;
  }

  async getHealthDetails(): Promise<RedisHealthResult> {
    return {
      healthy: true,
      driver: 'memory',
      latencyMs: 0,
      status: 'ready',
      clientStatus: 'ready',
    };
  }

  async close(): Promise<void> {
    this.store.clear();
  }
}

export class RealRedisService implements IRedisService {
  public client: Redis;

  constructor(customUrl?: string, customOptions?: Record<string, any>) {
    const targetUrl = customUrl || env.REDIS_URL;
    const isTls = env.REDIS_TLS || targetUrl.startsWith('rediss://');

    this.client = new Redis(targetUrl, {
      maxRetriesPerRequest: null, // Required by BullMQ & high-resilience producers
      connectTimeout: env.REDIS_CONNECT_TIMEOUT_MS,
      keepAlive: 10000,
      enableReadyCheck: true,
      tls: isTls ? {} : undefined,
      retryStrategy: (times) => {
        if (times > env.REDIS_MAX_RETRIES) {
          logger.error({ times }, 'Redis connection retry attempts exhausted');
          return null;
        }
        const delay = Math.min(times * 150 + Math.random() * 100, 3000);
        logger.warn({ times, delay }, 'Retrying Redis connection with exponential backoff');
        return delay;
      },
      reconnectOnError: (err) => {
        const targetError = 'READONLY';
        if (err.message.includes(targetError)) {
          return true; // Reconnect on read-only replica switchover
        }
        return false;
      },
      ...customOptions,
    });

    this.client.on('connect', () => {
      logger.info('Connected to Redis server');
    });

    this.client.on('ready', () => {
      logger.info('Redis client connection ready');
    });

    this.client.on('error', (err) => {
      logger.error({ err: err.message }, 'Redis connection error');
    });

    this.client.on('close', () => {
      logger.warn('Redis client connection closed');
    });
  }

  getClient(): Redis {
    return this.client;
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.client.set(key, value, 'EX', ttlSeconds);
    } else {
      await this.client.set(key, value);
    }
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async publish(channel: string, message: string): Promise<number> {
    return this.client.publish(channel, message);
  }

  async isHealthy(): Promise<boolean> {
    const details = await this.getHealthDetails();
    return details.healthy;
  }

  async getHealthDetails(): Promise<RedisHealthResult> {
    const start = Date.now();
    try {
      if (this.client.status !== 'ready' && this.client.status !== 'connect') {
        return {
          healthy: false,
          driver: 'redis',
          status: this.client.status,
          latencyMs: Date.now() - start,
          error: `Redis not ready (status: ${this.client.status})`,
        };
      }

      const pong = await this.client.ping();
      const latencyMs = Date.now() - start;
      const isAlive = pong === 'PONG';
      return {
        healthy: isAlive,
        driver: 'redis',
        latencyMs,
        status: this.client.status,
      };
    } catch (err) {
      return {
        healthy: false,
        driver: 'redis',
        latencyMs: Date.now() - start,
        status: this.client.status,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async close(): Promise<void> {
    try {
      await this.client.quit();
    } catch {
      this.client.disconnect();
    }
  }
}

export function createRedisService(): IRedisService {
  if (env.NODE_ENV === 'production') {
    if (env.REDIS_ENABLE_FALLBACK) {
      const msg = '[RedisService FATAL] Production mode prohibits REDIS_ENABLE_FALLBACK. Must use a real dedicated Redis instance.';
      logger.fatal(msg);
      throw new Error(msg);
    }
    try {
      logger.info('Initializing Production Redis Service');
      return new RealRedisService();
    } catch (error) {
      logger.fatal({ error }, 'FATAL: Failed to initialize production Redis client');
      throw new Error(`Production Redis initialization failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (env.NODE_ENV === 'test') {
    return new MemoryRedisService();
  }

  // Development mode:
  if (env.REDIS_ENABLE_FALLBACK || env.ALLOW_DEV_FALLBACKS) {
    try {
      return new RealRedisService();
    } catch (error) {
      logger.warn('Failed to initialize live Redis, using in-memory fallback because dev fallback is enabled');
      return new MemoryRedisService();
    }
  }

  return new RealRedisService();
}

export const redisService = createRedisService();
