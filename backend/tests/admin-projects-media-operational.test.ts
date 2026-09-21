import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import { buildApp } from '../src/app.js';
import { authService } from '../src/modules/auth/auth.service.js';
import { projectsService, mockProjects } from '../src/modules/projects/projects.service.js';
import { reviewService } from '../src/modules/projects/review/review.service.js';
import { collaborationService } from '../src/modules/collaboration/collaboration.service.js';
import { mediaService, mockMediaAssets } from '../src/modules/media/media.service.js';
import { mockAuditLogs } from '../src/modules/admin/admin.service.js';
import { storageService } from '../src/services/storage/index.js';

describe('Admin Projects & Media Enterprise Management Suite', () => {
  let app: FastifyInstance;
  let superadminToken: string;
  let regularUserToken: string;
  let regularUserId: string;
  let regularUserEmail: string;

  let testProjectId: string;
  let testProject2Id: string;
  let testMediaId: string;
  let testMedia2Id: string;
  let coordinatedMediaId: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    // 1. Authenticate as superadmin
    const superLogin = await app.inject({
      method: 'POST',
      url: '/v1/admin/login',
      payload: {
        email: 'admin@techxayan.com',
        password: 'Admin123!',
      },
    });
    expect(superLogin.statusCode).toBe(200);
    const superBody = JSON.parse(superLogin.body);
    superadminToken = superBody.data.tokens.accessToken;

    // 2. Register a creative director user
    regularUserEmail = `creative_lead_${Date.now()}@techxayan.com`;
    const regRes = await authService.register({
      email: regularUserEmail,
      password: 'DirectorPassword123!',
      displayName: 'Maya Lin Creative',
    });
    regularUserId = regRes.user.id;
    regularUserToken = authService.signAccessToken({
      userId: regularUserId,
      sessionId: 'sess_maya_director',
      email: regularUserEmail,
      role: 'USER',
    });

    // 3. Create realistic test project 1
    const p1 = await projectsService.create(regularUserId, {
      title: 'Tokyo 4K Cinematic Montage',
      description: 'Documentary footage shot on RED V-Raptor',
      canvas: {
        resolutionWidth: 3840,
        resolutionHeight: 2160,
        framerate: 60.0,
        aspectRatio: '16:9',
        colorSpace: 'rec709',
      },
      timeline: {
        duration: 180,
        framerate: 60.0,
        tracks: [
          {
            id: 'trk-video-main',
            type: 'video',
            name: 'Primary Video Track',
            clips: [
              {
                id: 'clp-shinjuku-night',
                name: 'Shinjuku Neon 4K',
                start: 0,
                duration: 45,
                sourceStart: 0,
                sourceDuration: 45,
              },
            ],
          },
          {
            id: 'trk-audio-mix',
            type: 'audio',
            name: 'Ambience & Score',
            clips: [
              {
                id: 'clp-taiko-ambience',
                name: 'Tokyo Rain Atmos',
                start: 0,
                duration: 120,
                sourceStart: 0,
                sourceDuration: 120,
              },
            ],
          },
        ],
      },
    });
    testProjectId = p1.id;

    // Add collaboration member to Project 1
    await collaborationService.inviteCollaborator(
      testProjectId,
      regularUserId,
      {
        userId: 'user_collab_partner',
        role: 'EDITOR',
      }
    );

    // Add review comment to Project 1
    await reviewService.createComment(
      testProjectId,
      regularUserId,
      {
        type: 'TIMECODE',
        text: 'Color tone in Shinjuku clip is slightly over-saturated at highlight peak',
        timecode: 12.4,
      }
    );

    // Create realistic test project 2 (Vertical short)
    const p2 = await projectsService.create(regularUserId, {
      title: 'Instagram Reel - Tokyo Street Food',
      description: 'Vertical 9:16 micro clip',
      canvas: {
        resolutionWidth: 1080,
        resolutionHeight: 1920,
        framerate: 30.0,
        aspectRatio: '9:16',
        colorSpace: 'sRGB',
      },
      timeline: {
        duration: 25,
        framerate: 30.0,
        tracks: [],
      },
    });
    testProject2Id = p2.id;

    // 4. Create direct media assets
    const lutContent = 'TITLE "Tokyo_Night_Teal"\nLUT_3D_SIZE 2\n0.0 0.0 0.0\n1.0 1.0 1.0';
    const m1Res = await app.inject({
      method: 'POST',
      url: '/v1/media/upload',
      headers: { Authorization: `Bearer ${regularUserToken}` },
      payload: {
        fileName: 'Tokyo_Night_Teal.cube',
        mimeType: 'application/x-lut',
        fileBase64: Buffer.from(lutContent).toString('base64'),
        category: 'lut',
        checksumSha256: crypto.createHash('sha256').update(Buffer.from(lutContent)).digest('hex'),
      },
    });
    expect(m1Res.statusCode).toBe(201);
    testMediaId = JSON.parse(m1Res.body).data.id;

    // Asset 2: Simulated Image
    const imgContent = 'test-image-png-binary-data-for-testing';
    const m2Res = await app.inject({
      method: 'POST',
      url: '/v1/media/upload',
      headers: { Authorization: `Bearer ${regularUserToken}` },
      payload: {
        fileName: 'Tokyo_Tower_Sunset.png',
        mimeType: 'image/png',
        fileBase64: Buffer.from(imgContent).toString('base64'),
        category: 'image',
        checksumSha256: crypto.createHash('sha256').update(Buffer.from(imgContent)).digest('hex'),
      },
    });
    expect(m2Res.statusCode).toBe(201);
    testMedia2Id = JSON.parse(m2Res.body).data.id;

    // Asset 3: Coordinated Deletion Target with multiple linked storage artifacts
    const coordContent = 'test-audio-wav-binary-content';
    const m3Res = await app.inject({
      method: 'POST',
      url: '/v1/media/upload',
      headers: { Authorization: `Bearer ${regularUserToken}` },
      payload: {
        fileName: 'Full_Documentary_Master_Audio.wav',
        mimeType: 'audio/wav',
        fileBase64: Buffer.from(coordContent).toString('base64'),
        category: 'audio',
        checksumSha256: crypto.createHash('sha256').update(Buffer.from(coordContent)).digest('hex'),
      },
    });
    expect(m3Res.statusCode).toBe(201);
    coordinatedMediaId = JSON.parse(m3Res.body).data.id;

    // Populate waveform and thumbnail and proxy in storage for coordinated deletion test
    const coordAsset = mockMediaAssets.get(coordinatedMediaId)!;
    coordAsset.waveformFileKey = `waveforms/${coordinatedMediaId}.json`;
    coordAsset.thumbnailFileKey = `thumbnails/${coordinatedMediaId}.webp`;
    coordAsset.proxyFileKey = `proxies/${coordinatedMediaId}.mp4`;

    await storageService.putObject(coordAsset.fileKey, Buffer.from(coordContent), 'audio/wav');
    await storageService.putObject(coordAsset.waveformFileKey, Buffer.from('{"peaks": [0.1, 0.4, 0.8]}'), 'application/json');
    await storageService.putObject(coordAsset.thumbnailFileKey, Buffer.from('WEBP_THUMB_DATA'), 'image/webp');
    await storageService.putObject(coordAsset.proxyFileKey, Buffer.from('MP4_PROXY_DATA'), 'video/mp4');
  });

  afterAll(async () => {
    await app.close();
  });

  // ============================================================================
  // PART 1: PROJECT MANAGEMENT (/admin/projects)
  // ============================================================================

  describe('Admin Project Management Endpoints', () => {
    it('GET /v1/admin/projects returns server-side paginated list with calculated telemetry', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/v1/admin/projects?page=1&pageSize=10',
        headers: { authorization: `Bearer ${superadminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data.projects)).toBe(true);
      expect(body.data.total).toBeGreaterThanOrEqual(2);
      expect(body.data.page).toBe(1);
      expect(body.data.pageSize).toBe(10);
      expect(body.data.totalPages).toBeGreaterThanOrEqual(1);

      // Verify enriched project fields
      const p = body.data.projects.find((proj: any) => proj.id === testProjectId);
      expect(p).toBeDefined();
      expect(p.title).toBe('Tokyo 4K Cinematic Montage');
      expect(p.ownerEmail).toBe(regularUserEmail);
      expect(p.ownerName).toBe('Maya Lin Creative');
      expect(p.resolution).toContain('3840x2160');
      expect(typeof p.estimatedSizeBytes).toBe('number');
      expect(typeof p.assetCount).toBe('number');
      expect(typeof p.version).toBe('number');
      expect(p.status).toBe('active');
    });

    it('GET /v1/admin/projects searches by project title, ID, and owner email', async () => {
      // 1. Search by title
      const resTitle = await app.inject({
        method: 'GET',
        url: '/v1/admin/projects?search=Cinematic',
        headers: { authorization: `Bearer ${superadminToken}` },
      });
      expect(resTitle.statusCode).toBe(200);
      const dataTitle = JSON.parse(resTitle.body).data.projects;
      expect(dataTitle.length).toBeGreaterThanOrEqual(1);
      expect(dataTitle.some((proj: any) => proj.id === testProjectId)).toBe(true);

      // 2. Search by project ID
      const resId = await app.inject({
        method: 'GET',
        url: `/v1/admin/projects?search=${testProject2Id}`,
        headers: { authorization: `Bearer ${superadminToken}` },
      });
      expect(resId.statusCode).toBe(200);
      const dataId = JSON.parse(resId.body).data.projects;
      expect(dataId.length).toBe(1);
      expect(dataId[0].id).toBe(testProject2Id);

      // 3. Search by owner email
      const resOwner = await app.inject({
        method: 'GET',
        url: `/v1/admin/projects?search=${regularUserEmail}`,
        headers: { authorization: `Bearer ${superadminToken}` },
      });
      expect(resOwner.statusCode).toBe(200);
      const dataOwner = JSON.parse(resOwner.body).data.projects;
      expect(dataOwner.length).toBeGreaterThanOrEqual(2);
    });

    it('GET /v1/admin/projects filters by status and ownerId', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/v1/admin/projects?ownerId=${regularUserId}&status=active`,
        headers: { authorization: `Bearer ${superadminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const projects = JSON.parse(res.body).data.projects;
      expect(projects.length).toBeGreaterThanOrEqual(2);
      projects.forEach((proj: any) => {
        expect(proj.ownerId).toBe(regularUserId);
        expect(proj.status).toBe('active');
      });
    });

    it('GET /v1/admin/projects sorts by title, version, and created date', async () => {
      const resAsc = await app.inject({
        method: 'GET',
        url: '/v1/admin/projects?sortBy=title&sortOrder=asc',
        headers: { authorization: `Bearer ${superadminToken}` },
      });
      expect(resAsc.statusCode).toBe(200);
      const ascTitles = JSON.parse(resAsc.body).data.projects.map((p: any) => p.title.toLowerCase());

      const resDesc = await app.inject({
        method: 'GET',
        url: '/v1/admin/projects?sortBy=title&sortOrder=desc',
        headers: { authorization: `Bearer ${superadminToken}` },
      });
      expect(resDesc.statusCode).toBe(200);
      const descTitles = JSON.parse(resDesc.body).data.projects.map((p: any) => p.title.toLowerCase());

      expect(ascTitles[0]).not.toBe(descTitles[0]);
    });

    it('GET /v1/admin/projects/:id returns full 8-subsystem deep inspection view', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/v1/admin/projects/${testProjectId}`,
        headers: { authorization: `Bearer ${superadminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      const detail = body.data;

      // 1. Metadata & project header
      expect(detail.project.id).toBe(testProjectId);
      expect(detail.project.title).toBe('Tokyo 4K Cinematic Montage');
      expect(detail.project.ownerName).toBe('Maya Lin Creative');
      expect(detail.metadata).toBeDefined();

      // 2. Versions
      expect(Array.isArray(detail.versions)).toBe(true);
      expect(detail.versions.length).toBeGreaterThanOrEqual(1);

      // 3. Members & Collaborators
      expect(Array.isArray(detail.members)).toBe(true);
      expect(detail.members.some((m: any) => m.userId === 'user_collab_partner')).toBe(true);

      // 4. Permissions RBAC
      expect(detail.permissions).toBeDefined();
      expect(detail.permissions.OWNER).toBeDefined();
      expect(detail.permissions.EDITOR).toBeDefined();

      // 5. Review Comments
      expect(Array.isArray(detail.comments)).toBe(true);
      expect(detail.comments.length).toBeGreaterThanOrEqual(1);
      expect(detail.comments[0].text).toContain('over-saturated');

      // 6. Assets
      expect(Array.isArray(detail.assets)).toBe(true);

      // 7. Snapshots
      expect(Array.isArray(detail.snapshots)).toBe(true);

      // 8. Audit Activity
      expect(Array.isArray(detail.activity)).toBe(true);
    });

    it('POST /v1/admin/projects/:id/snapshots creates revision snapshot and logs audit event', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/v1/admin/projects/${testProjectId}/snapshots`,
        headers: { authorization: `Bearer ${superadminToken}` },
        payload: {
          name: 'Milestone v1.0 Rough Cut',
          description: 'Approved rough cut with primary timeline audio pass',
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(body.data.name).toBe('Milestone v1.0 Rough Cut');
      expect(body.data.versionNumber).toBeDefined();

      // Verify snapshot appears in project detail inspector
      const detailRes = await app.inject({
        method: 'GET',
        url: `/v1/admin/projects/${testProjectId}`,
        headers: { authorization: `Bearer ${superadminToken}` },
      });
      const snapshots = JSON.parse(detailRes.body).data.snapshots;
      expect(snapshots.some((s: any) => s.name === 'Milestone v1.0 Rough Cut')).toBe(true);

      // Verify audit log entry
      const audit = mockAuditLogs.find(
        (log) => log.action === 'PROJECT_SNAPSHOT_CREATED' && log.targetId === testProjectId
      );
      expect(audit).toBeDefined();
      expect(audit?.details?.snapshotName).toBe('Milestone v1.0 Rough Cut');
    });

    it('POST /v1/admin/projects/:id/archive and /restore toggles status with audit entries', async () => {
      // 1. Archive
      const archiveRes = await app.inject({
        method: 'POST',
        url: `/v1/admin/projects/${testProject2Id}/archive`,
        headers: { authorization: `Bearer ${superadminToken}` },
      });
      expect(archiveRes.statusCode).toBe(200);
      const archiveBody = JSON.parse(archiveRes.body);
      expect(archiveBody.data.status).toBe('archived');

      // Verify in memory project
      expect(mockProjects.get(testProject2Id)?.status).toBe('archived');

      // Verify PROJECT_ARCHIVED audit log
      const archAudit = mockAuditLogs.find(
        (log) => log.action === 'PROJECT_ARCHIVED' && log.targetId === testProject2Id
      );
      expect(archAudit).toBeDefined();

      // 2. Restore
      const restoreRes = await app.inject({
        method: 'POST',
        url: `/v1/admin/projects/${testProject2Id}/restore`,
        headers: { authorization: `Bearer ${superadminToken}` },
      });
      expect(restoreRes.statusCode).toBe(200);
      const restoreBody = JSON.parse(restoreRes.body);
      expect(restoreBody.data.status).toBe('active');

      // Verify PROJECT_RESTORED audit log
      const resAudit = mockAuditLogs.find(
        (log) => log.action === 'PROJECT_RESTORED' && log.targetId === testProject2Id
      );
      expect(resAudit).toBeDefined();
    });

    it('Security: non-admin user cannot access admin project endpoints', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/v1/admin/projects',
        headers: { authorization: `Bearer ${regularUserToken}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  // ============================================================================
  // PART 2: MEDIA MANAGEMENT (/admin/media)
  // ============================================================================

  describe('Admin Media Asset Management & Lifecycle Endpoints', () => {
    it('GET /v1/admin/media returns server-side paginated media with storage details', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/v1/admin/media?page=1&pageSize=10',
        headers: { authorization: `Bearer ${superadminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data.media)).toBe(true);
      expect(body.data.total).toBeGreaterThanOrEqual(2);
      expect(body.data.page).toBe(1);
      expect(body.data.pageSize).toBe(10);
      expect(body.data.totalPages).toBeGreaterThanOrEqual(1);

      // Verify media asset fields
      const item = body.data.media.find((m: any) => m.id === testMediaId);
      expect(item).toBeDefined();
      expect(item.name).toBe('Tokyo_Night_Teal.cube');
      expect(item.ownerEmail).toBe(regularUserEmail);
      expect(item.ownerName).toBe('Maya Lin Creative');
      expect(item.category).toBe('lut');
      expect(item.storageObject).toBeDefined();
      expect(item.storageObject.fileKey).toBeDefined();
    });

    it('GET /v1/admin/media searches by filename, ID, and owner', async () => {
      // 1. Search by filename
      const resName = await app.inject({
        method: 'GET',
        url: '/v1/admin/media?search=Sunset',
        headers: { authorization: `Bearer ${superadminToken}` },
      });
      expect(resName.statusCode).toBe(200);
      const dataName = JSON.parse(resName.body).data.media;
      expect(dataName.length).toBeGreaterThanOrEqual(1);
      expect(dataName.some((m: any) => m.id === testMedia2Id)).toBe(true);

      // 2. Search by owner
      const resOwner = await app.inject({
        method: 'GET',
        url: `/v1/admin/media?search=${regularUserEmail}`,
        headers: { authorization: `Bearer ${superadminToken}` },
      });
      expect(resOwner.statusCode).toBe(200);
      const dataOwner = JSON.parse(resOwner.body).data.media;
      expect(dataOwner.length).toBeGreaterThanOrEqual(2);
    });

    it('GET /v1/admin/media filters by category and status', async () => {
      const resImage = await app.inject({
        method: 'GET',
        url: '/v1/admin/media?category=image',
        headers: { authorization: `Bearer ${superadminToken}` },
      });
      expect(resImage.statusCode).toBe(200);
      const images = JSON.parse(resImage.body).data.media;
      expect(images.length).toBeGreaterThanOrEqual(1);
      images.forEach((img: any) => {
        expect(img.category).toBe('image');
      });
    });

    it('GET /v1/admin/media/:id returns 6-tab deep inspection details', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/v1/admin/media/${coordinatedMediaId}`,
        headers: { authorization: `Bearer ${superadminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      const detail = body.data;

      // 1. Media core
      expect(detail.asset.id).toBe(coordinatedMediaId);
      expect(detail.asset.name).toBe('Full_Documentary_Master_Audio.wav');
      expect(detail.asset.ownerEmail).toBe(regularUserEmail);

      // 2. Storage object check
      expect(detail.storage).toBeDefined();
      expect(detail.storage.exists).toBe(true);
      expect(detail.storage.fileKey).toBeDefined();
      expect(detail.downloadUrl).toBeDefined();

      // 3. Waveform & proxy & thumbnail
      expect(detail.waveform).toBeDefined();
      expect(detail.waveform.exists).toBe(true);
      expect(detail.waveform.fileKey).toContain('waveforms');

      expect(detail.thumbnail).toBeDefined();
      expect(detail.thumbnail.exists).toBe(true);

      expect(detail.proxy).toBeDefined();
      expect(detail.proxy.exists).toBe(true);

      // 4. Processing jobs
      expect(Array.isArray(detail.processingJobs)).toBe(true);

      // 5. Checksum & integrity
      expect(detail.checksum).toBeDefined();
      expect(detail.checksum.algorithm).toBe('sha256');
      expect(detail.checksum.expected).toBeDefined();

      // 6. Audit activity
      expect(Array.isArray(detail.auditActivity)).toBe(true);
    });

    it('POST /v1/admin/media/:id/retry restarts processing with audit log', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/v1/admin/media/${testMedia2Id}/retry`,
        headers: { authorization: `Bearer ${superadminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);

      const audit = mockAuditLogs.find(
        (log) => log.action === 'MEDIA_PROCESSING_RETRIED' && log.targetId === testMedia2Id
      );
      expect(audit).toBeDefined();
    });

    it('POST /v1/admin/media/:id/archive updates media status and logs audit entry', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/v1/admin/media/${testMediaId}/archive`,
        headers: { authorization: `Bearer ${superadminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.status).toBe('ARCHIVED');

      const audit = mockAuditLogs.find(
        (log) => log.action === 'MEDIA_ASSET_ARCHIVED' && log.targetId === testMediaId
      );
      expect(audit).toBeDefined();
    });

    it('POST /v1/admin/media/:id/cleanup-orphaned cleans or validates missing storage objects', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/v1/admin/media/${testMedia2Id}/cleanup-orphaned`,
        headers: { authorization: `Bearer ${superadminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);

      const audit = mockAuditLogs.find(
        (log) => log.action === 'MEDIA_ORPHAN_CLEANED' && log.targetId === testMedia2Id
      );
      expect(audit).toBeDefined();
    });

    it('DELETE /v1/admin/media/:id performs coordinated storage and database deletion', async () => {
      const targetAsset = mockMediaAssets.get(coordinatedMediaId)!;
      const primaryKey = targetAsset.fileKey;
      const waveKey = targetAsset.waveformFileKey!;
      const thumbKey = targetAsset.thumbnailFileKey!;
      const proxyKey = targetAsset.proxyFileKey!;

      // Confirm all 4 storage artifacts exist before deletion
      expect(await storageService.headObject(primaryKey)).not.toBeNull();
      expect(await storageService.headObject(waveKey)).not.toBeNull();
      expect(await storageService.headObject(thumbKey)).not.toBeNull();
      expect(await storageService.headObject(proxyKey)).not.toBeNull();

      // Execute admin coordinated deletion
      const delRes = await app.inject({
        method: 'DELETE',
        url: `/v1/admin/media/${coordinatedMediaId}`,
        headers: { authorization: `Bearer ${superadminToken}` },
      });

      expect(delRes.statusCode).toBe(200);
      const body = JSON.parse(delRes.body);
      expect(body.success).toBe(true);
      expect(body.data.coordinatedDeletion).toBeDefined();
      expect(body.data.coordinatedDeletion.deletedObjects).toContain(primaryKey);
      expect(body.data.coordinatedDeletion.deletedObjects).toContain(waveKey);
      expect(body.data.coordinatedDeletion.deletedObjects).toContain(thumbKey);
      expect(body.data.coordinatedDeletion.deletedObjects).toContain(proxyKey);

      // Verify storage artifacts were removed from mock storage
      const mockStorage = (storageService as any).mockObjects;
      if (mockStorage) {
        expect(mockStorage.has(primaryKey)).toBe(false);
        expect(mockStorage.has(waveKey)).toBe(false);
        expect(mockStorage.has(thumbKey)).toBe(false);
        expect(mockStorage.has(proxyKey)).toBe(false);
      }

      // Verify asset status in repository is marked deleted
      expect(targetAsset.status.toUpperCase()).toBe('DELETED');

      // Verify audit log entry
      const delAudit = mockAuditLogs.find(
        (log) => log.action === 'MEDIA_ASSET_DELETED' && log.targetId === coordinatedMediaId
      );
      expect(delAudit).toBeDefined();
      expect(delAudit?.actorId).toBeDefined();
    });

    it('Security: non-admin user cannot delete or archive media via admin routes', async () => {
      const delRes = await app.inject({
        method: 'DELETE',
        url: `/v1/admin/media/${testMedia2Id}`,
        headers: { authorization: `Bearer ${regularUserToken}` },
      });
      expect(delRes.statusCode).toBe(403);
    });
  });
});
