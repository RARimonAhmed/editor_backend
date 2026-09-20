import { FastifyRequest, FastifyReply } from 'fastify';
import { adminService } from './admin.service.js';
import { createSuccessResponse } from '../../core/response.js';

export class AdminController {
  async listUsers(request: FastifyRequest, reply: FastifyReply) {
    const query = request.query as { limit?: string; offset?: string; search?: string };
    const limit = query.limit ? parseInt(query.limit, 10) : 50;
    const offset = query.offset ? parseInt(query.offset, 10) : 0;

    const result = await adminService.listUsers(limit, offset, query.search);
    return reply.status(200).send(createSuccessResponse(result));
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
}

export const adminController = new AdminController();
