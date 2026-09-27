import { FastifyRequest, FastifyReply } from 'fastify';
import { presetService } from './preset.service.js';
import { listPresetsQuerySchema, getCapabilitiesQuerySchema } from './preset.schemas.js';
import { createSuccessResponse } from '../../core/response.js';
import { ValidationError } from '../../core/errors.js';
import { PlatformId } from './preset.types.js';

export class PresetController {
  /**
   * GET /api/v1/presets
   */
  async listPresets(request: FastifyRequest, reply: FastifyReply) {
    const parse = listPresetsQuerySchema.safeParse(request.query);
    if (!parse.success) {
      throw new ValidationError('Invalid query parameters', parse.error.format());
    }
    const result = presetService.listPresets(parse.data);
    return reply.status(200).send(createSuccessResponse(result.items, { pagination: result }));
  }

  /**
   * GET /api/v1/presets/capabilities
   */
  async getCapabilities(request: FastifyRequest, reply: FastifyReply) {
    const parse = getCapabilitiesQuerySchema.safeParse(request.query);
    if (!parse.success) {
      throw new ValidationError('Invalid capability query parameters', parse.error.format());
    }
    const capabilities = presetService.getPlatformCapabilities(parse.data.platform as PlatformId);
    return reply.status(200).send(createSuccessResponse(capabilities));
  }

  /**
   * GET /api/v1/presets/:id
   */
  async getPresetById(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const query = (request.query || {}) as { platform?: PlatformId };
    const preset = presetService.getPresetById(id, query.platform);
    return reply.status(200).send(createSuccessResponse(preset));
  }
}

export const presetController = new PresetController();
