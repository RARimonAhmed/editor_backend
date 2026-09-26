-- ==============================================================================
-- TechXayan Creative - my_editor Enterprise PostgreSQL Schema
-- Migration: 003_render_jobs.sql
-- Subsystem: Video Timeline Cloud Render Job Pipeline & Export Lifecycle
-- ==============================================================================

-- 1. Create render_jobs table
CREATE TABLE IF NOT EXISTS render_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    project_version_id UUID REFERENCES project_versions(id) ON DELETE SET NULL,
    status VARCHAR(32) DEFAULT 'queued' NOT NULL,
    settings JSONB DEFAULT '{}'::jsonb NOT NULL,
    progress NUMERIC(5,2) DEFAULT 0.00 NOT NULL,
    stage VARCHAR(64) DEFAULT 'queued' NOT NULL,
    error_code VARCHAR(64),
    error_message TEXT,
    output_object JSONB,
    worker_metadata JSONB DEFAULT '{}'::jsonb NOT NULL,
    attempts INTEGER DEFAULT 0 NOT NULL,
    max_attempts INTEGER DEFAULT 3 NOT NULL,
    credit_reservation_id UUID,
    credit_cost INTEGER DEFAULT 0 NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,

    -- Constraints
    CONSTRAINT chk_render_job_status CHECK (
        status IN (
            'queued',
            'starting',
            'running',
            'cancelling',
            'cancelled',
            'validating',
            'uploading',
            'completed',
            'failed'
        )
    ),
    CONSTRAINT chk_render_job_progress CHECK (progress >= 0.00 AND progress <= 100.00),
    CONSTRAINT chk_render_job_attempts CHECK (attempts >= 0),
    CONSTRAINT chk_render_job_max_attempts CHECK (max_attempts > 0),
    CONSTRAINT chk_render_job_credit_cost CHECK (credit_cost >= 0)
);

-- 2. Trigger for automatic updated_at timestamp
DROP TRIGGER IF EXISTS trg_render_jobs_updated_at ON render_jobs;
CREATE TRIGGER trg_render_jobs_updated_at
BEFORE UPDATE ON render_jobs
FOR EACH ROW
EXECUTE FUNCTION trigger_set_updated_at();

-- 3. Optimized indexes for querying, pagination, user isolation, and workers
CREATE INDEX IF NOT EXISTS idx_render_jobs_user_id ON render_jobs (user_id);
CREATE INDEX IF NOT EXISTS idx_render_jobs_project_id ON render_jobs (project_id);
CREATE INDEX IF NOT EXISTS idx_render_jobs_status ON render_jobs (status);
CREATE INDEX IF NOT EXISTS idx_render_jobs_created_at ON render_jobs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_render_jobs_user_status ON render_jobs (user_id, status);
CREATE INDEX IF NOT EXISTS idx_render_jobs_project_status ON render_jobs (project_id, status);
CREATE INDEX IF NOT EXISTS idx_render_jobs_credit_res ON render_jobs (credit_reservation_id) WHERE credit_reservation_id IS NOT NULL;

-- 4. Compatibility view for credit_wallets referencing credits table if queried
CREATE OR REPLACE VIEW credit_wallets AS SELECT * FROM credits;

-- ==============================================================================
-- ROLLBACK DOWN SCRIPT (For reference and manual migrations rollback):
-- DROP TRIGGER IF EXISTS trg_render_jobs_updated_at ON render_jobs;
-- DROP TABLE IF EXISTS render_jobs CASCADE;
-- DROP VIEW IF EXISTS credit_wallets;
-- ==============================================================================
