import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { adminController } from './admin.controller.js';
import { authService } from '../auth/auth.service.js';
import { ForbiddenError } from '../../core/errors.js';

export async function requireAdmin(request: FastifyRequest, _reply: FastifyReply) {
  const adminKeyHeader = request.headers['x-admin-key'] as string;
  const configuredAdminKey = process.env.ADMIN_API_KEY || 'adm_super_secret_production_key_32bytes';

  if (adminKeyHeader && adminKeyHeader === configuredAdminKey) {
    (request as any).user = { userId: 'admin_api_key', email: 'admin@techxayan.com', role: 'SUPERADMIN' };
    return;
  }

  const authHeader = request.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const payload = authService.verifyAccessToken(token);
      const role = (payload.role || '').toUpperCase();
      if (role === 'ADMIN' || role === 'SUPERADMIN' || (payload as any).isAdmin) {
        (request as any).user = payload;
        return;
      }
    } catch {
      // invalid token
    }
  }

  throw new ForbiddenError('Forbidden: Administrative access required');
}

export async function adminRoutes(fastify: FastifyInstance) {
  // Public admin authentication endpoint
  fastify.post('/login', adminController.adminLogin.bind(adminController));

  // Protected admin routes require valid ADMIN / SUPERADMIN credentials or x-admin-key
  fastify.register(async (protectedAdmin) => {
    protectedAdmin.addHook('preHandler', requireAdmin);

    // Executive overview & charts telemetry
    protectedAdmin.get('/stats', adminController.getStatsOverview.bind(adminController));
    protectedAdmin.get('/overview', adminController.getStatsOverview.bind(adminController));
    protectedAdmin.get('/charts', adminController.getCharts.bind(adminController));
    protectedAdmin.get('/health', adminController.getSystemHealth.bind(adminController));
    protectedAdmin.get('/system/health', adminController.getSystemHealth.bind(adminController));

    // Core platform resources
    protectedAdmin.get('/users', adminController.listUsers.bind(adminController));
    protectedAdmin.get('/users/:id', adminController.getUserDetails.bind(adminController));
    protectedAdmin.patch('/users/:id/role', adminController.updateUserRole.bind(adminController));
    protectedAdmin.patch('/users/:id/status', adminController.updateUserStatus.bind(adminController));
    protectedAdmin.post('/users/:id/revoke-sessions', adminController.revokeUserSessions.bind(adminController));
    protectedAdmin.get('/projects', adminController.listProjects.bind(adminController));
    protectedAdmin.get('/media', adminController.listMedia.bind(adminController));
    protectedAdmin.get('/comments', adminController.listComments.bind(adminController));
    protectedAdmin.get('/jobs', adminController.listJobs.bind(adminController));
    protectedAdmin.get('/ai/jobs', adminController.listAIJobs.bind(adminController));
    protectedAdmin.get('/failed-jobs', adminController.listFailedJobs.bind(adminController));
    protectedAdmin.post('/jobs/:id/retry', adminController.retryJob.bind(adminController));

    // Telemetry & Billing
    protectedAdmin.get('/usage', adminController.getUsage.bind(adminController));
    protectedAdmin.get('/subscriptions', adminController.getSubscriptions.bind(adminController));
    protectedAdmin.get('/credits', adminController.getCredits.bind(adminController));
    protectedAdmin.post('/credits/grant', adminController.grantCredits.bind(adminController));
    protectedAdmin.post('/users/:id/credits/grant', adminController.grantCredits.bind(adminController));
    protectedAdmin.get('/audit-logs', adminController.listAuditLogs.bind(adminController));
  });
}
