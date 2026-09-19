import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';

describe('Cloud Project Management & Concurrency Module', () => {
  let app: FastifyInstance;
  let authToken: string;
  let createdProjectId: string;
  let initialETag: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    // Register a test user
    const regRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email: `project_architect_${Date.now()}@techxayan.com`,
        password: 'Password123!',
        displayName: 'TechXayan Creative Director',
      },
    });

    const body = JSON.parse(regRes.body);
    authToken = body.data.tokens.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  // 1. CREATE PROJECT
  it('POST /v1/projects creates a comprehensive cloud video project', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/projects',
      headers: { Authorization: `Bearer ${authToken}` },
      payload: {
        title: 'Cinematic Travel Vlog 4K',
        description: 'Shot in Tokyo on Sony FX3 in S-Log3',
        canvas: {
          resolutionWidth: 3840,
          resolutionHeight: 2160,
          framerate: 60.0,
          aspectRatio: '16:9',
          colorSpace: 'rec709',
        },
        timeline: {
          duration: 120.5,
          framerate: 60.0,
          tracks: [
            {
              id: 'track-v1',
              type: 'video',
              name: 'A-Roll Video',
              muted: false,
              locked: false,
              clips: [
                {
                  id: 'clip-1',
                  name: 'Shibuya Crossing Intro',
                  start: 0,
                  duration: 15.0,
                  speed: 1.0,
                  volume: 1.0,
                },
              ],
            },
            {
              id: 'track-a1',
              type: 'audio',
              name: 'Tokyo Binaural Ambience',
              muted: false,
              locked: false,
              clips: [
                {
                  id: 'clip-2',
                  name: 'Rain Audio',
                  start: 0,
                  duration: 15.0,
                  volume: 0.8,
                },
              ],
            },
          ],
          markers: [{ time: 5.0, label: 'Beat Drop' }],
        },
        assets: [
          {
            id: 'asset-fx3-01',
            name: 'FX3_001.mp4',
            type: 'video',
            sizeBytes: 104857600,
            duration: 15.0,
          },
        ],
        settings: {
          autoSaveIntervalSeconds: 15,
          snapToGrid: true,
          rippleEditing: true,
          proxyEnabled: true,
        },
      },
    });

    expect(res.statusCode).toBe(201);
    expect(res.headers['etag']).toBeDefined();
    initialETag = res.headers['etag'] as string;

    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.title).toBe('Cinematic Travel Vlog 4K');
    expect(body.data.version).toBe(1);
    expect(body.data.projectVersion).toBe(1);
    expect(body.data.status).toBe('active');

    // Verify composite structure: metadata, canvas, timeline, assets, versions, settings
    expect(body.data.metadata.description).toBe('Shot in Tokyo on Sony FX3 in S-Log3');
    expect(body.data.canvas.resolutionWidth).toBe(3840);
    expect(body.data.timeline.tracks.length).toBe(2);
    expect(body.data.assets.length).toBe(1);
    expect(body.data.settings.rippleEditing).toBe(true);
    expect(body.data.versions.currentVersion).toBe(1);

    createdProjectId = body.data.id;
  });

  // 2. OPEN PROJECT (GET BY ID & ETAG)
  it('GET /v1/projects/:id returns full project and supports If-None-Match 304', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/projects/${createdProjectId}`,
      headers: { Authorization: `Bearer ${authToken}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['etag']).toBeDefined();
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(createdProjectId);
    expect(body.data.canvas.resolutionHeight).toBe(2160);

    // Test If-None-Match caching
    const cachedRes = await app.inject({
      method: 'GET',
      url: `/v1/projects/${createdProjectId}`,
      headers: {
        Authorization: `Bearer ${authToken}`,
        'If-None-Match': initialETag,
      },
    });
    expect(cachedRes.statusCode).toBe(304);
  });

  // 3. RENAME & PATCH UPDATE
  it('PATCH /v1/projects/:id updates title and increments projectVersion to 2', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/v1/projects/${createdProjectId}`,
      headers: { Authorization: `Bearer ${authToken}` },
      payload: {
        title: 'Cinematic Travel Vlog 4K - Director Cut',
        expectedVersion: 1, // Device knows it is at version 1
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.title).toBe('Cinematic Travel Vlog 4K - Director Cut');
    expect(body.data.version).toBe(2);
    expect(body.data.projectVersion).toBe(2);
  });

  // 4. OPTIMISTIC CONCURRENCY / PREVENT SILENT OVERWRITE BETWEEN DEVICES
  it('Prevents one device from silently overwriting another device newer project (HTTP 409)', async () => {
    // Scenario:
    // Server is at Version 2.
    // Stale Device (e.g. Android tablet offline) attempts to push an update expecting Version 1.

    const conflictRes = await app.inject({
      method: 'PATCH',
      url: `/v1/projects/${createdProjectId}`,
      headers: { Authorization: `Bearer ${authToken}` },
      payload: {
        title: 'Stale Android Overwrite Attempt',
        expectedVersion: 1, // Stale base version
      },
    });

    expect(conflictRes.statusCode).toBe(409);
    const conflictBody = JSON.parse(conflictRes.body);
    expect(conflictBody.success).toBe(false);
    expect(conflictBody.error.code).toBe('CONCURRENCY_CONFLICT');
    expect(conflictBody.error.details.currentVersion).toBe(2);
    expect(conflictBody.error.details.expectedVersion).toBe(1);

    // ETag If-Match mismatch also triggers 409 Concurrency Conflict
    const etagConflictRes = await app.inject({
      method: 'PATCH',
      url: `/v1/projects/${createdProjectId}`,
      headers: {
        Authorization: `Bearer ${authToken}`,
        'If-Match': initialETag, // Stale version 1 ETag
      },
      payload: {
        title: 'ETag Mismatch Attempt',
      },
    });
    expect(etagConflictRes.statusCode).toBe(409);
  });

  // 5. AUTOSAVE CLOUD SYNC ENDPOINT (NON-DESTRUCTIVE)
  it('POST /v1/projects/:id/autosave performs non-destructive cloud sync', async () => {
    const autosaveRes = await app.inject({
      method: 'POST',
      url: `/v1/projects/${createdProjectId}/autosave`,
      headers: { Authorization: `Bearer ${authToken}` },
      payload: {
        baseVersion: 2, // Matches current server version
        device: {
          deviceFingerprint: 'win-rtx4090-01',
          deviceName: 'Windows Video Workstation',
          deviceType: 'windows',
          appVersion: '1.2.0',
        },
        changeSummary: 'Added Color Grade LUT',
        settings: {
          proxyEnabled: false,
        },
      },
    });

    expect(autosaveRes.statusCode).toBe(200);
    const autosaveBody = JSON.parse(autosaveRes.body);
    expect(autosaveBody.success).toBe(true);
    expect(autosaveBody.data.version).toBe(3);
    expect(autosaveBody.data.settings.proxyEnabled).toBe(false);

    // Attempting autosave with outdated baseVersion (e.g. 2 instead of 3) must be rejected
    const staleAutosaveRes = await app.inject({
      method: 'POST',
      url: `/v1/projects/${createdProjectId}/autosave`,
      headers: { Authorization: `Bearer ${authToken}` },
      payload: {
        baseVersion: 2, // Stale!
        changeSummary: 'Stale background autosave',
      },
    });
    expect(staleAutosaveRes.statusCode).toBe(409);
  });

  // 6. VERSION HISTORY INSPECTION
  it('GET /v1/projects/:id/versions returns immutable version snapshot history', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/projects/${createdProjectId}/versions`,
      headers: { Authorization: `Bearer ${authToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.length).toBeGreaterThanOrEqual(3); // v1 (created), v2 (renamed), v3 (autosaved)
    expect(body.data.some((v: any) => v.isAutoSave === true)).toBe(true);
  });

  // 7. DUPLICATE PROJECT
  it('POST /v1/projects/:id/duplicate creates a new project deep copy at version 1', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/v1/projects/${createdProjectId}/duplicate`,
      headers: { Authorization: `Bearer ${authToken}` },
      payload: {
        newTitle: 'Tokyo Vlog - Japanese Subtitle Edition',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.id).not.toBe(createdProjectId);
    expect(body.data.title).toBe('Tokyo Vlog - Japanese Subtitle Edition');
    expect(body.data.version).toBe(1);
    expect(body.data.canvas.resolutionWidth).toBe(3840);
  });

  // 8. ARCHIVE & RESTORE PROJECT
  it('POST /v1/projects/:id/archive and restore toggles archive status', async () => {
    // Archive
    const archiveRes = await app.inject({
      method: 'POST',
      url: `/v1/projects/${createdProjectId}/archive`,
      headers: { Authorization: `Bearer ${authToken}` },
    });
    expect(archiveRes.statusCode).toBe(200);
    expect(JSON.parse(archiveRes.body).data.status).toBe('archived');

    // Restore
    const restoreRes = await app.inject({
      method: 'POST',
      url: `/v1/projects/${createdProjectId}/restore`,
      headers: { Authorization: `Bearer ${authToken}` },
    });
    expect(restoreRes.statusCode).toBe(200);
    expect(JSON.parse(restoreRes.body).data.status).toBe('active');
  });

  // 9. LIST & SEARCH PROJECTS
  it('GET /v1/projects filters by search query and status', async () => {
    // 1. Search by title keyword
    const searchRes = await app.inject({
      method: 'GET',
      url: '/v1/projects?search=Director',
      headers: { Authorization: `Bearer ${authToken}` },
    });
    expect(searchRes.statusCode).toBe(200);
    const searchBody = JSON.parse(searchRes.body);
    expect(searchBody.data.length).toBeGreaterThanOrEqual(1);
    expect(searchBody.data[0].title).toMatch(/Director/i);

    // 2. Filter by status=all
    const allRes = await app.inject({
      method: 'GET',
      url: '/v1/projects?status=all',
      headers: { Authorization: `Bearer ${authToken}` },
    });
    expect(allRes.statusCode).toBe(200);
    expect(JSON.parse(allRes.body).data.length).toBeGreaterThanOrEqual(2);
  });

  // 10. SOFT-DELETE & RESTORE
  it('DELETE /v1/projects/:id soft-deletes and can be restored', async () => {
    // Delete
    const delRes = await app.inject({
      method: 'DELETE',
      url: `/v1/projects/${createdProjectId}`,
      headers: { Authorization: `Bearer ${authToken}` },
    });
    expect(delRes.statusCode).toBe(200);
    expect(JSON.parse(delRes.body).data.deleted).toBe(true);

    // Verify it is excluded from active list
    const activeList = await app.inject({
      method: 'GET',
      url: '/v1/projects?status=active',
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const activeProjects = JSON.parse(activeList.body).data;
    expect(activeProjects.some((p: any) => p.id === createdProjectId)).toBe(false);

    // Restore from deletion
    const restoreRes = await app.inject({
      method: 'POST',
      url: `/v1/projects/${createdProjectId}/restore`,
      headers: { Authorization: `Bearer ${authToken}` },
    });
    expect(restoreRes.statusCode).toBe(200);
    expect(JSON.parse(restoreRes.body).data.status).toBe('active');
  });
});

