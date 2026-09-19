import dotenv from 'dotenv';
import { z } from 'zod';

// Load .env file if present
dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  HOST: z.string().default('0.0.0.0'),
  API_PREFIX: z.string().default('/api/v1'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // Auth & Security
  JWT_SECRET: z.string().min(16).default('development-jwt-secret-key-replace-in-production'),
  JWT_REFRESH_SECRET: z.string().min(16).default('development-jwt-refresh-secret-key-replace-in-production'),
  JWT_EXPIRES_IN: z.string().default('1h'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),
  CORS_ORIGINS: z.string().default('*'),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),

  // Database
  DATABASE_URL: z.string().default('postgresql://postgres:postgres@localhost:5432/my_editor_db'),
  DATABASE_POOL_MIN: z.coerce.number().int().nonnegative().default(2),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(20),
  DATABASE_SSL: z.coerce.boolean().default(false),

  // Redis
  REDIS_URL: z.string().default('redis://localhost:6379'),
  REDIS_ENABLE_FALLBACK: z.coerce.boolean().default(true),

  // Storage
  STORAGE_DRIVER: z.enum(['s3', 'mock']).default('mock'),
  STORAGE_ENDPOINT: z.string().default('http://localhost:9000'),
  STORAGE_REGION: z.string().default('us-east-1'),
  STORAGE_BUCKET: z.string().default('my-editor-assets'),
  STORAGE_ACCESS_KEY: z.string().default('minioadmin'),
  STORAGE_SECRET_KEY: z.string().default('minioadmin'),
  STORAGE_FORCE_PATH_STYLE: z.coerce.boolean().default(true),
  STORAGE_PUBLIC_URL_PREFIX: z.string().default('http://localhost:9000/my-editor-assets'),

  // AI Providers
  AI_DEFAULT_PROVIDER: z.enum(['mock', 'openai', 'gemini']).default('mock'),
  OPENAI_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),

  // Worker
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(5),
  WORKER_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(3000),
  FFMPEG_PATH: z.string().default('/usr/bin/ffmpeg'),
  FFPROBE_PATH: z.string().default('/usr/bin/ffprobe'),

  // Webhooks
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  INTERNAL_WEBHOOK_SECRET: z.string().default('internal_worker_secret_key_for_callbacks'),
});

export type EnvConfig = z.infer<typeof envSchema>;

function loadEnvConfig(): EnvConfig {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('❌ Invalid environment variables:', JSON.stringify(parsed.error.format(), null, 2));
    throw new Error('Environment configuration validation failed');
  }
  return parsed.data;
}

export const env = loadEnvConfig();
