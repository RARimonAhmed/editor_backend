import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { projectsService } from '../src/modules/projects/projects.service.js';
import { collaborationService } from '../src/modules/collaboration/collaboration.service.js';

describe('Project Collaboration & Fine-Grained RBAC Subsystem', () => {
  let app: FastifyInstance;
  let ownerToken: string;
  let ownerUserId: string;
  let editorToken: string;
  let editorUserId: string;
  let viewerToken: string;
  let viewerUserId: string;
  let projectId: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    // 1. Register Owner
    const regOwner = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email: `project_owner_${Date.now()}@techxayan.com`,
        password: 'Password123!',
        displayName: 'Project Owner',
      },
    });
    const ownerBody = JSON.parse(regOwner.body);
    ownerToken = ownerBody.data.tokens.accessToken;
    ownerUserId = ownerBody.data.user.id;

    // 2. Register Editor
    const regEditor = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email: `collaborator_editor_${Date.now()}@techxayan.com`,
        password: 'Password123!',
        displayName: 'Senior Video Editor',
      },
    });
    const editorBody = JSON.parse(regEditor.body);
    editorToken = editorBody.data.tokens.accessToken;
    editorUserId = editorBody.data.user.id;

    // 3. Register Viewer
    const regViewer = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email: `collaborator_viewer_${Date.now()}@techxayan.com`,
        password: 'Password123!',
        displayName: 'Client Reviewer',
      },
    });
    const viewerBody = JSON.parse(regViewer.body);
    viewerToken = viewerBody.data.tokens.accessToken;
    viewerUserId = viewerBody.data.user.id;

    // Create a project owned by Owner
    const proj = await projectsService.create(ownerUserId, {
      title: 'Global Collaboration Project',
      description: 'Documentary project with cross-team review',
    });
    projectId = proj.id;
  });

  afterAll(async () => {
    await app.close();
  });

  // 1. INVITE COLLABORATORS WITH ROLES
  it('Owner can invite collaborators with distinct roles (EDITOR, VIEWER)', async () => {
    // Invite Editor
    const res1 = await app.inject({
      method: 'POST',
      url: `/v1/projects/${projectId}/collaborators`,
      headers: { Authorization: `Bearer ${ownerToken}` },
      payload: {
        userId: editorUserId,
        role: 'EDITOR',
      },
    });

    expect(res1.statusCode).toBe(201);
    const body1 = JSON.parse(res1.body);
    expect(body1.success).toBe(true);
    expect(body1.data.role).toBe('EDITOR');

    // Invite Viewer
    const res2 = await app.inject({
      method: 'POST',
      url: `/v1/projects/${projectId}/collaborators`,
      headers: { Authorization: `Bearer ${ownerToken}` },
      payload: {
        userId: viewerUserId,
        role: 'VIEWER',
      },
    });

    expect(res2.statusCode).toBe(201);
    const body2 = JSON.parse(res2.body);
    expect(body2.data.role).toBe('VIEWER');
  });

  // 2. LIST COLLABORATORS
  it('GET /v1/projects/:id/collaborators returns owner and active team members', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/projects/${projectId}/collaborators`,
      headers: { Authorization: `Bearer ${ownerToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.owner.userId).toBe(ownerUserId);
    expect(body.data.owner.role).toBe('OWNER');
    expect(body.data.collaborators.length).toBe(2);
  });

  // 3. FINE-GRAINED RBAC PERMISSION ENFORCEMENT
  it('Enforces fine-grained permissions across roles: EDITOR vs VIEWER', async () => {
    // Owner has full permissions
    const ownerCanDelete = await collaborationService.hasPermission(projectId, ownerUserId, 'project:delete');
    const ownerCanEdit = await collaborationService.hasPermission(projectId, ownerUserId, 'timeline:edit');
    expect(ownerCanDelete).toBe(true);
    expect(ownerCanEdit).toBe(true);

    // Editor can edit timeline but CANNOT delete project or manage collaborators
    const editorCanEdit = await collaborationService.hasPermission(projectId, editorUserId, 'timeline:edit');
    const editorCanDelete = await collaborationService.hasPermission(projectId, editorUserId, 'project:delete');
    const editorCanManageTeam = await collaborationService.hasPermission(projectId, editorUserId, 'project:collaborators:manage');
    expect(editorCanEdit).toBe(true);
    expect(editorCanDelete).toBe(false);
    expect(editorCanManageTeam).toBe(false);

    // Viewer is read-only (cannot edit timeline or upload media)
    const viewerCanView = await collaborationService.hasPermission(projectId, viewerUserId, 'project:view');
    const viewerCanEdit = await collaborationService.hasPermission(projectId, viewerUserId, 'timeline:edit');
    const viewerCanUpload = await collaborationService.hasPermission(projectId, viewerUserId, 'media:upload');
    expect(viewerCanView).toBe(true);
    expect(viewerCanEdit).toBe(false);
    expect(viewerCanUpload).toBe(false);
  });

  // 4. UPDATE COLLABORATOR ROLE
  it('Owner can update collaborator role from VIEWER to COMMENTER', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/v1/projects/${projectId}/collaborators/${viewerUserId}`,
      headers: { Authorization: `Bearer ${ownerToken}` },
      payload: { role: 'COMMENTER' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.role).toBe('COMMENTER');

    const updatedRole = await collaborationService.getUserRole(projectId, viewerUserId);
    expect(updatedRole).toBe('COMMENTER');
  });

  // 5. SHAREABLE LINK LIFECYCLE (CREATE, ACCESS WITH PASSWORD, REVOKE)
  it('Share link workflow: creates password-protected link, accesses project, and revokes cleanly', async () => {
    // 1. Create Share Link
    const createRes = await app.inject({
      method: 'POST',
      url: `/v1/projects/${projectId}/share-link`,
      headers: { Authorization: `Bearer ${ownerToken}` },
      payload: {
        role: 'COMMENTER',
        allowComments: true,
        password: 'ClientReviewSecret2026',
        expiresInDays: 7,
      },
    });

    expect(createRes.statusCode).toBe(201);
    const linkBody = JSON.parse(createRes.body);
    const token = linkBody.data.token;
    expect(token).toBeDefined();

    // 2. Access with wrong password -> 403
    const wrongPassRes = await app.inject({
      method: 'POST',
      url: `/v1/projects/shared/${token}`,
      payload: { password: 'WrongPassword!' },
    });
    expect(wrongPassRes.statusCode).toBe(403);

    // 3. Access with correct password -> 200
    const correctPassRes = await app.inject({
      method: 'POST',
      url: `/v1/projects/shared/${token}`,
      payload: { password: 'ClientReviewSecret2026' },
    });
    expect(correctPassRes.statusCode).toBe(200);
    const sharedData = JSON.parse(correctPassRes.body);
    expect(sharedData.data.project.id).toBe(projectId);
    expect(sharedData.data.grantedRole).toBe('COMMENTER');
    expect(sharedData.data.allowComments).toBe(true);

    // 4. Revoke Share Link
    const revokeRes = await app.inject({
      method: 'DELETE',
      url: `/v1/projects/${projectId}/share-link`,
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    expect(revokeRes.statusCode).toBe(200);

    // 5. Accessing revoked link -> 404
    const afterRevokeRes = await app.inject({
      method: 'POST',
      url: `/v1/projects/shared/${token}`,
      payload: { password: 'ClientReviewSecret2026' },
    });
    expect(afterRevokeRes.statusCode).toBe(404);
  });

  // 6. VOLUNTARILY LEAVE PROJECT
  it('Collaborator can leave project voluntarily; Owner cannot leave', async () => {
    // Viewer leaves
    const leaveRes = await app.inject({
      method: 'POST',
      url: `/v1/projects/${projectId}/collaborators/leave`,
      headers: { Authorization: `Bearer ${viewerToken}` },
    });
    expect(leaveRes.statusCode).toBe(200);

    const viewerRole = await collaborationService.getUserRole(projectId, viewerUserId);
    expect(viewerRole).toBeNull();

    // Owner cannot leave
    const ownerLeaveRes = await app.inject({
      method: 'POST',
      url: `/v1/projects/${projectId}/collaborators/leave`,
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    expect(ownerLeaveRes.statusCode).toBe(400);
  });
});
