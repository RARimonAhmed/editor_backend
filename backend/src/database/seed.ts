import bcrypt from 'bcryptjs';
import { db } from './client.js';
import { logger } from '../core/logger.js';

export async function runSeeds() {
  logger.info('Starting database seeding...');

  const isHealthy = await db.isHealthy();
  if (!isHealthy) {
    logger.warn('Database is offline or running mock driver. Skipping persistent SQL seed execution.');
    return;
  }

  try {
    const passwordHash = await bcrypt.hash('Password123!', 10);

    // 1. Seed demo creator
    const userRes = await db.query(
      `INSERT INTO users (email, password_hash, display_name, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name
       RETURNING id;`,
      ['creator@techxayan.com', passwordHash, 'TechXayan Creator', 'pro']
    );

    const userId = userRes.rows[0]?.id;

    if (userId) {
      // 2. Seed subscription
      await db.query(
        `INSERT INTO subscriptions (user_id, tier, status)
         VALUES ($1, 'pro', 'active')
         ON CONFLICT (user_id) DO NOTHING;`,
        [userId]
      );

      // 3. Seed credit wallet
      const walletRes = await db.query(
        `INSERT INTO credit_wallets (user_id, balance)
         VALUES ($1, 500)
         ON CONFLICT (user_id) DO UPDATE SET balance = 500
         RETURNING id;`,
        [userId]
      );

      const walletId = walletRes.rows[0]?.id;

      if (walletId) {
        await db.query(
          `INSERT INTO credit_transactions (wallet_id, user_id, amount, type, description)
           VALUES ($1, $2, 500, 'subscription_grant', 'Pro Plan Monthly Credit Grant')
           ON CONFLICT DO NOTHING;`,
          [walletId, userId]
        );
      }

      // 4. Seed demo video project
      const sampleTimeline = {
        duration: 30.0,
        framerate: 30.0,
        tracks: [
          {
            id: 'track-v1',
            type: 'video',
            name: 'Main Video',
            clips: [
              {
                id: 'clip-1',
                name: 'Drone Shot 4K.mp4',
                start: 0,
                duration: 12.5,
                sourceStart: 0,
                speed: 1.0,
                volume: 1.0,
              },
              {
                id: 'clip-2',
                name: 'Urban Sunset.mp4',
                start: 12.5,
                duration: 17.5,
                sourceStart: 2.0,
                speed: 1.0,
                volume: 1.0,
              },
            ],
          },
          {
            id: 'track-a1',
            type: 'audio',
            name: 'Background Music',
            clips: [
              {
                id: 'clip-a1',
                name: 'Cyberpunk Synthwave Beat.mp3',
                start: 0,
                duration: 30.0,
                sourceStart: 0,
                volume: 0.8,
              },
            ],
          },
          {
            id: 'track-t1',
            type: 'text',
            name: 'Titles & Captions',
            clips: [
              {
                id: 'clip-t1',
                name: 'TechXayan Creative - my_editor',
                start: 1.0,
                duration: 4.0,
                style: { fontSize: 48, color: '#ffffff', animation: 'fade-in' },
              },
            ],
          },
        ],
        markers: [{ time: 12.5, label: 'Beat Drop' }],
      };

      await db.query(
        `INSERT INTO projects (user_id, title, resolution_width, resolution_height, framerate, timeline_data)
         VALUES ($1, $2, 1920, 1080, 30.00, $3);`,
        [userId, 'Cinematic Demo Showcase', JSON.stringify(sampleTimeline)]
      );
    }

    logger.info('✅ Database seeding finished successfully');
  } catch (error) {
    logger.error({ error }, '❌ Database seeding failed');
    throw error;
  }
}

if (process.argv[1] && process.argv[1].endsWith('seed.ts')) {
  runSeeds()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
