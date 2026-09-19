import { FastifyRequest, FastifyReply } from 'fastify';
import { creditsService } from './credits.service.js';
import { createSuccessResponse } from '../../core/response.js';

export class CreditsController {
  async getBalance(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.user!.userId;
    const balance = await creditsService.getBalance(userId);
    return reply.status(200).send(createSuccessResponse({ balance }));
  }

  async getHistory(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.user!.userId;
    const history = await creditsService.getHistory(userId);
    return reply.status(200).send(createSuccessResponse(history));
  }
}

export const creditsController = new CreditsController();
