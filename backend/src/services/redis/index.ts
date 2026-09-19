import { Redis } from 'ioredis';
import { env } from '../../config/env.js';
import { logger } from '../../core/logger.js';

export interface IRedisService {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
  publish(channel: string, message: string): Promise<number>;
  isHealthy(): Promise<boolean>;
  close(): Promise<void>;
}

class MemoryRedisService implements IRedisService {
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

  async close(): Promise<void> {
    this.store.clear();
  }
}

class RealRedisService implements IRedisService {
  private client: Redis;

  constructor() {
    this.client = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 2,
      retryStrategy: (times) => {
        if (times > 3) return null; // stop retrying
        return Math.min(times * 200, 1000);
      },
    });

    this.client.on('error', (err) => {
      logger.error({ err }, 'Redis connection error');
    });
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
    try {
      const pong = await this.client.ping();
      return pong === 'PONG';
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    await this.client.quit();
  }
}

export function createRedisService(): IRedisService {
  if (env.NODE_ENV === 'test' || env.REDIS_ENABLE_FALLBACK) {
    // In test or local dev without live Redis, safely use in-memory adapter
    return new MemoryRedisService();
  }

  try {
    return new RealRedisService();
  } catch (error) {
    logger.warn('Failed to initialize live Redis, using in-memory fallback');
    return new MemoryRedisService();
  }
}

export const redisService = createRedisService();
