import { FastifyRequest, FastifyReply } from 'fastify';
import { authService } from './auth.service.js';
import { registerSchema, loginSchema, refreshTokenSchema } from './auth.schemas.js';
import { createSuccessResponse } from '../../core/response.js';
import { ValidationError } from '../../core/errors.js';

export class AuthController {
  async register(request: FastifyRequest, reply: FastifyReply) {
    const parseResult = registerSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw new ValidationError('Invalid registration input', parseResult.error.format());
    }

    const result = await authService.register(parseResult.data);
    return reply.status(201).send(createSuccessResponse(result));
  }

  async login(request: FastifyRequest, reply: FastifyReply) {
    const parseResult = loginSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw new ValidationError('Invalid login credentials', parseResult.error.format());
    }

    const result = await authService.login(parseResult.data);
    return reply.status(200).send(createSuccessResponse(result));
  }

  async refreshToken(request: FastifyRequest, reply: FastifyReply) {
    const parseResult = refreshTokenSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw new ValidationError('Refresh token is required', parseResult.error.format());
    }

    const tokens = await authService.refreshTokens(parseResult.data.refreshToken);
    return reply.status(200).send(createSuccessResponse(tokens));
  }

  async getMe(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.user!.userId;
    const profile = await authService.getProfile(userId);
    return reply.status(200).send(createSuccessResponse(profile));
  }
}

export const authController = new AuthController();
