import { FastifyRequest, FastifyReply } from 'fastify';
import { adminService } from './admin.service.js';
import { authService } from '../auth/auth.service.js';
import { createSuccessResponse } from '../../core/response.js';
import { AuthenticationError, ForbiddenError } from '../../core/errors.js';

export class AdminController {
  async listUsers(request: FastifyRequest, reply: FastifyReply) {
    const query = (request.query || {}) as Record<string, string>;
    const limit = query.pageSize ? parseInt(query.pageSize, 10) : query.limit ? parseInt(query.limit, 10) : 50;
    const page = query.page ? parseInt(query.page, 10) : undefined;
    const offset = query.offset ? parseInt(query.offset, 10) : undefined;

    const result = await adminService.listUsers({
      search: query.search,
      role: query.role,
      status: query.status,
      subscription: query.subscription,
      createdFrom: query.createdFrom,
      createdTo: query.createdTo,
      sortBy: query.sortBy as any,
      sortOrder: query.sortOrder as any,
      limit,
      pageSize: limit,
      page,
      offset,
    });
    return reply.status(200).send(createSuccessResponse(result));
  }

  async getUserDetails(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const details = await adminService.getUserDetails(id);
    return reply.status(200).send(createSuccessResponse(details));
  }

  async listProjects(request: FastifyRequest, reply: FastifyReply) {
    const query = request.query as { limit?: string; offset?: string; status?: string };
    const limit = query.limit ? parseInt(query.limit, 10) : 50;
    const offset = query.offset ? parseInt(query.offset, 10) : 0;

    const result = await adminService.listProjects(limit, offset, query.status);
    return reply.status(200).send(createSuccessResponse(result));
  }

  async listJobs(request: FastifyRequest, reply: FastifyReply) {
    const query = request.query as { limit?: string; offset?: string; status?: string; type?: string };
    const limit = query.limit ? parseInt(query.limit, 10) : 50;
    const offset = query.offset ? parseInt(query.offset, 10) : 0;

    const result = await adminService.listJobs(limit, offset, query.status, query.type);
    return reply.status(200).send(createSuccessResponse(result));
  }

  async listFailedJobs(request: FastifyRequest, reply: FastifyReply) {
    const query = request.query as { limit?: string; offset?: string };
    const limit = query.limit ? parseInt(query.limit, 10) : 50;
    const offset = query.offset ? parseInt(query.offset, 10) : 0;

    const result = await adminService.listFailedJobs(limit, offset);
    return reply.status(200).send(createSuccessResponse(result));
  }

  async retryJob(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const actorId = (request as any).user?.userId || 'admin_system';

    const result = await adminService.retryFailedJob(id, actorId);
    return reply.status(200).send(createSuccessResponse(result));
  }

  async listAIJobs(request: FastifyRequest, reply: FastifyReply) {
    const query = request.query as { limit?: string; offset?: string };
    const limit = query.limit ? parseInt(query.limit, 10) : 50;
    const offset = query.offset ? parseInt(query.offset, 10) : 0;

    const result = await adminService.listAIJobs(limit, offset);
    return reply.status(200).send(createSuccessResponse(result));
  }

  async getUsage(request: FastifyRequest, reply: FastifyReply) {
    const report = await adminService.getUsageReport();
    return reply.status(200).send(createSuccessResponse(report));
  }

  async getSubscriptions(request: FastifyRequest, reply: FastifyReply) {
    const report = await adminService.getSubscriptionsReport();
    return reply.status(200).send(createSuccessResponse(report));
  }

  async getCredits(request: FastifyRequest, reply: FastifyReply) {
    const telemetry = await adminService.getCreditsTelemetry();
    return reply.status(200).send(createSuccessResponse(telemetry));
  }

  async listAuditLogs(request: FastifyRequest, reply: FastifyReply) {
    const query = request.query as { limit?: string; offset?: string };
    const limit = query.limit ? parseInt(query.limit, 10) : 50;
    const offset = query.offset ? parseInt(query.offset, 10) : 0;

    const result = adminService.listAuditLogs(limit, offset);
    return reply.status(200).send(createSuccessResponse(result));
  }

  async getStatsOverview(_request: FastifyRequest, reply: FastifyReply) {
    const stats = await adminService.getStatsOverview();
    return reply.status(200).send(createSuccessResponse(stats));
  }

  async getCharts(_request: FastifyRequest, reply: FastifyReply) {
    const charts = await adminService.getChartTelemetry();
    return reply.status(200).send(createSuccessResponse(charts));
  }

  async getSystemHealth(_request: FastifyRequest, reply: FastifyReply) {
    const health = await adminService.getSystemHealthReport();
    return reply.status(200).send(createSuccessResponse(health));
  }

  async listMedia(request: FastifyRequest, reply: FastifyReply) {
    const query = request.query as { limit?: string; offset?: string; search?: string };
    const limit = query.limit ? parseInt(query.limit, 10) : 50;
    const offset = query.offset ? parseInt(query.offset, 10) : 0;

    const result = await adminService.listMedia(limit, offset, query.search);
    return reply.status(200).send(createSuccessResponse(result));
  }

  async listComments(request: FastifyRequest, reply: FastifyReply) {
    const query = request.query as { limit?: string; offset?: string; projectId?: string };
    const limit = query.limit ? parseInt(query.limit, 10) : 50;
    const offset = query.offset ? parseInt(query.offset, 10) : 0;

    const result = await adminService.listComments(limit, offset, query.projectId);
    return reply.status(200).send(createSuccessResponse(result));
  }

  async updateUserRole(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const body = request.body as { role: string; status?: string };
    const actor = (request as any).user || { userId: 'admin_system', role: 'ADMIN' };

    const updated = await adminService.updateUserRole(id, body.role, body.status, actor);
    return reply.status(200).send(createSuccessResponse(updated));
  }

  async updateUserStatus(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const body = request.body as { status: string; reason?: string };
    const actor = (request as any).user || { userId: 'admin_system', role: 'ADMIN' };

    const updated = await adminService.updateUserStatus(id, body.status, actor, body.reason);
    return reply.status(200).send(createSuccessResponse(updated));
  }

  async revokeUserSessions(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const body = (request.body || {}) as { sessionId?: string };
    const actor = (request as any).user || { userId: 'admin_system', role: 'ADMIN' };

    const result = await adminService.revokeUserSessions(id, actor, body.sessionId);
    return reply.status(200).send(createSuccessResponse(result));
  }

  async grantCredits(request: FastifyRequest, reply: FastifyReply) {
    const params = (request.params || {}) as { id?: string };
    const body = (request.body || {}) as { userId?: string; amount: number; reason: string };
    const userId = params.id || body.userId;
    const actorId = (request as any).user?.userId || 'admin_system';

    const result = await adminService.grantCredits(userId!, body.amount, body.reason, actorId);
    return reply.status(200).send(createSuccessResponse(result));
  }

  async adminLogin(request: FastifyRequest, reply: FastifyReply) {
    const body = (request.body || {}) as { email?: string; password?: string; adminKey?: string };
    const configuredAdminKey = process.env.ADMIN_API_KEY || 'adm_super_secret_production_key_32bytes';

    // 1. Admin API key sign-in
    if (body.adminKey && body.adminKey === configuredAdminKey) {
      const adminUser = {
        id: 'admin_master',
        email: 'admin@techxayan.com',
        role: 'SUPERADMIN',
        displayName: 'Platform Super Administrator',
      };
      const token = authService.signAccessToken({
        userId: adminUser.id,
        sessionId: 'session_admin_master',
        email: adminUser.email,
        role: adminUser.role as any,
      });

      adminService.recordAuditLog('ADMIN_API_KEY_LOGIN', adminUser.id, { method: 'admin_key' });
      return reply.status(200).send(
        createSuccessResponse({
          user: adminUser,
          tokens: {
            accessToken: token,
            refreshToken: token,
            expiresIn: '24h',
          },
        })
      );
    }

    // 2. Email / Password sign-in
    if (!body.email || !body.password) {
      throw new AuthenticationError('Email and password or adminKey required');
    }

    const authRes = await authService.login(
      { email: body.email, password: body.password },
      { ip: request.ip, userAgent: request.headers['user-agent'] }
    );

    const role = (authRes.user as any).role || 'user';
    if (role !== 'ADMIN' && role !== 'SUPERADMIN' && !(authRes.user as any).isAdmin) {
      throw new ForbiddenError('Access Denied: Administrative role required');
    }

    adminService.recordAuditLog('ADMIN_LOGIN_SUCCESS', authRes.user.id, { email: body.email });

    return reply.status(200).send(createSuccessResponse(authRes));
  }
}

export const adminController = new AdminController();
