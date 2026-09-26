import dotenv from 'dotenv';
import { z } from 'zod';

// Load .env file if present
dotenv.config();

const envSchema = z
  .object({
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

    // Database (PostgreSQL)
    DATABASE_URL: z.string().default('postgresql://postgres:postgres@localhost:5432/my_editor_db'),
    DATABASE_POOL_MIN: z.coerce.number().int().nonnegative().default(2),
    DATABASE_POOL_MAX: z.coerce.number().int().positive().default(20),
    DATABASE_POOL_IDLE_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
    DATABASE_POOL_CONN_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
    DATABASE_STATEMENT_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
    DATABASE_SSL: z.coerce.boolean().default(false),
    DATABASE_SSL_REJECT_UNAUTHORIZED: z.coerce.boolean().default(true),
    DATABASE_SSL_CA: z.string().optional(),

    // Redis
    REDIS_URL: z.string().default('redis://localhost:6379'),
    REDIS_ENABLE_FALLBACK: z.coerce.boolean().default(false),
    REDIS_TLS: z.coerce.boolean().default(false),
    REDIS_CONNECT_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
    REDIS_MAX_RETRIES: z.coerce.number().int().positive().default(5),

    // Storage
    STORAGE_DRIVER: z.enum(['s3', 'mock']).default('s3'),
    STORAGE_ENDPOINT: z.string().optional().default('http://localhost:9000'),
    STORAGE_REGION: z.string().default('us-east-1'),
    STORAGE_BUCKET: z.string().default('my-editor-assets'),
    STORAGE_ACCESS_KEY: z.string().default('minioadmin'),
    STORAGE_SECRET_KEY: z.string().default('minioadmin'),
    STORAGE_FORCE_PATH_STYLE: z.coerce.boolean().default(true),
    STORAGE_PUBLIC_URL_PREFIX: z.string().default('http://localhost:9000/my-editor-assets'),
    STORAGE_TEMP_PREFIX: z.string().default('temp/'),
    STORAGE_FINAL_PREFIX: z.string().default('projects/'),
    STORAGE_MAX_UPLOAD_SIZE_BYTES: z.coerce.number().int().positive().default(5368709120), // 5GB max upload

    // Development & Fallback Flags
    ALLOW_DEV_FALLBACKS: z.coerce.boolean().default(false),

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
  })
  .superRefine((data, ctx) => {
    // STRICT PRODUCTION CONTROLS
    if (data.NODE_ENV === 'production') {
      if (data.ALLOW_DEV_FALLBACKS) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['ALLOW_DEV_FALLBACKS'],
          message: 'FATAL: ALLOW_DEV_FALLBACKS is strictly forbidden in production mode.',
        });
      }

      if (data.REDIS_ENABLE_FALLBACK) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['REDIS_ENABLE_FALLBACK'],
          message: 'FATAL: REDIS_ENABLE_FALLBACK cannot be enabled in production. Real Redis is required.',
        });
      }

      if (data.STORAGE_DRIVER === 'mock') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['STORAGE_DRIVER'],
          message: 'FATAL: STORAGE_DRIVER cannot be set to "mock" in production. S3-compatible storage is required.',
        });
      }

      if (data.JWT_SECRET.includes('development') || data.JWT_SECRET.length < 32) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['JWT_SECRET'],
          message: 'FATAL: JWT_SECRET must be at least 32 characters and cannot use default dev secret in production.',
        });
      }

      if (data.JWT_REFRESH_SECRET.includes('development') || data.JWT_REFRESH_SECRET.length < 32) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['JWT_REFRESH_SECRET'],
          message: 'FATAL: JWT_REFRESH_SECRET must be at least 32 characters and cannot use default dev secret in production.',
        });
      }

      if (data.STORAGE_DRIVER === 's3' && (data.STORAGE_ACCESS_KEY === 'minioadmin' || data.STORAGE_SECRET_KEY === 'minioadmin')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['STORAGE_ACCESS_KEY'],
          message: 'FATAL: Default minioadmin credentials are not allowed in production mode.',
        });
      }
    }
  });

export type EnvConfig = z.infer<typeof envSchema>;

export function loadEnvConfig(customEnv?: Record<string, string | undefined>): EnvConfig {
  const parsed = envSchema.safeParse(customEnv || process.env);
  if (!parsed.success) {
    console.error('❌ Configuration validation failed:', JSON.stringify(parsed.error.format(), null, 2));
    throw new Error('Environment configuration validation failed');
  }
  return parsed.data;
}

export const env = loadEnvConfig();

