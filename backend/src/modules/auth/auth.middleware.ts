import { FastifyRequest, FastifyReply } from 'fastify';
import { authService, TokenPayload } from './auth.service.js';
import { AuthenticationError, ForbiddenError } from '../../core/errors.js';

// Extend FastifyRequest to include user
declare module 'fastify' {
  interface FastifyRequest {
    user?: TokenPayload;
  }
}

export async function authenticate(request: FastifyRequest, _reply: FastifyReply) {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AuthenticationError('Missing or malformed Authorization header');
  }

  const token = authHeader.substring(7).trim();
  const payload = authService.verifyAccessToken(token);
  request.user = payload;
}

export function requireRole(allowedRoles: string[]) {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    if (!request.user) {
      throw new AuthenticationError('User must be authenticated');
    }

    if (!allowedRoles.includes(request.user.role)) {
      throw new ForbiddenError(`Access denied. Requires one of roles: ${allowedRoles.join(', ')}`);
    }
  };
}
