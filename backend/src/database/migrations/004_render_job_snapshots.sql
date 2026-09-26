-- ==============================================================================
-- TechXayan Creative - my_editor Enterprise PostgreSQL Schema
-- Migration: 004_render_job_snapshots.sql
-- Subsystem: Immutable Render Project Snapshots & Version Safety
-- ==============================================================================

-- Add immutable snapshot columns to render_jobs table
ALTER TABLE render_jobs
    ADD COLUMN IF NOT EXISTS snapshot_data JSONB,
    ADD COLUMN IF NOT EXISTS snapshot_hash VARCHAR(64),
    ADD COLUMN IF NOT EXISTS snapshot_version INTEGER DEFAULT 1,
    ADD COLUMN IF NOT EXISTS project_version INTEGER;

-- Index for high-speed idempotency lookups by snapshot hash
CREATE INDEX IF NOT EXISTS idx_render_jobs_snapshot_hash ON render_jobs (snapshot_hash) WHERE snapshot_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_render_jobs_project_version ON render_jobs (project_id, project_version) WHERE project_version IS NOT NULL;
