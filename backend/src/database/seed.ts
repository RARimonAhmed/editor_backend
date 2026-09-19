import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { db } from './client.js';
import { logger } from '../core/logger.js';

export async function runSeeds() {
  logger.info('🌱 Starting comprehensive database seeding...');

  const isHealthy = await db.isHealthy();
  if (!isHealthy) {
    logger.warn('⚠️  Database is offline or running mock driver. Skipping persistent SQL seed execution.');
    return;
  }

  try {
    const passwordHash = await bcrypt.hash('Password123!', 10);

    // 1. Seed Subscription Plans
    logger.info('Seeding subscription plans...');
    const plans = [
      {
        id: uuidv4(),
        code: 'free',
        name: 'Free Creator',
        priceMonthly: 0,
        priceAnnual: 0,
        credits: 50,
        res: '1080p',
        storage: 2147483648, // 2GB
      },
      {
        id: uuidv4(),
        code: 'pro',
        name: 'Pro Editor',
        priceMonthly: 1900, // $19.00
        priceAnnual: 19000, // $190.00
        credits: 500,
        res: '4k',
        storage: 53687091200, // 50GB
      },
      {
        id: uuidv4(),
        code: 'studio',
        name: 'Studio Team',
        priceMonthly: 4900, // $49.00
        priceAnnual: 49000, // $490.00
        credits: 2000,
        res: '8k',
        storage: 536870912000, // 500GB
      },
    ];

    for (const plan of plans) {
      await db.query(
        `INSERT INTO plans (id, code, name, price_cents_monthly, price_cents_annual, monthly_credits, max_resolution, max_storage_bytes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (code) DO UPDATE SET
           name = EXCLUDED.name,
           price_cents_monthly = EXCLUDED.price_cents_monthly,
           monthly_credits = EXCLUDED.monthly_credits;`,
        [plan.id, plan.code, plan.name, plan.priceMonthly, plan.priceAnnual, plan.credits, plan.res, plan.storage]
      );
    }

    // Get pro plan ID
    const proPlanRes = await db.query<{ id: string }>('SELECT id FROM plans WHERE code = $1 LIMIT 1;', ['pro']);
    const proPlanId = proPlanRes.rows[0]?.id;

    // 2. Seed Creator User
    logger.info('Seeding creator user and profile...');
    const userRes = await db.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, role, status, email_verified_at)
       VALUES ($1, $2, 'pro', 'active', CURRENT_TIMESTAMP)
       ON CONFLICT (email) DO UPDATE SET role = 'pro'
       RETURNING id;`,
      ['creator@techxayan.com', passwordHash]
    );
    const userId = userRes.rows[0]?.id;

    if (userId) {
      // 3. Seed Profile
      await db.query(
        `INSERT INTO profiles (user_id, display_name, avatar_url, bio, timezone, preferences)
         VALUES ($1, $2, $3, $4, 'America/New_York', $5)
         ON CONFLICT (user_id) DO UPDATE SET display_name = EXCLUDED.display_name;`,
        [
          userId,
          'TechXayan Pro Creator',
          'https://storage.mock.local/avatars/creator.png',
          'Cinematographer, video editor and motion designer using my_editor.',
          JSON.stringify({
            theme: 'dark',
            autoSaveIntervalSeconds: 30,
            hardwareAcceleration: true,
            defaultFps: 60,
          }),
        ]
      );

      // 4. Seed Devices
      await db.query(
        `INSERT INTO devices (user_id, device_fingerprint, device_type, device_name, os_version, app_version)
         VALUES ($1, 'win-desktop-device-01', 'windows', 'Main Studio PC (RTX 4090)', 'Windows 11 Pro 23H2', '1.0.0'),
                ($1, 'android-tablet-device-02', 'android', 'Samsung Galaxy Tab S9 Ultra', 'Android 14', '1.0.0')
         ON CONFLICT (user_id, device_fingerprint) DO UPDATE SET last_active_at = CURRENT_TIMESTAMP;`,
        [userId]
      );

      // 5. Seed Subscription
      if (proPlanId) {
        await db.query(
          `INSERT INTO subscriptions (user_id, plan_id, status)
           VALUES ($1, $2, 'active')
           ON CONFLICT (user_id) DO UPDATE SET plan_id = EXCLUDED.plan_id;`,
          [userId, proPlanId]
        );
      }

      // 6. Seed Credit Wallet & Transactions
      const walletRes = await db.query<{ id: string }>(
        `INSERT INTO credits (user_id, balance, lifetime_granted)
         VALUES ($1, 500, 500)
         ON CONFLICT (user_id) DO UPDATE SET balance = 500
         RETURNING id;`,
        [userId]
      );
      const walletId = walletRes.rows[0]?.id;

      if (walletId) {
        await db.query(
          `INSERT INTO credit_transactions (credit_wallet_id, user_id, amount, balance_after, type, description)
           VALUES ($1, $2, 500, 500, 'plan_renewal', 'Monthly Pro Tier Credit Allocation')
           ON CONFLICT DO NOTHING;`,
          [walletId, userId]
        );
      }

      // 7. Seed Sample Storage Objects
      const storageObjId = uuidv4();
      await db.query(
        `INSERT INTO storage_objects (id, bucket, key, driver, size_bytes, mime_type, is_public, status)
         VALUES ($1, 'my-editor-assets', 'demo/cinematic_drone_4k.mp4', 's3', 157286400, 'video/mp4', true, 'available')
         ON CONFLICT (bucket, key) DO NOTHING;`,
        [storageObjId]
      );

      // 8. Seed Media Asset with Metadata, Thumbnail, Waveform, and Proxy
      const assetId = uuidv4();
      await db.query(
        `INSERT INTO media_assets (id, user_id, storage_object_id, name, original_filename, mime_type, file_size_bytes, duration_seconds, width, height, framerate, status)
         VALUES ($1, $2, $3, 'Cinematic Drone 4K', 'DJI_0042_4K.MP4', 'video/mp4', 157286400, 30.000, 3840, 2160, 59.940, 'ready')
         ON CONFLICT DO NOTHING;`,
        [assetId, userId, storageObjId]
      );

      await db.query(
        `INSERT INTO media_metadata (asset_id, codec_long_name, pixel_format, bit_depth, color_primaries, has_alpha_channel, metadata_raw)
         VALUES ($1, 'H.264 / AVC / MPEG-4 AVC', 'yuv420p', 8, 'bt709', false, $2)
         ON CONFLICT (asset_id) DO NOTHING;`,
        [assetId, JSON.stringify({ encoder: 'DJI Air 3', bitrate: '120Mbps' })]
      );

      await db.query(
        `INSERT INTO media_waveforms (asset_id, peaks_data, channels)
         VALUES ($1, $2, 2)
         ON CONFLICT (asset_id) DO NOTHING;`,
        [assetId, JSON.stringify([0.12, -0.15, 0.45, -0.42, 0.88, -0.85, 0.32, -0.28])]
      );

      // 9. Seed Video Project with Strict Versioning (version 1 and version 2)
      logger.info('Seeding project with strictly versioned timeline documents and history...');
      const projectId = uuidv4();
      const timelineDocId = uuidv4();
      const version1Id = uuidv4();
      const version2Id = uuidv4();

      // Create Project anchor
      await db.query(
        `INSERT INTO projects (id, owner_id, title, resolution_width, resolution_height, framerate, aspect_ratio, version_number, status)
         VALUES ($1, $2, 'Cinematic Showcase 4K', 3840, 2160, 60.000, '16:9', 2, 'active')
         ON CONFLICT DO NOTHING;`,
        [projectId, userId]
      );

      // Create Timeline Document anchor
      await db.query(
        `INSERT INTO timeline_documents (id, project_id, duration_seconds, framerate, tracks_count, version_counter)
         VALUES ($1, $2, 30.000, 60.000, 3, 2)
         ON CONFLICT (project_id) DO NOTHING;`,
        [timelineDocId, projectId]
      );

      // Timeline Version 1 (Initial rough cut)
      const v1Tracks = [
        {
          id: 'track-v1',
          type: 'video',
          name: 'Main 4K Video',
          clips: [{ id: 'clip-1', name: 'DJI_0042_4K.MP4', start: 0, duration: 15.0, sourceStart: 0 }],
        },
      ];
      await db.query(
        `INSERT INTO timeline_versions (id, timeline_id, project_id, version_number, author_id, mutation_type, tracks_state)
         VALUES ($1, $2, $3, 1, $4, 'initial', $5)
         ON CONFLICT (timeline_id, version_number) DO NOTHING;`,
        [version1Id, timelineDocId, projectId, userId, JSON.stringify(v1Tracks)]
      );

      // Timeline Version 2 (Multi-track with audio & titles - NEVER OVERWRITING V1)
      const v2Tracks = [
        {
          id: 'track-v1',
          type: 'video',
          name: 'Main 4K Video',
          clips: [
            { id: 'clip-1', name: 'DJI_0042_4K.MP4', start: 0, duration: 15.0, sourceStart: 0 },
            { id: 'clip-2', name: 'Sunset_Broll.MP4', start: 15.0, duration: 15.0, sourceStart: 2.0 },
          ],
        },
        {
          id: 'track-a1',
          type: 'audio',
          name: 'Cyberpunk Synthwave Beat',
          clips: [{ id: 'clip-a1', name: 'Synth_Master.mp3', start: 0, duration: 30.0, volume: 0.85 }],
        },
        {
          id: 'track-t1',
          type: 'text',
          name: 'Dynamic Title',
          clips: [{ id: 'clip-t1', name: 'TechXayan Creative', start: 1.0, duration: 4.0, style: { font: 'Outfit', size: 64 } }],
        },
      ];
      await db.query(
        `INSERT INTO timeline_versions (id, timeline_id, project_id, version_number, author_id, mutation_type, tracks_state)
         VALUES ($1, $2, $3, 2, $4, 'clip_add', $5)
         ON CONFLICT (timeline_id, version_number) DO NOTHING;`,
        [version2Id, timelineDocId, projectId, userId, JSON.stringify(v2Tracks)]
      );

      // Project Versions (Snapshots)
      await db.query(
        `INSERT INTO project_versions (project_id, version_number, created_by, change_summary, snapshot_data, timeline_version_id)
         VALUES ($1, 1, $2, 'Initial 4K timeline setup', $3, $4),
                ($1, 2, $2, 'Added B-roll track, synthwave audio and animated title', $5, $6)
         ON CONFLICT (project_id, version_number) DO NOTHING;`,
        [
          projectId,
          userId,
          JSON.stringify({ title: 'Cinematic Showcase 4K', tracks: 1 }),
          version1Id,
          JSON.stringify({ title: 'Cinematic Showcase 4K', tracks: 3 }),
          version2Id,
        ]
      );

      // Point active version pointers
      await db.query(
        'UPDATE timeline_documents SET active_version_id = $1 WHERE id = $2;',
        [version2Id, timelineDocId]
      );
    }

    // 10. Seed Creative Catalog (Effects, Transitions, Fonts)
    logger.info('Seeding creative catalog (effects, transitions, fonts)...');
    await db.query(`
      INSERT INTO effects (name, code, category, parameters_schema, is_premium)
      VALUES 
        ('Cyberpunk Neon LUT', 'fx_cyberpunk_lut', 'lut', '{"intensity": {"type": "number", "default": 0.8, "min": 0, "max": 1}}'::jsonb, true),
        ('Gaussian Blur', 'fx_gaussian_blur', 'blur', '{"radius": {"type": "number", "default": 10, "min": 0, "max": 100}}'::jsonb, false),
        ('Cinematic 35mm Grain', 'fx_film_grain_35mm', 'color_grade', '{"roughness": {"type": "number", "default": 0.3}}'::jsonb, false)
      ON CONFLICT (code) DO NOTHING;
    `);

    await db.query(`
      INSERT INTO transitions (name, code, category, default_duration_seconds, parameters_schema, is_premium)
      VALUES 
        ('Cross Dissolve', 'trans_cross_dissolve', 'fade', 0.500, '{"curve": {"type": "string", "default": "linear"}}'::jsonb, false),
        ('Whip Pan Right', 'trans_whip_pan_right', 'whip_pan', 0.350, '{"motion_blur": {"type": "boolean", "default": true}}'::jsonb, true),
        ('Glitch Slice Wipe', 'trans_glitch_wipe', 'glitch', 0.400, '{"rgb_split": {"type": "number", "default": 15}}'::jsonb, true)
      ON CONFLICT (code) DO NOTHING;
    `);

    await db.query(`
      INSERT INTO fonts (family_name, sub_family, format, license, is_system)
      VALUES 
        ('Outfit', 'Bold', 'woff2', 'OFL', true),
        ('Inter', 'Regular', 'woff2', 'OFL', true),
        ('Cinzel', 'Decorative', 'woff2', 'OFL', true)
      ON CONFLICT (family_name, sub_family) DO NOTHING;
    `);

    logger.info('✅ Comprehensive database seeding completed successfully!');
  } catch (error) {
    logger.error({ error }, '❌ Database seeding execution failed');
    throw error;
  }
}

if (process.argv[1] && process.argv[1].endsWith('seed.ts')) {
  runSeeds()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
