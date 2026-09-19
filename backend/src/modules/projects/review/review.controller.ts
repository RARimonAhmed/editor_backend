import { FastifyRequest, FastifyReply } from 'fastify';
import { reviewService } from './review.service.js';
import {
  createSnapshotSchema,
  restoreSnapshotSchema,
  compareVersionsSchema,
  createCommentSchema,
  updateCommentSchema,
  listCommentsQuerySchema,
} from './review.schemas.js';

export class ReviewController {
  // ============================================================================
  // VERSION SNAPSHOTS & DIFFS
  // ============================================================================

  async createSnapshot(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const userId = (request as any).user?.userId || (request as any).user?.id || (request.headers['x-user-id'] as string) || 'anonymous';
    const { id: projectId } = request.params as { id: string };
    const parsed = createSnapshotSchema.parse(request.body);

    const snapshot = await reviewService.createSnapshot(projectId, userId, parsed);
    reply.status(201).send({
      success: true,
      data: snapshot,
    });
  }

  async listSnapshots(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const userId = (request as any).user?.userId || (request as any).user?.id || (request.headers['x-user-id'] as string) || 'anonymous';
    const { id: projectId } = request.params as { id: string };

    const snapshots = await reviewService.listSnapshots(projectId, userId);
    reply.status(200).send({
      success: true,
      data: snapshots,
    });
  }

  async getSnapshot(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const userId = (request as any).user?.userId || (request as any).user?.id || (request.headers['x-user-id'] as string) || 'anonymous';
    const { id: projectId, versionNumber } = request.params as { id: string; versionNumber: string };

    const snapshot = await reviewService.getSnapshot(projectId, parseInt(versionNumber, 10), userId);
    reply.status(200).send({
      success: true,
      data: snapshot,
    });
  }

  async restoreSnapshot(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const userId = (request as any).user?.userId || (request as any).user?.id || (request.headers['x-user-id'] as string) || 'anonymous';
    const { id: projectId, versionNumber } = request.params as { id: string; versionNumber: string };
    const parsed = restoreSnapshotSchema.parse(request.body || {});

    const result = await reviewService.restoreSnapshot(
      projectId,
      parseInt(versionNumber, 10),
      userId,
      parsed.expectedVersion
    );

    reply.status(200).send({
      success: true,
      data: result,
    });
  }

  async compareVersions(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const userId = (request as any).user?.userId || (request as any).user?.id || (request.headers['x-user-id'] as string) || 'anonymous';
    const { id: projectId } = request.params as { id: string };
    const parsed = compareVersionsSchema.parse(request.query);

    const diff = await reviewService.compareVersions(
      projectId,
      parsed.sourceVersion,
      parsed.targetVersion,
      userId
    );

    reply.status(200).send({
      success: true,
      data: diff,
    });
  }

  // ============================================================================
  // TIMECODE COMMENTS
  // ============================================================================

  async createComment(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const userId = (request as any).user?.userId || (request as any).user?.id || (request.headers['x-user-id'] as string) || 'anonymous';
    const { id: projectId } = request.params as { id: string };
    const parsed = createCommentSchema.parse(request.body);

    const comment = await reviewService.createComment(projectId, userId, parsed as any);
    reply.status(201).send({
      success: true,
      data: comment,
    });
  }

  async listComments(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const userId = (request as any).user?.userId || (request as any).user?.id || (request.headers['x-user-id'] as string) || 'anonymous';
    const { id: projectId } = request.params as { id: string };
    const parsed = listCommentsQuerySchema.parse(request.query || {});

    const comments = await reviewService.listComments(projectId, userId, parsed as any);
    reply.status(200).send({
      success: true,
      data: comments,
    });
  }

  async updateComment(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const userId = (request as any).user?.userId || (request as any).user?.id || (request.headers['x-user-id'] as string) || 'anonymous';
    const { id: projectId, commentId } = request.params as { id: string; commentId: string };
    const parsed = updateCommentSchema.parse(request.body || {});

    const status = parsed.status || 'RESOLVED';
    const comment = await reviewService.resolveComment(projectId, commentId, userId, status);
    reply.status(200).send({
      success: true,
      data: comment,
    });
  }

  async deleteComment(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const userId = (request as any).user?.userId || (request as any).user?.id || (request.headers['x-user-id'] as string) || 'anonymous';
    const { id: projectId, commentId } = request.params as { id: string; commentId: string };

    const result = await reviewService.deleteComment(projectId, commentId, userId);
    reply.status(200).send({
      success: true,
      data: result,
    });
  }
}

export const reviewController = new ReviewController();
