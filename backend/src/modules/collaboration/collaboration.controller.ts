import { FastifyRequest, FastifyReply } from 'fastify';
import { collaborationService } from './collaboration.service.js';
import {
  inviteCollaboratorSchema,
  updateCollaboratorRoleSchema,
  createShareLinkSchema,
  accessShareLinkSchema,
} from './collaboration.schemas.js';

export class CollaborationController {
  async inviteCollaborator(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const userId = (request as any).user?.userId || (request as any).user?.id || (request.headers['x-user-id'] as string) || 'anonymous';
    const { id: projectId } = request.params as { id: string };
    const parsed = inviteCollaboratorSchema.parse(request.body);

    const collaborator = await collaborationService.inviteCollaborator(projectId, userId, parsed as any);
    reply.status(201).send({
      success: true,
      data: collaborator,
    });
  }

  async listCollaborators(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const userId = (request as any).user?.userId || (request as any).user?.id || (request.headers['x-user-id'] as string) || 'anonymous';
    const { id: projectId } = request.params as { id: string };

    const data = await collaborationService.listCollaborators(projectId, userId);
    reply.status(200).send({
      success: true,
      data,
    });
  }

  async updateRole(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const userId = (request as any).user?.userId || (request as any).user?.id || (request.headers['x-user-id'] as string) || 'anonymous';
    const { id: projectId, userId: targetUserId } = request.params as { id: string; userId: string };
    const parsed = updateCollaboratorRoleSchema.parse(request.body);

    const updated = await collaborationService.updateRole(projectId, userId, targetUserId, parsed.role);
    reply.status(200).send({
      success: true,
      data: updated,
    });
  }

  async removeCollaborator(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const userId = (request as any).user?.userId || (request as any).user?.id || (request.headers['x-user-id'] as string) || 'anonymous';
    const { id: projectId, userId: targetUserId } = request.params as { id: string; userId: string };

    const result = await collaborationService.removeCollaborator(projectId, userId, targetUserId);
    reply.status(200).send({
      success: true,
      data: result,
    });
  }

  async leaveProject(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const userId = (request as any).user?.userId || (request as any).user?.id || (request.headers['x-user-id'] as string) || 'anonymous';
    const { id: projectId } = request.params as { id: string };

    const result = await collaborationService.leaveProject(projectId, userId);
    reply.status(200).send({
      success: true,
      data: result,
    });
  }

  async createShareLink(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const userId = (request as any).user?.userId || (request as any).user?.id || (request.headers['x-user-id'] as string) || 'anonymous';
    const { id: projectId } = request.params as { id: string };
    const parsed = createShareLinkSchema.parse(request.body || {});

    const link = await collaborationService.createShareLink(projectId, userId, parsed as any);
    reply.status(201).send({
      success: true,
      data: {
        ...link,
        shareUrl: `/v1/projects/shared/${link.token}`,
      },
    });
  }

  async getShareLink(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const userId = (request as any).user?.userId || (request as any).user?.id || (request.headers['x-user-id'] as string) || 'anonymous';
    const { id: projectId } = request.params as { id: string };

    const link = await collaborationService.getShareLink(projectId, userId);
    reply.status(200).send({
      success: true,
      data: link ? { ...link, shareUrl: `/v1/projects/shared/${link.token}` } : null,
    });
  }

  async revokeShareLink(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const userId = (request as any).user?.userId || (request as any).user?.id || (request.headers['x-user-id'] as string) || 'anonymous';
    const { id: projectId } = request.params as { id: string };

    const result = await collaborationService.revokeShareLink(projectId, userId);
    reply.status(200).send({
      success: true,
      data: result,
    });
  }

  async accessSharedProject(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { token } = request.params as { token: string };
    const body = (request.body as any) || {};
    const parsed = accessShareLinkSchema.parse(body);

    const result = await collaborationService.accessSharedProject(token, parsed.password);
    reply.status(200).send({
      success: true,
      data: result,
    });
  }
}

export const collaborationController = new CollaborationController();
