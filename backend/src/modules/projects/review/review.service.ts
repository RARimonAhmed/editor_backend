import { v4 as uuidv4 } from 'uuid';
import {
  ProjectVersionSnapshot,
  VersionDiff,
  ProjectComment,
  CreateSnapshotInput,
  CreateCommentInput,
  ListCommentsFilter,
} from './review.types.js';
import { mockProjects, projectsService } from '../projects.service.js';
import { collaborationService } from '../../collaboration/collaboration.service.js';
import { collaborationManager } from '../../collaboration/collaboration.manager.js';
import { NotFoundError, ForbiddenError, ValidationError } from '../../../core/errors.js';
import { logger } from '../../../core/logger.js';

// In-memory repositories for high-speed retrieval and unit tests
export const mockSnapshots = new Map<string, ProjectVersionSnapshot>();
export const mockComments = new Map<string, ProjectComment>();

export class ReviewService {
  // ============================================================================
  // 1. PROJECT VERSION SNAPSHOTS (IMMUTABLE, NON-DESTRUCTIVE)
  // ============================================================================

  async createSnapshot(
    projectId: string,
    userId: string,
    input: CreateSnapshotInput
  ): Promise<ProjectVersionSnapshot> {
    await collaborationService.assertPermission(projectId, userId, 'version:create');

    const project = mockProjects.get(projectId);
    if (!project) throw new NotFoundError(`Project not found: ${projectId}`);

    const versionNumber = project.version;
    const snapshotKey = `${projectId}:${versionNumber}`;

    // Deep clone project document to guarantee immutability
    const immutableSnapshot = JSON.parse(JSON.stringify(project));

    const snapshotRecord: ProjectVersionSnapshot = {
      id: uuidv4(),
      projectId,
      versionNumber,
      name: input.name,
      description: input.description,
      snapshot: immutableSnapshot,
      createdBy: userId,
      createdByName: `User ${userId.slice(0, 6)}`,
      createdAt: new Date().toISOString(),
    };

    mockSnapshots.set(snapshotKey, snapshotRecord);
    logger.info({ projectId, versionNumber, name: input.name }, 'Created immutable project version snapshot');

    // Broadcast real-time WebSocket notification
    collaborationManager.broadcast(projectId, {
      action: 'VERSION_CREATED',
      projectId,
      senderId: userId,
      data: {
        id: snapshotRecord.id,
        versionNumber: snapshotRecord.versionNumber,
        name: snapshotRecord.name,
        createdAt: snapshotRecord.createdAt,
      },
    });

    return snapshotRecord;
  }

  async listSnapshots(projectId: string, userId: string): Promise<ProjectVersionSnapshot[]> {
    await collaborationService.assertPermission(projectId, userId, 'project:view');

    const snapshots = Array.from(mockSnapshots.values())
      .filter((s) => s.projectId === projectId)
      .sort((a, b) => b.versionNumber - a.versionNumber);

    return snapshots;
  }

  async getSnapshot(
    projectId: string,
    versionNumber: number,
    userId: string
  ): Promise<ProjectVersionSnapshot> {
    await collaborationService.assertPermission(projectId, userId, 'project:view');

    const snapshotKey = `${projectId}:${versionNumber}`;
    const snapshot = mockSnapshots.get(snapshotKey);
    if (!snapshot) {
      throw new NotFoundError(`Version ${versionNumber} not found for project ${projectId}`);
    }

    return snapshot;
  }

  /**
   * Non-destructive restore: Restores content from an older snapshot into a NEW version.
   * Never overwrites or deletes any previous versions in history.
   */
  async restoreSnapshot(
    projectId: string,
    versionNumber: number,
    userId: string,
    expectedVersion?: number
  ): Promise<{ restoredProject: any; restoredFromVersion: number; newVersion: number }> {
    await collaborationService.assertPermission(projectId, userId, 'version:restore');

    const snapshot = await this.getSnapshot(projectId, versionNumber, userId);
    const currentProject = await projectsService.getById(projectId, userId);

    // Concurrency check
    if (expectedVersion !== undefined && currentProject.version !== expectedVersion) {
      throw new ValidationError(
        `Version conflict: Server is on version ${currentProject.version}, but expected ${expectedVersion}`
      );
    }

    // Apply restored state as an update (increments project version cleanly)
    const updated = await projectsService.update(
      projectId,
      userId,
      {
        expectedVersion,
        timeline: snapshot.snapshot.timeline,
        canvas: snapshot.snapshot.canvas,
        assets: snapshot.snapshot.assets,
        settings: snapshot.snapshot.settings,
      }
    );

    logger.info(
      { projectId, restoredFromVersion: versionNumber, newVersion: updated.version },
      'Restored project state non-destructively from snapshot'
    );

    return {
      restoredProject: updated,
      restoredFromVersion: versionNumber,
      newVersion: updated.version,
    };
  }

  /**
   * Computes structured metadata and timeline diff between two snapshots
   */
  async compareVersions(
    projectId: string,
    sourceVersion: number,
    targetVersion: number,
    userId: string
  ): Promise<VersionDiff> {
    await collaborationService.assertPermission(projectId, userId, 'project:view');

    const sourceSnapshot = await this.getSnapshot(projectId, sourceVersion, userId);
    const targetSnapshot = await this.getSnapshot(projectId, targetVersion, userId);

    const srcProj = sourceSnapshot.snapshot;
    const tgtProj = targetSnapshot.snapshot;

    const srcDuration = srcProj.timeline?.duration || 0;
    const tgtDuration = tgtProj.timeline?.duration || 0;
    const durationDelta = tgtDuration - srcDuration;

    const canvasChanged =
      srcProj.canvas?.aspectRatio !== tgtProj.canvas?.aspectRatio ||
      srcProj.canvas?.resolutionWidth !== tgtProj.canvas?.resolutionWidth ||
      srcProj.canvas?.resolutionHeight !== tgtProj.canvas?.resolutionHeight ||
      srcProj.canvas?.framerate !== tgtProj.canvas?.framerate;

    // Track differences
    const srcTracks = srcProj.timeline?.tracks || [];
    const tgtTracks = tgtProj.timeline?.tracks || [];
    const timelineTracksDelta = tgtTracks.length - srcTracks.length;

    // Clip differences
    const srcClips = new Map<string, any>();
    for (const track of srcTracks) {
      for (const clip of track.clips || []) {
        srcClips.set(clip.id, clip);
      }
    }

    const tgtClips = new Map<string, any>();
    for (const track of tgtTracks) {
      for (const clip of track.clips || []) {
        tgtClips.set(clip.id, clip);
      }
    }

    const clipsAdded: string[] = [];
    const clipsRemoved: string[] = [];
    const clipsModified: string[] = [];

    for (const [id, clip] of tgtClips.entries()) {
      if (!srcClips.has(id)) {
        clipsAdded.push(clip.name || id);
      } else {
        const srcClip = srcClips.get(id);
        if (
          srcClip.startTime !== clip.startTime ||
          srcClip.duration !== clip.duration ||
          srcClip.inPoint !== clip.inPoint ||
          srcClip.outPoint !== clip.outPoint
        ) {
          clipsModified.push(clip.name || id);
        }
      }
    }

    for (const [id, clip] of srcClips.entries()) {
      if (!tgtClips.has(id)) {
        clipsRemoved.push(clip.name || id);
      }
    }

    const srcAssetsCount = srcProj.assets?.length || 0;
    const tgtAssetsCount = tgtProj.assets?.length || 0;
    const assetsDeltaCount = tgtAssetsCount - srcAssetsCount;

    const summary = `Diff v${sourceVersion} -> v${targetVersion}: Duration ${durationDelta >= 0 ? '+' : ''}${durationDelta.toFixed(1)}s, ${clipsAdded.length} clip(s) added, ${clipsRemoved.length} removed, ${clipsModified.length} modified. Canvas ${canvasChanged ? 'modified' : 'unchanged'}.`;

    return {
      sourceVersion,
      targetVersion,
      durationDelta,
      canvasChanged,
      timelineTracksDelta,
      clipsAdded,
      clipsRemoved,
      clipsModified,
      assetsDeltaCount,
      summary,
    };
  }

  // ============================================================================
  // 2. TIMECODE REVIEW COMMENTS WORKFLOW
  // ============================================================================

  async createComment(
    projectId: string,
    userId: string,
    input: CreateCommentInput
  ): Promise<ProjectComment> {
    const role = await collaborationService.assertPermission(projectId, userId, 'comment:create');

    const project = mockProjects.get(projectId);
    if (!project) throw new NotFoundError(`Project not found: ${projectId}`);

    const now = new Date().toISOString();
    const commentId = uuidv4();

    const comment: ProjectComment = {
      id: commentId,
      projectId,
      type: input.type,
      timecode: input.timecode,
      endTimecode: input.endTimecode,
      assetId: input.assetId,
      text: input.text,
      authorId: userId,
      authorName: `User ${userId.slice(0, 6)}`,
      authorRole: role,
      status: 'OPEN',
      createdAt: now,
      updatedAt: now,
    };

    mockComments.set(commentId, comment);
    logger.info({ projectId, commentId, timecode: input.timecode, authorRole: role }, 'Review comment added');

    // Broadcast real-time comment notification
    collaborationManager.broadcast(projectId, {
      action: 'COMMENT_ADDED',
      projectId,
      senderId: userId,
      data: comment,
    });

    return comment;
  }

  async listComments(
    projectId: string,
    userId: string,
    filter: ListCommentsFilter = {}
  ): Promise<ProjectComment[]> {
    await collaborationService.assertPermission(projectId, userId, 'project:view');

    let comments = Array.from(mockComments.values()).filter((c) => c.projectId === projectId);

    if (filter.type) {
      comments = comments.filter((c) => c.type === filter.type);
    }

    if (filter.status && filter.status !== 'all') {
      comments = comments.filter((c) => c.status === filter.status);
    }

    if (filter.assetId) {
      comments = comments.filter((c) => c.assetId === filter.assetId);
    }

    if (filter.startTimecode !== undefined) {
      comments = comments.filter((c) => (c.timecode ?? 0) >= filter.startTimecode!);
    }

    if (filter.endTimecode !== undefined) {
      comments = comments.filter((c) => (c.timecode ?? 0) <= filter.endTimecode!);
    }

    // Sort timeline comments chronologically, then by createdAt
    comments.sort((a, b) => {
      if (a.timecode !== undefined && b.timecode !== undefined) {
        return a.timecode - b.timecode;
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return comments;
  }

  async resolveComment(
    projectId: string,
    commentId: string,
    userId: string,
    status: 'OPEN' | 'RESOLVED'
  ): Promise<ProjectComment> {
    await collaborationService.assertPermission(projectId, userId, 'comment:resolve');

    const comment = mockComments.get(commentId);
    if (!comment || comment.projectId !== projectId) {
      throw new NotFoundError(`Comment not found: ${commentId}`);
    }

    const now = new Date().toISOString();
    comment.status = status;
    comment.resolvedBy = status === 'RESOLVED' ? userId : undefined;
    comment.resolvedAt = status === 'RESOLVED' ? now : undefined;
    comment.updatedAt = now;

    mockComments.set(commentId, comment);
    logger.info({ projectId, commentId, status }, 'Review comment status updated');

    collaborationManager.broadcast(projectId, {
      action: 'COMMENT_RESOLVED',
      projectId,
      senderId: userId,
      data: comment,
    });

    return comment;
  }

  async deleteComment(
    projectId: string,
    commentId: string,
    userId: string
  ): Promise<{ deleted: boolean; id: string }> {
    const role = await collaborationService.getUserRole(projectId, userId);
    const comment = mockComments.get(commentId);
    if (!comment || comment.projectId !== projectId) {
      throw new NotFoundError(`Comment not found: ${commentId}`);
    }

    // Author or Owner can delete comments
    if (comment.authorId !== userId && role !== 'OWNER') {
      throw new ForbiddenError('You can only delete your own comments unless you are the project owner');
    }

    mockComments.delete(commentId);
    logger.info({ projectId, commentId }, 'Review comment deleted');
    return { deleted: true, id: commentId };
  }
}

export const reviewService = new ReviewService();
