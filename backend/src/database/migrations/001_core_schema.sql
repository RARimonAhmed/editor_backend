-- ==============================================================================
-- TechXayan Creative - my_editor Enterprise PostgreSQL Schema
-- Migration: 001_core_schema.sql
-- Subsystems: Identity, Projects & Versioning, Media Hierarchy, Timeline Documents,
--             AI Pipelines, Billing & Credits, Storage, Creative Assets, Audit & Notifications
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "citext";

-- 2. SCHEMA MIGRATIONS TRACKER
CREATE TABLE IF NOT EXISTS _schema_migrations (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    checksum VARCHAR(64),
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. TRIGGER FUNCTION: AUTO-UPDATE UPDATED_AT
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ==============================================================================
-- SUBSYSTEM 1: IDENTITY & DEVICE ACCESS
-- ==============================================================================

-- Users
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email CITEXT NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(32) NOT NULL DEFAULT 'user', -- 'user', 'pro', 'admin', 'system'
    status VARCHAR(32) NOT NULL DEFAULT 'active', -- 'active', 'suspended', 'pending_verification', 'deleted'
    email_verified_at TIMESTAMP WITH TIME ZONE,
    deleted_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_user_role CHECK (role IN ('user', 'pro', 'admin', 'system')),
    CONSTRAINT chk_user_status CHECK (status IN ('active', 'suspended', 'pending_verification', 'deleted'))
);

-- Profiles
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    display_name VARCHAR(100) NOT NULL,
    avatar_url TEXT,
    bio TEXT,
    timezone VARCHAR(64) DEFAULT 'UTC' NOT NULL,
    locale VARCHAR(16) DEFAULT 'en-US' NOT NULL,
    preferences JSONB DEFAULT '{"theme": "dark", "autoSaveIntervalSeconds": 30, "hardwareAcceleration": true}'::jsonb NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Devices (Windows desktop, Android tablet/phone, Web)
CREATE TABLE IF NOT EXISTS devices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_fingerprint VARCHAR(255) NOT NULL,
    device_type VARCHAR(32) NOT NULL, -- 'windows', 'android', 'web', 'macos'
    device_name VARCHAR(128) NOT NULL,
    os_version VARCHAR(64),
    app_version VARCHAR(32),
    push_token TEXT,
    last_active_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    is_trusted BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_device_type CHECK (device_type IN ('windows', 'android', 'web', 'macos')),
    CONSTRAINT uq_user_device_fingerprint UNIQUE (user_id, device_fingerprint)
);

-- Sessions
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id UUID REFERENCES devices(id) ON DELETE SET NULL,
    refresh_token_hash VARCHAR(255) NOT NULL UNIQUE,
    ip_address INET,
    user_agent TEXT,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    is_revoked BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- ==============================================================================
-- SUBSYSTEM 2: STORAGE OBJECTS CATALOG
-- ==============================================================================

-- Storage Objects (S3, MinIO, R2 physical storage metadata)
CREATE TABLE IF NOT EXISTS storage_objects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bucket VARCHAR(128) NOT NULL,
    key TEXT NOT NULL,
    driver VARCHAR(32) DEFAULT 's3' NOT NULL, -- 's3', 'minio', 'r2', 'local'
    size_bytes BIGINT NOT NULL,
    mime_type VARCHAR(128) NOT NULL,
    etag VARCHAR(128),
    checksum_sha256 VARCHAR(64),
    is_public BOOLEAN DEFAULT FALSE NOT NULL,
    status VARCHAR(32) DEFAULT 'available' NOT NULL, -- 'pending_upload', 'available', 'deleted'
    deleted_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT uq_bucket_key UNIQUE (bucket, key),
    CONSTRAINT chk_storage_status CHECK (status IN ('pending_upload', 'available', 'deleted'))
);

-- ==============================================================================
-- SUBSYSTEM 3: PROJECTS, MEMBERS & VERSIONING
-- ==============================================================================

-- Projects
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    title VARCHAR(255) DEFAULT 'Untitled Project' NOT NULL,
    description TEXT,
    resolution_width INTEGER DEFAULT 1920 NOT NULL,
    resolution_height INTEGER DEFAULT 1080 NOT NULL,
    framerate NUMERIC(6,3) DEFAULT 30.000 NOT NULL,
    aspect_ratio VARCHAR(16) DEFAULT '16:9' NOT NULL,
    color_space VARCHAR(32) DEFAULT 'rec709' NOT NULL, -- 'rec709', 'dci_p3', 'rec2020_hlg', 'srgb'
    current_version_id UUID, -- References project_versions(id) deferred
    version_number INTEGER DEFAULT 1 NOT NULL,
    thumbnail_url TEXT,
    status VARCHAR(32) DEFAULT 'active' NOT NULL, -- 'active', 'archived', 'deleted'
    deleted_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_project_status CHECK (status IN ('active', 'archived', 'deleted')),
    CONSTRAINT chk_resolution_width CHECK (resolution_width > 0 AND resolution_width <= 15360), -- Up to 16K
    CONSTRAINT chk_resolution_height CHECK (resolution_height > 0 AND resolution_height <= 8640)
);

-- Project Members (Collaboration ACL)
CREATE TABLE IF NOT EXISTS project_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(32) DEFAULT 'editor' NOT NULL, -- 'owner', 'admin', 'editor', 'viewer', 'commenter'
    invited_by UUID REFERENCES users(id) ON DELETE SET NULL,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT uq_project_member UNIQUE (project_id, user_id),
    CONSTRAINT chk_project_member_role CHECK (role IN ('owner', 'admin', 'editor', 'viewer', 'commenter'))
);

-- Project Permissions (Fine-grained capabilities)
CREATE TABLE IF NOT EXISTS project_permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    member_id UUID NOT NULL REFERENCES project_members(id) ON DELETE CASCADE,
    can_edit_timeline BOOLEAN DEFAULT TRUE NOT NULL,
    can_export BOOLEAN DEFAULT TRUE NOT NULL,
    can_invite BOOLEAN DEFAULT FALSE NOT NULL,
    can_delete_assets BOOLEAN DEFAULT FALSE NOT NULL,
    can_manage_roles BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT uq_member_permission UNIQUE (member_id)
);

-- Timeline Documents (Active timeline anchor for project)
CREATE TABLE IF NOT EXISTS timeline_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
    duration_seconds NUMERIC(12,3) DEFAULT 0.000 NOT NULL,
    framerate NUMERIC(6,3) DEFAULT 30.000 NOT NULL,
    tracks_count INTEGER DEFAULT 0 NOT NULL,
    active_version_id UUID, -- References timeline_versions(id) deferred
    version_counter INTEGER DEFAULT 1 NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_timeline_duration CHECK (duration_seconds >= 0)
);

-- Timeline Versions (Strictly Immutable Timeline History - NEVER OVERWRITTEN)
CREATE TABLE IF NOT EXISTS timeline_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    timeline_id UUID NOT NULL REFERENCES timeline_documents(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    author_id UUID REFERENCES users(id) ON DELETE SET NULL,
    mutation_type VARCHAR(64) NOT NULL, -- 'initial', 'clip_add', 'clip_move', 'clip_split', 'clip_trim', 'effect_apply', 'auto_save', 'manual_commit'
    tracks_state JSONB NOT NULL, -- Full multi-track hierarchical state: video, audio, text, effects
    markers JSONB DEFAULT '[]'::jsonb NOT NULL,
    delta_patch JSONB, -- Optional operational transformation / JSON patch against previous version
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT uq_timeline_version UNIQUE (timeline_id, version_number)
);

-- Project Versions (Full Project Configuration Snapshot History - NEVER OVERWRITTEN)
CREATE TABLE IF NOT EXISTS project_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    change_summary TEXT,
    snapshot_data JSONB NOT NULL, -- Includes project metadata, resolution, framerate, active timeline reference
    timeline_version_id UUID REFERENCES timeline_versions(id) ON DELETE SET NULL,
    is_auto_save BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT uq_project_version UNIQUE (project_id, version_number)
);

-- Add deferred foreign keys from parent tables to their active version records
ALTER TABLE projects
    ADD CONSTRAINT fk_project_current_version
    FOREIGN KEY (current_version_id) REFERENCES project_versions(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE timeline_documents
    ADD CONSTRAINT fk_timeline_active_version
    FOREIGN KEY (active_version_id) REFERENCES timeline_versions(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;

-- ==============================================================================
-- SUBSYSTEM 4: MEDIA PIPELINE & ASSET HIERARCHY
-- ==============================================================================

-- Media Assets
CREATE TABLE IF NOT EXISTS media_assets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    storage_object_id UUID NOT NULL REFERENCES storage_objects(id) ON DELETE RESTRICT,
    name VARCHAR(255) NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    mime_type VARCHAR(128) NOT NULL,
    file_size_bytes BIGINT NOT NULL,
    duration_seconds NUMERIC(12,3),
    width INTEGER,
    height INTEGER,
    framerate NUMERIC(6,3),
    audio_channels SMALLINT,
    audio_sample_rate INTEGER,
    status VARCHAR(32) DEFAULT 'uploading' NOT NULL, -- 'uploading', 'processing', 'ready', 'failed', 'deleted'
    deleted_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_media_status CHECK (status IN ('uploading', 'processing', 'ready', 'failed', 'deleted'))
);

-- Media Metadata (Deep EXIF & FFprobe technical telemetry)
CREATE TABLE IF NOT EXISTS media_metadata (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    asset_id UUID NOT NULL UNIQUE REFERENCES media_assets(id) ON DELETE CASCADE,
    exif JSONB DEFAULT '{}'::jsonb NOT NULL,
    codec_long_name VARCHAR(128),
    pixel_format VARCHAR(64),
    bit_depth SMALLINT,
    color_primaries VARCHAR(64),
    has_alpha_channel BOOLEAN DEFAULT FALSE NOT NULL,
    metadata_raw JSONB DEFAULT '{}'::jsonb NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Media Variants (Stems, Alternate Bitrates, Masters)
CREATE TABLE IF NOT EXISTS media_variants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    asset_id UUID NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
    storage_object_id UUID NOT NULL REFERENCES storage_objects(id) ON DELETE CASCADE,
    variant_type VARCHAR(64) NOT NULL, -- 'original', 'proxy_low', 'proxy_high', 'audio_stem', 'export_master'
    resolution VARCHAR(32),
    bitrate_kbps INTEGER,
    codec VARCHAR(64),
    file_size_bytes BIGINT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT uq_asset_variant UNIQUE (asset_id, variant_type, resolution)
);

-- Media Thumbnails (Timeline filmstrips and scrub previews)
CREATE TABLE IF NOT EXISTS media_thumbnails (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    asset_id UUID NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
    storage_object_id UUID NOT NULL REFERENCES storage_objects(id) ON DELETE CASCADE,
    time_offset_seconds NUMERIC(10,3) DEFAULT 0.000 NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    is_primary BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Media Waveforms (High-speed timeline audio amplitude peaks)
CREATE TABLE IF NOT EXISTS media_waveforms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    asset_id UUID NOT NULL UNIQUE REFERENCES media_assets(id) ON DELETE CASCADE,
    storage_object_id UUID REFERENCES storage_objects(id) ON DELETE SET NULL,
    peaks_data JSONB NOT NULL, -- Array of normalized min/max peak values
    channels SMALLINT DEFAULT 2 NOT NULL,
    samples_per_pixel INTEGER DEFAULT 256 NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Media Proxies (Fast scrubbing lightweight edit proxies)
CREATE TABLE IF NOT EXISTS media_proxies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    asset_id UUID NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
    storage_object_id UUID NOT NULL REFERENCES storage_objects(id) ON DELETE CASCADE,
    resolution VARCHAR(32) NOT NULL, -- '360p', '720p', '1080p'
    codec VARCHAR(32) DEFAULT 'h264' NOT NULL, -- 'h264', 'prores_proxy'
    status VARCHAR(32) DEFAULT 'generating' NOT NULL, -- 'generating', 'ready', 'failed'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT uq_asset_proxy_resolution UNIQUE (asset_id, resolution),
    CONSTRAINT chk_proxy_status CHECK (status IN ('generating', 'ready', 'failed'))
);

-- ==============================================================================
-- SUBSYSTEM 5: AI PIPELINES & DISTRIBUTED JOBS
-- ==============================================================================

-- AI Jobs
CREATE TABLE IF NOT EXISTS ai_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    job_type VARCHAR(64) NOT NULL, -- 'transcription', 'caption_generation', 'smart_cut', 'broll_generation', 'voice_enhancement', 'scene_detection'
    provider VARCHAR(64) NOT NULL, -- 'mock', 'openai', 'gemini', 'elevenlabs', 'runway'
    status VARCHAR(32) DEFAULT 'queued' NOT NULL, -- 'queued', 'processing', 'completed', 'failed', 'cancelled'
    credits_reserved INTEGER DEFAULT 0 NOT NULL,
    credits_deducted INTEGER DEFAULT 0 NOT NULL,
    input_payload JSONB DEFAULT '{}'::jsonb NOT NULL,
    error_message TEXT,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_ai_job_status CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'cancelled'))
);

-- AI Job Steps (Granular multi-stage execution progress)
CREATE TABLE IF NOT EXISTS ai_job_steps (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID NOT NULL REFERENCES ai_jobs(id) ON DELETE CASCADE,
    step_index INTEGER NOT NULL,
    step_name VARCHAR(128) NOT NULL,
    status VARCHAR(32) DEFAULT 'pending' NOT NULL, -- 'pending', 'processing', 'completed', 'failed'
    progress_percentage SMALLINT DEFAULT 0 NOT NULL,
    details JSONB DEFAULT '{}'::jsonb NOT NULL,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT uq_job_step UNIQUE (job_id, step_index),
    CONSTRAINT chk_step_progress CHECK (progress_percentage >= 0 AND progress_percentage <= 100),
    CONSTRAINT chk_step_status CHECK (status IN ('pending', 'processing', 'completed', 'failed'))
);

-- AI Outputs
CREATE TABLE IF NOT EXISTS ai_outputs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID NOT NULL REFERENCES ai_jobs(id) ON DELETE CASCADE,
    output_type VARCHAR(64) NOT NULL, -- 'subtitles_srt', 'subtitles_json', 'silence_cuts', 'media_asset', 'audio_track'
    content_json JSONB,
    storage_object_id UUID REFERENCES storage_objects(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- ==============================================================================
-- SUBSYSTEM 6: PLANS, SUBSCRIPTIONS & CREDIT TRANSACTIONS
-- ==============================================================================

-- Plans
CREATE TABLE IF NOT EXISTS plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(32) NOT NULL UNIQUE, -- 'free', 'pro', 'studio', 'enterprise'
    name VARCHAR(64) NOT NULL,
    price_cents_monthly INTEGER DEFAULT 0 NOT NULL,
    price_cents_annual INTEGER DEFAULT 0 NOT NULL,
    monthly_credits INTEGER DEFAULT 50 NOT NULL,
    max_resolution VARCHAR(16) DEFAULT '1080p' NOT NULL, -- '1080p', '4k', '8k'
    max_storage_bytes BIGINT DEFAULT 2147483648 NOT NULL, -- 2 GB default
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Subscriptions
CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
    status VARCHAR(32) DEFAULT 'active' NOT NULL, -- 'active', 'trialing', 'past_due', 'canceled', 'paused'
    stripe_subscription_id VARCHAR(255),
    stripe_customer_id VARCHAR(255),
    current_period_start TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    current_period_end TIMESTAMP WITH TIME ZONE DEFAULT (CURRENT_TIMESTAMP + INTERVAL '30 days') NOT NULL,
    cancel_at_period_end BOOLEAN DEFAULT FALSE NOT NULL,
    canceled_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_subscription_status CHECK (status IN ('active', 'trialing', 'past_due', 'canceled', 'paused'))
);

-- Credits Wallet
CREATE TABLE IF NOT EXISTS credits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    balance INTEGER DEFAULT 50 NOT NULL,
    lifetime_granted INTEGER DEFAULT 50 NOT NULL,
    lifetime_used INTEGER DEFAULT 0 NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_credit_balance_positive CHECK (balance >= 0)
);

-- Credit Transactions (Double-entry immutable audit ledger)
CREATE TABLE IF NOT EXISTS credit_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    credit_wallet_id UUID NOT NULL REFERENCES credits(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL, -- Negative for debit, positive for credit grant
    balance_after INTEGER NOT NULL,
    type VARCHAR(64) NOT NULL, -- 'signup_grant', 'plan_renewal', 'topup', 'ai_job_charge', 'render_charge', 'job_refund', 'admin_adjustment'
    reference_id UUID, -- Links to ai_jobs(id), render jobs, or Stripe invoice ID
    description TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- ==============================================================================
-- SUBSYSTEM 7: CREATIVE ASSETS, TEMPLATES & EFFECTS
-- ==============================================================================

-- Templates (Prebuilt project scaffolds)
CREATE TABLE IF NOT EXISTS templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    creator_id UUID REFERENCES users(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL UNIQUE,
    category VARCHAR(64) NOT NULL, -- 'youtube', 'tiktok', 'cinematic', 'gaming', 'podcast', 'business'
    aspect_ratio VARCHAR(16) DEFAULT '16:9' NOT NULL,
    preview_video_url TEXT,
    timeline_data JSONB NOT NULL,
    is_featured BOOLEAN DEFAULT FALSE NOT NULL,
    is_premium BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Effects
CREATE TABLE IF NOT EXISTS effects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(128) NOT NULL,
    code VARCHAR(64) NOT NULL UNIQUE,
    category VARCHAR(64) NOT NULL, -- 'color_grade', 'blur', 'glitch', 'distortion', 'lut', 'hdr'
    parameters_schema JSONB NOT NULL, -- JSON Schema of configurable sliders/color pickers
    shader_code TEXT,
    is_premium BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Transitions
CREATE TABLE IF NOT EXISTS transitions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(128) NOT NULL,
    code VARCHAR(64) NOT NULL UNIQUE,
    category VARCHAR(64) NOT NULL, -- 'fade', 'wipe', 'zoom', 'slide', 'whip_pan', 'morph', 'light_leak'
    default_duration_seconds NUMERIC(6,3) DEFAULT 0.500 NOT NULL,
    parameters_schema JSONB NOT NULL,
    is_premium BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Fonts (Typography for titling and animated subtitles)
CREATE TABLE IF NOT EXISTS fonts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    family_name VARCHAR(128) NOT NULL,
    sub_family VARCHAR(64) DEFAULT 'Regular' NOT NULL,
    storage_object_id UUID REFERENCES storage_objects(id) ON DELETE SET NULL,
    format VARCHAR(16) DEFAULT 'woff2' NOT NULL, -- 'ttf', 'otf', 'woff2'
    license VARCHAR(64) DEFAULT 'open_source' NOT NULL,
    is_system BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT uq_font_family_style UNIQUE (family_name, sub_family)
);

-- Assets (Stock music, SFX, stickers, motion overlays)
CREATE TABLE IF NOT EXISTS assets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    type VARCHAR(64) NOT NULL, -- 'audio_track', 'sfx', 'sticker', 'overlay', 'background', 'intro'
    category VARCHAR(64) NOT NULL,
    storage_object_id UUID NOT NULL REFERENCES storage_objects(id) ON DELETE RESTRICT,
    duration_seconds NUMERIC(10,3),
    tags TEXT[] DEFAULT ARRAY[]::TEXT[] NOT NULL,
    is_premium BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- ==============================================================================
-- SUBSYSTEM 8: NOTIFICATIONS & AUDIT LOGS
-- ==============================================================================

-- Notifications
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(64) NOT NULL, -- 'job_completed', 'job_failed', 'collaboration_invite', 'credit_low', 'subscription_renewed'
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    data JSONB DEFAULT '{}'::jsonb NOT NULL,
    read_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Audit Logs (Tamper-evident security and activity log)
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(128) NOT NULL, -- 'user.login', 'project.version.commit', 'asset.upload', 'subscription.update', 'credit.charge'
    entity_type VARCHAR(64) NOT NULL, -- 'user', 'project', 'media_asset', 'subscription'
    entity_id UUID,
    ip_address INET,
    user_agent TEXT,
    diff_before JSONB,
    diff_after JSONB,
    metadata JSONB DEFAULT '{}'::jsonb NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- ==============================================================================
-- AUTOMATIC TIMESTAMP TRIGGERS
-- ==============================================================================

DO $$
DECLARE
    t text;
BEGIN
    FOR t IN 
        SELECT table_name 
        FROM information_schema.columns 
        WHERE column_name = 'updated_at' 
          AND table_schema = 'public'
    LOOP
        EXECUTE format('
            DROP TRIGGER IF EXISTS trg_%I_updated_at ON %I;
            CREATE TRIGGER trg_%I_updated_at
            BEFORE UPDATE ON %I
            FOR EACH ROW
            EXECUTE FUNCTION trigger_set_updated_at();
        ', t, t, t, t);
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ==============================================================================
-- INDEXES FOR ENTERPRISE-GRADE PERFORMANCE
-- ==============================================================================

-- 1. User & Identity Indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_active ON users (email) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_users_status ON users (status);
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON profiles (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_devices_user_id ON devices (user_id);

-- 2. Project & Version Indexes
CREATE INDEX IF NOT EXISTS idx_projects_owner_id ON projects (owner_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects (status);
CREATE INDEX IF NOT EXISTS idx_projects_created_at ON projects (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_projects_updated_at ON projects (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_versions_project_id ON project_versions (project_id, version_number DESC);
CREATE INDEX IF NOT EXISTS idx_project_members_project_id ON project_members (project_id);
CREATE INDEX IF NOT EXISTS idx_project_members_user_id ON project_members (user_id);
CREATE INDEX IF NOT EXISTS idx_timeline_documents_project_id ON timeline_documents (project_id);
CREATE INDEX IF NOT EXISTS idx_timeline_versions_timeline_id ON timeline_versions (timeline_id, version_number DESC);
CREATE INDEX IF NOT EXISTS idx_timeline_versions_project_id ON timeline_versions (project_id);

-- 3. Media Asset Indexes
CREATE INDEX IF NOT EXISTS idx_media_assets_user_id ON media_assets (user_id);
CREATE INDEX IF NOT EXISTS idx_media_assets_project_id ON media_assets (project_id);
CREATE INDEX IF NOT EXISTS idx_media_assets_status ON media_assets (status);
CREATE INDEX IF NOT EXISTS idx_media_assets_created_at ON media_assets (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_media_variants_asset_id ON media_variants (asset_id);
CREATE INDEX IF NOT EXISTS idx_media_thumbnails_asset_id ON media_thumbnails (asset_id);
CREATE INDEX IF NOT EXISTS idx_media_proxies_asset_id ON media_proxies (asset_id);

-- 4. Job & Task Indexes
CREATE INDEX IF NOT EXISTS idx_ai_jobs_user_id ON ai_jobs (user_id);
CREATE INDEX IF NOT EXISTS idx_ai_jobs_project_id ON ai_jobs (project_id);
CREATE INDEX IF NOT EXISTS idx_ai_jobs_status ON ai_jobs (status);
CREATE INDEX IF NOT EXISTS idx_ai_jobs_created_at ON ai_jobs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_job_steps_job_id ON ai_job_steps (job_id);
CREATE INDEX IF NOT EXISTS idx_ai_outputs_job_id ON ai_outputs (job_id);

-- 5. Billing & Credit Ledger Indexes
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions (user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions (status);
CREATE INDEX IF NOT EXISTS idx_credits_user_id ON credits (user_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_id ON credit_transactions (user_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_wallet_id ON credit_transactions (credit_wallet_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_created_at ON credit_transactions (created_at DESC);

-- 6. Storage & Creative Catalog Indexes
CREATE INDEX IF NOT EXISTS idx_storage_objects_status ON storage_objects (status);
CREATE INDEX IF NOT EXISTS idx_templates_category ON templates (category);
CREATE INDEX IF NOT EXISTS idx_templates_featured ON templates (is_featured) WHERE is_featured = TRUE;
CREATE INDEX IF NOT EXISTS idx_effects_category ON effects (category);
CREATE INDEX IF NOT EXISTS idx_transitions_category ON transitions (category);
CREATE INDEX IF NOT EXISTS idx_assets_type ON assets (type);
CREATE INDEX IF NOT EXISTS idx_assets_tags ON assets USING GIN (tags);

-- 7. Notifications & Auditing Indexes
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications (user_id, created_at DESC) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at DESC);
