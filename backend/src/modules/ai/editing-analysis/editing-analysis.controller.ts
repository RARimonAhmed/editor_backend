import { FastifyRequest, FastifyReply } from 'fastify';
import { editingAnalysisService } from './editing-analysis.service.js';
import {
  runEditingAnalysisSchema,
  validateCommandsSchema,
  applyEditingCommandsSchema,
  getAnalysisParamsSchema,
} from './editing-analysis.schemas.js';
import { createSuccessResponse } from '../../../core/response.js';
import { ValidationError } from '../../../core/errors.js';

export class EditingAnalysisController {
  /**
   * POST /v1/ai/editing-analysis
   * Analyzes media or project and generates structured Editor Commands (silences, fillers, pauses, scenes, highlights).
   * Strictly non-destructive: AI does NOT modify project data directly.
   */
  async runAnalysis(request: FastifyRequest, reply: FastifyReply) {
    const parse = runEditingAnalysisSchema.safeParse(request.body);
    if (!parse.success) {
      throw new ValidationError('Invalid editing analysis request', parse.error.format());
    }

    const userId = request.user!.userId;
    const result = await editingAnalysisService.runAnalysis(userId, parse.data);
    return reply.status(200).send(createSuccessResponse(result));
  }

  /**
   * POST /v1/ai/editing-analysis/validate
   * Validates user-adjusted editor commands and calculates preview diff without mutating timeline.
   */
  async validateCommands(request: FastifyRequest, reply: FastifyReply) {
    const parse = validateCommandsSchema.safeParse(request.body);
    if (!parse.success) {
      throw new ValidationError('Invalid command validation request', parse.error.format());
    }

    const userId = request.user!.userId;
    const result = await editingAnalysisService.validateCommands(userId, parse.data);
    return reply.status(200).send(createSuccessResponse(result));
  }

  /**
   * POST /v1/ai/editing-analysis/apply
   * Explicit user-initiated application of approved Editor Commands via ProjectBloc.
   * Modifies timeline with ripple editing, increments project version, and snapshots history.
   */
  async applyCommands(request: FastifyRequest, reply: FastifyReply) {
    const parse = applyEditingCommandsSchema.safeParse(request.body);
    if (!parse.success) {
      throw new ValidationError('Invalid apply commands request', parse.error.format());
    }

    const userId = request.user!.userId;
    const result = await editingAnalysisService.applyCommandsToProject(userId, parse.data);
    return reply.status(200).send(createSuccessResponse(result));
  }

  /**
   * GET /v1/ai/editing-analysis/:id
   * Retrieves previously computed editing analysis document.
   */
  async getAnalysis(request: FastifyRequest, reply: FastifyReply) {
    const parse = getAnalysisParamsSchema.safeParse(request.params);
    if (!parse.success) {
      throw new ValidationError('Invalid analysis ID parameter', parse.error.format());
    }

    const userId = request.user!.userId;
    const result = await editingAnalysisService.getAnalysis(parse.data.id, userId);
    return reply.status(200).send(createSuccessResponse(result));
  }
}

export const editingAnalysisController = new EditingAnalysisController();
