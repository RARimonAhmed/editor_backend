-- ==============================================================================
-- TechXayan Creative - my_editor Enterprise PostgreSQL Schema
-- Migration: 002_ai_jobs_system.sql
-- Subsystem: Asynchronous AI Job System, Idempotency, Deduplication, and Telemetry
-- ==============================================================================

-- 1. Modify ai_jobs table to support uppercase statuses, progress, model, usage, cost, and idempotency
DO $$
BEGIN
    -- Add columns if they do not exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ai_jobs' AND column_name = 'type') THEN
        ALTER TABLE ai_jobs ADD COLUMN type VARCHAR(64);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ai_jobs' AND column_name = 'progress') THEN
        ALTER TABLE ai_jobs ADD COLUMN progress SMALLINT DEFAULT 0 NOT NULL;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ai_jobs' AND column_name = 'input') THEN
        ALTER TABLE ai_jobs ADD COLUMN input JSONB DEFAULT '{}'::jsonb NOT NULL;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ai_jobs' AND column_name = 'output') THEN
        ALTER TABLE ai_jobs ADD COLUMN output JSONB;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ai_jobs' AND column_name = 'model') THEN
        ALTER TABLE ai_jobs ADD COLUMN model VARCHAR(128);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ai_jobs' AND column_name = 'usage') THEN
        ALTER TABLE ai_jobs ADD COLUMN usage JSONB DEFAULT '{}'::jsonb;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ai_jobs' AND column_name = 'cost') THEN
        ALTER TABLE ai_jobs ADD COLUMN cost INTEGER DEFAULT 0 NOT NULL;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ai_jobs' AND column_name = 'error') THEN
        ALTER TABLE ai_jobs ADD COLUMN error TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ai_jobs' AND column_name = 'idempotency_key') THEN
        ALTER TABLE ai_jobs ADD COLUMN idempotency_key VARCHAR(255);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ai_jobs' AND column_name = 'timeout_ms') THEN
        ALTER TABLE ai_jobs ADD COLUMN timeout_ms INTEGER DEFAULT 60000 NOT NULL;
    END IF;

    -- Sync type from job_type if column exists
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ai_jobs' AND column_name = 'job_type') THEN
        UPDATE ai_jobs SET type = job_type WHERE type IS NULL;
    END IF;

    -- Sync input from input_payload if column exists
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ai_jobs' AND column_name = 'input_payload') THEN
        UPDATE ai_jobs SET input = input_payload WHERE input = '{}'::jsonb AND input_payload IS NOT NULL;
    END IF;

    -- Drop old status check constraint if it exists
    ALTER TABLE ai_jobs DROP CONSTRAINT IF EXISTS chk_ai_job_status;

    -- Add updated status check constraint supporting both uppercase and legacy lowercase
    ALTER TABLE ai_jobs ADD CONSTRAINT chk_ai_job_status 
        CHECK (status IN ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED', 'queued', 'processing', 'completed', 'failed', 'cancelled'));

    -- Add progress check constraint
    ALTER TABLE ai_jobs DROP CONSTRAINT IF EXISTS chk_ai_job_progress;
    ALTER TABLE ai_jobs ADD CONSTRAINT chk_ai_job_progress 
        CHECK (progress >= 0 AND progress <= 100);
END $$;

-- 2. Indexes for Idempotency, User Jobs, and Status Lookup
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_jobs_user_idempotency 
    ON ai_jobs (user_id, idempotency_key) 
    WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ai_jobs_user_status 
    ON ai_jobs (user_id, status);

CREATE INDEX IF NOT EXISTS idx_ai_jobs_project 
    ON ai_jobs (project_id) 
    WHERE project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ai_jobs_created_at 
    ON ai_jobs (created_at DESC);
