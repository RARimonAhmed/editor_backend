/**
 * Domain types for Media Intelligence and Semantic Search
 * 
 * Extracts searchable multi-modal metadata: visual objects, anonymous faces,
 * speech/transcript, speakers, scenes, explicit source locations, audio events, and embeddings.
 * 
 * PRIVACY INVARIANT:
 * Strictly prohibits inferring sensitive personal attributes (race, gender, emotion, age, biometrics).
 * Faces are tracked solely by spatial bounding boxes, count, and frame presence.
 */

export interface DetectedVisualObject {
  id: string;
  label: string;
  confidence: number;
  start: number;
  end: number;
  box?: [number, number, number, number]; // [ymin, xmin, ymax, xmax] normalized 0.0 - 1.0
}

export interface DetectedFace {
  id: string;
  start: number;
  end: number;
  box?: [number, number, number, number]; // [ymin, xmin, ymax, xmax] normalized
  confidence: number;
  faceCount: number;
  // NOTE: Strictly no sensitive personal attributes (race, gender, emotion, biometrics)
}

export interface DetectedAudioEvent {
  id: string;
  label: string; // 'engine_hum', 'applause', 'music', 'footsteps', 'door_slam', 'ambient'
  start: number;
  end: number;
  confidence: number;
}

export interface DetectedSceneSegment {
  sceneIndex: number;
  start: number;
  end: number;
  keyframeTime: number;
  description: string;
  tags: string[];
}

export interface SourceLocationMetadata {
  latitude: number;
  longitude: number;
  placeName?: string;
  city?: string;
  country?: string;
  source: 'exif' | 'metadata';
}

export interface SegmentEmbedding {
  start: number;
  end: number;
  embedding: number[];
  textSnippet: string;
  objects: string[];
  hasSpeech: boolean;
}

export interface MediaIntelligenceMetadata {
  mediaId: string;
  userId: string;
  projectId?: string;
  fileName: string;
  category: string;
  durationSeconds: number;
  visualObjects: DetectedVisualObject[];
  faces: DetectedFace[];
  audioEvents: DetectedAudioEvent[];
  scenes: DetectedSceneSegment[];
  transcript?: string;
  speechSegments?: Array<{
    start: number;
    end: number;
    text: string;
    speakerId?: string;
  }>;
  speakers?: Array<{ id: string; name: string }>;
  location: SourceLocationMetadata | null;
  assetEmbedding: number[];
  segmentEmbeddings: SegmentEmbedding[];
  summary: string;
  keywords: string[];
  indexedAt: string;
}

export interface TimeRangeMatch {
  start: number;
  end: number;
  score: number;
  snippet: string;
  matchedObjects: string[];
  matchedSpeech?: string;
  matchedAudioEvents?: string[];
  matchedScenes?: string[];
  thumbnailUrl?: string;
}

export interface SemanticSearchResultItem {
  assetId: string;
  assetName: string;
  category: string;
  duration: number;
  score: number;
  matchingRanges: TimeRangeMatch[];
  intelligenceSummary: string;
  location?: SourceLocationMetadata | null;
  thumbnailUrl?: string;
  downloadUrl?: string;
  createdAt?: string;
}

export type SearchMode = 'semantic' | 'hybrid' | 'object' | 'speech' | 'scene';

export interface SemanticSearchQuery {
  query: string;
  mode?: SearchMode;
  objects?: string[];
  speechQuery?: string;
  sceneQuery?: string;
  audioEvents?: string[];
  minDuration?: number;
  maxDuration?: number;
  createdAfter?: string;
  createdBefore?: string;
  category?: string;
  projectId?: string;
  limit?: number;
  offset?: number;
}
