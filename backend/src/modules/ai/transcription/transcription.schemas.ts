import { z } from 'zod';

export const transcribeMediaSchema = z.object({
  mediaUrl: z.string().url('Invalid media URL').optional(),
  mediaAssetId: z.string().uuid('Invalid media asset ID').optional(),
  audioBase64: z.string().optional(),
  language: z.string().default('en'),
  speakerDiarization: z.boolean().default(true),
  maxSpeakers: z.number().int().min(1).max(10).default(5),
  wordsPerCaption: z.number().int().min(2).max(15).default(6),
  captionStyle: z.enum(['karaoke', 'dynamic', 'standard', 'minimal']).default('dynamic'),
  provider: z.string().optional(),
  model: z.string().optional(),
}).refine(
  (data) => data.mediaUrl || data.mediaAssetId || data.audioBase64,
  {
    message: 'Either mediaUrl, mediaAssetId, or audioBase64 must be provided',
    path: ['mediaUrl'],
  }
);

export const getTranscriptionParamsSchema = z.object({
  id: z.string().uuid('Invalid transcription ID format'),
});

export type TranscribeMediaBody = z.infer<typeof transcribeMediaSchema>;
export type GetTranscriptionParams = z.infer<typeof getTranscriptionParamsSchema>;
