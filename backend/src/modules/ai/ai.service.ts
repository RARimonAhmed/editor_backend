import {
  IAIProvider,
  TranscriptionResult,
  SubtitleSegment,
  SmartCutResult,
  GenerateVisualResult,
} from './ai.types.js';
import { aiGatewayService, AIGatewayService } from './ai-gateway.service.js';

export class AIService {
  public readonly gateway: AIGatewayService = aiGatewayService;

  getProvider(name?: string): IAIProvider {
    const adapter = this.gateway.getAdapter(name || 'mock');
    return (adapter as unknown as IAIProvider) || (this.gateway.getAdapter('mock') as unknown as IAIProvider);
  }

  async transcribe(userId: string, mediaUrl: string, language = 'en', providerName?: string): Promise<TranscriptionResult> {
    const res = await this.gateway.speechToText(userId, {
      audioUrl: mediaUrl,
      language,
      provider: providerName,
    });

    return {
      language: res.language,
      duration: res.durationSeconds,
      fullText: res.text,
      segments: res.segments,
    };
  }

  async generateCaptions(userId: string, mediaUrl: string, _style = 'dynamic', providerName?: string): Promise<SubtitleSegment[]> {
    const res = await this.gateway.speechToText(userId, {
      audioUrl: mediaUrl,
      provider: providerName,
    });
    return res.segments;
  }

  async detectSilences(userId: string, mediaUrl: string, minDuration?: number, providerName?: string): Promise<SmartCutResult> {
    const res = await this.gateway.analyzeAudio(userId, {
      audioUrl: mediaUrl,
      minSilenceSeconds: minDuration,
      provider: providerName,
    });

    return {
      silenceIntervals: res.silences.map((s) => ({ start: s.start, end: s.end })),
      recommendedCuts: res.recommendedCuts,
      savedTimeSeconds: res.savedTimeSeconds,
    };
  }

  async generateBroll(userId: string, prompt: string, duration = 5, providerName?: string): Promise<GenerateVisualResult> {
    const res = await this.gateway.generateVideo(userId, {
      prompt,
      durationSeconds: duration,
      provider: providerName,
    });

    return {
      prompt,
      assetUrl: res.videoUrl,
      duration: res.durationSeconds,
    };
  }
}

export const aiService = new AIService();
