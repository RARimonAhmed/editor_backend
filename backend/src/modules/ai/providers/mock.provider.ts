import { IAIProvider, TranscriptionResult, SubtitleSegment, SmartCutResult, GenerateVisualResult } from '../ai.types.js';
import { logger } from '../../../core/logger.js';

export class MockAIProvider implements IAIProvider {
  public readonly name = 'mock';

  async transcribeAudio(mediaUrl: string, language = 'en'): Promise<TranscriptionResult> {
    logger.info({ mediaUrl, language }, 'MockAIProvider: Processing audio transcription');

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
      language,
      duration: 8.5,
      fullText: 'Welcome to TechXayan Creative video editor. Transforming your vision into cinematic masterpieces on Windows and Android.',
      segments,
    };
  }

  async generateCaptions(mediaUrl: string, style = 'dynamic-word'): Promise<SubtitleSegment[]> {
    const res = await this.transcribeAudio(mediaUrl);
    return res.segments;
  }

  async detectSilences(mediaUrl: string, minSilenceDurationSeconds = 0.6): Promise<SmartCutResult> {
    logger.info({ mediaUrl, minSilenceDurationSeconds }, 'MockAIProvider: Detecting video speech silences');
    return {
      silenceIntervals: [
        { start: 4.2, end: 4.8 },
        { start: 8.5, end: 9.8 },
      ],
      recommendedCuts: [
        { start: 4.3, end: 4.7 },
        { start: 8.6, end: 9.7 },
      ],
      savedTimeSeconds: 1.5,
    };
  }

  async generateBroll(prompt: string, durationSeconds = 5): Promise<GenerateVisualResult> {
    logger.info({ prompt, durationSeconds }, 'MockAIProvider: Generating synthetic B-roll visual asset');
    return {
      prompt,
      assetUrl: 'https://mock-storage.local/generated/broll-cinematic-sunset.mp4',
      duration: durationSeconds,
    };
  }
}
