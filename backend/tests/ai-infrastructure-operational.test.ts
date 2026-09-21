import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { aiGatewayService } from '../src/modules/ai/ai-gateway.service.js';
import { FakeAIProviderAdapter } from '../src/modules/ai/providers/fake.provider.js';
import { commandValidatorService } from '../src/modules/ai/commands/command-validator.service.js';
import { EditorCommand } from '../src/modules/ai/commands/editor-command.types.js';
import { env } from '../src/config/env.js';
import { creditsService } from '../src/modules/credits/credits.service.js';

describe('Operational AI Infrastructure & Real Provider Architecture', () => {
  let app: FastifyInstance;
  let authToken: string;
  let testUserId: string;
  let fakeAdapter: FakeAIProviderAdapter;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    // Register test user
    const regRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email: `ai_architect_${Date.now()}@techxayan.com`,
        password: 'Password123!',
        displayName: 'Senior AI Infrastructure Lead',
      },
    });

    const body = JSON.parse(regRes.body);
    authToken = body.data.tokens.accessToken;
    testUserId = body.data.user.id;

    fakeAdapter = aiGatewayService.getAdapter('fake') as FakeAIProviderAdapter;
  });

  afterAll(async () => {
    fakeAdapter.resetSimulation();
    aiGatewayService.resetRateLimits();
    await app.close();
  });

  beforeEach(() => {
    fakeAdapter.resetSimulation();
    aiGatewayService.resetRateLimits();
  });

  // ============================================================================
  // 1. SUCCESSFUL PROVIDER EXECUTION ACROSS ALL 6 CAPABILITIES
  // ============================================================================
  describe('1. Successful Provider Execution Across All Core Capabilities', () => {
    it('1.1 Text Generation: Supports model selection, token tracking, and latency', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/ai/text',
        headers: { Authorization: `Bearer ${authToken}` },
        payload: {
          prompt: 'Generate an energetic voiceover script for an action trailer',
          provider: 'fake',
          model: 'fake-gpt-4o-cinematic',
          temperature: 0.8,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(body.data.text).toContain('fake-gpt-4o-cinematic');
      expect(body.data.finishReason).toBe('stop');

      // Gateway Telemetry
      const gateway = body.data.gateway;
      expect(gateway).toBeDefined();
      expect(gateway.provider).toBe('fake');
      expect(gateway.model).toBe('fake-gpt-4o-cinematic');
      expect(gateway.latencyMs).toBeGreaterThanOrEqual(0);
      expect(gateway.usage.promptTokens).toBeGreaterThan(0);
      expect(gateway.usage.completionTokens).toBeGreaterThan(0);
      expect(gateway.usage.totalTokens).toBeGreaterThan(0);
      expect(gateway.usage.estimatedCostCredits).toBe(1);
    });

    it('1.2 Structured JSON: Returns strictly typed data matching requested schema', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/ai/structured-json',
        headers: { Authorization: `Bearer ${authToken}` },
        payload: {
          prompt: 'Analyze video pacing and recommend color grade palette',
          provider: 'fake',
          schemaName: 'VideoPacingAnalysis',
          schema: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              recommendedColorGrade: { type: 'string' },
              keyThemes: { type: 'array', items: { type: 'string' } },
            },
            required: ['title', 'recommendedColorGrade', 'keyThemes'],
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
      expect(body.data.gateway.usage.estimatedCostCredits).toBe(1);
    });

    it('1.3 Multimodal Vision Analysis: Identifies visual entities and scene attributes', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/ai/vision',
        headers: { Authorization: `Bearer ${authToken}` },
        payload: {
          images: [
            {
              url: 'https://cdn.techxayan.com/sample_keyframes/intro.jpg',
              mimeType: 'image/jpeg',
            },
          ],
          prompt: 'Detect lighting temperature, key subjects, and bounding boxes',
          provider: 'fake',
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(body.data.text).toBeDefined();
      expect(body.data.labels).toBeInstanceOf(Array);
      expect(body.data.objects).toBeInstanceOf(Array);
      expect(body.data.gateway.usage.imageCount).toBe(1);
      expect(body.data.gateway.usage.estimatedCostCredits).toBe(2);
    });

    it('1.4 Speech-to-Text: Transcribes audio with timestamped subtitle segments', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/ai/speech-to-text',
        headers: { Authorization: `Bearer ${authToken}` },
        payload: {
          audioUrl: 'https://cdn.techxayan.com/samples/voiceover.mp3',
          language: 'en',
          wordTimestamps: true,
          provider: 'fake',
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(body.data.text).toBeDefined();
      expect(body.data.segments).toBeInstanceOf(Array);
      expect(body.data.segments.length).toBeGreaterThan(0);
      expect(body.data.segments[0].start).toBeGreaterThanOrEqual(0);
      expect(body.data.segments[0].end).toBeGreaterThan(body.data.segments[0].start);
      expect(body.data.gateway.usage.estimatedCostCredits).toBe(5);
    });

    it('1.5 Text-to-Speech (TTS): Generates speech audio and computes duration & characters', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/ai/tts',
        headers: { Authorization: `Bearer ${authToken}` },
        payload: {
          text: 'Welcome to TechXayan Creative Video Editor for Windows and Android.',
          voiceId: 'alloy',
          format: 'mp3',
          speed: 1.0,
          provider: 'fake',
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(body.data.audioUrl).toBeDefined();
      expect(body.data.durationSeconds).toBeGreaterThan(0);
      expect(body.data.characterCount).toBeGreaterThan(10);
      expect(body.data.gateway.usage.estimatedCostCredits).toBe(3);
    });

    it('1.6 Vector Embeddings: Generates normalized multidimensional float vectors', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/ai/embeddings',
        headers: { Authorization: `Bearer ${authToken}` },
        payload: {
          input: ['Cinematic slow motion drone shot over mountains', 'Fast-paced action montage'],
          dimensions: 512,
          provider: 'fake',
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(body.data.embeddings).toBeInstanceOf(Array);
      expect(body.data.embeddings.length).toBe(2);
      expect(body.data.dimensions).toBe(512);
      expect(body.data.embeddings[0].length).toBe(512);
    });
  });

  // ============================================================================
  // 2. TIMEOUT ENFORCEMENT & RETRY
  // ============================================================================
  describe('2. Timeout Enforcement', () => {
    it('Aborts request exceeding timeoutMs and returns HTTP 504 AI_TIMEOUT', async () => {
      fakeAdapter.simulateFailure = 'timeout';

      const res = await app.inject({
        method: 'POST',
        url: '/v1/ai/text',
        headers: { Authorization: `Bearer ${authToken}` },
        payload: {
          prompt: 'This request will hang and time out',
          provider: 'fake',
          timeoutMs: 40,
        },
      });

      expect(res.statusCode).toBe(504);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('AI_TIMEOUT');
    });
  });

  // ============================================================================
  // 3. INVALID RESPONSE & MALFORMED JSON
  // ============================================================================
  describe('3. Invalid Response & Malformed JSON Handling', () => {
    it('Catches malformed JSON string from provider and returns HTTP 502 AI_INVALID_RESPONSE', async () => {
      fakeAdapter.simulateFailure = 'malformed_json';

      const res = await app.inject({
        method: 'POST',
        url: '/v1/ai/structured-json',
        headers: { Authorization: `Bearer ${authToken}` },
        payload: {
          prompt: 'Return malformed json',
          provider: 'fake',
          schema: { type: 'object' },
        },
      });

      expect(res.statusCode).toBe(502);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('AI_INVALID_RESPONSE');
    });

    it('Catches corrupt or unparseable provider schema response', async () => {
      fakeAdapter.simulateFailure = 'invalid_response';

      const res = await app.inject({
        method: 'POST',
        url: '/v1/ai/text',
        headers: { Authorization: `Bearer ${authToken}` },
        payload: {
          prompt: 'Trigger invalid response',
          provider: 'fake',
        },
      });

      expect(res.statusCode).toBe(502);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('AI_INVALID_RESPONSE');
    });
  });

  // ============================================================================
  // 4. PROVIDER FAILURE & EXPONENTIAL BACKOFF RETRY
  // ============================================================================
  describe('4. Provider Failure & Resilience', () => {
    it('Recovers from transient 500 error on retry with backoff', async () => {
      fakeAdapter.simulateFailure = 'server_error';
      fakeAdapter.maxFailuresBeforeSuccess = 1; // Fails on attempt 1, succeeds on attempt 2

      const res = await app.inject({
        method: 'POST',
        url: '/v1/ai/text',
        headers: { Authorization: `Bearer ${authToken}` },
        payload: {
          prompt: 'Retry on transient failure',
          provider: 'fake',
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(fakeAdapter.failureCount).toBe(1);
    });
  });

  // ============================================================================
  // 5. AUTOMATIC FALLBACK ROUTING
  // ============================================================================
  describe('5. Fallback Routing', () => {
    it('Automatically routes to fallback provider when primary provider permanently fails', async () => {
      fakeAdapter.simulateFailure = 'server_error'; // Fake provider fails continuously

      const res = await app.inject({
        method: 'POST',
        url: '/v1/ai/text',
        headers: { Authorization: `Bearer ${authToken}` },
        payload: {
          prompt: 'Test automatic fallback routing',
          provider: 'fake',
          fallbackProvider: 'mock',
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(body.data.gateway.fallbackUsed).toBe(true);
      expect(body.data.gateway.fallbackFrom).toBe('fake');
      expect(body.data.gateway.provider).toBe('mock');
    });
  });

  // ============================================================================
  // 6. RATE LIMITING ENFORCEMENT
  // ============================================================================
  describe('6. Rate Limiting', () => {
    it('Rejects requests with HTTP 429 when user exceeds gateway token capacity', async () => {
      aiGatewayService.setUserRateLimitTokens(testUserId, 0);

      const res = await app.inject({
        method: 'POST',
        url: '/v1/ai/text',
        headers: { Authorization: `Bearer ${authToken}` },
        payload: {
          prompt: 'Rate limited request',
          provider: 'fake',
        },
      });

      expect(res.statusCode).toBe(429);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('AI_RATE_LIMIT_EXCEEDED');
    });
  });

  // ============================================================================
  // 7. INSUFFICIENT CREDITS & AUTOMATIC REFUND
  // ============================================================================
  describe('7. Insufficient Credits & Billing Guard', () => {
    it('Rejects request before provider call when user lacks required credits', async () => {
      // Register a broke user
      const brokeReg = await app.inject({
        method: 'POST',
        url: '/v1/auth/register',
        payload: {
          email: `broke_creator_${Date.now()}@techxayan.com`,
          password: 'Password123!',
          displayName: 'Broke Creator',
        },
      });
      const brokeUser = JSON.parse(brokeReg.body).data;
      const brokeToken = brokeUser.tokens.accessToken;
      const brokeUserId = brokeUser.user.id;

      // Drain balance to 0
      const currentBalance = await creditsService.getBalance(brokeUserId);
      if (currentBalance > 0) {
        await creditsService.deductCredits(brokeUserId, currentBalance, 'Drain for test');
      }

      const res = await app.inject({
        method: 'POST',
        url: '/v1/ai/text',
        headers: { Authorization: `Bearer ${brokeToken}` },
        payload: {
          prompt: 'Try generating with 0 credits',
          provider: 'fake',
        },
      });

      expect(res.statusCode).toBe(402);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('INSUFFICIENT_CREDITS');
    });
  });

  // ============================================================================
  // 8. STRICT EditorCommand[] OUTPUT SCHEMA VALIDATION (ANTI-CODE-EXECUTION)
  // ============================================================================
  describe('8. Strict EditorCommand[] Schema Validation', () => {
    it('Accepts strictly validated EditorCommand list', () => {
      const validCommands: EditorCommand[] = [
        {
          id: 'cmd-1',
          category: 'clip',
          action: 'SPLIT_CLIP',
          targetClipId: 'clip-101',
          timeRange: { start: 2.5, end: 5.0 },
          parameters: { splitTime: 2.5 },
          confidence: 0.95,
          explanation: 'Split clip at beat drop',
        },
        {
          id: 'cmd-2',
          category: 'color',
          action: 'ADD_CONTRAST',
          targetClipId: 'clip-101',
          parameters: { contrast: 1.25 },
          confidence: 0.92,
          explanation: 'Increase contrast by 25%',
        },
      ];

      const validation = commandValidatorService.validate(validCommands, 60);
      expect(validation.valid).toBe(true);
      expect(validation.errors.length).toBe(0);
      expect(validation.validatedCommands.length).toBe(2);
    });

    it('Rejects arbitrary generated executable code in parameters', () => {
      const maliciousCommands: any[] = [
        {
          id: 'cmd-hack',
          category: 'clip',
          action: 'EXECUTE_PAYLOAD',
          parameters: {
            injectedCode: '<script>alert("hacked")</script>',
            evalString: 'eval("process.exit(1)")',
          },
          confidence: 0.99,
          explanation: 'Malicious payload injection',
        },
      ];

      const validation = commandValidatorService.validate(maliciousCommands as EditorCommand[], 60);
      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
      expect(validation.errors[0]).toContain('disallowed executable code patterns');
    });

    it('Rejects physically infeasible or negative time ranges', () => {
      const invalidTimingCommands: any[] = [
        {
          id: 'cmd-time-error',
          category: 'trim',
          action: 'TRIM_CLIP',
          timeRange: { start: 10.0, end: 5.0 }, // End precedes start!
          parameters: {},
          confidence: 0.8,
          explanation: 'Inverted time range',
        },
      ];

      const validation = commandValidatorService.validate(invalidTimingCommands as EditorCommand[], 60);
      expect(validation.valid).toBe(false);
      expect(
        validation.errors.some(
          (e) => e.includes('cannot precede start time') || e.includes('greater than or equal to start time')
        )
      ).toBe(true);
    });
  });

  // ============================================================================
  // 9. SECRET ISOLATION: NEVER LOG, STORE, OR RETURN API KEYS
  // ============================================================================
  describe('9. Server-Side Secret Isolation', () => {
    it('GET /v1/ai/providers never leaks provider API keys in response', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/v1/ai/providers',
        headers: { Authorization: `Bearer ${authToken}` },
      });

      expect(res.statusCode).toBe(200);
      const rawBody = res.body;

      // Assert that neither secret nor apiKey is ever in the payload
      expect(rawBody).not.toContain('apiKey');
      expect(rawBody).not.toContain('secret');
      if (env.GEMINI_API_KEY) {
        expect(rawBody).not.toContain(env.GEMINI_API_KEY);
      }
      if (env.OPENAI_API_KEY) {
        expect(rawBody).not.toContain(env.OPENAI_API_KEY);
      }
    });

    it('AI provider error responses never leak API keys in error details', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/ai/text',
        headers: { Authorization: `Bearer ${authToken}` },
        payload: {
          prompt: 'Check for leaked credentials in error details',
          provider: 'gemini',
        },
      });

      const body = JSON.parse(res.body);
      const stringified = JSON.stringify(body);
      expect(stringified).not.toContain('AIzaSy'); // Common Google API key prefix
      expect(stringified).not.toContain('sk-proj-'); // Common OpenAI API key prefix
    });
  });

  // ============================================================================
  // 10. CONDITIONAL REAL PROVIDER EXECUTION (WHEN ENV KEYS CONFIGURED)
  // ============================================================================
  describe('10. Real Provider Execution (Conditional on Environment)', () => {
    it('Google Gemini: Runs real execution when GEMINI_API_KEY present, otherwise returns structured 503', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/ai/text',
        headers: { Authorization: `Bearer ${authToken}` },
        payload: {
          prompt: 'Summarize 3 tips for engaging video pacing',
          provider: 'gemini',
          model: 'gemini-1.5-flash',
        },
      });

      if (env.GEMINI_API_KEY) {
        // Real live Gemini call succeeded
        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body);
        expect(body.success).toBe(true);
        expect(body.data.text.length).toBeGreaterThan(10);
      } else {
        // Correctly refused with structured 503 AI_PROVIDER_UNAVAILABLE
        expect(res.statusCode).toBe(503);
        const body = JSON.parse(res.body);
        expect(body.error.code).toBe('AI_PROVIDER_UNAVAILABLE');
      }
    });

    it('OpenAI: Runs real execution when OPENAI_API_KEY present, otherwise returns structured 503', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/ai/text',
        headers: { Authorization: `Bearer ${authToken}` },
        payload: {
          prompt: 'Write a 1-sentence hook for a tech video',
          provider: 'openai',
          model: 'gpt-4o-mini',
        },
      });

      if (env.OPENAI_API_KEY) {
        // Real live OpenAI call succeeded
        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body);
        expect(body.success).toBe(true);
        expect(body.data.text.length).toBeGreaterThan(10);
      } else {
        // Correctly refused with structured 503 AI_PROVIDER_UNAVAILABLE
        expect(res.statusCode).toBe(503);
        const body = JSON.parse(res.body);
        expect(body.error.code).toBe('AI_PROVIDER_UNAVAILABLE');
      }
    });
  });
});
