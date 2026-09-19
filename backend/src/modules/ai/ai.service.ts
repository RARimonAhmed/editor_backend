import { IAIProvider, TranscriptionResult, SubtitleSegment, SmartCutResult, GenerateVisualResult } from './ai.types.js';
import { MockAIProvider } from './providers/mock.provider.js';
import { OpenAIProvider } from './providers/openai.provider.js';
import { GeminiProvider } from './providers/gemini.provider.js';
import { creditsService } from '../credits/credits.service.js';
import { env } from '../../config/env.js';
import { logger } from '../../core/logger.js';

export class AIService {
  private providers = new Map<string, IAIProvider>();
  private defaultProviderName: string;

  constructor() {
    this.defaultProviderName = env.AI_DEFAULT_PROVIDER;
    this.registerProvider(new MockAIProvider());
    this.registerProvider(new OpenAIProvider());
    this.registerProvider(new GeminiProvider());
  }

  registerProvider(provider: IAIProvider) {
    this.providers.set(provider.name, provider);
  }

  getProvider(name?: string): IAIProvider {
    const providerName = name || this.defaultProviderName;
    const provider = this.providers.get(providerName);
    if (!provider) {
      logger.warn(`AI Provider '${providerName}' not found. Falling back to mock provider.`);
      return this.providers.get('mock')!;
    }
    return provider;
  }

  async transcribe(userId: string, mediaUrl: string, language = 'en', providerName?: string): Promise<TranscriptionResult> {
    const creditCost = 5;
    await creditsService.deductCredits(userId, creditCost, 'AI Audio Transcription (Whisper)');

    try {
      const provider = this.getProvider(providerName);
      const result = await provider.transcribeAudio(mediaUrl, language);
      return result;
    } catch (error) {
      // Refund credits on failure
      await creditsService.grantCredits(userId, creditCost, 'refund', 'Refund for failed AI transcription');
      throw error;
    }
  }

  async generateCaptions(userId: string, mediaUrl: string, style = 'dynamic', providerName?: string): Promise<SubtitleSegment[]> {
    const creditCost = 3;
    await creditsService.deductCredits(userId, creditCost, 'AI Auto Captions Generation');

    try {
      const provider = this.getProvider(providerName);
      const result = await provider.generateCaptions(mediaUrl, style);
      return result;
    } catch (error) {
      await creditsService.grantCredits(userId, creditCost, 'refund', 'Refund for failed caption generation');
      throw error;
    }
  }

  async detectSilences(userId: string, mediaUrl: string, minDuration?: number, providerName?: string): Promise<SmartCutResult> {
    const creditCost = 2;
    await creditsService.deductCredits(userId, creditCost, 'AI Smart Silence Cut Detection');

    try {
      const provider = this.getProvider(providerName);
      const result = await provider.detectSilences(mediaUrl, minDuration);
      return result;
    } catch (error) {
      await creditsService.grantCredits(userId, creditCost, 'refund', 'Refund for failed silence detection');
      throw error;
    }
  }

  async generateBroll(userId: string, prompt: string, duration = 5, providerName?: string): Promise<GenerateVisualResult> {
    const creditCost = 15;
    await creditsService.deductCredits(userId, creditCost, `AI B-roll Generation: "${prompt.substring(0, 20)}..."`);

    try {
      const provider = this.getProvider(providerName);
      const result = await provider.generateBroll(prompt, duration);
      return result;
    } catch (error) {
      await creditsService.grantCredits(userId, creditCost, 'refund', 'Refund for failed B-roll generation');
      throw error;
    }
  }
}

export const aiService = new AIService();
