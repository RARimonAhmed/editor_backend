import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { aiGatewayService } from '../src/modules/ai/ai-gateway.service.js';
import { FakeAIProviderAdapter } from '../src/modules/ai/providers/fake.provider.js';

describe('Provider-Agnostic AI Gateway Subsystem', () => {
  let app: FastifyInstance;
  let authToken: string;
  let testUserId: string;
  let fakeAdapter: FakeAIProviderAdapter;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    // Register a test user with initial credits
    const regRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email: `gateway_lead_${Date.now()}@techxayan.com`,
        password: 'Password123!',
        displayName: 'TechXayan AI Lead',
      },
    });

    const body = JSON.parse(regRes.body);
    authToken = body.data.tokens.accessToken;
    testUserId = body.data.user.id;

    fakeAdapter = aiGatewayService.getAdapter('fake') as FakeAIProviderAdapter;
    fakeAdapter.resetSimulation();
  });

  afterAll(async () => {
    fakeAdapter.resetSimulation();
    await app.close();
  });

  // --------------------------------------------------------------------------
  // 1. PROVIDER DISCOVERY (WITHOUT SECRETS LEAKAGE)
  // --------------------------------------------------------------------------
  it('GET /v1/ai/providers lists active server providers without leaking secrets', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/ai/providers',
      headers: { Authorization: `Bearer ${authToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data).toBeInstanceOf(Array);

    const providerIds = body.data.map((p: any) => p.id);
    expect(providerIds).toContain('fake');
    expect(providerIds).toContain('mock');
    expect(providerIds).toContain('gemini');
    expect(providerIds).toContain('openai');

    // Verify no secret keys are exposed
    const stringified = JSON.stringify(body.data);
    expect(stringified).not.toContain('apiKey');
    expect(stringified).not.toContain('secret');
  });

  // --------------------------------------------------------------------------
  // 2. TEXT GENERATION
  // --------------------------------------------------------------------------
  it('POST /v1/ai/text performs normalized text generation with model selection', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/ai/text',
      headers: { Authorization: `Bearer ${authToken}` },
      payload: {
        prompt: 'Create a dynamic 30-second video script for a tech commercial',
        provider: 'fake',
        model: 'fake-gpt-4o-custom',
        temperature: 0.7,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.text).toContain('fake-gpt-4o-custom');
    expect(body.data.finishReason).toBe('stop');
    expect(body.data.gateway).toBeDefined();
    expect(body.data.gateway.provider).toBe('fake');
    expect(body.data.gateway.model).toBe('fake-gpt-4o-custom');
    expect(body.data.gateway.usage.totalTokens).toBeGreaterThan(0);
    expect(body.data.gateway.usage.estimatedCostCredits).toBe(1);
  });

  // --------------------------------------------------------------------------
  // 3. STRUCTURED JSON GENERATION
  // --------------------------------------------------------------------------
  it('POST /v1/ai/structured-json generates schema-enforced structured JSON', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/ai/structured-json',
      headers: { Authorization: `Bearer ${authToken}` },
      payload: {
        prompt: 'Analyze video pacing and color grading',
        provider: 'fake',
        schema: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            recommendedColorGrade: { type: 'string' },
          },
        },
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.data).toBeDefined();
    expect(body.data.data.title).toBe('Cinematic Teaser');
    expect(body.data.data.recommendedColorGrade).toBe('teal_and_orange');
    expect(body.data.rawJson).toBeDefined();
  });

  // --------------------------------------------------------------------------
  // 4. SPEECH-TO-TEXT WITH WORD-LEVEL TIMESTAMPS
  // --------------------------------------------------------------------------
  it('POST /v1/ai/speech-to-text transcribes speech with word-level timestamps', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/ai/speech-to-text',
      headers: { Authorization: `Bearer ${authToken}` },
      payload: {
        audioUrl: 'https://mock-storage.local/interview_dialogue.wav',
        language: 'en',
        provider: 'fake',
        wordTimestamps: true,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.text).toContain('Welcome to TechXayan Creative');
    expect(body.data.segments).toBeInstanceOf(Array);
    expect(body.data.segments[0].words).toBeInstanceOf(Array);
    expect(body.data.durationSeconds).toBeGreaterThan(0);
    expect(body.data.gateway.usage.audioDurationSeconds).toBe(6.4);
  });

  // --------------------------------------------------------------------------
  // 5. TEXT-TO-SPEECH VOICE SYNTHESIS
  // --------------------------------------------------------------------------
  it('POST /v1/ai/text-to-speech synthesizes natural voiceover', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/ai/text-to-speech',
      headers: { Authorization: `Bearer ${authToken}` },
      payload: {
        text: 'Experience next-generation mobile and desktop video editing.',
        voiceGender: 'female',
        speed: 1.1,
        format: 'mp3',
        provider: 'fake',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.audioUrl).toContain('.mp3');
    expect(body.data.characterCount).toBeGreaterThan(0);
    expect(body.data.gateway.usage.characterCount).toBeGreaterThan(0);
  });

  // --------------------------------------------------------------------------
  // 6. IMAGE GENERATION
  // --------------------------------------------------------------------------
  it('POST /v1/ai/image generates visuals from prompt', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/ai/image',
      headers: { Authorization: `Bearer ${authToken}` },
      payload: {
        prompt: 'Futuristic neon cyberpunk timeline editor workstation',
        aspectRatio: '16:9',
        count: 2,
        provider: 'fake',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.images).toHaveLength(2);
    expect(body.data.images[0].url).toBeDefined();
    expect(body.data.gateway.usage.imageCount).toBe(2);
  });

  // --------------------------------------------------------------------------
  // 7. VIDEO GENERATION (B-ROLL)
  // --------------------------------------------------------------------------
  it('POST /v1/ai/video generates synthetic video B-roll', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/ai/video',
      headers: { Authorization: `Bearer ${authToken}` },
      payload: {
        prompt: 'Drone shot over mountain river at golden hour',
        durationSeconds: 5,
        resolution: '1080p',
        fps: 60,
        provider: 'fake',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.videoUrl).toContain('.mp4');
    expect(body.data.resolution).toBe('1080p');
    expect(body.data.fps).toBe(60);
    expect(body.data.gateway.usage.videoDurationSeconds).toBe(5);
  });

  // --------------------------------------------------------------------------
  // 8. EMBEDDING GENERATION
  // --------------------------------------------------------------------------
  it('POST /v1/ai/embedding generates vector embeddings for semantic search', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/ai/embedding',
      headers: { Authorization: `Bearer ${authToken}` },
      payload: {
        input: ['cyberpunk color palette', 'warm golden hour grading'],
        dimensions: 512,
        provider: 'fake',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.embeddings).toHaveLength(2);
    expect(body.data.dimensions).toBe(512);
  });

  // --------------------------------------------------------------------------
  // 9. MULTIMODAL VISION ANALYSIS
  // --------------------------------------------------------------------------
  it('POST /v1/ai/vision analyzes video frames and visual objects', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/ai/vision',
      headers: { Authorization: `Bearer ${authToken}` },
      payload: {
        images: [
          {
            url: 'https://mock-storage.local/keyframes/frame_01.jpg',
            mimeType: 'image/jpeg',
          },
        ],
        prompt: 'Describe lighting and identify key subject bounding boxes',
        provider: 'fake',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.text).toBeDefined();
    expect(body.data.labels).toBeInstanceOf(Array);
    expect(body.data.objects).toBeInstanceOf(Array);
    expect(body.data.objects[0].box).toBeDefined();
  });

  // --------------------------------------------------------------------------
  // 10. AUDIO ANALYSIS & SMART CUTS
  // --------------------------------------------------------------------------
  it('POST /v1/ai/audio-analysis identifies dead air silences and beats', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/ai/audio-analysis',
      headers: { Authorization: `Bearer ${authToken}` },
      payload: {
        audioUrl: 'https://mock-storage.local/podcast_track.wav',
        minSilenceSeconds: 0.5,
        detectBeats: true,
        provider: 'fake',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.silences).toBeInstanceOf(Array);
    expect(body.data.recommendedCuts).toBeInstanceOf(Array);
    expect(body.data.beatsBpm).toBe(120);
  });

  // --------------------------------------------------------------------------
  // 11. ANTI-SSRF / ARBITRARY URL REJECTION
  // --------------------------------------------------------------------------
  it('Strictly rejects arbitrary user-supplied provider URLs', async () => {
    const maliciousUrls = [
      'http://169.254.169.254/latest/meta-data',
      'https://malicious-ai-proxy.attacker.com',
      'http://localhost:9000',
      'ftp://fileserver/ai',
    ];

    for (const url of maliciousUrls) {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/ai/text',
        headers: { Authorization: `Bearer ${authToken}` },
        payload: {
          prompt: 'Test SSRF injection',
          provider: url,
        },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(false);
      expect(body.error.message).toContain('forbidden');
    }
  });

  // --------------------------------------------------------------------------
  // 12. TIMEOUT ENFORCEMENT
  // --------------------------------------------------------------------------
  it('Enforces timeout limits and returns HTTP 504 on provider delays', async () => {
    fakeAdapter.simulateFailure = 'timeout';

    const res = await app.inject({
      method: 'POST',
      url: '/v1/ai/text',
      headers: { Authorization: `Bearer ${authToken}` },
      payload: {
        prompt: 'Trigger timeout',
        provider: 'fake',
        timeoutMs: 50, // 50ms timeout
      },
    });

    fakeAdapter.resetSimulation();

    expect(res.statusCode).toBe(504);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('AI_TIMEOUT');
  });

  // --------------------------------------------------------------------------
  // 13. AUTOMATIC RETRIES WITH EXPONENTIAL BACKOFF
  // --------------------------------------------------------------------------
  it('Retries transient failures automatically and succeeds', async () => {
    fakeAdapter.simulateFailure = 'server_error';
    fakeAdapter.maxFailuresBeforeSuccess = 1; // Fail 1 time, succeed on attempt 2

    const res = await app.inject({
      method: 'POST',
      url: '/v1/ai/text',
      headers: { Authorization: `Bearer ${authToken}` },
      payload: {
        prompt: 'Test automatic retry recovery',
        provider: 'fake',
      },
    });

    fakeAdapter.resetSimulation();

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.text).toBeDefined();
  });

  // --------------------------------------------------------------------------
  // 14. FALLBACK PROVIDER ORCHESTRATION
  // --------------------------------------------------------------------------
  it('Seamlessly executes fallback provider when primary provider fails', async () => {
    // Primary provider 'fake' will fail with rate limit
    fakeAdapter.simulateFailure = 'rate_limit';

    const res = await app.inject({
      method: 'POST',
      url: '/v1/ai/text',
      headers: { Authorization: `Bearer ${authToken}` },
      payload: {
        prompt: 'Script outline with fallback',
        provider: 'fake',
        fallbackProvider: 'mock', // Fallback to 'mock'
      },
    });

    fakeAdapter.resetSimulation();

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.text).toContain('Mock AI');
    expect(body.data.gateway.fallbackUsed).toBe(true);
    expect(body.data.gateway.fallbackFrom).toBe('fake');
    expect(body.data.gateway.provider).toBe('mock');
  });
});
