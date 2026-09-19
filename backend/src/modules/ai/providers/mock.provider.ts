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
  AIAudioAnalysisRequest,
  AIAudioAnalysisResponse,
  AIMusicRequest,
  AIMusicResponse,
  AISfxRequest,
  AISfxResponse,
  TranscriptionResult,
  SubtitleSegment,
  SmartCutResult,
  GenerateVisualResult,
} from '../ai.types.js';
import { logger } from '../../../core/logger.js';

export class MockAIProvider implements IAIProviderAdapter, IAIProvider {
  public readonly id = 'mock';
  public readonly name = 'mock';
  public readonly supportedCapabilities: AICapability[] = [
    'text_generation',
    'structured_json',
    'speech_to_text',
    'text_to_speech',
    'image_generation',
    'video_generation',
    'music_generation',
    'sfx_generation',
    'embedding',
    'vision',
    'audio_analysis',
  ];

  public readonly defaultModels: Partial<Record<AICapability, string>> = {
    text_generation: 'mock-text-v1',
    structured_json: 'mock-json-v1',
    speech_to_text: 'mock-whisper-v1',
    text_to_speech: 'mock-tts-v1',
    image_generation: 'mock-image-v1',
    video_generation: 'mock-video-v1',
    music_generation: 'mock-music-v1',
    sfx_generation: 'mock-sfx-v1',
    embedding: 'mock-embed-v1',
    vision: 'mock-vision-v1',
    audio_analysis: 'mock-audio-v1',
  };

  // 1. Text
  async generateText(req: AITextRequest): Promise<Omit<AITextResponse, 'gateway'>> {
    return {
      text: `[Mock AI] Generated response for prompt: "${req.prompt}".`,
      finishReason: 'stop',
    };
  }

  // 2. Structured JSON
  async generateStructuredJson<T>(req: AIStructuredJsonRequest<T>): Promise<Omit<AIStructuredJsonResponse<T>, 'gateway'>> {
    const data: Record<string, any> = {
      summary: 'Mock structured output',
      confidence: 0.98,
      items: ['intro', 'cut', 'outro'],
    };
    return {
      data: data as T,
      rawJson: JSON.stringify(data),
    };
  }

  // 3. Speech-to-Text
  async speechToText(req: AISpeechToTextRequest): Promise<Omit<AISpeechToTextResponse, 'gateway'>> {
    const lang = req.language || 'en';
    const segments: SubtitleSegment[] = [
      {
        id: 'sub-1',
        start: 0.5,
        end: 4.2,
        text: 'Welcome to TechXayan Creative video editor.',
        words: [
          { word: 'Welcome', start: 0.5, end: 1.0 },
          { word: 'to', start: 1.1, end: 1.3 },
          { word: 'TechXayan', start: 1.4, end: 2.2 },
          { word: 'Creative', start: 2.3, end: 3.0 },
          { word: 'video', start: 3.1, end: 3.6 },
          { word: 'editor.', start: 3.7, end: 4.2 },
        ],
      },
      {
        id: 'sub-2',
        start: 4.8,
        end: 8.5,
        text: 'Transforming your vision into cinematic masterpieces on Windows and Android.',
        words: [
          { word: 'Transforming', start: 4.8, end: 5.5 },
          { word: 'your', start: 5.6, end: 5.8 },
          { word: 'vision', start: 5.9, end: 6.4 },
          { word: 'into', start: 6.5, end: 6.8 },
          { word: 'cinematic', start: 6.9, end: 7.5 },
          { word: 'masterpieces.', start: 7.6, end: 8.5 },
        ],
      },
    ];

    return {
      text: 'Welcome to TechXayan Creative video editor. Transforming your vision into cinematic masterpieces on Windows and Android.',
      language: lang,
      durationSeconds: 8.5,
      segments,
    };
  }

  // 4. Text-to-Speech
  async textToSpeech(req: AITextToSpeechRequest): Promise<Omit<AITextToSpeechResponse, 'gateway'>> {
    const format = req.format || 'mp3';
    return {
      audioUrl: `https://mock-storage.local/generated/tts_${Date.now()}.${format}`,
      format,
      durationSeconds: Math.max(1.0, req.text.length * 0.05),
      characterCount: req.text.length,
    };
  }

  // 5. Image Generation
  async generateImage(req: AIImageRequest): Promise<Omit<AIImageResponse, 'gateway'>> {
    const count = req.count || 1;
    const images = [];
    for (let i = 0; i < count; i++) {
      images.push({
        url: `https://mock-storage.local/generated/image_${Date.now()}_${i}.png`,
        width: req.width || 1024,
        height: req.height || 1024,
      });
    }
    return { images };
  }

  // 6. Video Generation
  async generateVideo(req: AIVideoRequest): Promise<Omit<AIVideoResponse, 'gateway'>> {
    return {
      videoUrl: 'https://mock-storage.local/generated/broll-cinematic-sunset.mp4',
      durationSeconds: req.durationSeconds || 5,
      resolution: req.resolution || '1080p',
      fps: req.fps || 30,
    };
  }

  // 7. Embedding
  async generateEmbedding(req: AIEmbeddingRequest): Promise<Omit<AIEmbeddingResponse, 'gateway'>> {
    const count = Array.isArray(req.input) ? req.input.length : 1;
    const dims = req.dimensions || 768;
    const embeddings = [];
    for (let i = 0; i < count; i++) {
      embeddings.push(new Array(dims).fill(0.01));
    }
    return { embeddings, dimensions: dims };
  }

  // 8. Vision
  async analyzeVision(req: AIVisionRequest): Promise<Omit<AIVisionResponse, 'gateway'>> {
    return {
      text: `Mock visual analysis for prompt "${req.prompt}". Scene contains dynamic framing.`,
      labels: ['cinematic', 'composition'],
      objects: [{ label: 'scene', confidence: 0.95 }],
    };
  }

  // 9. Audio Analysis
  async analyzeAudio(req: AIAudioAnalysisRequest): Promise<Omit<AIAudioAnalysisResponse, 'gateway'>> {
    return {
      silences: [
        { start: 4.2, end: 4.8, durationSeconds: 0.6 },
        { start: 8.5, end: 9.8, durationSeconds: 1.3 },
      ],
      recommendedCuts: [
        { start: 4.3, end: 4.7 },
        { start: 8.6, end: 9.7 },
      ],
      savedTimeSeconds: 1.5,
      beatsBpm: 128,
    };
  }

  // 10. Music Generation
  async generateMusic(req: AIMusicRequest): Promise<Omit<AIMusicResponse, 'gateway'>> {
    const duration = req.durationSeconds || 30;
    return {
      audioUrl: `https://assets.techxayan.com/mock/music_${Date.now()}.mp3`,
      audioBase64: 'UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=',
      durationSeconds: duration,
      genre: req.genre || 'electronic',
      tempoBpm: req.tempoBpm || 120,
    };
  }

  // 11. SFX Generation
  async generateSFX(req: AISfxRequest): Promise<Omit<AISfxResponse, 'gateway'>> {
    const duration = req.durationSeconds || 3;
    return {
      audioUrl: `https://assets.techxayan.com/mock/sfx_${Date.now()}.wav`,
      audioBase64: 'UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=',
      durationSeconds: duration,
      category: req.category || 'whoosh',
    };
  }

  // --------------------------------------------------------------------------
  // LEGACY BACKWARD COMPATIBILITY
  // --------------------------------------------------------------------------
  async transcribeAudio(mediaUrl: string, language = 'en'): Promise<TranscriptionResult> {
    logger.info({ mediaUrl, language }, 'MockAIProvider: Processing audio transcription (legacy)');
    const res = await this.speechToText({ audioUrl: mediaUrl, language });
    return {
      language: res.language,
      duration: res.durationSeconds,
      fullText: res.text,
      segments: res.segments,
    };
  }

  async generateCaptions(mediaUrl: string, _style = 'dynamic-word'): Promise<SubtitleSegment[]> {
    const res = await this.transcribeAudio(mediaUrl);
    return res.segments;
  }

  async detectSilences(mediaUrl: string, minSilenceDurationSeconds = 0.6): Promise<SmartCutResult> {
    logger.info({ mediaUrl, minSilenceDurationSeconds }, 'MockAIProvider: Detecting video speech silences (legacy)');
    const res = await this.analyzeAudio({ audioUrl: mediaUrl, minSilenceSeconds: minSilenceDurationSeconds });
    return {
      silenceIntervals: res.silences.map((s) => ({ start: s.start, end: s.end })),
      recommendedCuts: res.recommendedCuts,
      savedTimeSeconds: res.savedTimeSeconds,
    };
  }

  async generateBroll(prompt: string, durationSeconds = 5): Promise<GenerateVisualResult> {
    logger.info({ prompt, durationSeconds }, 'MockAIProvider: Generating synthetic B-roll visual asset (legacy)');
    const res = await this.generateVideo({ prompt, durationSeconds });
    return {
      prompt,
      assetUrl: res.videoUrl,
      duration: res.durationSeconds,
    };
  }
}
