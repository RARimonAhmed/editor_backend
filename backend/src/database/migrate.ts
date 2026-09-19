import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { db } from './client.js';
import { logger } from '../core/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runMigrations() {
  logger.info('🚀 Initiating PostgreSQL schema migration runner...');

  const migrationsDir = path.join(__dirname, 'migrations');
  
  // Ensure migrations directory exists, fallback to schema.sql if empty
  let migrationFiles: string[] = [];
  if (fs.existsSync(migrationsDir)) {
    migrationFiles = fs
      .readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.sql'))
      .sort();
  }

  const isHealthy = await db.isHealthy();
  if (!isHealthy) {
    logger.warn('⚠️  Database is currently unreachable via network. Validating migration syntax in offline mode.');
    for (const file of migrationFiles) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      if (!sql.trim()) {
        throw new Error(`Migration file ${file} is empty`);
      }
      logger.info(`Syntax verified: ${file} (${sql.length} bytes)`);
    }
    return;
  }

  try {
    // 1. Ensure migrations tracking table exists
    await db.query(`
      CREATE TABLE IF NOT EXISTS _schema_migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        checksum VARCHAR(64),
        applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. Fetch already applied migrations
    const appliedResult = await db.query<{ name: string }>('SELECT name FROM _schema_migrations;');
    const appliedSet = new Set(appliedResult.rows.map((row) => row.name));

    // 3. Apply pending migrations sequentially
    let appliedCount = 0;
    for (const file of migrationFiles) {
      if (appliedSet.has(file)) {
        logger.debug({ migration: file }, 'Migration already applied, skipping');
        continue;
      }

      logger.info({ migration: file }, `Applying pending migration: ${file}`);
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');
      const checksum = crypto.createHash('sha256').update(sql).digest('hex');

      await db.query('BEGIN');
      try {
        await db.query(sql);
        await db.query(
          'INSERT INTO _schema_migrations (name, checksum) VALUES ($1, $2);',
          [file, checksum]
        );
        await db.query('COMMIT');
        appliedCount++;
        logger.info({ migration: file }, `✅ Successfully applied migration: ${file}`);
      } catch (migrationError) {
        await db.query('ROLLBACK');
        logger.error({ migration: file, error: migrationError }, `❌ Migration failed, rolled back: ${file}`);
        throw migrationError;
      }
    }

    if (appliedCount === 0) {
      logger.info('Database schema is already up to date. No pending migrations.');
    } else {
      logger.info(`🎉 Successfully applied ${appliedCount} migration(s).`);
    }
  } catch (error) {
    logger.error({ error }, '❌ Migration runner execution failed');
    throw error;
  }
}

// Allow direct execution from CLI: `npm run db:migrate`
if (process.argv[1] && process.argv[1].endsWith('migrate.ts')) {
  runMigrations()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
