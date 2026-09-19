/**
 * Role-Based Access Control (RBAC) & Collaboration Types
 * Fine-grained permissions across timeline, media, AI jobs, exports, versions, comments, settings.
 */

export type ProjectRole = 'OWNER' | 'EDITOR' | 'COMMENTER' | 'VIEWER';

export type ProjectPermission =
  | 'project:view'
  | 'project:delete'
  | 'project:archive'
  | 'project:settings:update'
  | 'project:collaborators:manage'
  | 'project:share_link:manage'
  | 'timeline:edit'
  | 'media:upload'
  | 'media:delete'
  | 'ai:run'
  | 'export:start'
  | 'version:create'
  | 'version:restore'
  | 'comment:create'
  | 'comment:resolve';

export const ROLE_PERMISSIONS: Record<ProjectRole, readonly ProjectPermission[]> = {
  OWNER: [
    'project:view',
    'project:delete',
    'project:archive',
    'project:settings:update',
    'project:collaborators:manage',
    'project:share_link:manage',
    'timeline:edit',
    'media:upload',
    'media:delete',
    'ai:run',
    'export:start',
    'version:create',
    'version:restore',
    'comment:create',
    'comment:resolve',
  ],
  EDITOR: [
    'project:view',
    'timeline:edit',
    'media:upload',
    'media:delete',
    'ai:run',
    'export:start',
    'version:create',
    'comment:create',
    'comment:resolve',
  ],
  COMMENTER: [
    'project:view',
    'comment:create',
    'comment:resolve',
  ],
  VIEWER: [
    'project:view',
  ],
};

export type CollaboratorStatus = 'INVITED' | 'ACTIVE' | 'DECLINED' | 'REVOKED';

export interface ProjectCollaborator {
  id: string;
  projectId: string;
  userId: string;
  email?: string;
  name?: string;
  role: ProjectRole;
  status: CollaboratorStatus;
  invitedBy: string;
  invitedAt: string;
  acceptedAt?: string;
  updatedAt: string;
}

export interface ProjectShareLink {
  id: string;
  projectId: string;
  token: string;
  role: ProjectRole; // Role granted when accessed via link (usually VIEWER or COMMENTER)
  allowComments: boolean;
  passwordHash?: string;
  expiresAt?: string;
  maxUses?: number;
  useCount: number;
  createdBy: string;
  createdAt: string;
  revokedAt?: string;
  isActive: boolean;
}

export interface InviteCollaboratorInput {
  email?: string;
  userId?: string;
  role: ProjectRole;
}

export interface UpdateCollaboratorRoleInput {
  role: ProjectRole;
}

export interface CreateShareLinkInput {
  role?: ProjectRole;
  allowComments?: boolean;
  password?: string;
  expiresInDays?: number;
  maxUses?: number;
}
