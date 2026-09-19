export interface SpeakerInfo {
  id: string;
  name: string;
  color: string;
  totalSpeakingSeconds?: number;
}

export interface WordTiming {
  word: string;
  start: number;
  end: number;
  confidence: number;
  speakerId?: string;
}

export interface CaptionSegment {
  id: string;
  start: number;
  end: number;
  text: string;
  speakerId?: string;
  speakerName?: string;
  words: WordTiming[];
}

export interface CaptionStyleOptions {
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: string;
  color?: string;
  backgroundColor?: string;
  alignment?: 'center' | 'left' | 'right';
  yOffsetPercent?: number;
  animation?: 'karaoke' | 'dynamic' | 'standard' | 'minimal';
  activeWordColor?: string;
}

export interface TimelineCaptionObject {
  id: string;
  trackId: string;
  name: string;
  start: number;
  duration: number;
  sourceStart: number;
  text: string;
  speaker?: {
    id: string;
    name: string;
    color: string;
  };
  words: WordTiming[];
  style: {
    fontFamily: string;
    fontSize: number;
    fontWeight: string;
    color: string;
    backgroundColor: string;
    alignment: 'center' | 'left' | 'right';
    yOffsetPercent: number;
    animation: 'karaoke' | 'dynamic' | 'standard' | 'minimal';
    activeWordColor: string;
  };
  transform: {
    positionX: number;
    positionY: number;
    scale: number;
    opacity: number;
  };
}

export interface TranscriptionDocument {
  id: string;
  userId: string;
  mediaUrl: string;
  mediaAssetId?: string | null;
  language: string;
  durationSeconds: number;
  transcript: string;
  words: WordTiming[];
  speakers: SpeakerInfo[];
  segments: CaptionSegment[];
  srt: string;
  vtt: string;
  captionObjects: TimelineCaptionObject[];
  createdAt: string;
  completedAt: string;
}

export interface TranscribeMediaInput {
  mediaUrl?: string;
  mediaAssetId?: string;
  audioBase64?: string;
  language?: string;
  speakerDiarization?: boolean;
  maxSpeakers?: number;
  wordsPerCaption?: number;
  captionStyle?: 'karaoke' | 'dynamic' | 'standard' | 'minimal';
  provider?: string;
  model?: string;
}
