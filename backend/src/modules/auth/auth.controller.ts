import { FastifyRequest, FastifyReply } from 'fastify';
import { authService } from './auth.service.js';
import {
  registerSchema,
  loginSchema,
  oauthLoginSchema,
  refreshTokenSchema,
  logoutSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  updateProfileSchema,
} from './auth.schemas.js';
import { createSuccessResponse } from '../../core/response.js';
import { ValidationError } from '../../core/errors.js';

export class AuthController {
  // POST /v1/auth/register
  async register(request: FastifyRequest, reply: FastifyReply) {
    const parseResult = registerSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw new ValidationError('Invalid registration input', parseResult.error.format());
    }

    const clientInfo = {
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    };

    const result = await authService.register(parseResult.data, clientInfo);
    return reply.status(201).send(createSuccessResponse(result));
  }

  // POST /v1/auth/login
  async login(request: FastifyRequest, reply: FastifyReply) {
    const parseResult = loginSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw new ValidationError('Invalid login credentials', parseResult.error.format());
    }

    const clientInfo = {
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    };

    const result = await authService.login(parseResult.data, clientInfo);
    return reply.status(200).send(createSuccessResponse(result));
  }

  // POST /v1/auth/oauth/:provider
  async loginOAuth(
    request: FastifyRequest<{ Params: { provider: string } }>,
    reply: FastifyReply
  ) {
    const parseResult = oauthLoginSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw new ValidationError('Invalid OAuth payload', parseResult.error.format());
    }

    const clientInfo = {
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    };

    const result = await authService.loginWithOAuth(
      request.params.provider,
      parseResult.data,
      clientInfo
    );
    return reply.status(200).send(createSuccessResponse(result));
  }

  // POST /v1/auth/refresh
  async refreshToken(request: FastifyRequest, reply: FastifyReply) {
    const parseResult = refreshTokenSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw new ValidationError('Refresh token is required', parseResult.error.format());
    }

    const tokens = await authService.refreshTokens(parseResult.data.refreshToken);
    return reply.status(200).send(createSuccessResponse(tokens));
  }

  // POST /v1/auth/logout
  async logout(request: FastifyRequest, reply: FastifyReply) {
    const parseResult = logoutSchema.safeParse(request.body || {});
    const refreshToken = parseResult.success ? parseResult.data.refreshToken : undefined;
    const sessionId = request.user?.sessionId;

    await authService.logout(refreshToken, sessionId);
    return reply.status(200).send(createSuccessResponse({ loggedOut: true }));
  }

  // POST /v1/auth/logout-all
  async logoutAll(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.user!.userId;
    await authService.logoutAll(userId);
    return reply.status(200).send(createSuccessResponse({ loggedOutAll: true }));
  }

  // POST /v1/auth/forgot-password
  async forgotPassword(request: FastifyRequest, reply: FastifyReply) {
    const parseResult = forgotPasswordSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw new ValidationError('Valid email is required', parseResult.error.format());
    }

    const result = await authService.forgotPassword(parseResult.data.email);
    return reply.status(200).send(createSuccessResponse(result));
  }

  // POST /v1/auth/reset-password
  async resetPassword(request: FastifyRequest, reply: FastifyReply) {
    const parseResult = resetPasswordSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw new ValidationError('Invalid reset password payload', parseResult.error.format());
    }

    await authService.resetPassword(parseResult.data.token, parseResult.data.newPassword);
    return reply.status(200).send(
      createSuccessResponse({ message: 'Password has been successfully updated. Please login with your new password.' })
    );
  }

  // GET /v1/me
  async getMe(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.user!.userId;
    const profile = await authService.getProfile(userId);
    return reply.status(200).send(createSuccessResponse(profile));
  }

  // PATCH /v1/me
  async updateMe(request: FastifyRequest, reply: FastifyReply) {
    const parseResult = updateProfileSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw new ValidationError('Invalid profile update parameters', parseResult.error.format());
    }

    const userId = request.user!.userId;
    const profile = await authService.updateProfile(userId, parseResult.data);
    return reply.status(200).send(createSuccessResponse(profile));
  }

  // DELETE /v1/me (Account deletion)
  async deleteMe(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.user!.userId;
    await authService.deleteAccount(userId);
    return reply.status(200).send(createSuccessResponse({ deleted: true }));
  }
}

export const authController = new AuthController();
