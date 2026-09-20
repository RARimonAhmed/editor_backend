import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import {
  ProjectRole,
  ProjectPermission,
  ROLE_PERMISSIONS,
  ProjectCollaborator,
  ProjectShareLink,
  InviteCollaboratorInput,
  CreateShareLinkInput,
} from './rbac.types.js';
import { mockProjects } from '../projects/projects.service.js';
import { db } from '../../database/client.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../../core/errors.js';
import { logger } from '../../core/logger.js';
import { realtimeService } from '../realtime/realtime.service.js';

// In-memory repositories for high-speed lookup and tests
export const mockCollaborators = new Map<string, ProjectCollaborator>();
export const mockShareLinks = new Map<string, ProjectShareLink>();

export class CollaborationService {
  /**
   * Resolves the user's role on a given project
   */
  async getUserRole(projectId: string, userId: string): Promise<ProjectRole | null> {
    // 1. Check if user is the direct Project Owner
    const project = mockProjects.get(projectId);
    if (project && project.userId === userId) {
      return 'OWNER';
    }

    // 2. Check Collaborator records
    const collabKey = `${projectId}:${userId}`;
    const collab = mockCollaborators.get(collabKey);
    if (collab && (collab.status === 'ACTIVE' || collab.status === 'INVITED')) {
      return collab.role;
    }

    // 3. Fallback to DB if connected
    try {
      if (await db.isHealthy()) {
        const res = await db.query(
          `SELECT role, status FROM project_collaborators WHERE project_id = $1 AND user_id = $2;`,
          [projectId, userId]
        );
        if (res.rows.length > 0 && res.rows[0].status === 'ACTIVE') {
          return res.rows[0].role as ProjectRole;
        }
      }
    } catch {
      // ignore
    }

    return null;
  }

  /**
   * Checks whether a user has a specific permission on a project
   */
  async hasPermission(projectId: string, userId: string, permission: ProjectPermission): Promise<boolean> {
    const role = await this.getUserRole(projectId, userId);
    if (!role) return false;
    const permissions = ROLE_PERMISSIONS[role] || [];
    return permissions.includes(permission);
  }

  /**
   * Asserts permission or throws ForbiddenError
   */
  async assertPermission(projectId: string, userId: string, permission: ProjectPermission): Promise<ProjectRole> {
    const role = await this.getUserRole(projectId, userId);
    if (!role) {
      throw new ForbiddenError(`You do not have access to this project`);
    }

    const permissions = ROLE_PERMISSIONS[role] || [];
    if (!permissions.includes(permission)) {
      throw new ForbiddenError(
        `Permission denied: Role "${role}" does not have "${permission}" capability on project ${projectId}`
      );
    }

    return role;
  }

  /**
   * Invites a collaborator to the project
   */
  async inviteCollaborator(
    projectId: string,
    requesterUserId: string,
    input: InviteCollaboratorInput
  ): Promise<ProjectCollaborator> {
    await this.assertPermission(projectId, requesterUserId, 'project:collaborators:manage');

    const project = mockProjects.get(projectId);
    if (!project) throw new NotFoundError(`Project not found: ${projectId}`);

    const targetUserId = input.userId || `user_${input.email?.replace(/[^a-zA-Z0-9]/g, '_')}`;
    if (targetUserId === project.userId) {
      throw new ValidationError('Project owner already has full administrative access');
    }

    const collabKey = `${projectId}:${targetUserId}`;
    const existing = mockCollaborators.get(collabKey);
    if (existing && existing.status === 'ACTIVE') {
      throw new ValidationError(`User is already an active collaborator with role "${existing.role}"`);
    }

    const now = new Date().toISOString();
    const collaborator: ProjectCollaborator = {
      id: uuidv4(),
      projectId,
      userId: targetUserId,
      email: input.email,
      role: input.role,
      status: 'ACTIVE', // Auto-active for seamless collaboration
      invitedBy: requesterUserId,
      invitedAt: now,
      acceptedAt: now,
      updatedAt: now,
    };

    mockCollaborators.set(collabKey, collaborator);
    realtimeService.notifyProjectShared(projectId, targetUserId, input.role, requesterUserId);
    logger.info({ projectId, targetUserId, role: input.role }, 'Collaborator added to project');
    return collaborator;
  }

  /**
   * Lists all collaborators on a project (including owner)
   */
  async listCollaborators(
    projectId: string,
    requesterUserId: string
  ): Promise<{ owner: { userId: string; role: ProjectRole }; collaborators: ProjectCollaborator[] }> {
    await this.assertPermission(projectId, requesterUserId, 'project:view');

    const project = mockProjects.get(projectId);
    if (!project) throw new NotFoundError(`Project not found: ${projectId}`);

    const collaborators = Array.from(mockCollaborators.values()).filter(
      (c) => c.projectId === projectId && c.status === 'ACTIVE'
    );

    return {
      owner: {
        userId: project.userId,
        role: 'OWNER',
      },
      collaborators,
    };
  }

  /**
   * Updates a collaborator's role
   */
  async updateRole(
    projectId: string,
    requesterUserId: string,
    targetUserId: string,
    newRole: ProjectRole
  ): Promise<ProjectCollaborator> {
    await this.assertPermission(projectId, requesterUserId, 'project:collaborators:manage');

    const project = mockProjects.get(projectId);
    if (!project) throw new NotFoundError(`Project not found: ${projectId}`);

    if (targetUserId === project.userId) {
      throw new ValidationError('Cannot modify role of the project owner');
    }

    const collabKey = `${projectId}:${targetUserId}`;
    const collab = mockCollaborators.get(collabKey);
    if (!collab || collab.status !== 'ACTIVE') {
      throw new NotFoundError('Collaborator not found or not active');
    }

    collab.role = newRole;
    collab.updatedAt = new Date().toISOString();
    mockCollaborators.set(collabKey, collab);

    logger.info({ projectId, targetUserId, newRole }, 'Collaborator role updated');
    return collab;
  }

  /**
   * Removes a collaborator from the project
   */
  async removeCollaborator(
    projectId: string,
    requesterUserId: string,
    targetUserId: string
  ): Promise<{ removed: boolean; userId: string }> {
    await this.assertPermission(projectId, requesterUserId, 'project:collaborators:manage');

    const collabKey = `${projectId}:${targetUserId}`;
    const collab = mockCollaborators.get(collabKey);
    if (!collab) {
      throw new NotFoundError('Collaborator not found');
    }

    collab.status = 'REVOKED';
    collab.updatedAt = new Date().toISOString();
    mockCollaborators.delete(collabKey);

    logger.info({ projectId, targetUserId }, 'Collaborator removed');
    return { removed: true, userId: targetUserId };
  }

  /**
   * Collaborator leaves a project voluntarily
   */
  async leaveProject(projectId: string, userId: string): Promise<{ left: boolean }> {
    const project = mockProjects.get(projectId);
    if (project && project.userId === userId) {
      throw new ValidationError('Project owner cannot leave the project; transfer ownership or delete the project instead');
    }

    const collabKey = `${projectId}:${userId}`;
    mockCollaborators.delete(collabKey);
    logger.info({ projectId, userId }, 'Collaborator left the project');
    return { left: true };
  }

  /**
   * Creates a shareable link with optional password and expiry
   */
  async createShareLink(
    projectId: string,
    requesterUserId: string,
    input: CreateShareLinkInput
  ): Promise<ProjectShareLink> {
    await this.assertPermission(projectId, requesterUserId, 'project:share_link:manage');

    const token = crypto.randomBytes(24).toString('hex');
    const passwordHash = input.password
      ? crypto.createHash('sha256').update(input.password).digest('hex')
      : undefined;

    const expiresAt = input.expiresInDays
      ? new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000).toISOString()
      : undefined;

    const shareLink: ProjectShareLink = {
      id: uuidv4(),
      projectId,
      token,
      role: input.role || 'VIEWER',
      allowComments: input.allowComments ?? true,
      passwordHash,
      expiresAt,
      maxUses: input.maxUses,
      useCount: 0,
      createdBy: requesterUserId,
      createdAt: new Date().toISOString(),
      isActive: true,
    };

    mockShareLinks.set(token, shareLink);
    logger.info({ projectId, token }, 'Created project share link');
    return shareLink;
  }

  /**
   * Retrieves active share link for a project
   */
  async getShareLink(projectId: string, requesterUserId: string): Promise<ProjectShareLink | null> {
    await this.assertPermission(projectId, requesterUserId, 'project:view');
    const links = Array.from(mockShareLinks.values()).filter(
      (l) => l.projectId === projectId && l.isActive
    );
    return links.length > 0 ? links[0] : null;
  }

  /**
   * Revokes an active share link
   */
  async revokeShareLink(projectId: string, requesterUserId: string): Promise<{ revoked: boolean }> {
    await this.assertPermission(projectId, requesterUserId, 'project:share_link:manage');
    let revoked = false;

    for (const [token, link] of mockShareLinks.entries()) {
      if (link.projectId === projectId && link.isActive) {
        link.isActive = false;
        link.revokedAt = new Date().toISOString();
        revoked = true;
      }
    }

    return { revoked };
  }

  /**
   * Validates and accesses a shared project using token and optional password
   */
  async accessSharedProject(
    token: string,
    password?: string
  ): Promise<{ project: any; grantedRole: ProjectRole; allowComments: boolean }> {
    const link = mockShareLinks.get(token);
    if (!link || !link.isActive) {
      throw new NotFoundError('Share link is invalid, expired, or revoked');
    }

    if (link.expiresAt && new Date(link.expiresAt).getTime() < Date.now()) {
      link.isActive = false;
      throw new ValidationError('This share link has expired');
    }

    if (link.maxUses && link.useCount >= link.maxUses) {
      link.isActive = false;
      throw new ValidationError('This share link has reached its maximum usage limit');
    }

    if (link.passwordHash) {
      if (!password) {
        throw new ForbiddenError('Password is required to access this shared project');
      }
      const hash = crypto.createHash('sha256').update(password).digest('hex');
      if (hash !== link.passwordHash) {
        throw new ForbiddenError('Invalid password for shared project');
      }
    }

    link.useCount += 1;

    const project = mockProjects.get(link.projectId);
    if (!project) {
      throw new NotFoundError('Project associated with share link no longer exists');
    }

    return {
      project,
      grantedRole: link.role,
      allowComments: link.allowComments,
    };
  }
}

export const collaborationService = new CollaborationService();
