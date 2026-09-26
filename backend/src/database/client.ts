import pg from 'pg';
import { env } from '../config/env.js';
import { logger } from '../core/logger.js';

const { Pool } = pg;

export interface ITransactionClient {
  query<R extends pg.QueryResultRow = any>(text: string, params?: any[]): Promise<pg.QueryResult<R>>;
}

export interface IDatabaseClient {
  query<R extends pg.QueryResultRow = any>(text: string, params?: any[]): Promise<pg.QueryResult<R>>;
  transaction<T>(callback: (client: ITransactionClient) => Promise<T>): Promise<T>;
  isHealthy(): Promise<boolean>;
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
        rows: [{ '?column?': 1 } as unknown as R],
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
          } else if (lower.includes("status = 'failed'")) {
            found.status = 'failed';
            found.stage = 'failed';
          } else if (lower.includes("status = 'queued'")) {
            found.status = 'queued';
            found.stage = 'queued';
            found.progress = 0;
            found.error_code = null;
            found.error_message = null;
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

  async close(): Promise<void> {
    // No-op for in-memory
  }
}

class PostgresDatabaseClient implements IDatabaseClient {
  private pool: pg.Pool;
  private isConnected = false;

  constructor() {
    this.pool = new Pool({
      connectionString: env.DATABASE_URL,
      min: env.DATABASE_POOL_MIN,
      max: env.DATABASE_POOL_MAX,
      ssl: env.DATABASE_SSL ? { rejectUnauthorized: false } : false,
      connectionTimeoutMillis: 3000,
    });

    this.pool.on('error', (err) => {
      logger.error({ err }, 'Unexpected PostgreSQL client error on idle connection');
    });
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
    try {
      const res = await this.pool.query('SELECT 1 as alive');
      this.isConnected = res.rowCount === 1;
      return true;
    } catch (err) {
      this.isConnected = false;
      return false;
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
  } else {
    try {
      db = new PostgresDatabaseClient();
      logger.info('Initialized PostgreSQL client pool');
    } catch (error) {
      logger.warn({ error }, 'PostgreSQL connection failed, falling back to memory database adapter');
      db = new MemoryDatabaseClient();
    }
  }
  return db;
}

export async function withTransaction<T>(callback: (client: ITransactionClient) => Promise<T>): Promise<T> {
  return db.transaction(callback);
}

// Default export
db = initializeDatabase();

