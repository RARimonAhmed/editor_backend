import { v4 as uuidv4 } from 'uuid';
import {
  TranscriptionDocument,
  TranscribeMediaInput,
  WordTiming,
  SpeakerInfo,
  CaptionSegment,
} from './transcription.types.js';
import {
  generateSrt,
  generateVtt,
  buildTimelineCaptionObjects,
} from './caption-formatter.js';
import { aiGatewayService } from '../ai-gateway.service.js';
import { mediaService } from '../../media/media.service.js';
import { storageService } from '../../../services/storage/index.js';
import { db } from '../../../database/client.js';
import { NotFoundError, ForbiddenError, ValidationError } from '../../../core/errors.js';
import { logger } from '../../../core/logger.js';

// In-memory transcription store for instant access and unit testing
const mockTranscriptions = new Map<string, TranscriptionDocument>();

const SPEAKER_PALETTE = ['#38BDF8', '#A855F7', '#34D399', '#FB923C', '#F43F5E', '#FBBF24'];

export class TranscriptionService {
  /**
   * Transcribes audio or video media and produces rich transcript, words,
   * speaker IDs, SRT, VTT, and native timeline Caption objects
   */
  async transcribe(userId: string, input: TranscribeMediaInput): Promise<TranscriptionDocument> {
    let resolvedAudioUrl = input.mediaUrl;

    // 1. Resolve media from mediaAssetId if provided
    if (input.mediaAssetId) {
      try {
        const asset = await mediaService.getById(input.mediaAssetId, userId);
        resolvedAudioUrl = asset.downloadUrl || (await storageService.getDownloadPresignedUrl(asset.fileKey));
      } catch (err) {
        logger.warn({ err, mediaAssetId: input.mediaAssetId }, 'Failed to resolve mediaAssetId; falling back to direct URL if present');
        if (!resolvedAudioUrl) {
          throw err;
        }
      }
    }

    if (!resolvedAudioUrl && !input.audioBase64) {
      throw new ValidationError('Either mediaUrl, mediaAssetId, or audioBase64 must be provided');
    }

    logger.info({ userId, mediaAssetId: input.mediaAssetId, language: input.language }, 'Initiating Speech-to-Text inference');

    // 2. Dispatch to AI Gateway Speech-to-Text
    const sttRes = await aiGatewayService.speechToText(userId, {
      audioUrl: resolvedAudioUrl,
      audioBase64: input.audioBase64,
      language: input.language,
      provider: input.provider,
      model: input.model,
      wordTimestamps: true,
      speakerDiarization: input.speakerDiarization ?? true,
    });

    const docId = uuidv4();
    const now = new Date().toISOString();

    // 3. Normalize Words with Timestamps and Speaker IDs
    const normalizedWords: WordTiming[] = [];
    if (sttRes.words && sttRes.words.length > 0) {
      for (const w of sttRes.words) {
        normalizedWords.push({
          word: w.word,
          start: Number(w.start.toFixed(3)),
          end: Number(w.end.toFixed(3)),
          confidence: w.confidence ?? 0.95,
          speakerId: w.speakerId || 'spk_1',
        });
      }
    } else {
      // Fallback: extract words from segments
      for (const seg of sttRes.segments) {
        if (seg.words && seg.words.length > 0) {
          for (const w of seg.words) {
            normalizedWords.push({
              word: w.word,
              start: Number(w.start.toFixed(3)),
              end: Number(w.end.toFixed(3)),
              confidence: w.confidence ?? 0.95,
              speakerId: w.speakerId || seg.speakerId || 'spk_1',
            });
          }
        }
      }
    }

    // 4. Normalize Speakers and Diarization Metadata
    const speakersMap = new Map<string, SpeakerInfo>();

    if (sttRes.speakers && sttRes.speakers.length > 0) {
      sttRes.speakers.forEach((s, idx) => {
        speakersMap.set(s.id, {
          id: s.id,
          name: s.name,
          color: s.color || SPEAKER_PALETTE[idx % SPEAKER_PALETTE.length],
          totalSpeakingSeconds: 0,
        });
      });
    }

    // 5. Normalize Caption Segments
    const normalizedSegments: CaptionSegment[] = sttRes.segments.map((seg, idx) => {
      const spkId = seg.speakerId || 'spk_1';
      const spkName = seg.speakerName || `Speaker ${spkId.replace('spk_', '') || '1'}`;

      if (!speakersMap.has(spkId)) {
        speakersMap.set(spkId, {
          id: spkId,
          name: spkName,
          color: SPEAKER_PALETTE[speakersMap.size % SPEAKER_PALETTE.length],
          totalSpeakingSeconds: 0,
        });
      }

      const segWords = (seg.words && seg.words.length > 0
        ? seg.words
        : normalizedWords.filter((w) => w.start >= seg.start && w.end <= seg.end + 0.1)
      ).map((w) => ({
        word: w.word,
        start: Number(w.start.toFixed(3)),
        end: Number(w.end.toFixed(3)),
        confidence: w.confidence ?? 0.95,
        speakerId: w.speakerId || spkId,
      }));

      // Accumulate speaking time
      const speakerObj = speakersMap.get(spkId)!;
      speakerObj.totalSpeakingSeconds = Number(
        ((speakerObj.totalSpeakingSeconds || 0) + (seg.end - seg.start)).toFixed(2)
      );

      return {
        id: seg.id || `seg-${idx + 1}`,
        start: Number(seg.start.toFixed(3)),
        end: Number(seg.end.toFixed(3)),
        text: seg.text.trim(),
        speakerId: spkId,
        speakerName: spkName,
        words: segWords,
      };
    });

    const speakersList = Array.from(speakersMap.values());

    // 6. Build Multi-Format Subtitles
    const srt = generateSrt(normalizedSegments);
    const vtt = generateVtt(normalizedSegments);
    const captionObjects = buildTimelineCaptionObjects(
      normalizedSegments,
      speakersList,
      input.captionStyle || 'dynamic'
    );

    // 7. Assemble Complete Document
    const document: TranscriptionDocument = {
      id: docId,
      userId,
      mediaUrl: resolvedAudioUrl || 'inline://base64',
      mediaAssetId: input.mediaAssetId || null,
      language: sttRes.language || input.language || 'en',
      durationSeconds: Number(sttRes.durationSeconds.toFixed(2)),
      transcript: sttRes.text.trim(),
      words: normalizedWords,
      speakers: speakersList,
      segments: normalizedSegments,
      srt,
      vtt,
      captionObjects,
      createdAt: now,
      completedAt: now,
    };

    // Store in memory
    mockTranscriptions.set(docId, document);

    // Persist to PostgreSQL if available
    try {
      if (await db.isHealthy()) {
        await db.query(
          `INSERT INTO ai_outputs (id, job_id, output_type, content_json, created_at)
           VALUES ($1, $1, $2, $3, CURRENT_TIMESTAMP)
           ON CONFLICT (id) DO NOTHING;`,
          [docId, 'transcription_document', JSON.stringify(document)]
        );
      }
    } catch {
      // non-blocking fallback
    }

    logger.info(
      { docId, userId, wordCount: normalizedWords.length, segments: normalizedSegments.length },
      'Speech-to-Text transcription pipeline successfully completed'
    );

    return document;
  }

  /**
   * Retrieves single transcription document ensuring ownership
   */
  async getTranscription(id: string, userId: string): Promise<TranscriptionDocument> {
    const doc = mockTranscriptions.get(id);
    if (!doc) {
      throw new NotFoundError(`Transcription not found: ${id}`);
    }

    if (doc.userId !== userId) {
      throw new ForbiddenError('You do not have permission to view this transcription');
    }

    return doc;
  }

  /**
   * Returns raw SubRip (.srt) subtitle string
   */
  async getSrt(id: string, userId: string): Promise<string> {
    const doc = await this.getTranscription(id, userId);
    return doc.srt;
  }

  /**
   * Returns raw WebVTT (.vtt) subtitle string
   */
  async getVtt(id: string, userId: string): Promise<string> {
    const doc = await this.getTranscription(id, userId);
    return doc.vtt;
  }
}

export const transcriptionService = new TranscriptionService();
