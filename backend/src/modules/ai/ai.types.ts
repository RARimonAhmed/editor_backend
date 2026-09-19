// Standardized AI Gateway Modalities & Unified Interfaces

export type AICapability =
  | 'text_generation'
  | 'structured_json'
  | 'speech_to_text'
  | 'text_to_speech'
  | 'image_generation'
  | 'video_generation'
  | 'music_generation'
  | 'sfx_generation'
  | 'embedding'
  | 'vision'
  | 'audio_analysis';


// Token & Usage Normalization
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface AIUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  audioDurationSeconds?: number;
  imageCount?: number;
  videoDurationSeconds?: number;
  characterCount?: number;
  estimatedCostCredits: number;
  providerCostUsd?: number;
}

export interface AIGatewayMetadata {
  provider: string;
  model: string;
  latencyMs: number;
  fallbackUsed?: boolean;
  fallbackFrom?: string;
  timestamp: string;
  usage: AIUsage;
}

// ----------------------------------------------------------------------------
// 1. TEXT GENERATION
// ----------------------------------------------------------------------------
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AITextRequest {
  prompt: string;
  systemPrompt?: string;
  messages?: ChatMessage[];
  model?: string;
  provider?: string;
  fallbackProvider?: string;
  temperature?: number;
  maxTokens?: number;
  stopSequences?: string[];
  timeoutMs?: number;
}

export interface AITextResponse {
  text: string;
  finishReason: 'stop' | 'length' | 'content_filter' | 'error';
  gateway: AIGatewayMetadata;
}

// ----------------------------------------------------------------------------
// 2. STRUCTURED JSON
// ----------------------------------------------------------------------------
export interface AIStructuredJsonRequest<T = any> {
  prompt: string;
  schema: Record<string, any>;
  schemaName?: string;
  systemPrompt?: string;
  model?: string;
  provider?: string;
  fallbackProvider?: string;
  temperature?: number;
  timeoutMs?: number;
}

export interface AIStructuredJsonResponse<T = any> {
  data: T;
  rawJson: string;
  gateway: AIGatewayMetadata;
}

// ----------------------------------------------------------------------------
// 3. SPEECH-TO-TEXT (TRANSCRIPTION)
// ----------------------------------------------------------------------------
export interface WordTimestamp {
  word: string;
  start: number;
  end: number;
  confidence?: number;
  speakerId?: string;
}

export interface SubtitleSegment {
  id: string;
  start: number;
  end: number;
  text: string;
  speakerId?: string;
  speakerName?: string;
  words?: WordTimestamp[];
}

export interface AISpeechToTextRequest {
  audioUrl?: string;
  audioBase64?: string;
  mimeType?: string;
  language?: string;
  prompt?: string;
  wordTimestamps?: boolean;
  speakerDiarization?: boolean;
  model?: string;
  provider?: string;
  fallbackProvider?: string;
  timeoutMs?: number;
  skipCreditDeduction?: boolean;
}

export interface AISpeechToTextResponse {
  text: string;
  language: string;
  durationSeconds: number;
  segments: SubtitleSegment[];
  words?: WordTimestamp[];
  speakers?: Array<{ id: string; name: string; color: string }>;
  gateway: AIGatewayMetadata;
}

// ----------------------------------------------------------------------------
// 4. TEXT-TO-SPEECH (VOICE SYNTHESIS)
// ----------------------------------------------------------------------------
export interface AITextToSpeechRequest {
  text: string;
  voiceId?: string;
  voiceGender?: 'male' | 'female' | 'neutral';
  speed?: number; // 0.5 to 2.0
  pitch?: number;
  format?: 'mp3' | 'wav' | 'aac';
  model?: string;
  provider?: string;
  fallbackProvider?: string;
  timeoutMs?: number;
}

export interface AITextToSpeechResponse {
  audioUrl: string;
  audioBase64?: string;
  format: string;
  durationSeconds: number;
  characterCount: number;
  gateway: AIGatewayMetadata;
}

// ----------------------------------------------------------------------------
// 5. IMAGE GENERATION
// ----------------------------------------------------------------------------
export interface AIImageRequest {
  prompt: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
  aspectRatio?: '1:1' | '16:9' | '9:16' | '4:3';
  count?: number;
  style?: string;
  model?: string;
  provider?: string;
  fallbackProvider?: string;
  timeoutMs?: number;
}

export interface GeneratedImageItem {
  url: string;
  base64?: string;
  width: number;
  height: number;
}

export interface AIImageResponse {
  images: GeneratedImageItem[];
  gateway: AIGatewayMetadata;
}

// ----------------------------------------------------------------------------
// 6. VIDEO GENERATION (B-ROLL & SYNTHETIC ASSETS)
// ----------------------------------------------------------------------------
export interface AIVideoRequest {
  prompt: string;
  imageUrl?: string;
  durationSeconds?: number;
  fps?: number;
  resolution?: '720p' | '1080p';
  motionStrength?: number;
  model?: string;
  provider?: string;
  fallbackProvider?: string;
  timeoutMs?: number;
}

export interface AIVideoResponse {
  videoUrl: string;
  durationSeconds: number;
  resolution: string;
  fps: number;
  gateway: AIGatewayMetadata;
}

// ----------------------------------------------------------------------------
// 7. EMBEDDING
// ----------------------------------------------------------------------------
export interface AIEmbeddingRequest {
  input: string | string[];
  dimensions?: number;
  model?: string;
  provider?: string;
  fallbackProvider?: string;
  timeoutMs?: number;
}

export interface AIEmbeddingResponse {
  embeddings: number[][];
  dimensions: number;
  gateway: AIGatewayMetadata;
}

// ----------------------------------------------------------------------------
// 8. VISION (MULTIMODAL IMAGE ANALYSIS)
// ----------------------------------------------------------------------------
export interface VisionImageSource {
  url?: string;
  base64?: string;
  mimeType: string;
}

export interface AIVisionRequest {
  images: VisionImageSource[];
  prompt: string;
  maxTokens?: number;
  model?: string;
  provider?: string;
  fallbackProvider?: string;
  timeoutMs?: number;
}

export interface DetectedVisualObject {
  label: string;
  confidence: number;
  box?: [number, number, number, number]; // [ymin, xmin, ymax, xmax]
}

export interface AIVisionResponse {
  text: string;
  labels?: string[];
  objects?: DetectedVisualObject[];
  gateway: AIGatewayMetadata;
}

// ----------------------------------------------------------------------------
// 9. AUDIO ANALYSIS (SMART CUTS & BEAT DETECTION)
// ----------------------------------------------------------------------------
export interface AIAudioAnalysisRequest {
  audioUrl?: string;
  audioBase64?: string;
  minSilenceSeconds?: number;
  detectBeats?: boolean;
  model?: string;
  provider?: string;
  fallbackProvider?: string;
  timeoutMs?: number;
}

export interface SilenceInterval {
  start: number;
  end: number;
  durationSeconds: number;
}

export interface SoundEvent {
  label: string;
  start: number;
  end: number;
  confidence: number;
}

export interface AIAudioAnalysisResponse {
  silences: SilenceInterval[];
  recommendedCuts: Array<{ start: number; end: number }>;
  savedTimeSeconds: number;
  beatsBpm?: number;
  soundEvents?: SoundEvent[];
  gateway: AIGatewayMetadata;
}

// ----------------------------------------------------------------------------
// 10. MUSIC GENERATION
// ----------------------------------------------------------------------------
export interface AIMusicRequest {
  prompt: string;
  genre?: string;
  tempoBpm?: number;
  durationSeconds?: number;
  mood?: string;
  model?: string;
  provider?: string;
  fallbackProvider?: string;
  timeoutMs?: number;
  skipCreditDeduction?: boolean;
}

export interface AIMusicResponse {
  audioUrl: string;
  audioBase64?: string;
  durationSeconds: number;
  genre?: string;
  tempoBpm?: number;
  gateway: AIGatewayMetadata;
}

// ----------------------------------------------------------------------------
// 11. SFX GENERATION
// ----------------------------------------------------------------------------
export interface AISfxRequest {
  prompt: string;
  category?: string;
  durationSeconds?: number;
  model?: string;
  provider?: string;
  fallbackProvider?: string;
  timeoutMs?: number;
  skipCreditDeduction?: boolean;
}

export interface AISfxResponse {
  audioUrl: string;
  audioBase64?: string;
  durationSeconds: number;
  category?: string;
  gateway: AIGatewayMetadata;
}

// ----------------------------------------------------------------------------
// PROVIDER ADAPTER CONTRACT
// ----------------------------------------------------------------------------
export interface IAIProviderAdapter {
  readonly id: string;
  readonly name: string;
  readonly supportedCapabilities: AICapability[];
  readonly defaultModels: Partial<Record<AICapability, string>>;

  generateText?(req: AITextRequest): Promise<Omit<AITextResponse, 'gateway'>>;
  generateStructuredJson?<T>(req: AIStructuredJsonRequest<T>): Promise<Omit<AIStructuredJsonResponse<T>, 'gateway'>>;
  speechToText?(req: AISpeechToTextRequest): Promise<Omit<AISpeechToTextResponse, 'gateway'>>;
  textToSpeech?(req: AITextToSpeechRequest): Promise<Omit<AITextToSpeechResponse, 'gateway'>>;
  generateImage?(req: AIImageRequest): Promise<Omit<AIImageResponse, 'gateway'>>;
  generateVideo?(req: AIVideoRequest): Promise<Omit<AIVideoResponse, 'gateway'>>;
  generateMusic?(req: AIMusicRequest): Promise<Omit<AIMusicResponse, 'gateway'>>;
  generateSFX?(req: AISfxRequest): Promise<Omit<AISfxResponse, 'gateway'>>;
  generateEmbedding?(req: AIEmbeddingRequest): Promise<Omit<AIEmbeddingResponse, 'gateway'>>;
  analyzeVision?(req: AIVisionRequest): Promise<Omit<AIVisionResponse, 'gateway'>>;
  analyzeAudio?(req: AIAudioAnalysisRequest): Promise<Omit<AIAudioAnalysisResponse, 'gateway'>>;
}


// ----------------------------------------------------------------------------
// BACKWARD COMPATIBILITY LEGACY TYPES
// ----------------------------------------------------------------------------
export interface TranscriptionResult {
  language: string;
  duration: number;
  fullText: string;
  segments: SubtitleSegment[];
}

export interface SmartCutResult {
  silenceIntervals: Array<{ start: number; end: number }>;
  recommendedCuts: Array<{ start: number; end: number }>;
  savedTimeSeconds: number;
}

export interface GenerateVisualResult {
  prompt: string;
  assetUrl: string;
  duration: number;
}

export interface IAIProvider {
  name: string;
  transcribeAudio(mediaUrl: string, language?: string): Promise<TranscriptionResult>;
  generateCaptions(mediaUrl: string, style?: string): Promise<SubtitleSegment[]>;
  detectSilences(mediaUrl: string, minSilenceDurationSeconds?: number): Promise<SmartCutResult>;
  generateBroll(prompt: string, durationSeconds?: number): Promise<GenerateVisualResult>;
}
