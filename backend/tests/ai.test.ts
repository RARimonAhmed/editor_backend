import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';

describe('AI Video Services Module', () => {
  let app: FastifyInstance;
  let authToken: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    // Register a test user
    const regRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: `ai_${Date.now()}@techxayan.com`,
        password: 'Password123!',
        displayName: 'AI Tester',
      },
    });

    const body = JSON.parse(regRes.body);
    authToken = body.data.tokens.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /api/v1/ai/transcribe generates transcription with word timestamps', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/ai/transcribe',
      headers: { Authorization: `Bearer ${authToken}` },
      payload: {
        mediaUrl: 'https://storage.mock.local/test-audio.mp3',
        language: 'en',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.segments).toBeInstanceOf(Array);
    expect(body.data.segments.length).toBeGreaterThan(0);
    expect(body.data.fullText).toBeDefined();
  });

  it('POST /api/v1/ai/captions generates dynamic subtitles for timeline', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/ai/captions',
      headers: { Authorization: `Bearer ${authToken}` },
      payload: {
        mediaUrl: 'https://storage.mock.local/test-video.mp4',
        style: 'cinematic-glow',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data).toBeInstanceOf(Array);
  });

  it('POST /api/v1/ai/smart-cut identifies silence intervals for jump cuts', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/ai/smart-cut',
      headers: { Authorization: `Bearer ${authToken}` },
      payload: {
        mediaUrl: 'https://storage.mock.local/voiceover.wav',
        minSilenceDurationSeconds: 0.5,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.silenceIntervals).toBeDefined();
    expect(body.data.savedTimeSeconds).toBeGreaterThan(0);
  });
});
