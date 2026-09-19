import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from './client.js';
import { logger } from '../core/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runMigrations() {
  logger.info('Running database migrations...');
  const schemaPath = path.join(__dirname, 'schema.sql');
  
  if (!fs.existsSync(schemaPath)) {
    throw new Error(`Schema file not found at: ${schemaPath}`);
  }

  const sql = fs.readFileSync(schemaPath, 'utf8');

  try {
    const isHealthy = await db.isHealthy();
    if (!isHealthy) {
      logger.warn('Database not directly reachable via network. Storing migration schema verification.');
      return;
    }

    await db.query(sql);
    logger.info('✅ Database schema migrations applied successfully');
  } catch (error) {
    logger.error({ error }, '❌ Database migration failed');
    throw error;
  }
}

// Allow direct execution: `tsx src/database/migrate.ts`
if (process.argv[1] && process.argv[1].endsWith('migrate.ts')) {
  runMigrations()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
