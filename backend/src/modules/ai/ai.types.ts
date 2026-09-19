export interface SubtitleSegment {
  id: string;
  start: number; // in seconds
  end: number;
  text: string;
  words?: Array<{ word: string; start: number; end: number }>;
}

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
