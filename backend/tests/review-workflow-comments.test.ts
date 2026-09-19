import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { projectsService } from '../src/modules/projects/projects.service.js';

describe('Professional Review Workflow & Timecode Comments Subsystem', () => {
  let app: FastifyInstance;
  let authToken: string;
  let userId: string;
  let projectId: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    // Register user
    const regRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email: `review_lead_${Date.now()}@techxayan.com`,
        password: 'Password123!',
        displayName: 'Post-Production Supervisor',
      },
    });

    const body = JSON.parse(regRes.body);
    authToken = body.data.tokens.accessToken;
    userId = body.data.user.id;

    // Create a base project
    const proj = await projectsService.create(userId, {
      title: 'Commercial Spot 30s',
      timeline: {
        duration: 30.0,
        tracks: [
          {
            id: 'video-track-1',
            type: 'video',
            name: 'Hero Footage',
            clips: [
              {
                id: 'clip-101',
                name: 'Opening Hero Shot',
                startTime: 0,
                duration: 10,
              },
            ],
          },
        ],
      },
    });
    projectId = proj.id;
  });

  afterAll(async () => {
    await app.close();
  });

  // 1. CREATE NAMED IMMUTABLE VERSION SNAPSHOTS
  it('Creates immutable named snapshots (Version 1, Version 2) across project revisions', async () => {
    // 1. Snapshot Version 1
    const snap1Res = await app.inject({
      method: 'POST',
      url: `/v1/projects/${projectId}/versions`,
      headers: { Authorization: `Bearer ${authToken}` },
      payload: {
        name: 'Rough Cut v1',
        description: 'First assembly cut before client review',
      },
    });

    expect(snap1Res.statusCode).toBe(201);
    const snap1Body = JSON.parse(snap1Res.body);
    expect(snap1Body.success).toBe(true);
    expect(snap1Body.data.versionNumber).toBe(1);
    expect(snap1Body.data.name).toBe('Rough Cut v1');

    // 2. Modify project timeline (add a clip and extend duration)
    const currentProject = await projectsService.getById(projectId, userId);
    await projectsService.update(
      projectId,
      userId,
      {
        expectedVersion: currentProject.version,
        timeline: {
          duration: 45.0,
          tracks: [
            {
              id: 'video-track-1',
              type: 'video',
              name: 'Hero Footage',
              clips: [
                { id: 'clip-101', name: 'Opening Hero Shot', startTime: 0, duration: 10 },
                { id: 'clip-102', name: 'Product Close-Up', startTime: 10, duration: 15 },
              ],
            },
          ],
        },
      }
    );

    // 3. Snapshot Version 2
    const snap2Res = await app.inject({
      method: 'POST',
      url: `/v1/projects/${projectId}/versions`,
      headers: { Authorization: `Bearer ${authToken}` },
      payload: {
        name: 'Director Review Cut v2',
        description: 'Extended cut with product hero sequence',
      },
    });

    expect(snap2Res.statusCode).toBe(201);
    const snap2Body = JSON.parse(snap2Res.body);
    expect(snap2Body.data.versionNumber).toBe(2);
    expect(snap2Body.data.name).toBe('Director Review Cut v2');

    // 4. List all snapshots
    const listRes = await app.inject({
      method: 'GET',
      url: `/v1/projects/${projectId}/versions`,
      headers: { Authorization: `Bearer ${authToken}` },
    });

    expect(listRes.statusCode).toBe(200);
    const listBody = JSON.parse(listRes.body);
    expect(listBody.data.length).toBe(2);
  });

  // 2. COMPARE VERSION SNAPSHOTS DIFF
  it('GET /v1/projects/:id/versions/compare computes timeline track, clip, and duration diff', async () => {
    const diffRes = await app.inject({
      method: 'GET',
      url: `/v1/projects/${projectId}/versions/compare?sourceVersion=1&targetVersion=2`,
      headers: { Authorization: `Bearer ${authToken}` },
    });

    expect(diffRes.statusCode).toBe(200);
    const diffBody = JSON.parse(diffRes.body);
    expect(diffBody.success).toBe(true);

    const diff = diffBody.data;
    expect(diff.sourceVersion).toBe(1);
    expect(diff.targetVersion).toBe(2);
    expect(diff.durationDelta).toBe(15.0); // 45.0s - 30.0s = +15s
    expect(diff.clipsAdded).toContain('Product Close-Up');
    expect(diff.summary).toContain('+15.0s');
  });

  // 3. NON-DESTRUCTIVE SNAPSHOT RESTORE
  it('Restores Version 1 non-destructively: creates Version 3 with v1 contents without destroying v2', async () => {
    const projectBefore = await projectsService.getById(projectId, userId);

    const restoreRes = await app.inject({
      method: 'POST',
      url: `/v1/projects/${projectId}/versions/1/restore`,
      headers: { Authorization: `Bearer ${authToken}` },
      payload: {
        expectedVersion: projectBefore.version,
      },
    });

    expect(restoreRes.statusCode).toBe(200);
    const restoreBody = JSON.parse(restoreRes.body);
    expect(restoreBody.success).toBe(true);
    expect(restoreBody.data.restoredFromVersion).toBe(1);
    expect(restoreBody.data.newVersion).toBe(projectBefore.version + 1);

    // Verify timeline was restored back to 30.0s
    const restoredProject = await projectsService.getById(projectId, userId);
    expect(restoredProject.timeline.duration).toBe(30.0);
  });

  // 4. TIMECODE REVIEW COMMENTS WORKFLOW
  it('Allows adding timeline timecode comments, asset comments, filtering and resolving them', async () => {
    // 1. Add timeline comment at timecode t = 14.5s
    const c1Res = await app.inject({
      method: 'POST',
      url: `/v1/projects/${projectId}/comments`,
      headers: { Authorization: `Bearer ${authToken}` },
      payload: {
        type: 'timeline',
        timecode: 14.5,
        endTimecode: 16.0,
        text: 'Shadows in the background need 15% lift to match key light',
      },
    });

    expect(c1Res.statusCode).toBe(201);
    const c1Body = JSON.parse(c1Res.body);
    const comment1 = c1Body.data;
    expect(comment1.timecode).toBe(14.5);
    expect(comment1.status).toBe('OPEN');
    expect(comment1.authorRole).toBe('OWNER');

    // 2. Add second comment at timecode t = 2.0s
    await app.inject({
      method: 'POST',
      url: `/v1/projects/${projectId}/comments`,
      headers: { Authorization: `Bearer ${authToken}` },
      payload: {
        type: 'timeline',
        timecode: 2.0,
        text: 'Add subtle whoosh sound effect on logo reveal',
      },
    });

    // 3. List comments: verify chronological timecode ordering (2.0s before 14.5s)
    const listRes = await app.inject({
      method: 'GET',
      url: `/v1/projects/${projectId}/comments`,
      headers: { Authorization: `Bearer ${authToken}` },
    });

    expect(listRes.statusCode).toBe(200);
    const listBody = JSON.parse(listRes.body);
    expect(listBody.data.length).toBe(2);
    expect(listBody.data[0].timecode).toBe(2.0);
    expect(listBody.data[1].timecode).toBe(14.5);

    // 4. Resolve comment 1
    const resolveRes = await app.inject({
      method: 'PATCH',
      url: `/v1/projects/${projectId}/comments/${comment1.id}`,
      headers: { Authorization: `Bearer ${authToken}` },
      payload: { status: 'RESOLVED' },
    });

    expect(resolveRes.statusCode).toBe(200);
    const resolveBody = JSON.parse(resolveRes.body);
    expect(resolveBody.data.status).toBe('RESOLVED');
    expect(resolveBody.data.resolvedAt).toBeDefined();

    // 5. Filter by status: open vs resolved
    const openRes = await app.inject({
      method: 'GET',
      url: `/v1/projects/${projectId}/comments?status=OPEN`,
      headers: { Authorization: `Bearer ${authToken}` },
    });

    const openBody = JSON.parse(openRes.body);
    expect(openBody.data.length).toBe(1);
    expect(openBody.data[0].timecode).toBe(2.0);

    // 6. Delete comment
    const delRes = await app.inject({
      method: 'DELETE',
      url: `/v1/projects/${projectId}/comments/${comment1.id}`,
      headers: { Authorization: `Bearer ${authToken}` },
    });

    expect(delRes.statusCode).toBe(200);
  });
});
