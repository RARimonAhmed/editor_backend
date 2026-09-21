import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { adminService } from '../src/modules/admin/admin.service.js';
import { collaborationService } from '../src/modules/collaboration/collaboration.service.js';

describe('Day 3 Command 11: Production Cloud Project Management Acceptance', () => {
  let app: FastifyInstance;
  let ownerToken: string;
  let ownerId: string;
  let editorToken: string;
  let editorId: string;
  let viewerToken: string;
  let viewerId: string;
  let outsiderToken: string;
  let outsiderId: string;

  let testProjectId: string;
  let projectETag: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    // 1. Register Owner
    const ownerRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email: `project_owner_${Date.now()}@techxayan.com`,
        password: 'Password123!',
        displayName: 'Lead Studio Producer',
      },
    });
    const ownerBody = JSON.parse(ownerRes.body);
    ownerToken = ownerBody.data.tokens.accessToken;
    ownerId = ownerBody.data.user.id;

    // 2. Register Editor
    const editorRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email: `project_editor_${Date.now()}@techxayan.com`,
        password: 'Password123!',
        displayName: 'Senior Video Editor',
      },
    });
    const editorBody = JSON.parse(editorRes.body);
    editorToken = editorBody.data.tokens.accessToken;
    editorId = editorBody.data.user.id;

    // 3. Register Viewer
    const viewerRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email: `project_viewer_${Date.now()}@techxayan.com`,
        password: 'Password123!',
        displayName: 'Client Reviewer',
      },
    });
    const viewerBody = JSON.parse(viewerRes.body);
    viewerToken = viewerBody.data.tokens.accessToken;
    viewerId = viewerBody.data.user.id;

    // 4. Register Outsider
    const outsiderRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email: `project_outsider_${Date.now()}@techxayan.com`,
        password: 'Password123!',
        displayName: 'Unauthorized User',
      },
    });
    const outsiderBody = JSON.parse(outsiderRes.body);
    outsiderToken = outsiderBody.data.tokens.accessToken;
    outsiderId = outsiderBody.data.user.id;
  });

  afterAll(async () => {
    await app.close();
  });

  // ============================================================================
  // 1. CREATE PROJECT WITH RICH DATA
  // ============================================================================
  it('1. POST /v1/projects creates project with canvas, multi-track timeline, text, effects, keyframes, audio, captions, and asset pointers', async () => {
    const payload = {
      title: 'Cinematic Commercial 4K Master',
      description: 'SuperBowl commercial edit with multi-layer grade and Dolby audio',
      canvas: {
        resolutionWidth: 3840,
        resolutionHeight: 2160,
        framerate: 59.94,
        aspectRatio: '16:9',
        colorSpace: 'rec709',
        backgroundColor: '#050505',
      },
      timeline: {
        duration: 30.0,
        framerate: 59.94,
        tracks: [
          {
            id: 'track-video-primary',
            type: 'video',
            name: 'A-Roll 4K',
            muted: false,
            locked: false,
            clips: [
              {
                id: 'clip-hero-shot',
                name: 'Opening Hero Landscape',
                mediaAssetId: 'asset-4k-hero-01',
                start: 0,
                duration: 10.5,
                sourceStart: 2.0,
                speed: 1.0,
                volume: 1.0,
                effects: [
                  {
                    id: 'fx-grade-01',
                    type: 'color_grading',
                    name: 'Teal & Orange LUT',
                    enabled: true,
                    parameters: { exposure: 0.2, saturation: 1.15, temperature: 5600 },
                  },
                ],
                keyframes: [
                  {
                    property: 'scale',
                    timeMs: 0,
                    value: 1.0,
                    easing: 'ease-out',
                  },
                  {
                    property: 'scale',
                    timeMs: 5000,
                    value: 1.08,
                    easing: 'ease-in-out',
                  },
                ],
              },
            ],
          },
          {
            id: 'track-text-titles',
            type: 'text',
            name: 'Lower Thirds & Kinetic Titles',
            muted: false,
            locked: false,
            clips: [
              {
                id: 'clip-title-01',
                name: 'Main Brand Logo Text',
                start: 1.0,
                duration: 4.0,
                text: {
                  content: 'TECHXAYAN CREATIVE STUDIO',
                  fontFamily: 'Montserrat',
                  fontSize: 48,
                  fontWeight: 'bold',
                  color: '#FFD700',
                  alignment: 'center',
                },
                keyframes: [
                  {
                    property: 'opacity',
                    timeMs: 0,
                    value: 0.0,
                    easing: 'linear',
                  },
                  {
                    property: 'opacity',
                    timeMs: 500,
                    value: 1.0,
                    easing: 'ease-in',
                  },
                ],
              },
            ],
          },
          {
            id: 'track-audio-master',
            type: 'audio',
            name: 'Cinematic Score & Sound FX',
            muted: false,
            locked: false,
            clips: [
              {
                id: 'clip-audio-score',
                name: 'Orchestral Theme',
                mediaAssetId: 'asset-audio-theme-01',
                start: 0,
                duration: 30.0,
                sourceStart: 0,
                volume: 0.85,
                audio: {
                  volume: 0.85,
                  gainDb: -2.0,
                  pan: 0,
                  fadeInMs: 1500,
                  fadeOutMs: 3000,
                },
              },
            ],
          },
          {
            id: 'track-captions',
            type: 'caption',
            name: 'Spoken Dialogue Subtitles',
            muted: false,
            locked: false,
            clips: [
              {
                id: 'clip-caption-01',
                name: 'Spoken Voiceover',
                start: 2.0,
                duration: 5.0,
                captions: [
                  {
                    id: 'sub-01',
                    text: 'The future of cloud video editing is here.',
                    startMs: 2000,
                    endMs: 7000,
                    speaker: 'Narrator',
                    words: [
                      { word: 'The', startMs: 2000, endMs: 2200 },
                      { word: 'future', startMs: 2250, endMs: 2700 },
                      { word: 'of', startMs: 2750, endMs: 2900 },
                      { word: 'cloud', startMs: 2950, endMs: 3400 },
                    ],
                  },
                ],
              },
            ],
          },
        ],
        markers: [
          {
            id: 'marker-beat-drop',
            time: 10.5,
            label: 'Bass Drop & Cut',
            color: '#FF0055',
          },
        ],
      },
      assets: [
        {
          id: 'asset-ref-01',
          mediaAssetId: 'asset-4k-hero-01',
          name: 'hero_fx3_slog3.mov',
          type: 'video',
          uri: 's3://production-media/assets/hero_fx3_slog3.mov',
          sizeBytes: 840000000,
          duration: 45.0,
        },
      ],
      settings: {
        autoSaveIntervalSeconds: 15,
        snapToGrid: true,
        rippleEditing: true,
        proxyEnabled: true,
        defaultAudioGain: 0,
      },
    };

    const res = await app.inject({
      method: 'POST',
      url: '/v1/projects',
      headers: { Authorization: `Bearer ${ownerToken}` },
      payload,
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);

    testProjectId = body.data.id;
    projectETag = res.headers['etag'] as string;

    expect(testProjectId).toBeDefined();
    expect(body.data.version).toBe(1);
    expect(body.data.projectVersion).toBe(1);
    expect(body.data.title).toBe(payload.title);
    expect(body.data.canvas.resolutionWidth).toBe(3840);
    expect(body.data.timeline.tracks.length).toBe(4);
    expect(body.data.timeline.markers.length).toBe(1);
    expect(body.data.assets.length).toBe(1);
    expect(body.data.versions.totalVersions).toBe(1);
  });

  // ============================================================================
  // 2. REOPEN PROJECT & IF-NONE-MATCH CACHING
  // ============================================================================
  it('2. GET /v1/projects/:id opens project and returns 304 Not Modified when ETag matches', async () => {
    // Standard Open (200 OK)
    const openRes = await app.inject({
      method: 'GET',
      url: `/v1/projects/${testProjectId}`,
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    expect(openRes.statusCode).toBe(200);
    const openBody = JSON.parse(openRes.body);
    expect(openBody.data.id).toBe(testProjectId);
    expect(openBody.data.durationMs).toBe(30000);
    expect(openBody.data.tracks.length).toBe(4);

    // Conditional Open with If-None-Match (304 Not Modified)
    const cachedRes = await app.inject({
      method: 'GET',
      url: `/v1/projects/${testProjectId}`,
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'If-None-Match': projectETag,
      },
    });
    expect(cachedRes.statusCode).toBe(304);
    expect(cachedRes.body).toBe('');
  });

  // ============================================================================
  // 3. EDIT & RENAME (INCREMENTS VERSION)
  // ============================================================================
  it('3. PATCH /v1/projects/:id/rename updates title and increments projectVersion to 2', async () => {
    const renameRes = await app.inject({
      method: 'PATCH',
      url: `/v1/projects/${testProjectId}/rename`,
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'If-Match': projectETag,
      },
      payload: {
        title: 'SuperBowl Commercial 4K Final Cut',
        expectedVersion: 1,
      },
    });

    expect(renameRes.statusCode).toBe(200);
    const body = JSON.parse(renameRes.body);
    expect(body.data.title).toBe('SuperBowl Commercial 4K Final Cut');
    expect(body.data.version).toBe(2);
    expect(body.data.projectVersion).toBe(2);

    projectETag = renameRes.headers['etag'] as string;
  });

  // ============================================================================
  // 4. OPTIMISTIC CONCURRENCY CONFLICT DETECTION
  // ============================================================================
  it('4. PATCH /v1/projects/:id returns 409 Conflict with structured details on stale expectedVersion', async () => {
    const conflictRes = await app.inject({
      method: 'PATCH',
      url: `/v1/projects/${testProjectId}`,
      headers: { Authorization: `Bearer ${ownerToken}` },
      payload: {
        title: 'Overwriting Stale Title',
        expectedVersion: 1, // Stale: server is now at version 2!
      },
    });

    expect(conflictRes.statusCode).toBe(409);
    const body = JSON.parse(conflictRes.body);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('CONCURRENCY_CONFLICT');
    expect(body.error.details).toBeDefined();
    expect(body.error.details.currentVersion).toBe(2);
    expect(body.error.details.expectedVersion).toBe(1);
    expect(body.error.details.serverETag).toBeDefined();
  });

  // ============================================================================
  // 5. AUTOSAVE IDEMPOTENCY & RETRY SAFETY
  // ============================================================================
  it('5. POST /v1/projects/:id/autosave performs atomic sync and gracefully tolerates idempotent retries', async () => {
    const clientMutationId = `mut_${Date.now()}`;

    // First autosave attempt (baseVersion: 2 -> version: 3)
    const autoRes1 = await app.inject({
      method: 'POST',
      url: `/v1/projects/${testProjectId}/autosave`,
      headers: { Authorization: `Bearer ${ownerToken}` },
      payload: {
        baseVersion: 2,
        clientMutationId,
        changeSummary: 'Split hero clip at 00:05.000',
        device: {
          deviceName: 'Studio Workstation Pro',
          deviceType: 'windows_desktop',
          appVersion: '1.2.0',
        },
      },
    });

    expect(autoRes1.statusCode).toBe(200);
    const body1 = JSON.parse(autoRes1.body);
    expect(body1.data.version).toBe(3);

    // Simulated network glitch: Client retries identical autosave with same clientMutationId and baseVersion 2
    const retryRes = await app.inject({
      method: 'POST',
      url: `/v1/projects/${testProjectId}/autosave`,
      headers: { Authorization: `Bearer ${ownerToken}` },
      payload: {
        baseVersion: 2,
        clientMutationId,
        changeSummary: 'Split hero clip at 00:05.000',
        device: {
          deviceName: 'Studio Workstation Pro',
        },
      },
    });

    // Idempotent retry must succeed with HTTP 200 and return existing version 3 WITHOUT double-incrementing!
    expect(retryRes.statusCode).toBe(200);
    const retryBody = JSON.parse(retryRes.body);
    expect(retryBody.data.version).toBe(3);

    // Another client sending outdated baseVersion 2 with different mutation ID must trigger 409 Conflict
    const diffConflictRes = await app.inject({
      method: 'POST',
      url: `/v1/projects/${testProjectId}/autosave`,
      headers: { Authorization: `Bearer ${ownerToken}` },
      payload: {
        baseVersion: 2,
        clientMutationId: 'different_stale_mutation',
      },
    });
    expect(diffConflictRes.statusCode).toBe(409);
  });

  // ============================================================================
  // 6. BACKUP SNAPSHOTS & NON-DESTRUCTIVE RESTORE
  // ============================================================================
  it('6. POST /v1/projects/:id/snapshots creates immutable milestone; restoring rollback increments to version N+1', async () => {
    // Create milestone snapshot
    const snapRes = await app.inject({
      method: 'POST',
      url: `/v1/projects/${testProjectId}/snapshots`,
      headers: { Authorization: `Bearer ${ownerToken}` },
      payload: {
        name: 'Client Rough Cut Milestone v3',
        description: 'Approved edit before color timing changes',
      },
    });

    expect(snapRes.statusCode).toBe(201);
    const snapBody = JSON.parse(snapRes.body);
    expect(snapBody.data.versionNumber).toBe(3);
    expect(snapBody.data.name).toBe('Client Rough Cut Milestone v3');

    // List snapshots
    const listSnapRes = await app.inject({
      method: 'GET',
      url: `/v1/projects/${testProjectId}/snapshots`,
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    expect(listSnapRes.statusCode).toBe(200);
    const listSnapBody = JSON.parse(listSnapRes.body);
    expect(listSnapBody.data.length).toBeGreaterThanOrEqual(1);

    // Make an edit (advances to version 4)
    await app.inject({
      method: 'PATCH',
      url: `/v1/projects/${testProjectId}`,
      headers: { Authorization: `Bearer ${ownerToken}` },
      payload: {
        title: 'Rough Cut Post Color Timing',
        expectedVersion: 3,
      },
    });

    // Non-destructive restore from snapshot version 3
    const restoreRes = await app.inject({
      method: 'POST',
      url: `/v1/projects/${testProjectId}/versions/3/restore`,
      headers: { Authorization: `Bearer ${ownerToken}` },
      payload: {
        expectedVersion: 4,
      },
    });

    expect(restoreRes.statusCode).toBe(200);
    const restoreBody = JSON.parse(restoreRes.body);
    expect(restoreBody.data.restoredFromVersion).toBe(3);
    expect(restoreBody.data.newVersion).toBe(5); // Non-destructive increment to 5!

    // Verify current project is on version 5
    const verifyRes = await app.inject({
      method: 'GET',
      url: `/v1/projects/${testProjectId}`,
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    const verifyBody = JSON.parse(verifyRes.body);
    expect(verifyBody.data.version).toBe(5);
  });

  // ============================================================================
  // 7. SEARCH, FILTERING, SORTING & PAGINATION
  // ============================================================================
  it('7. GET /v1/projects filters by search keyword, status, and supports pagination', async () => {
    // Search keyword matching description or title
    const searchRes = await app.inject({
      method: 'GET',
      url: '/v1/projects?search=commercial&limit=10&offset=0',
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    expect(searchRes.statusCode).toBe(200);
    const searchBody = JSON.parse(searchRes.body);
    expect(searchBody.data.length).toBeGreaterThanOrEqual(1);
    const foundProject = searchBody.data[0];
    const matchesKeyword =
      foundProject.title.toLowerCase().includes('commercial') ||
      Boolean(foundProject.description?.toLowerCase().includes('commercial'));
    expect(matchesKeyword).toBe(true);

    // Filter by status=all vs status=active
    const allRes = await app.inject({
      method: 'GET',
      url: '/v1/projects?status=all',
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    expect(allRes.statusCode).toBe(200);
  });

  // ============================================================================
  // 8. SECURITY & COLLABORATION PERMISSIONS
  // ============================================================================
  it('8. Enforces strict RBAC: Owner full access, Editor timeline access, Viewer read-only, Outsider 403', async () => {
    // Outsider cannot access project
    const outsiderRes = await app.inject({
      method: 'GET',
      url: `/v1/projects/${testProjectId}`,
      headers: { Authorization: `Bearer ${outsiderToken}` },
    });
    expect(outsiderRes.statusCode).toBe(403);

    // Invite Editor to project
    await collaborationService.inviteCollaborator(testProjectId, ownerId, {
      userId: editorId,
      role: 'EDITOR',
    });

    // Editor can now view project
    const editorViewRes = await app.inject({
      method: 'GET',
      url: `/v1/projects/${testProjectId}`,
      headers: { Authorization: `Bearer ${editorToken}` },
    });
    expect(editorViewRes.statusCode).toBe(200);

    // Editor can edit project timeline
    const editorEditRes = await app.inject({
      method: 'PATCH',
      url: `/v1/projects/${testProjectId}`,
      headers: { Authorization: `Bearer ${editorToken}` },
      payload: {
        description: 'Updated by collaborator editor',
        expectedVersion: 5,
      },
    });
    expect(editorEditRes.statusCode).toBe(200);

    // Invite Viewer to project
    await collaborationService.inviteCollaborator(testProjectId, ownerId, {
      userId: viewerId,
      role: 'VIEWER',
    });

    // Viewer can read project
    const viewerViewRes = await app.inject({
      method: 'GET',
      url: `/v1/projects/${testProjectId}`,
      headers: { Authorization: `Bearer ${viewerToken}` },
    });
    expect(viewerViewRes.statusCode).toBe(200);

    // Viewer CANNOT edit project
    const viewerEditRes = await app.inject({
      method: 'PATCH',
      url: `/v1/projects/${testProjectId}`,
      headers: { Authorization: `Bearer ${viewerToken}` },
      payload: {
        title: 'Viewer unauthorized edit',
      },
    });
    expect(viewerEditRes.statusCode).toBe(403);
  });

  // ============================================================================
  // 9. DUPLICATE, ARCHIVE, RESTORE, PERMANENT DELETE
  // ============================================================================
  it('9. Supports duplicate, archive, restore, and permanent deletion', async () => {
    // Duplicate
    const dupRes = await app.inject({
      method: 'POST',
      url: `/v1/projects/${testProjectId}/duplicate`,
      headers: { Authorization: `Bearer ${ownerToken}` },
      payload: { newTitle: 'Duplicated Campaign Clone' },
    });
    expect(dupRes.statusCode).toBe(201);
    const dupBody = JSON.parse(dupRes.body);
    const clonedId = dupBody.data.id;
    expect(clonedId).toBeDefined();
    expect(dupBody.data.version).toBe(1);

    // Archive cloned project
    const archRes = await app.inject({
      method: 'POST',
      url: `/v1/projects/${clonedId}/archive`,
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    expect(archRes.statusCode).toBe(200);
    const archBody = JSON.parse(archRes.body);
    expect(archBody.data.status).toBe('archived');

    // Restore cloned project
    const restRes = await app.inject({
      method: 'POST',
      url: `/v1/projects/${clonedId}/restore`,
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    expect(restRes.statusCode).toBe(200);
    const restBody = JSON.parse(restRes.body);
    expect(restBody.data.status).toBe('active');

    // Permanent Delete
    const permDeleteRes = await app.inject({
      method: 'DELETE',
      url: `/v1/projects/${clonedId}?permanent=true`,
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    expect(permDeleteRes.statusCode).toBe(200);

    // Verify completely deleted
    const verifyDelRes = await app.inject({
      method: 'GET',
      url: `/v1/projects/${clonedId}`,
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    expect(verifyDelRes.statusCode).toBe(404);
  });

  // ============================================================================
  // 10. ADMIN DASHBOARD INTEGRATION
  // ============================================================================
  it('10. Projects created and edited by users immediately reflect in Admin Dashboard metrics', async () => {
    const overview = await adminService.getStatsOverview();
    expect(overview.totalProjects).toBeGreaterThanOrEqual(1);

    const adminList = await adminService.listProjects({ limit: 10 });
    expect(adminList.total).toBeGreaterThanOrEqual(1);
    const found = adminList.projects.find((p) => p.id === testProjectId);
    expect(found).toBeDefined();
    expect(found?.ownerId).toBe(ownerId);
  });
});
