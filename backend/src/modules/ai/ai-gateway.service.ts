import {
  IAIProviderAdapter,
  AICapability,
  AITextRequest,
  AITextResponse,
  AIStructuredJsonRequest,
  AIStructuredJsonResponse,
  AISpeechToTextRequest,
  AISpeechToTextResponse,
  AITextToSpeechRequest,
  AITextToSpeechResponse,
  AIImageRequest,
  AIImageResponse,
  AIVideoRequest,
  AIVideoResponse,
  AIEmbeddingRequest,
  AIEmbeddingResponse,
  AIVisionRequest,
  AIVisionResponse,
  AIAudioAnalysisRequest,
  AIAudioAnalysisResponse,
  AIGatewayMetadata,
  AIUsage,
} from './ai.types.js';
import { FakeAIProviderAdapter } from './providers/fake.provider.js';
import { MockAIProvider } from './providers/mock.provider.js';
import { GeminiProvider } from './providers/gemini.provider.js';
import { OpenAIProvider } from './providers/openai.provider.js';
import { creditsService } from '../credits/credits.service.js';
import { env } from '../../config/env.js';
import { logger } from '../../core/logger.js';
import { AppError, ValidationError } from '../../core/errors.js';

interface UserRateLimitState {
  tokens: number;
  lastRefill: number;
}

export class AIGatewayService {
  private adapters = new Map<string, IAIProviderAdapter>();
  private defaultProviderId: string;
  private userRateLimits = new Map<string, UserRateLimitState>();

  // Rate limit config: 60 requests per minute capacity, refilled at 1 token/sec
  private readonly rateLimitMax = 60;
  private readonly rateLimitRefillPerSec = 1;

  constructor() {
    this.defaultProviderId = env.AI_DEFAULT_PROVIDER || 'mock';

    // Register built-in adapters
    this.registerAdapter(new FakeAIProviderAdapter());
    this.registerAdapter(new MockAIProvider());
    this.registerAdapter(new GeminiProvider());
    this.registerAdapter(new OpenAIProvider());
  }

  registerAdapter(adapter: IAIProviderAdapter) {
    this.adapters.set(adapter.id, adapter);
    logger.info({ providerId: adapter.id, name: adapter.name }, 'Registered AI Provider Adapter in Gateway');
  }

  getAdapter(id: string): IAIProviderAdapter | undefined {
    return this.adapters.get(id);
  }

  listAdapters(): Array<{ id: string; name: string; capabilities: AICapability[]; defaultModels: Partial<Record<AICapability, string>> }> {
    return Array.from(this.adapters.values()).map((a) => ({
      id: a.id,
      name: a.name,
      capabilities: a.supportedCapabilities,
      defaultModels: a.defaultModels,
    }));
  }

  // --------------------------------------------------------------------------
  // SECURITY & ANTI-SSRF VERIFICATION
  // --------------------------------------------------------------------------
  private validateProviderIdentifier(providerId?: string): string {
    if (!providerId) {
      return this.defaultProviderId;
    }

    // Strictly disallow arbitrary user-supplied URLs (anti-SSRF)
    if (
      providerId.includes('://') ||
      providerId.includes('/') ||
      providerId.includes('\\') ||
      providerId.includes(':') ||
      providerId.startsWith('http')
    ) {
      throw new ValidationError('Arbitrary or remote user-supplied AI provider URLs are strictly forbidden.');
    }

    const adapter = this.adapters.get(providerId);
    if (!adapter) {
      throw new ValidationError(`AI provider "${providerId}" is not registered or supported.`);
    }

    return providerId;
  }

  // --------------------------------------------------------------------------
  // RATE LIMITING ENFORCEMENT
  // --------------------------------------------------------------------------
  private checkRateLimit(userId: string) {
    const now = Date.now();
    let state = this.userRateLimits.get(userId);

    if (!state) {
      state = { tokens: this.rateLimitMax - 1, lastRefill: now };
      this.userRateLimits.set(userId, state);
      return;
    }

    // Refill tokens based on elapsed time
    const elapsedSec = (now - state.lastRefill) / 1000;
    state.tokens = Math.min(this.rateLimitMax, state.tokens + elapsedSec * this.rateLimitRefillPerSec);
    state.lastRefill = now;

    if (state.tokens < 1) {
      throw new AppError(
        'AI gateway rate limit exceeded. Please wait a moment before sending more AI inference requests.',
        429,
        'AI_RATE_LIMIT_EXCEEDED'
      );
    }

    state.tokens -= 1;
  }

  // --------------------------------------------------------------------------
  // CORE DISPATCHER WITH TIMEOUT, RETRY, FALLBACK & USAGE
  // --------------------------------------------------------------------------
  private async executeWithResilience<Req extends { timeoutMs?: number; provider?: string; fallbackProvider?: string; model?: string }, Res>(
    userId: string,
    capability: AICapability,
    req: Req,
    creditCost: number,
    creditDescription: string,
    executor: (adapter: IAIProviderAdapter, request: Req) => Promise<Res>,
    computeUsage: (res: Res, latencyMs: number) => AIUsage
  ): Promise<Res & { gateway: AIGatewayMetadata }> {
    // 1. Check Rate Limit
    this.checkRateLimit(userId);

    // 2. Validate Provider Identifier (Anti-SSRF)
    const primaryProviderId = this.validateProviderIdentifier(req.provider);
    const fallbackProviderId = req.fallbackProvider ? this.validateProviderIdentifier(req.fallbackProvider) : undefined;

    // 3. Deduct Credits Atomically
    if (creditCost > 0) {
      await creditsService.deductCredits(userId, creditCost, creditDescription);
    }

    const timeoutMs = req.timeoutMs || (capability === 'video_generation' || capability === 'image_generation' ? 60000 : 15000);
    const startTime = Date.now();

    try {
      // Execute Primary Provider (with retries)
      const primaryAdapter = this.adapters.get(primaryProviderId)!;
      if (!primaryAdapter.supportedCapabilities.includes(capability)) {
        throw new ValidationError(`Provider "${primaryProviderId}" does not support AI capability "${capability}".`);
      }

      const result = await this.executeWithRetryAndTimeout(primaryAdapter, req, timeoutMs, executor);
      const latencyMs = Date.now() - startTime;
      const model = req.model || primaryAdapter.defaultModels[capability] || 'default';
      const usage = computeUsage(result, latencyMs);

      return {
        ...result,
        gateway: {
          provider: primaryProviderId,
          model,
          latencyMs,
          timestamp: new Date().toISOString(),
          usage,
        },
      };
    } catch (primaryError) {
      logger.warn(
        { primaryProviderId, fallbackProviderId, capability, error: (primaryError as Error).message },
        'Primary AI provider call failed'
      );

      // Check for Fallback Provider
      if (fallbackProviderId && fallbackProviderId !== primaryProviderId) {
        const fallbackAdapter = this.adapters.get(fallbackProviderId);
        if (fallbackAdapter && fallbackAdapter.supportedCapabilities.includes(capability)) {
          logger.info({ fallbackProviderId, capability }, 'Triggering automatic AI Gateway fallback provider');
          try {
            const fallbackResult = await this.executeWithRetryAndTimeout(fallbackAdapter, req, timeoutMs, executor);
            const latencyMs = Date.now() - startTime;
            const model = req.model || fallbackAdapter.defaultModels[capability] || 'default';
            const usage = computeUsage(fallbackResult, latencyMs);

            return {
              ...fallbackResult,
              gateway: {
                provider: fallbackProviderId,
                model,
                latencyMs,
                fallbackUsed: true,
                fallbackFrom: primaryProviderId,
                timestamp: new Date().toISOString(),
                usage,
              },
            };
          } catch (fallbackError) {
            logger.error({ fallbackError }, 'Fallback AI provider also failed');
          }
        }
      }

      // If all providers failed, refund user credits
      if (creditCost > 0) {
        await creditsService.grantCredits(
          userId,
          creditCost,
          'refund',
          `Automated refund for failed ${creditDescription}`
        );
      }

      throw primaryError;
    }
  }

  private async executeWithRetryAndTimeout<Req extends { timeoutMs?: number }, Res>(
    adapter: IAIProviderAdapter,
    req: Req,
    timeoutMs: number,
    executor: (adapter: IAIProviderAdapter, request: Req) => Promise<Res>
  ): Promise<Res> {
    const maxRetries = 2;
    let lastError: any;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          const backoff = 50 * Math.pow(2, attempt - 1);
          await new Promise((r) => setTimeout(r, backoff));
        }

        return await this.withTimeout(executor(adapter, req), timeoutMs);
      } catch (err: any) {
        lastError = err;
        // Do not retry on client validation errors (400) or authentication errors
        if (err.statusCode === 400 || err.statusCode === 401 || err.statusCode === 403) {
          throw err;
        }
      }
    }

    throw lastError;
  }

  private withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new AppError(`AI Gateway request timed out after ${timeoutMs}ms`, 504, 'AI_TIMEOUT'));
      }, timeoutMs);

      promise
        .then((res) => {
          clearTimeout(timer);
          resolve(res);
        })
        .catch((err) => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }

  // ============================================================================
  // 1. TEXT GENERATION
  // ============================================================================
  async generateText(userId: string, req: AITextRequest): Promise<AITextResponse> {
    return this.executeWithResilience(
      userId,
      'text_generation',
      req,
      1,
      'AI Text Generation',
      async (adapter, r) => {
        if (!adapter.generateText) throw new AppError(`Provider ${adapter.id} does not implement generateText`, 501, 'NOT_IMPLEMENTED');
        return adapter.generateText(r);
      },
      (res, _latency) => ({
        promptTokens: Math.round(req.prompt.length / 4),
        completionTokens: Math.round(res.text.length / 4),
        totalTokens: Math.round((req.prompt.length + res.text.length) / 4),
        estimatedCostCredits: 1,
      })
    );
  }

  // ============================================================================
  // 2. STRUCTURED JSON
  // ============================================================================
  async generateStructuredJson<T = any>(userId: string, req: AIStructuredJsonRequest<T>): Promise<AIStructuredJsonResponse<T>> {
    return this.executeWithResilience(
      userId,
      'structured_json',
      req,
      1,
      'AI Structured JSON Generation',
      async (adapter, r) => {
        if (!adapter.generateStructuredJson) throw new AppError(`Provider ${adapter.id} does not implement generateStructuredJson`, 501, 'NOT_IMPLEMENTED');
        return adapter.generateStructuredJson<T>(r);
      },
      (res, _latency) => ({
        promptTokens: Math.round(req.prompt.length / 4),
        completionTokens: Math.round(res.rawJson.length / 4),
        totalTokens: Math.round((req.prompt.length + res.rawJson.length) / 4),
        estimatedCostCredits: 1,
      })
    );
  }

  // ============================================================================
  // 3. SPEECH-TO-TEXT
  // ============================================================================
  async speechToText(userId: string, req: AISpeechToTextRequest): Promise<AISpeechToTextResponse> {
    return this.executeWithResilience(
      userId,
      'speech_to_text',
      req,
      5,
      'AI Speech-to-Text Transcription',
      async (adapter, r) => {
        if (!adapter.speechToText) throw new AppError(`Provider ${adapter.id} does not implement speechToText`, 501, 'NOT_IMPLEMENTED');
        return adapter.speechToText(r);
      },
      (res, _latency) => ({
        audioDurationSeconds: res.durationSeconds,
        estimatedCostCredits: 5,
      })
    );
  }

  // ============================================================================
  // 4. TEXT-TO-SPEECH
  // ============================================================================
  async textToSpeech(userId: string, req: AITextToSpeechRequest): Promise<AITextToSpeechResponse> {
    return this.executeWithResilience(
      userId,
      'text_to_speech',
      req,
      3,
      'AI Text-to-Speech Voice Synthesis',
      async (adapter, r) => {
        if (!adapter.textToSpeech) throw new AppError(`Provider ${adapter.id} does not implement textToSpeech`, 501, 'NOT_IMPLEMENTED');
        return adapter.textToSpeech(r);
      },
      (res, _latency) => ({
        characterCount: res.characterCount,
        audioDurationSeconds: res.durationSeconds,
        estimatedCostCredits: 3,
      })
    );
  }

  // ============================================================================
  // 5. IMAGE GENERATION
  // ============================================================================
  async generateImage(userId: string, req: AIImageRequest): Promise<AIImageResponse> {
    const count = req.count || 1;
    const credits = count * 2;
    return this.executeWithResilience(
      userId,
      'image_generation',
      req,
      credits,
      `AI Image Generation (${count} images)`,
      async (adapter, r) => {
        if (!adapter.generateImage) throw new AppError(`Provider ${adapter.id} does not implement generateImage`, 501, 'NOT_IMPLEMENTED');
        return adapter.generateImage(r);
      },
      (res, _latency) => ({
        imageCount: res.images.length,
        estimatedCostCredits: credits,
      })
    );
  }

  // ============================================================================
  // 6. VIDEO GENERATION
  // ============================================================================
  async generateVideo(userId: string, req: AIVideoRequest): Promise<AIVideoResponse> {
    return this.executeWithResilience(
      userId,
      'video_generation',
      req,
      15,
      'AI Video Generation (B-roll)',
      async (adapter, r) => {
        if (!adapter.generateVideo) throw new AppError(`Provider ${adapter.id} does not implement generateVideo`, 501, 'NOT_IMPLEMENTED');
        return adapter.generateVideo(r);
      },
      (res, _latency) => ({
        videoDurationSeconds: res.durationSeconds,
        estimatedCostCredits: 15,
      })
    );
  }

  // ============================================================================
  // 7. EMBEDDING
  // ============================================================================
  async generateEmbedding(userId: string, req: AIEmbeddingRequest): Promise<AIEmbeddingResponse> {
    return this.executeWithResilience(
      userId,
      'embedding',
      req,
      1,
      'AI Vector Embedding',
      async (adapter, r) => {
        if (!adapter.generateEmbedding) throw new AppError(`Provider ${adapter.id} does not implement generateEmbedding`, 501, 'NOT_IMPLEMENTED');
        return adapter.generateEmbedding(r);
      },
      (res, _latency) => ({
        totalTokens: Array.isArray(req.input) ? req.input.length * 10 : 10,
        estimatedCostCredits: 1,
      })
    );
  }

  // ============================================================================
  // 8. VISION
  // ============================================================================
  async analyzeVision(userId: string, req: AIVisionRequest): Promise<AIVisionResponse> {
    return this.executeWithResilience(
      userId,
      'vision',
      req,
      2,
      'AI Multimodal Vision Analysis',
      async (adapter, r) => {
        if (!adapter.analyzeVision) throw new AppError(`Provider ${adapter.id} does not implement analyzeVision`, 501, 'NOT_IMPLEMENTED');
        return adapter.analyzeVision(r);
      },
      (_res, _latency) => ({
        imageCount: req.images.length,
        estimatedCostCredits: 2,
      })
    );
  }

  // ============================================================================
  // 9. AUDIO ANALYSIS
  // ============================================================================
  async analyzeAudio(userId: string, req: AIAudioAnalysisRequest): Promise<AIAudioAnalysisResponse> {
    return this.executeWithResilience(
      userId,
      'audio_analysis',
      req,
      2,
      'AI Audio & Smart Cut Analysis',
      async (adapter, r) => {
        if (!adapter.analyzeAudio) throw new AppError(`Provider ${adapter.id} does not implement analyzeAudio`, 501, 'NOT_IMPLEMENTED');
        return adapter.analyzeAudio(r);
      },
      (_res, _latency) => ({
        estimatedCostCredits: 2,
      })
    );
  }
}

export const aiGatewayService = new AIGatewayService();
