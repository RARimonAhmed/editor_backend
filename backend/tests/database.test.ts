import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { runMigrations } from '../src/database/migrate.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Database Schema & Migration Suite', () => {
  it('Migration runner parses and validates all SQL migration files without errors', async () => {
    await expect(runMigrations()).resolves.not.toThrow();
  });

  it('Validates 001_core_schema.sql contains all 30+ requested core entities', () => {
    const migrationPath = path.join(__dirname, '../src/database/migrations/001_core_schema.sql');
    expect(fs.existsSync(migrationPath)).toBe(true);

    const sql = fs.readFileSync(migrationPath, 'utf8');

    // Verify all requested core tables exist
    const requiredTables = [
      'users',
      'profiles',
      'sessions',
      'devices',
      'projects',
      'project_versions',
      'project_members',
      'project_permissions',
      'media_assets',
      'media_variants',
      'media_metadata',
      'media_thumbnails',
      'media_waveforms',
      'media_proxies',
      'timeline_documents',
      'timeline_versions',
      'ai_jobs',
      'ai_job_steps',
      'ai_outputs',
      'subscriptions',
      'plans',
      'credits',
      'credit_transactions',
      'storage_objects',
      'templates',
      'effects',
      'transitions',
      'fonts',
      'assets',
      'notifications',
      'audit_logs',
    ];

    for (const table of requiredTables) {
      const tableRegex = new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`, 'i');
      expect(sql).toMatch(tableRegex);
    }
  });

  it('Verifies strict versioning constraints for projects and timeline documents', () => {
    const migrationPath = path.join(__dirname, '../src/database/migrations/001_core_schema.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    // Must have unique compound constraints for version history immutability
    expect(sql).toContain('uq_timeline_version UNIQUE (timeline_id, version_number)');
    expect(sql).toContain('uq_project_version UNIQUE (project_id, version_number)');
  });

  it('Verifies soft delete column on critical entities', () => {
    const migrationPath = path.join(__dirname, '../src/database/migrations/001_core_schema.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    // Users, projects, media_assets, and storage_objects must have deleted_at
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS users[\s\S]*?deleted_at TIMESTAMP WITH TIME ZONE/i);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS projects[\s\S]*?deleted_at TIMESTAMP WITH TIME ZONE/i);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS media_assets[\s\S]*?deleted_at TIMESTAMP WITH TIME ZONE/i);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS storage_objects[\s\S]*?deleted_at TIMESTAMP WITH TIME ZONE/i);
  });

  it('Verifies indexes are declared for user, project, asset, job, status, and timestamps', () => {
    const migrationPath = path.join(__dirname, '../src/database/migrations/001_core_schema.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    // Check key required indexes
    expect(sql).toContain('idx_users_email_active');
    expect(sql).toContain('idx_projects_owner_id');
    expect(sql).toContain('idx_project_versions_project_id');
    expect(sql).toContain('idx_timeline_versions_timeline_id');
    expect(sql).toContain('idx_media_assets_user_id');
    expect(sql).toContain('idx_ai_jobs_user_id');
    expect(sql).toContain('idx_ai_jobs_status');
    expect(sql).toContain('idx_projects_created_at');
    expect(sql).toContain('idx_projects_updated_at');
  });

  it('Verifies automatic updated_at trigger function is declared', () => {
    const migrationPath = path.join(__dirname, '../src/database/migrations/001_core_schema.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    expect(sql).toContain('CREATE OR REPLACE FUNCTION trigger_set_updated_at()');
    expect(sql).toContain('trg_%I_updated_at');
  });

  it('Verifies credit balance non-negative constraint is enforced', () => {
    const migrationPath = path.join(__dirname, '../src/database/migrations/001_core_schema.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    expect(sql).toContain('CONSTRAINT chk_credit_balance_positive CHECK (balance >= 0)');
  });
});
