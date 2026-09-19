import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { aiGatewayService } from '../src/modules/ai/ai-gateway.service.js';
import { FakeAIProviderAdapter } from '../src/modules/ai/providers/fake.provider.js';

describe('AI Speech-to-Text & Subtitle Generation Pipeline', () => {
  let app: FastifyInstance;
  let userToken: string;
  let userId: string;
  let otherToken: string;
  let fakeAdapter: FakeAIProviderAdapter;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    // Register User A
    const regResA = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email: `transcribe_lead_${Date.now()}@techxayan.com`,
        password: 'Password123!',
        displayName: 'TechXayan Audio Lead',
      },
    });
    const bodyA = JSON.parse(regResA.body);
    userToken = bodyA.data.tokens.accessToken;
    userId = bodyA.data.user.id;

    // Register User B (for isolation tests)
    const regResB = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email: `transcribe_other_${Date.now()}@techxayan.com`,
        password: 'Password123!',
        displayName: 'Other Creator',
      },
    });
    const bodyB = JSON.parse(regResB.body);
    otherToken = bodyB.data.tokens.accessToken;

    fakeAdapter = aiGatewayService.getAdapter('fake') as FakeAIProviderAdapter;
    fakeAdapter.resetSimulation();
  });

  afterAll(async () => {
    fakeAdapter.resetSimulation();
    await app.close();
  });

  // --------------------------------------------------------------------------
  // 1. END-TO-END TRANSCRIPTION INGESTION & MULTI-MODAL OUTPUT
  // --------------------------------------------------------------------------
  it('POST /v1/ai/transcribe returns transcript, words, timestamps, speakers, SRT, VTT, and caption objects', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/ai/transcribe',
      headers: { authorization: `Bearer ${userToken}` },
      payload: {
        mediaUrl: 'https://assets.techxayan.com/samples/video-interview.mp4',
        language: 'en',
        speakerDiarization: true,
        captionStyle: 'karaoke',
        provider: 'fake',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);

    const data = body.data;
    expect(data.id).toBeTypeOf('string');
    expect(data.transcript).toBeDefined();
    expect(data.transcript.length).toBeGreaterThan(0);
    expect(data.fullText).toBe(data.transcript);

    // Words with timings
    expect(Array.isArray(data.words)).toBe(true);
    expect(data.words.length).toBeGreaterThan(0);
    const firstWord = data.words[0];
    expect(firstWord).toHaveProperty('word');
    expect(firstWord).toHaveProperty('start');
    expect(firstWord).toHaveProperty('end');
    expect(firstWord).toHaveProperty('confidence');
    expect(firstWord).toHaveProperty('speakerId');
    expect(firstWord.start).toBeLessThan(firstWord.end);

    // Speakers with diarization
    expect(Array.isArray(data.speakers)).toBe(true);
    expect(data.speakers.length).toBeGreaterThanOrEqual(2);
    expect(data.speakers[0]).toHaveProperty('id');
    expect(data.speakers[0]).toHaveProperty('name');
    expect(data.speakers[0]).toHaveProperty('color');

    // Segments
    expect(Array.isArray(data.segments)).toBe(true);
    expect(data.segments.length).toBeGreaterThan(0);
    expect(data.segments[0]).toHaveProperty('speakerName');

    // Subtitle text formats
    expect(data.srt).toBeDefined();
    expect(data.srt).toContain('-->');
    expect(data.vtt).toBeDefined();
    expect(data.vtt).toContain('WEBVTT');

    // Real timeline Caption objects
    expect(Array.isArray(data.captionObjects)).toBe(true);
    expect(data.captionObjects.length).toBeGreaterThan(0);
    const firstCaption = data.captionObjects[0];
    expect(firstCaption).toHaveProperty('id');
    expect(firstCaption).toHaveProperty('trackId');
    expect(firstCaption.start).toBeGreaterThanOrEqual(0);
    expect(firstCaption.duration).toBeGreaterThan(0);
    expect(firstCaption.text).toBeDefined();
    expect(firstCaption.style).toBeDefined();
    expect(firstCaption.style.fontFamily).toBe('Inter');
    expect(firstCaption.style.fontSize).toBe(48);
    expect(firstCaption.style.animation).toBe('karaoke');
    expect(firstCaption.style.activeWordColor).toBe('#FACC15');
    expect(firstCaption.transform).toBeDefined();
    expect(firstCaption.transform.opacity).toBe(1);
  });

  // --------------------------------------------------------------------------
  // 2. DOCUMENT RETRIEVAL VIA GET /v1/ai/transcriptions/:id
  // --------------------------------------------------------------------------
  it('GET /v1/ai/transcriptions/:id returns the complete persisted transcription document', async () => {
    // 1. Create a transcription
    const createRes = await app.inject({
      method: 'POST',
      url: '/v1/ai/transcribe',
      headers: { authorization: `Bearer ${userToken}` },
      payload: {
        mediaUrl: 'https://assets.techxayan.com/samples/podcast.mp3',
        language: 'en',
        provider: 'fake',
      },
    });
    const docId = JSON.parse(createRes.body).data.id;

    // 2. Retrieve document
    const getRes = await app.inject({
      method: 'GET',
      url: `/v1/ai/transcriptions/${docId}`,
      headers: { authorization: `Bearer ${userToken}` },
    });

    expect(getRes.statusCode).toBe(200);
    const body = JSON.parse(getRes.body);
    expect(body.success).toBe(true);
    const doc = body.data.transcription;
    expect(doc.id).toBe(docId);
    expect(doc.userId).toBe(userId);
    expect(doc.words.length).toBeGreaterThan(0);
    expect(doc.speakers.length).toBeGreaterThan(0);
    expect(doc.captionObjects.length).toBeGreaterThan(0);
  });

  // --------------------------------------------------------------------------
  // 3. RAW SRT FORMATTED EXPORT
  // --------------------------------------------------------------------------
  it('GET /v1/ai/transcriptions/:id/srt streams raw SubRip text format', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/v1/ai/transcribe',
      headers: { authorization: `Bearer ${userToken}` },
      payload: {
        mediaUrl: 'https://assets.techxayan.com/samples/keynote.mp3',
        provider: 'fake',
      },
    });
    const docId = JSON.parse(createRes.body).data.id;

    const srtRes = await app.inject({
      method: 'GET',
      url: `/v1/ai/transcriptions/${docId}/srt`,
      headers: { authorization: `Bearer ${userToken}` },
    });

    expect(srtRes.statusCode).toBe(200);
    expect(srtRes.headers['content-type']).toContain('application/x-subrip');
    expect(srtRes.headers['content-disposition']).toContain(`transcription-${docId}.srt`);

    const rawSrt = srtRes.body;
    expect(rawSrt).toContain('1\n');
    expect(rawSrt).toContain('00:00:00,000 --> 00:00:03,100');
    expect(rawSrt).toContain('[Speaker 1] Welcome to TechXayan Creative video editor.');
    expect(rawSrt).toContain('2\n');
    expect(rawSrt).toContain('00:00:03,300 --> 00:00:06,400');
    expect(rawSrt).toContain('[Speaker 2] Empowering creators on Windows and Android.');
  });

  // --------------------------------------------------------------------------
  // 4. RAW WEBVTT (.vtt) FORMATTED EXPORT
  // --------------------------------------------------------------------------
  it('GET /v1/ai/transcriptions/:id/vtt streams raw WebVTT format', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/v1/ai/transcribe',
      headers: { authorization: `Bearer ${userToken}` },
      payload: {
        mediaUrl: 'https://assets.techxayan.com/samples/keynote.mp3',
        provider: 'fake',
      },
    });
    const docId = JSON.parse(createRes.body).data.id;

    const vttRes = await app.inject({
      method: 'GET',
      url: `/v1/ai/transcriptions/${docId}/vtt`,
      headers: { authorization: `Bearer ${userToken}` },
    });

    expect(vttRes.statusCode).toBe(200);
    expect(vttRes.headers['content-type']).toContain('text/vtt');
    expect(vttRes.headers['content-disposition']).toContain(`transcription-${docId}.vtt`);

    const rawVtt = vttRes.body;
    expect(rawVtt.startsWith('WEBVTT')).toBe(true);
    expect(rawVtt).toContain('00:00:00.000 --> 00:00:03.100');
    expect(rawVtt).toContain('<v Speaker 1>Welcome to TechXayan Creative video editor.');
    expect(rawVtt).toContain('00:00:03.300 --> 00:00:06.400');
    expect(rawVtt).toContain('<v Speaker 2>Empowering creators on Windows and Android.');
  });

  // --------------------------------------------------------------------------
  // 5. CAPTION STYLING OPTIONS (MINIMAL VS DYNAMIC)
  // --------------------------------------------------------------------------
  it('supports captionStyle styling variations for timeline Caption objects', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/ai/transcribe',
      headers: { authorization: `Bearer ${userToken}` },
      payload: {
        mediaUrl: 'https://assets.techxayan.com/samples/short.mp3',
        captionStyle: 'minimal',
        provider: 'fake',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const caption = body.data.captionObjects[0];
    expect(caption.style.animation).toBe('minimal');
    expect(caption.style.backgroundColor).toBe('transparent');
    expect(caption.style.fontSize).toBe(36);
  });

  // --------------------------------------------------------------------------
  // 6. ACCESS CONTROL & CROSS-TENANT PRIVACY
  // --------------------------------------------------------------------------
  it('prevents unauthorized users from accessing another user’s transcription', async () => {
    // User A creates transcription
    const createRes = await app.inject({
      method: 'POST',
      url: '/v1/ai/transcribe',
      headers: { authorization: `Bearer ${userToken}` },
      payload: {
        mediaUrl: 'https://assets.techxayan.com/samples/private-recording.mp3',
        provider: 'fake',
      },
    });
    const docId = JSON.parse(createRes.body).data.id;

    // User B attempts to access JSON document
    const getRes = await app.inject({
      method: 'GET',
      url: `/v1/ai/transcriptions/${docId}`,
      headers: { authorization: `Bearer ${otherToken}` },
    });
    expect(getRes.statusCode).toBe(403);

    // User B attempts to download SRT
    const srtRes = await app.inject({
      method: 'GET',
      url: `/v1/ai/transcriptions/${docId}/srt`,
      headers: { authorization: `Bearer ${otherToken}` },
    });
    expect(srtRes.statusCode).toBe(403);
  });

  // --------------------------------------------------------------------------
  // 7. INPUT VALIDATION
  // --------------------------------------------------------------------------
  it('returns 400 Validation Error when no media source is provided', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/ai/transcribe',
      headers: { authorization: `Bearer ${userToken}` },
      payload: {
        language: 'en',
      },
    });

    expect(res.statusCode).toBe(400);
  });
});
