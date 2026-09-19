import { ProjectDocument } from '../projects.service.js';
import { ProjectRole } from '../../collaboration/rbac.types.js';

export interface ProjectVersionSnapshot {
  id: string;
  projectId: string;
  versionNumber: number;
  name: string;
  description?: string;
  snapshot: ProjectDocument;
  createdBy: string;
  createdByName?: string;
  createdAt: string;
}

export interface VersionDiff {
  sourceVersion: number;
  targetVersion: number;
  durationDelta: number;
  canvasChanged: boolean;
  timelineTracksDelta: number;
  clipsAdded: string[];
  clipsRemoved: string[];
  clipsModified: string[];
  assetsDeltaCount: number;
  summary: string;
}

export type CommentType = 'timeline' | 'project' | 'asset';
export type CommentStatus = 'OPEN' | 'RESOLVED';

export interface ProjectComment {
  id: string;
  projectId: string;
  type: CommentType;
  timecode?: number;
  endTimecode?: number;
  assetId?: string;
  text: string;
  authorId: string;
  authorName: string;
  authorRole: ProjectRole;
  status: CommentStatus;
  resolvedBy?: string;
  resolvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSnapshotInput {
  name: string;
  description?: string;
}

export interface CreateCommentInput {
  type: CommentType;
  timecode?: number;
  endTimecode?: number;
  assetId?: string;
  text: string;
}

export interface ListCommentsFilter {
  type?: CommentType;
  status?: CommentStatus | 'all';
  assetId?: string;
  startTimecode?: number;
  endTimecode?: number;
}
