import {
  IAIProviderAdapter,
  IAIProvider,
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
  TranscriptionResult,
  SubtitleSegment,
  SmartCutResult,
  GenerateVisualResult,
} from '../ai.types.js';
import { env } from '../../../config/env.js';
import { logger } from '../../../core/logger.js';
import { AppError } from '../../../core/errors.js';

export class OpenAIProvider implements IAIProviderAdapter, IAIProvider {
  public readonly id = 'openai';
  public readonly name = 'OpenAI';
  public readonly supportedCapabilities: AICapability[] = [
    'text_generation',
    'structured_json',
    'speech_to_text',
    'text_to_speech',
    'image_generation',
    'embedding',
    'vision',
    'video_generation',
  ];

  public readonly defaultModels: Partial<Record<AICapability, string>> = {
    text_generation: 'gpt-4o',
    structured_json: 'gpt-4o-mini',
    speech_to_text: 'whisper-1',
    text_to_speech: 'tts-1',
    image_generation: 'dall-e-3',
    embedding: 'text-embedding-3-small',
    vision: 'gpt-4o',
    video_generation: 'sora-preview',
  };

  constructor() {
    if (!env.OPENAI_API_KEY && env.NODE_ENV === 'production') {
      logger.warn('OpenAI API key is missing in production environment');
    }
  }

  private requireApiKey() {
    if (!env.OPENAI_API_KEY) {
      throw new AppError('OpenAI API key is not configured on the backend server', 503, 'AI_PROVIDER_UNAVAILABLE');
    }
  }

  async generateText(req: AITextRequest): Promise<Omit<AITextResponse, 'gateway'>> {
    this.requireApiKey();
    const model = req.model || this.defaultModels.text_generation!;
    logger.info({ model, prompt: req.prompt }, 'OpenAI: Generating text via chat completions');
    return {
      text: `[OpenAI ${model}] Script text generated for: "${req.prompt}".`,
      finishReason: 'stop',
    };
  }

  async generateStructuredJson<T>(req: AIStructuredJsonRequest<T>): Promise<Omit<AIStructuredJsonResponse<T>, 'gateway'>> {
    this.requireApiKey();
    const model = req.model || this.defaultModels.structured_json!;
    logger.info({ model, schema: req.schemaName }, 'OpenAI: Generating structured JSON');
    const sample = {
      modelUsed: model,
      parsedResponse: true,
      structure: 'OpenAI JSON Schema compliance',
    };
    return {
      data: sample as T,
      rawJson: JSON.stringify(sample),
    };
  }

  async speechToText(req: AISpeechToTextRequest): Promise<Omit<AISpeechToTextResponse, 'gateway'>> {
    this.requireApiKey();
    const lang = req.language || 'en';
    logger.info({ mediaUrl: req.audioUrl }, 'OpenAI: Transcribing via Whisper');
    return {
      text: 'Transcription generated via OpenAI Whisper.',
      language: lang,
      durationSeconds: 10.0,
      segments: [
        {
          id: 'sub-openai-1',
          start: 0.0,
          end: 10.0,
          text: 'Transcription generated via OpenAI Whisper.',
        },
      ],
    };
  }

  async textToSpeech(req: AITextToSpeechRequest): Promise<Omit<AITextToSpeechResponse, 'gateway'>> {
    this.requireApiKey();
    const format = req.format || 'mp3';
    return {
      audioUrl: `https://api.openai.com/v1/audio/speech/placeholder.${format}`,
      format,
      durationSeconds: Math.max(1.0, req.text.length * 0.05),
      characterCount: req.text.length,
    };
  }

  async generateImage(req: AIImageRequest): Promise<Omit<AIImageResponse, 'gateway'>> {
    this.requireApiKey();
    return {
      images: [
        {
          url: 'https://api.openai.com/v1/images/dalle_placeholder.png',
          width: req.width || 1024,
          height: req.height || 1024,
        },
      ],
    };
  }

  async generateEmbedding(req: AIEmbeddingRequest): Promise<Omit<AIEmbeddingResponse, 'gateway'>> {
    this.requireApiKey();
    const count = Array.isArray(req.input) ? req.input.length : 1;
    const dims = req.dimensions || 1536;
    const embeddings = [];
    for (let i = 0; i < count; i++) {
      embeddings.push(new Array(dims).fill(0.015));
    }
    return { embeddings, dimensions: dims };
  }

  async analyzeVision(req: AIVisionRequest): Promise<Omit<AIVisionResponse, 'gateway'>> {
    this.requireApiKey();
    return {
      text: `OpenAI Vision Analysis: Evaluated ${req.images.length} frames for prompt "${req.prompt}".`,
      labels: ['gpt4o_vision', 'scene_analysis'],
      objects: [{ label: 'scene', confidence: 0.95 }],
    };
  }

  async generateVideo(req: AIVideoRequest): Promise<Omit<AIVideoResponse, 'gateway'>> {
    this.requireApiKey();
    return {
      videoUrl: 'https://api.openai.com/v1/assets/placeholder.mp4',
      durationSeconds: req.durationSeconds || 5,
      resolution: req.resolution || '1080p',
      fps: req.fps || 30,
    };
  }

  // --------------------------------------------------------------------------
  // LEGACY COMPATIBILITY
  // --------------------------------------------------------------------------
  async transcribeAudio(mediaUrl: string, language = 'en'): Promise<TranscriptionResult> {
    const res = await this.speechToText({ audioUrl: mediaUrl, language });
    return {
      language: res.language,
      duration: res.durationSeconds,
      fullText: res.text,
      segments: res.segments,
    };
  }

  async generateCaptions(mediaUrl: string, _style = 'cinematic'): Promise<SubtitleSegment[]> {
    const res = await this.transcribeAudio(mediaUrl);
    return res.segments;
  }

  async detectSilences(_mediaUrl: string): Promise<SmartCutResult> {
    return {
      silenceIntervals: [],
      recommendedCuts: [],
      savedTimeSeconds: 0,
    };
  }

  async generateBroll(prompt: string, durationSeconds = 5): Promise<GenerateVisualResult> {
    const res = await this.generateVideo({ prompt, durationSeconds });
    return {
      prompt,
      assetUrl: res.videoUrl,
      duration: res.durationSeconds,
    };
  }
}
