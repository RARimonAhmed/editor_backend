import { FastifyRequest, FastifyReply } from 'fastify';
import { transcriptionService } from './transcription.service.js';
import {
  transcribeMediaSchema,
  getTranscriptionParamsSchema,
  GetTranscriptionParams,
} from './transcription.schemas.js';
import { createSuccessResponse } from '../../../core/response.js';

export class TranscriptionController {
  /**
   * POST /v1/ai/transcribe
   * Transcribe media into rich transcript, word timestamps, speakers, SRT, VTT, and Caption objects
   */
  async transcribe(req: FastifyRequest, reply: FastifyReply) {
    const userId = req.user!.userId;
    const body = transcribeMediaSchema.parse(req.body);

    const transcription = await transcriptionService.transcribe(userId, body);

    return reply.status(200).send(
      createSuccessResponse(
        {
          id: transcription.id,
          fullText: transcription.transcript,
          transcript: transcription.transcript,
          language: transcription.language,
          duration: transcription.durationSeconds,
          durationSeconds: transcription.durationSeconds,
          words: transcription.words,
          speakers: transcription.speakers,
          segments: transcription.segments,
          srt: transcription.srt,
          vtt: transcription.vtt,
          captionObjects: transcription.captionObjects,
          transcription,
        },
        { message: 'Speech-to-Text transcription completed successfully' }
      )
    );
  }

  /**
   * GET /v1/ai/transcriptions/:id
   * Fetch complete transcription document
   */
  async getTranscription(
    req: FastifyRequest<{ Params: GetTranscriptionParams }>,
    reply: FastifyReply
  ) {
    const userId = req.user!.userId;
    const { id } = getTranscriptionParamsSchema.parse(req.params);

    const transcription = await transcriptionService.getTranscription(id, userId);

    return reply.status(200).send(createSuccessResponse({ transcription }));
  }

  /**
   * GET /v1/ai/transcriptions/:id/srt
   * Download or stream raw SubRip (.srt) subtitle file
   */
  async getSrt(
    req: FastifyRequest<{ Params: GetTranscriptionParams }>,
    reply: FastifyReply
  ) {
    const userId = req.user!.userId;
    const { id } = getTranscriptionParamsSchema.parse(req.params);

    const srt = await transcriptionService.getSrt(id, userId);

    return reply
      .header('Content-Type', 'application/x-subrip; charset=utf-8')
      .header('Content-Disposition', `inline; filename="transcription-${id}.srt"`)
      .status(200)
      .send(srt);
  }

  /**
   * GET /v1/ai/transcriptions/:id/vtt
   * Download or stream raw WebVTT (.vtt) subtitle file
   */
  async getVtt(
    req: FastifyRequest<{ Params: GetTranscriptionParams }>,
    reply: FastifyReply
  ) {
    const userId = req.user!.userId;
    const { id } = getTranscriptionParamsSchema.parse(req.params);

    const vtt = await transcriptionService.getVtt(id, userId);

    return reply
      .header('Content-Type', 'text/vtt; charset=utf-8')
      .header('Content-Disposition', `inline; filename="transcription-${id}.vtt"`)
      .status(200)
      .send(vtt);
  }
}

export const transcriptionController = new TranscriptionController();
