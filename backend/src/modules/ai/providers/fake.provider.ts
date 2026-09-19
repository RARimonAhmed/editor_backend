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
} from '../ai.types.js';
import { AppError } from '../../../core/errors.js';

export class FakeAIProviderAdapter implements IAIProviderAdapter {
  public readonly id = 'fake';
  public readonly name = 'TechXayan Fake AI Provider';
  public readonly supportedCapabilities: AICapability[] = [
    'text_generation',
    'structured_json',
    'speech_to_text',
    'text_to_speech',
    'image_generation',
    'video_generation',
    'embedding',
    'vision',
    'audio_analysis',
  ];

  public readonly defaultModels: Partial<Record<AICapability, string>> = {
    text_generation: 'fake-gpt-4o',
    structured_json: 'fake-gemini-2.0-flash',
    speech_to_text: 'fake-whisper-3',
    text_to_speech: 'fake-elevenlabs-v2',
    image_generation: 'fake-dall-e-3',
    video_generation: 'fake-sora-fast',
    embedding: 'fake-embedding-ada-002',
    vision: 'fake-vision-multimodal',
    audio_analysis: 'fake-audio-smartcut',
  };

  // Test simulation controls
  public simulateFailure: 'none' | 'rate_limit' | 'timeout' | 'server_error' | 'invalid_input' = 'none';
  public failureCount = 0;
  public maxFailuresBeforeSuccess = 0;
  public simulateLatencyMs = 0;

  resetSimulation() {
    this.simulateFailure = 'none';
    this.failureCount = 0;
    this.maxFailuresBeforeSuccess = 0;
    this.simulateLatencyMs = 0;
  }

  private async checkSimulation() {
    if (this.simulateLatencyMs > 0) {
      await new Promise((r) => setTimeout(r, this.simulateLatencyMs));
    }

    if (this.simulateFailure !== 'none') {
      if (this.maxFailuresBeforeSuccess > 0 && this.failureCount >= this.maxFailuresBeforeSuccess) {
        // Recover after N failures
        return;
      }

      this.failureCount++;
      switch (this.simulateFailure) {
        case 'rate_limit':
          throw new AppError('AI Provider Rate Limit Exceeded (HTTP 429)', 429, 'AI_RATE_LIMIT_EXCEEDED');
        case 'timeout':
          // Hang long enough to trigger gateway timeout
          await new Promise((r) => setTimeout(r, 60000));
          throw new AppError('AI Provider Gateway Timeout', 504, 'AI_TIMEOUT');
        case 'server_error':
          throw new AppError('Internal AI Provider Server Failure (HTTP 500)', 500, 'AI_PROVIDER_UNAVAILABLE');
        case 'invalid_input':
          throw new AppError('Invalid prompt or input payload provided', 400, 'AI_INVALID_INPUT');
      }
    }
  }

  // 1. Text Generation
  async generateText(req: AITextRequest): Promise<Omit<AITextResponse, 'gateway'>> {
    await this.checkSimulation();
    const model = req.model || this.defaultModels.text_generation!;
    return {
      text: `[${model}] Generated cinematic script summary for prompt: "${req.prompt}". Scene transitions are calibrated for high engagement.`,
      finishReason: 'stop',
    };
  }

  // 2. Structured JSON
  async generateStructuredJson<T>(req: AIStructuredJsonRequest<T>): Promise<Omit<AIStructuredJsonResponse<T>, 'gateway'>> {
    await this.checkSimulation();
    const sampleStructuredData: Record<string, any> = {
      title: 'Cinematic Teaser',
      recommendedColorGrade: 'teal_and_orange',
      keyThemes: ['action', 'pace', 'dynamic_cuts'],
      timelineMarkers: [
        { time: 1.2, note: 'Beat drop' },
        { time: 4.5, note: 'Hook climax' },
      ],
    };

    return {
      data: sampleStructuredData as T,
      rawJson: JSON.stringify(sampleStructuredData),
    };
  }

  // 3. Speech-to-Text
  async speechToText(req: AISpeechToTextRequest): Promise<Omit<AISpeechToTextResponse, 'gateway'>> {
    await this.checkSimulation();
    const lang = req.language || 'en';
    return {
      text: 'Welcome to TechXayan Creative video editor. Empowering creators on Windows and Android.',
      language: lang,
      durationSeconds: 6.4,
      speakers: [
        { id: 'spk_1', name: 'Speaker 1', color: '#38BDF8' },
        { id: 'spk_2', name: 'Speaker 2', color: '#A855F7' },
      ],
      segments: [
        {
          id: 'seg-1',
          start: 0.0,
          end: 3.1,
          text: 'Welcome to TechXayan Creative video editor.',
          speakerId: 'spk_1',
          speakerName: 'Speaker 1',
          words: [
            { word: 'Welcome', start: 0.0, end: 0.5, confidence: 0.99, speakerId: 'spk_1' },
            { word: 'to', start: 0.6, end: 0.8, confidence: 0.98, speakerId: 'spk_1' },
            { word: 'TechXayan', start: 0.9, end: 1.6, confidence: 0.96, speakerId: 'spk_1' },
            { word: 'Creative', start: 1.7, end: 2.3, confidence: 0.97, speakerId: 'spk_1' },
            { word: 'video', start: 2.4, end: 2.7, confidence: 0.98, speakerId: 'spk_1' },
            { word: 'editor.', start: 2.8, end: 3.1, confidence: 0.99, speakerId: 'spk_1' },
          ],
        },
        {
          id: 'seg-2',
          start: 3.3,
          end: 6.4,
          text: 'Empowering creators on Windows and Android.',
          speakerId: 'spk_2',
          speakerName: 'Speaker 2',
          words: [
            { word: 'Empowering', start: 3.3, end: 4.1, confidence: 0.98, speakerId: 'spk_2' },
            { word: 'creators', start: 4.2, end: 4.8, confidence: 0.99, speakerId: 'spk_2' },
            { word: 'on', start: 4.9, end: 5.1, confidence: 0.99, speakerId: 'spk_2' },
            { word: 'Windows', start: 5.2, end: 5.7, confidence: 0.97, speakerId: 'spk_2' },
            { word: 'and', start: 5.8, end: 5.9, confidence: 0.99, speakerId: 'spk_2' },
            { word: 'Android.', start: 6.0, end: 6.4, confidence: 0.98, speakerId: 'spk_2' },
          ],
        },
      ],
    };
  }

  // 4. Text-to-Speech
  async textToSpeech(req: AITextToSpeechRequest): Promise<Omit<AITextToSpeechResponse, 'gateway'>> {
    await this.checkSimulation();
    const format = req.format || 'mp3';
    return {
      audioUrl: `https://mock-ai.local/tts/generated_voice_${Date.now()}.${format}`,
      format,
      durationSeconds: Math.max(1.0, req.text.length * 0.06),
      characterCount: req.text.length,
    };
  }

  // 5. Image Generation
  async generateImage(req: AIImageRequest): Promise<Omit<AIImageResponse, 'gateway'>> {
    await this.checkSimulation();
    const count = req.count || 1;
    const images = [];
    for (let i = 0; i < count; i++) {
      images.push({
        url: `https://mock-ai.local/images/gen_${Date.now()}_${i}.png`,
        width: req.width || 1024,
        height: req.height || 1024,
      });
    }
    return { images };
  }

  // 6. Video Generation
  async generateVideo(req: AIVideoRequest): Promise<Omit<AIVideoResponse, 'gateway'>> {
    await this.checkSimulation();
    return {
      videoUrl: `https://mock-ai.local/video/broll_${Date.now()}.mp4`,
      durationSeconds: req.durationSeconds || 5.0,
      resolution: req.resolution || '1080p',
      fps: req.fps || 30,
    };
  }

  // 7. Embedding
  async generateEmbedding(req: AIEmbeddingRequest): Promise<Omit<AIEmbeddingResponse, 'gateway'>> {
    await this.checkSimulation();
    const count = Array.isArray(req.input) ? req.input.length : 1;
    const dims = req.dimensions || 1536;
    const embeddings: number[][] = [];
    for (let i = 0; i < count; i++) {
      const vec: number[] = [];
      for (let d = 0; d < dims; d++) {
        vec.push(Math.round(Math.sin(d * 0.17 + i) * 1000) / 1000);
      }
      embeddings.push(vec);
    }
    return {
      embeddings,
      dimensions: dims,
    };
  }

  // 8. Vision
  async analyzeVision(req: AIVisionRequest): Promise<Omit<AIVisionResponse, 'gateway'>> {
    await this.checkSimulation();
    return {
      text: `Vision Analysis for prompt "${req.prompt}": Scene features high-contrast cinematic lighting with a focal subject in the central third. Color palette dominated by deep blues and amber accents.`,
      labels: ['cinematic', 'portrait', 'lighting_dramatic', 'teal_orange'],
      objects: [
        { label: 'person', confidence: 0.96, box: [0.1, 0.25, 0.85, 0.75] },
        { label: 'camera', confidence: 0.88, box: [0.4, 0.3, 0.6, 0.5] },
      ],
    };
  }

  // 9. Audio Analysis
  async analyzeAudio(req: AIAudioAnalysisRequest): Promise<Omit<AIAudioAnalysisResponse, 'gateway'>> {
    await this.checkSimulation();
    const minSilence = req.minSilenceSeconds || 0.5;
    return {
      silences: [
        { start: 2.1, end: 2.8, durationSeconds: 0.7 },
        { start: 5.4, end: 6.2, durationSeconds: 0.8 },
      ],
      recommendedCuts: [
        { start: 2.2, end: 2.7 },
        { start: 5.5, end: 6.1 },
      ],
      savedTimeSeconds: 1.1,
      beatsBpm: 120,
      soundEvents: [
        { label: 'speech', start: 0.0, end: 2.1, confidence: 0.98 },
        { label: 'speech', start: 2.8, end: 5.4, confidence: 0.95 },
      ],
    };
  }
}
