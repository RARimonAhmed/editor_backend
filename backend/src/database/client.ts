import pg from 'pg';
import { env } from '../config/env.js';
import { logger } from '../core/logger.js';

const { Pool } = pg;

export interface IDatabaseClient {
  query<R extends pg.QueryResultRow = any>(text: string, params?: any[]): Promise<pg.QueryResult<R>>;
  isHealthy(): Promise<boolean>;
  close(): Promise<void>;
}

// In-memory fallback mock for local test/dev without a live PostgreSQL instance
class MemoryDatabaseClient implements IDatabaseClient {
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
    _schema_migrations: [],
  };

  async query<R extends pg.QueryResultRow = any>(text: string, params: any[] = []): Promise<pg.QueryResult<R>> {
    // Basic mock query handler for health checks and simple queries
    const trimmed = text.trim().toLowerCase();
    
    if (trimmed.startsWith('select 1')) {
      return {
        rows: [{ '?column?': 1 } as unknown as R],
        command: 'SELECT',
        rowCount: 1,
        oid: 0,
        fields: [],
      };
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

// Default export
db = initializeDatabase();
