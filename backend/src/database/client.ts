import pg from 'pg';
import { env } from '../config/env.js';
import { logger } from '../core/logger.js';

const { Pool } = pg;

export interface ITransactionClient {
  query<R extends pg.QueryResultRow = any>(text: string, params?: any[]): Promise<pg.QueryResult<R>>;
}

export interface DatabaseHealthResult {
  healthy: boolean;
  driver: 'postgresql' | 'memory';
  latencyMs?: number;
  pool?: {
    total?: number;
    idle?: number;
    waiting?: number;
    totalCount?: number;
    idleCount?: number;
    waitingCount?: number;
  };
  migrationsVerified?: boolean;
  error?: string;
}

export interface IDatabaseClient {
  query<R extends pg.QueryResultRow = any>(text: string, params?: any[]): Promise<pg.QueryResult<R>>;
  transaction<T>(callback: (client: ITransactionClient) => Promise<T>): Promise<T>;
  isHealthy(): Promise<boolean>;
  getHealthDetails(): Promise<DatabaseHealthResult>;
  verifyMigrations(): Promise<{ verified: boolean; appliedCount: number; pendingCount: number; pending: string[] }>;
  close(): Promise<void>;
}

// In-memory fallback mock for local test/dev without a live PostgreSQL instance
export class MemoryDatabaseClient implements IDatabaseClient {
  public tables: Record<string, any[]> = {
    users: [],
    refresh_tokens: [],
    subscriptions: [],
    credit_wallets: [],
    credit_transactions: [],
    projects: [],
    project_collaborators: [],
    media_assets: [],
    jobs: [],
    ai_jobs: [],
    render_jobs: [],
    _schema_migrations: [],
  };

  async transaction<T>(callback: (client: ITransactionClient) => Promise<T>): Promise<T> {
    return callback({
      query: (text: string, params?: any[]) => this.query(text, params),
    });
  }

  async query<R extends pg.QueryResultRow = any>(text: string, params: any[] = []): Promise<pg.QueryResult<R>> {
    const trimmed = text.trim();
    const lower = trimmed.toLowerCase();

    if (lower.startsWith('select 1')) {
      return {
        rows: [{ '?column?': 1, alive: 1, '1': 1 } as unknown as R],
        command: 'SELECT',
        rowCount: 1,
        oid: 0,
        fields: [],
      };
    }

    // Handle render_jobs queries in memory if needed
    if (lower.includes('render_jobs')) {
      if (lower.startsWith('insert into render_jobs')) {
        const row: any = {
          id: params[0],
          user_id: params[1],
          project_id: params[2],
          project_version_id: params[3] || null,
          status: 'queued',
          settings: typeof params[4] === 'string' ? JSON.parse(params[4]) : params[4],
          progress: 0.0,
          stage: 'queued',
          error_code: null,
          error_message: null,
          output_object: null,
          worker_metadata: typeof params[5] === 'string' ? JSON.parse(params[5]) : (params[5] || {}),
          attempts: 0,
          max_attempts: Number(params[6] ?? 3),
          credit_reservation_id: params[7] || null,
          credit_cost: Number(params[8] ?? 0),
          snapshot_data: params[9] ? (typeof params[9] === 'string' ? JSON.parse(params[9]) : params[9]) : null,
          snapshot_hash: params[10] || null,
          snapshot_version: Number(params[11] ?? 1),
          project_version: params[12] ? Number(params[12]) : null,
          created_at: new Date().toISOString(),
          started_at: null,
          completed_at: null,
          cancelled_at: null,
          updated_at: new Date().toISOString(),
        };
        this.tables.render_jobs.push(row);
        return {
          rows: [row as unknown as R],
          command: 'INSERT',
          rowCount: 1,
          oid: 0,
          fields: [],
        };
      }

      if (lower.startsWith('select') && lower.includes('from render_jobs')) {
        // By ID lookup
        if (lower.includes('where id = $1')) {
          const id = params[0];
          const found = this.tables.render_jobs.find((j) => j.id === id);
          return {
            rows: found ? ([found] as unknown as R[]) : [],
            command: 'SELECT',
            rowCount: found ? 1 : 0,
            oid: 0,
            fields: [],
          };
        }
        // General list query
        let rows = [...this.tables.render_jobs];
        if (lower.includes('where user_id =') || lower.includes('user_id = $')) {
          const userId = params[0];
          rows = rows.filter((r) => r.user_id === userId);
        }
        return {
          rows: rows as unknown as R[],
          command: 'SELECT',
          rowCount: rows.length,
          oid: 0,
          fields: [],
        };
      }

      if (lower.startsWith('update render_jobs')) {
        const id = params[params.length - 1]; // typically ID is last param or in query
        const found = this.tables.render_jobs.find((j) => j.id === id);
        if (found) {
          found.updated_at = new Date().toISOString();
          if (lower.includes("status = 'cancelled'")) {
            found.status = 'cancelled';
            found.stage = 'cancelled';
            found.cancelled_at = new Date().toISOString();
          } else if (lower.includes("status = 'cancelling'")) {
            found.status = 'cancelling';
            found.stage = 'cancelling';
          } else if (lower.includes("status = 'completed'")) {
            found.status = 'completed';
            found.stage = 'completed';
            found.progress = 100.0;
            if (params[0]) found.output_object = params[0];
            if (params[1]) found.worker_metadata = params[1];
            found.completed_at = new Date().toISOString();
          } else if (lower.includes("status = 'failed'")) {
            found.status = 'failed';
            found.stage = 'failed';
            if (lower.includes("error_code = 'render_execution_failed'")) {
              found.error_code = 'RENDER_EXECUTION_FAILED';
            } else if (lower.includes("error_code = 'queue_submission_failed'")) {
              found.error_code = 'QUEUE_SUBMISSION_FAILED';
            }
            if (params.length >= 2) {
              found.error_message = params[0];
            }
          } else if (lower.includes("status = 'queued'")) {
            found.status = 'queued';
            found.stage = 'queued';
            found.progress = 0;
            found.error_code = null;
            found.error_message = null;
          } else if (lower.includes('set status = $1, stage = $2, progress = $3')) {
            found.status = params[0];
            found.stage = params[1];
            found.progress = params[2];
          }
          if (lower.includes('attempts = attempts + 1')) {
            found.attempts = (found.attempts || 0) + 1;
          }
        }
        return {
          rows: found ? ([found] as unknown as R[]) : [],
          command: 'UPDATE',
          rowCount: found ? 1 : 0,
          oid: 0,
          fields: [],
        };
      }
    }

    return {
      rows: [] as R[],
      command: 'MOCK',
      rowCount: 0,
      oid: 0,
      fields: [],
    };
  }

  async isHealthy(): Promise<boolean> {
    return true;
  }

  async getHealthDetails(): Promise<DatabaseHealthResult> {
    return {
      healthy: true,
      driver: 'memory',
      latencyMs: 0,
      pool: { totalCount: 1, idleCount: 1, waitingCount: 0 },
      migrationsVerified: true,
    };
  }

  async verifyMigrations(): Promise<{ verified: boolean; appliedCount: number; pendingCount: number; pending: string[] }> {
    return {
      verified: true,
      appliedCount: 3,
      pendingCount: 0,
      pending: [],
    };
  }

  async close(): Promise<void> {
    // No-op for in-memory
  }
}

export class PostgresDatabaseClient implements IDatabaseClient {
  public pool: pg.Pool;
  private isConnected = false;

  constructor(customConfig?: Partial<pg.PoolConfig>) {
    let sslConfig: boolean | { rejectUnauthorized: boolean; ca?: string } = false;
    if (env.DATABASE_SSL || env.DATABASE_URL.includes('sslmode=require') || env.DATABASE_URL.includes('ssl=true')) {
      sslConfig = env.DATABASE_SSL_CA
        ? { rejectUnauthorized: env.DATABASE_SSL_REJECT_UNAUTHORIZED, ca: env.DATABASE_SSL_CA }
        : { rejectUnauthorized: env.DATABASE_SSL_REJECT_UNAUTHORIZED };
    }

    this.pool = new Pool({
      connectionString: env.DATABASE_URL,
      min: env.DATABASE_POOL_MIN,
      max: env.DATABASE_POOL_MAX,
      idleTimeoutMillis: env.DATABASE_POOL_IDLE_TIMEOUT_MS,
      connectionTimeoutMillis: env.DATABASE_POOL_CONN_TIMEOUT_MS,
      statement_timeout: env.DATABASE_STATEMENT_TIMEOUT_MS,
      ssl: sslConfig,
      ...customConfig,
    });

    this.pool.on('error', (err) => {
      logger.error({ err }, 'Unexpected PostgreSQL client error on idle connection');
    });

    this.pool.on('connect', () => {
      logger.debug('Client connected to PostgreSQL connection pool');
    });

    this.pool.on('acquire', () => {
      logger.trace('Client acquired from PostgreSQL connection pool');
    });

    this.pool.on('remove', () => {
      logger.debug('Client removed from PostgreSQL connection pool');
    });
  }

  getPoolStats() {
    return {
      total: this.pool.totalCount,
      idle: this.pool.idleCount,
      waiting: this.pool.waitingCount,
    };
  }

  async query<R extends pg.QueryResultRow = any>(text: string, params?: any[]): Promise<pg.QueryResult<R>> {
    return this.pool.query<R>(text, params);
  }

  async transaction<T>(callback: (client: ITransactionClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async isHealthy(): Promise<boolean> {
    const details = await this.getHealthDetails();
    return details.healthy;
  }

  async getHealthDetails(): Promise<DatabaseHealthResult> {
    const start = Date.now();
    try {
      const res = await this.pool.query('SELECT 1 as alive, NOW() as server_time;');
      const latencyMs = Date.now() - start;
      const isAlive = res.rowCount === 1;
      this.isConnected = isAlive;
      return {
        healthy: isAlive,
        driver: 'postgresql',
        latencyMs,
        pool: this.getPoolStats(),
      };
    } catch (err) {
      this.isConnected = false;
      return {
        healthy: false,
        driver: 'postgresql',
        latencyMs: Date.now() - start,
        pool: this.getPoolStats(),
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async verifyMigrations(): Promise<{ verified: boolean; appliedCount: number; pendingCount: number; pending: string[] }> {
    try {
      const tableCheck = await this.pool.query<{ exists: boolean }>(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = '_schema_migrations'
        );
      `);

      if (!tableCheck.rows[0]?.exists) {
        return { verified: false, appliedCount: 0, pendingCount: -1, pending: ['_schema_migrations table not found'] };
      }

      const appliedResult = await this.pool.query<{ name: string }>('SELECT name FROM _schema_migrations;');
      const appliedNames = new Set(appliedResult.rows.map((r) => r.name));

      // Resolve migrations directory safely
      const fs = await import('fs');
      const path = await import('path');
      const { fileURLToPath } = await import('url');
      const currentDir = path.dirname(fileURLToPath(import.meta.url));
      const migrationsDir = path.join(currentDir, 'migrations');

      const files = fs.existsSync(migrationsDir)
        ? fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()
        : [];

      const pending = files.filter((f) => !appliedNames.has(f));
      return {
        verified: pending.length === 0,
        appliedCount: appliedNames.size,
        pendingCount: pending.length,
        pending,
      };
    } catch (err) {
      return {
        verified: false,
        appliedCount: 0,
        pendingCount: -1,
        pending: [err instanceof Error ? err.message : String(err)],
      };
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

export let db: IDatabaseClient;

export function initializeDatabase(): IDatabaseClient {
  if (env.NODE_ENV === 'test') {
    db = new MemoryDatabaseClient();
    logger.info('Initialized in-memory database adapter for testing');
    return db;
  }

  if (env.NODE_ENV === 'production') {
    try {
      db = new PostgresDatabaseClient();
      logger.info('Initialized Production PostgreSQL client pool');
      return db;
    } catch (error) {
      logger.fatal({ error }, 'FATAL: Failed to initialize production PostgreSQL pool');
      throw new Error(`Production PostgreSQL initialization failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Development mode:
  try {
    db = new PostgresDatabaseClient();
    logger.info('Initialized PostgreSQL client pool');
    return db;
  } catch (error) {
    if (env.ALLOW_DEV_FALLBACKS) {
      logger.warn({ error }, 'PostgreSQL connection failed, using in-memory database adapter because ALLOW_DEV_FALLBACKS=true');
      db = new MemoryDatabaseClient();
      return db;
    }
    throw error;
  }
}

export async function withTransaction<T>(callback: (client: ITransactionClient) => Promise<T>): Promise<T> {
  return db.transaction(callback);
}

// Default export
db = initializeDatabase();

