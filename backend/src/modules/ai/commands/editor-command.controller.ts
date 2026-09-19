import { FastifyRequest, FastifyReply } from 'fastify';
import { intentParserService } from './intent-parser.service.js';
import { commandValidatorService } from './command-validator.service.js';
import {
  interpretPromptSchema,
  validateCommandsSchema,
  executeCommandsSchema,
} from './editor-command.schemas.js';
import { projectsService } from '../../projects/projects.service.js';
import { ValidationError } from '../../../core/errors.js';

export class EditorCommandController {
  /**
   * POST /v1/ai/commands/interpret
   * Interprets natural language editing commands, validates them, and builds a preview plan
   */
  async interpretPrompt(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const userId = (request as any).user?.userId || (request as any).user?.id || (request.headers['x-user-id'] as string) || 'anonymous';
    const parsed = interpretPromptSchema.parse(request.body);

    const intent = await intentParserService.parseIntent(
      userId,
      parsed.prompt,
      parsed.timelineContext,
      parsed.selectedClipId
    );

    const validation = commandValidatorService.validate(
      intent.commands,
      parsed.timelineContext?.duration || 60
    );

    const preview = commandValidatorService.generatePreview(
      validation.validatedCommands,
      parsed.timelineContext?.duration || 60
    );

    reply.status(200).send({
      success: true,
      data: {
        rawPrompt: parsed.prompt,
        intent,
        commands: validation.validatedCommands,
        validation,
        preview,
      },
    });
  }

  /**
   * POST /v1/ai/commands/validate
   * Validates custom or user-modified editor commands and computes execution preview diff
   */
  async validateCommands(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const parsed = validateCommandsSchema.parse(request.body);

    const validation = commandValidatorService.validate(
      parsed.commands as any,
      parsed.timelineDuration || 60
    );

    const preview = commandValidatorService.generatePreview(
      validation.validatedCommands,
      parsed.timelineDuration || 60
    );

    reply.status(200).send({
      success: true,
      data: {
        validation,
        preview,
      },
    });
  }

  /**
   * POST /v1/ai/commands/execute
   * Executes validated command list against a cloud project with optimistic concurrency
   */
  async executeCommands(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const userId = (request as any).user?.userId || (request as any).user?.id || (request.headers['x-user-id'] as string) || 'anonymous';
    const parsed = executeCommandsSchema.parse(request.body);

    // 1. Validate commands strictly
    const validation = commandValidatorService.validate(parsed.commands as any);
    if (!validation.valid) {
      throw new ValidationError(`Cannot execute invalid commands: ${validation.errors.join(', ')}`);
    }

    // 2. Fetch project and verify ownership/permissions
    const project = await projectsService.getById(parsed.projectId, userId);

    // 3. Compute execution preview
    const preview = commandValidatorService.generatePreview(
      validation.validatedCommands,
      project.timeline?.duration || 60
    );

    // 4. Update project timeline metadata and version via optimistic concurrency
    const updatedProject = await projectsService.update(
      parsed.projectId,
      userId,
      {
        expectedVersion: parsed.expectedVersion,
        timeline: {
          ...project.timeline,
          duration: preview.newEstimatedDuration,
        },
      }
    );

    reply.status(200).send({
      success: true,
      data: {
        projectId: parsed.projectId,
        version: updatedProject.version,
        appliedCommandsCount: validation.validatedCommands.length,
        preview,
        projectBlocActions: preview.projectBlocActions,
      },
    });
  }
}

export const editorCommandController = new EditorCommandController();
