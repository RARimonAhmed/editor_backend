-- ==============================================================================
-- TechXayan Creative - my_editor Enterprise PostgreSQL Schema
-- Migration: 005_creative_assets_templates_presets.sql
-- Subsystems: Creative Asset Library, Templates Platform, Effect Presets, Brand Kit
-- ==============================================================================

-- 1. Creative Assets Table
CREATE TABLE IF NOT EXISTS creative_assets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    version INTEGER DEFAULT 1 NOT NULL,
    type VARCHAR(64) NOT NULL,
    category VARCHAR(64) NOT NULL,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255),
    tags TEXT[] DEFAULT ARRAY[]::TEXT[] NOT NULL,
    thumbnail JSONB NOT NULL DEFAULT '{}'::jsonb,
    preview JSONB NOT NULL DEFAULT '{}'::jsonb,
    storage_key TEXT NOT NULL,
    cdn_url TEXT,
    license_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    compatibility JSONB NOT NULL DEFAULT '{}'::jsonb,
    aspect_ratios TEXT[] DEFAULT ARRAY['all']::TEXT[] NOT NULL,
    supported_platforms TEXT[] DEFAULT ARRAY['all']::TEXT[] NOT NULL,
    status VARCHAR(32) DEFAULT 'draft' NOT NULL,
    is_featured BOOLEAN DEFAULT FALSE NOT NULL,
    created_by VARCHAR(64) NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb NOT NULL,
    version_history JSONB DEFAULT '[]'::jsonb NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_creative_assets_type_status ON creative_assets (type, status);
CREATE INDEX IF NOT EXISTS idx_creative_assets_category ON creative_assets (category);
CREATE INDEX IF NOT EXISTS idx_creative_assets_tags ON creative_assets USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_creative_assets_featured ON creative_assets (is_featured) WHERE is_featured = TRUE;

-- 2. Expand Templates Table
ALTER TABLE templates
    ADD COLUMN IF NOT EXISTS description TEXT,
    ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT ARRAY[]::TEXT[] NOT NULL,
    ADD COLUMN IF NOT EXISTS duration NUMERIC(10,3) DEFAULT 10.0 NOT NULL,
    ADD COLUMN IF NOT EXISTS thumbnail_url TEXT,
    ADD COLUMN IF NOT EXISTS placeholders JSONB DEFAULT '{}'::jsonb NOT NULL,
    ADD COLUMN IF NOT EXISTS color_themes JSONB DEFAULT '[]'::jsonb NOT NULL,
    ADD COLUMN IF NOT EXISTS font_themes JSONB DEFAULT '[]'::jsonb NOT NULL,
    ADD COLUMN IF NOT EXISTS popularity INTEGER DEFAULT 0 NOT NULL,
    ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1 NOT NULL,
    ADD COLUMN IF NOT EXISTS schema_version INTEGER DEFAULT 1 NOT NULL,
    ADD COLUMN IF NOT EXISTS created_by VARCHAR(64);

CREATE INDEX IF NOT EXISTS idx_templates_aspect_ratio ON templates (aspect_ratio);
CREATE INDEX IF NOT EXISTS idx_templates_tags ON templates USING GIN (tags);

-- 3. Template Favorites Table
CREATE TABLE IF NOT EXISTS template_favorites (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    template_id UUID NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    PRIMARY KEY (user_id, template_id)
);

CREATE INDEX IF NOT EXISTS idx_template_favorites_user ON template_favorites (user_id);

-- 4. Effect & Transition Presets Table
CREATE TABLE IF NOT EXISTS effect_presets (
    id VARCHAR(64) PRIMARY KEY,
    version INTEGER DEFAULT 1 NOT NULL,
    name VARCHAR(128) NOT NULL,
    type VARCHAR(64) NOT NULL,
    category VARCHAR(64) NOT NULL,
    renderer VARCHAR(64) NOT NULL,
    parameters_schema JSONB NOT NULL,
    defaults JSONB NOT NULL,
    min_values JSONB NOT NULL,
    max_values JSONB NOT NULL,
    preview JSONB NOT NULL DEFAULT '{}'::jsonb,
    supported_platforms TEXT[] NOT NULL,
    is_premium BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_effect_presets_type ON effect_presets (type);
CREATE INDEX IF NOT EXISTS idx_effect_presets_renderer ON effect_presets (renderer);

-- 5. Brand Kits Table
CREATE TABLE IF NOT EXISTS brand_kits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    name VARCHAR(128) DEFAULT 'Default Brand Kit' NOT NULL,
    logo JSONB DEFAULT '{}'::jsonb NOT NULL,
    colors JSONB DEFAULT '{}'::jsonb NOT NULL,
    fonts JSONB DEFAULT '{}'::jsonb NOT NULL,
    intro JSONB DEFAULT '{}'::jsonb NOT NULL,
    outro JSONB DEFAULT '{}'::jsonb NOT NULL,
    watermark JSONB DEFAULT '{}'::jsonb NOT NULL,
    cta JSONB DEFAULT '{}'::jsonb NOT NULL,
    social_handles JSONB DEFAULT '{}'::jsonb NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_brand_kits_user ON brand_kits (user_id);

-- 6. Social Export Presets Table
CREATE TABLE IF NOT EXISTS social_export_presets (
    id VARCHAR(64) PRIMARY KEY,
    platform VARCHAR(32) NOT NULL,
    name VARCHAR(128) NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    aspect_ratio VARCHAR(16) NOT NULL,
    framerate NUMERIC(5,2) DEFAULT 30.0 NOT NULL,
    video_codec VARCHAR(32) DEFAULT 'h264' NOT NULL,
    bitrate_kbps INTEGER NOT NULL,
    audio_codec VARCHAR(32) DEFAULT 'aac' NOT NULL,
    audio_bitrate_kbps INTEGER DEFAULT 192 NOT NULL,
    safe_area JSONB NOT NULL,
    caption_defaults JSONB NOT NULL,
    thumbnail_rules JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_social_export_presets_platform ON social_export_presets (platform);
