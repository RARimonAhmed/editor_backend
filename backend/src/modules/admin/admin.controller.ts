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
    const query = (request.query || {}) as Record<string, string>;
    const limit = query.pageSize ? parseInt(query.pageSize, 10) : query.limit ? parseInt(query.limit, 10) : 50;
    const page = query.page ? parseInt(query.page, 10) : undefined;
    const offset = query.offset ? parseInt(query.offset, 10) : undefined;

    const result = await adminService.listProjects({
      search: query.search,
      owner: query.owner,
      status: query.status,
      createdFrom: query.createdFrom,
      createdTo: query.createdTo,
      sizeCategory: query.sizeCategory as any,
      sortBy: query.sortBy as any,
      sortOrder: query.sortOrder as any,
      limit,
      pageSize: limit,
      page,
      offset,
    });
    return reply.status(200).send(createSuccessResponse(result));
  }

  async getProjectDetails(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const details = await adminService.getProjectDetails(id);
    return reply.status(200).send(createSuccessResponse(details));
  }

  async archiveProject(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const actor = (request as any).user || { userId: 'admin_system', role: 'ADMIN' };
    const project = await adminService.archiveProject(id, actor);
    return reply.status(200).send(createSuccessResponse(project));
  }

  async restoreProject(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const actor = (request as any).user || { userId: 'admin_system', role: 'ADMIN' };
    const project = await adminService.restoreProject(id, actor);
    return reply.status(200).send(createSuccessResponse(project));
  }

  async createProjectSnapshot(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const body = (request.body || {}) as { name: string; description?: string };
    const actor = (request as any).user || { userId: 'admin_system', role: 'ADMIN' };
    const snapshot = await adminService.createProjectSnapshot(id, body, actor);
    return reply.status(201).send(createSuccessResponse(snapshot));
  }

  async listJobs(request: FastifyRequest, reply: FastifyReply) {
    const query = (request.query || {}) as Record<string, string>;
    const limit = query.pageSize ? parseInt(query.pageSize, 10) : query.limit ? parseInt(query.limit, 10) : 50;
    const page = query.page ? parseInt(query.page, 10) : undefined;
    const offset = query.offset ? parseInt(query.offset, 10) : undefined;

    const result = await adminService.listJobs({
      search: query.search,
      status: query.status,
      type: query.type,
      owner: query.owner,
      project: query.project,
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

  async getJobDetails(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const details = await adminService.getJobDetails(id);
    return reply.status(200).send(createSuccessResponse(details));
  }

  async getJobMetrics(_request: FastifyRequest, reply: FastifyReply) {
    const metrics = await adminService.getJobMetrics();
    return reply.status(200).send(createSuccessResponse(metrics));
  }

  async cancelJob(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const actor = (request as any).user || { userId: 'admin_system', role: 'ADMIN' };
    const result = await adminService.cancelJob(id, actor);
    return reply.status(200).send(createSuccessResponse(result));
  }

  async retryJob(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const actor = (request as any).user || { userId: 'admin_system', role: 'ADMIN' };
    const result = await adminService.retryJob(id, actor);
    return reply.status(200).send(createSuccessResponse(result));
  }

  async listAIJobs(request: FastifyRequest, reply: FastifyReply) {
    const query = (request.query || {}) as Record<string, string>;
    const limit = query.pageSize ? parseInt(query.pageSize, 10) : query.limit ? parseInt(query.limit, 10) : 50;
    const page = query.page ? parseInt(query.page, 10) : undefined;
    const offset = query.offset ? parseInt(query.offset, 10) : undefined;

    const result = await adminService.listAIJobs({
      search: query.search,
      status: query.status,
      type: query.type,
      owner: query.owner,
      project: query.project,
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

  async getAIJobDetails(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const details = await adminService.getAIJobDetails(id);
    return reply.status(200).send(createSuccessResponse(details));
  }

  async listRenderJobs(request: FastifyRequest, reply: FastifyReply) {
    const query = (request.query || {}) as Record<string, string>;
    const limit = query.pageSize ? parseInt(query.pageSize, 10) : query.limit ? parseInt(query.limit, 10) : 50;
    const page = query.page ? parseInt(query.page, 10) : undefined;
    const offset = query.offset ? parseInt(query.offset, 10) : undefined;

    const result = await adminService.listRenderJobs({
      search: query.search,
      status: query.status,
      type: query.type,
      owner: query.owner,
      project: query.project,
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

  async getRenderJobDetails(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const details = await adminService.getRenderJobDetails(id);
    return reply.status(200).send(createSuccessResponse(details));
  }

  async listFailedJobs(request: FastifyRequest, reply: FastifyReply) {
    const query = (request.query || {}) as Record<string, string>;
    const limit = query.pageSize ? parseInt(query.pageSize, 10) : query.limit ? parseInt(query.limit, 10) : 50;
    const result = await adminService.listJobs({
      status: 'FAILED',
      limit,
      pageSize: limit,
    });
    return reply.status(200).send(createSuccessResponse({ failedJobs: result.jobs, jobs: result.jobs, total: result.total }));
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

  async getSettings(_request: FastifyRequest, reply: FastifyReply) {
    const settings = await adminService.getSafeSettings();
    return reply.status(200).send(createSuccessResponse(settings));
  }

  async updateSettings(request: FastifyRequest, reply: FastifyReply) {
    const user = (request as any).user;
    if (user?.role !== 'SUPERADMIN') {
      throw new ForbiddenError('SUPERADMIN authorization required to modify system operational settings');
    }
    const body = (request.body || {}) as any;
    const updated = await adminService.updateSafeSettings(body, user?.userId || 'admin', request.ip);
    return reply.status(200).send(createSuccessResponse(updated));
  }

  async listMedia(request: FastifyRequest, reply: FastifyReply) {
    const query = (request.query || {}) as Record<string, string>;
    const limit = query.pageSize ? parseInt(query.pageSize, 10) : query.limit ? parseInt(query.limit, 10) : 50;
    const page = query.page ? parseInt(query.page, 10) : undefined;
    const offset = query.offset ? parseInt(query.offset, 10) : undefined;

    const result = await adminService.listMedia({
      search: query.search,
      category: query.category,
      status: query.status,
      owner: query.owner,
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

  async getMediaSummary(_request: FastifyRequest, reply: FastifyReply) {
    const summary = await adminService.getMediaSummary();
    return reply.status(200).send(createSuccessResponse(summary));
  }

  async getMediaDetails(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const details = await adminService.getMediaDetails(id);
    return reply.status(200).send(createSuccessResponse(details));
  }

  async retryMediaProcessing(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const actor = (request as any).user || { userId: 'admin_system', role: 'ADMIN' };
    const asset = await adminService.retryMediaProcessing(id, actor);
    return reply.status(200).send(createSuccessResponse(asset));
  }

  async archiveMedia(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const actor = (request as any).user || { userId: 'admin_system', role: 'ADMIN' };
    const asset = await adminService.archiveMedia(id, actor);
    return reply.status(200).send(createSuccessResponse(asset));
  }

  async deleteMedia(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const actor = (request as any).user || { userId: 'admin_system', role: 'ADMIN' };
    const result = await adminService.deleteMedia(id, actor);
    return reply.status(200).send(createSuccessResponse(result));
  }

  async cleanupOrphanedMedia(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const actor = (request as any).user || { userId: 'admin_system', role: 'ADMIN' };
    const result = await adminService.cleanupOrphanedMedia(id, actor);
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
