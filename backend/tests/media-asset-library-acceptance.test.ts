import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import { buildApp } from '../src/app.js';
import { storageService } from '../src/services/storage/index.js';
import { mediaProcessorService } from '../src/modules/media/media-processor.service.js';
import { mockMediaAssets, mockMediaFolders } from '../src/modules/media/media.service.js';

describe('Day 3 Command 12: Production Media Asset Library Acceptance', () => {
  let app: FastifyInstance;
  let userToken: string;
  let userId: string;
  let outsiderToken: string;
  let outsiderId: string;

  let testFolderId: string;
  let testSubFolderId: string;
  let testMediaId: string;
  let testFileKey: string;
  let testChecksum: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    // 1. Register primary creative editor user
    const userRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email: `media_lead_${Date.now()}@techxayan.com`,
        password: 'Password123!',
        displayName: 'Media Bin Director',
      },
    });
    const userBody = JSON.parse(userRes.body);
    userToken = userBody.data.tokens.accessToken;
    userId = userBody.data.user.id;

    // 2. Register outsider user for RBAC/isolation testing
    const outsiderRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email: `media_outsider_${Date.now()}@techxayan.com`,
        password: 'Password123!',
        displayName: 'Outsider User',
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
  // TEST 1: COMPLETE LIFECYCLE (PRESIGN -> UPLOAD -> COMPLETE -> PROCESS -> READY)
  // ============================================================================
  it('Test 1: Full media upload lifecycle: Presign -> Upload -> Complete -> Processing -> Ready', async () => {
    const fakeVideoBuffer = Buffer.from('test-mp4-video-container-stream-data-bytes-for-unit-test');
    testChecksum = crypto.createHash('sha256').update(fakeVideoBuffer).digest('hex');

    // 1. Presign upload
    const presignRes = await app.inject({
      method: 'POST',
      url: '/v1/media/presign',
      headers: { Authorization: `Bearer ${userToken}` },
      payload: {
        fileName: 'nature_drone_4k.mp4',
        mimeType: 'video/mp4',
        fileSizeBytes: fakeVideoBuffer.length,
        category: 'video',
        checksumSha256: testChecksum,
        uploadType: 'direct',
      },
    });

    expect(presignRes.statusCode).toBe(200);
    const presignBody = JSON.parse(presignRes.body);
    expect(presignBody.success).toBe(true);
    expect(presignBody.data.mediaId).toBeDefined();
    expect(presignBody.data.url).toContain('https://');

    testMediaId = presignBody.data.mediaId;
    testFileKey = presignBody.data.fileKey;

    // Verify initial status is UPLOADING
    const initialAsset = mockMediaAssets.get(testMediaId);
    expect(initialAsset).toBeDefined();
    expect(initialAsset?.status).toBe('UPLOADING');

    // 2. Simulate direct S3/MinIO upload
    await storageService.putObject(testFileKey, fakeVideoBuffer, 'video/mp4', testChecksum);

    // 3. Complete upload
    const completeRes = await app.inject({
      method: 'POST',
      url: '/v1/media/complete',
      headers: { Authorization: `Bearer ${userToken}` },
      payload: {
        mediaId: testMediaId,
        checksumSha256: testChecksum,
        durationSeconds: 42.5,
        width: 3840,
        height: 2160,
      },
    });

    expect(completeRes.statusCode).toBe(200);
    const completeBody = JSON.parse(completeRes.body);
    expect(completeBody.success).toBe(true);
    expect(completeBody.data.status).toBe('PROCESSING');

    // 4. Run media processor worker job
    const jobPayload = {
      jobId: `job_${Date.now()}`,
      mediaId: testMediaId,
      userId,
      fileKey: testFileKey,
      mimeType: 'video/mp4',
      category: 'video',
      fileName: 'nature_drone_4k.mp4',
      fileSizeBytes: fakeVideoBuffer.length,
      initialOverrides: {
        durationSeconds: 42.5,
        width: 3840,
        height: 2160,
        framerate: 60,
      },
    };

    const mockJob: any = {
      id: jobPayload.jobId,
      data: jobPayload,
      progress: 0,
    };

    await mediaProcessorService.processMediaJob(mockJob);

    // 5. Verify asset transitioned to READY and is readable by client
    const getRes = await app.inject({
      method: 'GET',
      url: `/v1/media/${testMediaId}`,
      headers: { Authorization: `Bearer ${userToken}` },
    });

    expect(getRes.statusCode).toBe(200);
    const getBody = JSON.parse(getRes.body);
    expect(getBody.success).toBe(true);
    expect(getBody.data.status).toBe('READY');
    expect(getBody.data.durationSeconds).toBe(42.5);
    expect(getBody.data.width).toBe(3840);
    expect(getBody.data.height).toBe(2160);
    expect(getBody.data.downloadUrl).toBeDefined();
  });

  // ============================================================================
  // TEST 2: MULTI-TYPE FORMAT SUPPORT
  // ============================================================================
  it('Test 2: Multi-type format support (video, audio, image, PNG, WEBP, SVG, font, LUT)', async () => {
    const formats = [
      { name: 'podcast_intro.mp3', mime: 'audio/mpeg', cat: 'audio', size: 1024 * 50 },
      { name: 'highres_logo.png', mime: 'image/png', cat: 'image', size: 1024 * 20 },
      { name: 'web_banner.webp', mime: 'image/webp', cat: 'image', size: 1024 * 15 },
      { name: 'icon_vector.svg', mime: 'image/svg+xml', cat: 'image', size: 1024 * 2 },
      { name: 'Inter-Bold.ttf', mime: 'font/ttf', cat: 'font', size: 1024 * 120 },
      { name: 'Cinematic_Film.cube', mime: 'application/x-lut', cat: 'lut', size: 1024 * 40 },
    ];

    for (const fmt of formats) {
      const regRes = await app.inject({
        method: 'POST',
        url: '/v1/media/register',
        headers: { Authorization: `Bearer ${userToken}` },
        payload: {
          fileName: fmt.name,
          mimeType: fmt.mime,
          fileSizeBytes: fmt.size,
          category: fmt.cat as any,
        },
      });

      expect(regRes.statusCode).toBe(201);
      const regBody = JSON.parse(regRes.body);
      expect(regBody.success).toBe(true);
      expect(regBody.data.category).toBe(fmt.cat);
      expect(regBody.data.status).toBe('READY');
      expect(regBody.data.name).toBe(fmt.name);
    }
  });

  // ============================================================================
  // TEST 3: TECHNICAL METADATA EXTRACTION & ORIENTATION
  // ============================================================================
  it('Test 3: Technical metadata extraction & orientation calculation (landscape/portrait/square)', async () => {
    // Landscape asset (1920x1080)
    const landscapeRes = await app.inject({
      method: 'POST',
      url: '/v1/media/register',
      headers: { Authorization: `Bearer ${userToken}` },
      payload: {
        fileName: 'landscape_clip.mp4',
        mimeType: 'video/mp4',
        fileSizeBytes: 1024 * 500,
        width: 1920,
        height: 1080,
        framerate: 30,
        codec: 'h264',
        bitrateKbps: 8000,
        audioChannels: 2,
        audioSampleRate: 48000,
        durationSeconds: 15.0,
      },
    });

    const landscapeBody = JSON.parse(landscapeRes.body);
    expect(landscapeBody.data.orientation).toBe('landscape');
    expect(landscapeBody.data.codec).toBe('h264');
    expect(landscapeBody.data.audioChannels).toBe(2);

    // Portrait asset (1080x1920)
    const portraitRes = await app.inject({
      method: 'POST',
      url: '/v1/media/register',
      headers: { Authorization: `Bearer ${userToken}` },
      payload: {
        fileName: 'tiktok_reel.mp4',
        mimeType: 'video/mp4',
        fileSizeBytes: 1024 * 400,
        width: 1080,
        height: 1920,
        framerate: 60,
      },
    });

    const portraitBody = JSON.parse(portraitRes.body);
    expect(portraitBody.data.orientation).toBe('portrait');

    // Square asset (1080x1080)
    const squareRes = await app.inject({
      method: 'POST',
      url: '/v1/media/register',
      headers: { Authorization: `Bearer ${userToken}` },
      payload: {
        fileName: 'instagram_post.png',
        mimeType: 'image/png',
        fileSizeBytes: 1024 * 100,
        width: 1080,
        height: 1080,
      },
    });

    const squareBody = JSON.parse(squareRes.body);
    expect(squareBody.data.orientation).toBe('square');
  });

  // ============================================================================
  // TEST 4: VARIANTS REFERENCES
  // ============================================================================
  it('Test 4: Media variants generation and reference contracts', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/media/${testMediaId}`,
      headers: { Authorization: `Bearer ${userToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const variants = body.data.variants;

    expect(variants).toBeDefined();
    expect(variants.original).toBeDefined();
    expect(variants.original.fileKey).toBe(testFileKey);
    expect(variants.thumbnail).toBeDefined();
    expect(variants.thumbnail.url).toContain('https://');
    expect(variants.waveform).toBeDefined();
    expect(Array.isArray(variants.waveform.peaks)).toBe(true);
    expect(variants.proxy).toBeDefined();
    expect(variants.proxy.resolution).toBe('720p');
    expect(variants.previewDerivative).toBeDefined();
  });

  // ============================================================================
  // TEST 5: FOLDER HIERARCHY MANAGEMENT
  // ============================================================================
  it('Test 5: Folder hierarchy management (Create, List, Rename, Move, Delete)', async () => {
    // 1. Create root folder
    const rootFolderRes = await app.inject({
      method: 'POST',
      url: '/v1/media/folders',
      headers: { Authorization: `Bearer ${userToken}` },
      payload: {
        name: 'Aerial B-Roll',
        color: '#10B981',
      },
    });

    expect(rootFolderRes.statusCode).toBe(201);
    const rootFolder = JSON.parse(rootFolderRes.body).data;
    expect(rootFolder.name).toBe('Aerial B-Roll');
    expect(rootFolder.parentId).toBeNull();
    testFolderId = rootFolder.id;

    // 2. Create nested subfolder
    const subFolderRes = await app.inject({
      method: 'POST',
      url: '/v1/media/folders',
      headers: { Authorization: `Bearer ${userToken}` },
      payload: {
        name: '4K Drone Takes',
        parentId: testFolderId,
        color: '#6366F1',
      },
    });

    expect(subFolderRes.statusCode).toBe(201);
    const subFolder = JSON.parse(subFolderRes.body).data;
    expect(subFolder.parentId).toBe(testFolderId);
    testSubFolderId = subFolder.id;

    // 3. List folders
    const listFoldersRes = await app.inject({
      method: 'GET',
      url: '/v1/media/folders',
      headers: { Authorization: `Bearer ${userToken}` },
    });

    expect(listFoldersRes.statusCode).toBe(200);
    const foldersList = JSON.parse(listFoldersRes.body).data;
    expect(foldersList.some((f: any) => f.id === testFolderId)).toBe(true);
    expect(foldersList.some((f: any) => f.id === testSubFolderId)).toBe(true);

    // 4. Rename folder
    const renameRes = await app.inject({
      method: 'PATCH',
      url: `/v1/media/folders/${testFolderId}`,
      headers: { Authorization: `Bearer ${userToken}` },
      payload: {
        name: 'Cinematic Drone Shots',
      },
    });

    expect(renameRes.statusCode).toBe(200);
    expect(JSON.parse(renameRes.body).data.name).toBe('Cinematic Drone Shots');

    // 5. Move folder to root
    const moveRes = await app.inject({
      method: 'PATCH',
      url: `/v1/media/folders/${testSubFolderId}/move`,
      headers: { Authorization: `Bearer ${userToken}` },
      payload: {
        parentId: null,
      },
    });

    expect(moveRes.statusCode).toBe(200);
    expect(JSON.parse(moveRes.body).data.parentId).toBeNull();

    // 6. Delete folder
    const deleteRes = await app.inject({
      method: 'DELETE',
      url: `/v1/media/folders/${testSubFolderId}`,
      headers: { Authorization: `Bearer ${userToken}` },
    });

    expect(deleteRes.statusCode).toBe(200);
    expect(mockMediaFolders.has(testSubFolderId)).toBe(false);
  });

  // ============================================================================
  // TEST 6: MEDIA ASSET MUTATIONS (RENAME, MOVE, FAVORITE, ARCHIVE, RESTORE)
  // ============================================================================
  it('Test 6: Media asset organization (Rename, Move, Favorite, Archive, Restore)', async () => {
    // 1. Rename asset
    const renameRes = await app.inject({
      method: 'PATCH',
      url: `/v1/media/${testMediaId}/rename`,
      headers: { Authorization: `Bearer ${userToken}` },
      payload: {
        name: 'Golden_Hour_Drone_4K.mp4',
      },
    });

    expect(renameRes.statusCode).toBe(200);
    expect(JSON.parse(renameRes.body).data.name).toBe('Golden_Hour_Drone_4K.mp4');

    // 2. Move asset to folder
    const moveRes = await app.inject({
      method: 'PATCH',
      url: `/v1/media/${testMediaId}/move`,
      headers: { Authorization: `Bearer ${userToken}` },
      payload: {
        folderId: testFolderId,
      },
    });

    expect(moveRes.statusCode).toBe(200);
    expect(JSON.parse(moveRes.body).data.folderId).toBe(testFolderId);

    // 3. Favorite asset
    const favRes = await app.inject({
      method: 'POST',
      url: `/v1/media/${testMediaId}/favorite`,
      headers: { Authorization: `Bearer ${userToken}` },
      payload: {
        isFavorite: true,
      },
    });

    expect(favRes.statusCode).toBe(200);
    expect(JSON.parse(favRes.body).data.isFavorite).toBe(true);

    // 4. Archive asset
    const archiveRes = await app.inject({
      method: 'POST',
      url: `/v1/media/${testMediaId}/archive`,
      headers: { Authorization: `Bearer ${userToken}` },
    });

    expect(archiveRes.statusCode).toBe(200);
    expect(JSON.parse(archiveRes.body).data.status).toBe('ARCHIVED');

    // 5. Restore asset
    const restoreRes = await app.inject({
      method: 'POST',
      url: `/v1/media/${testMediaId}/restore`,
      headers: { Authorization: `Bearer ${userToken}` },
    });

    expect(restoreRes.statusCode).toBe(200);
    expect(JSON.parse(restoreRes.body).data.status).toBe('READY');
  });

  // ============================================================================
  // TEST 7: MULTI-CRITERIA SEARCH AND FILTERING
  // ============================================================================
  it('Test 7: Search and multi-criteria filtering (folder, favorite, category, status, query)', async () => {
    // 1. Filter by folder
    const folderFilterRes = await app.inject({
      method: 'GET',
      url: `/v1/media?folderId=${testFolderId}&status=all`,
      headers: { Authorization: `Bearer ${userToken}` },
    });

    expect(folderFilterRes.statusCode).toBe(200);
    const folderData = JSON.parse(folderFilterRes.body).data;
    expect(folderData.some((m: any) => m.id === testMediaId)).toBe(true);

    // 2. Filter by favorite
    const favFilterRes = await app.inject({
      method: 'GET',
      url: '/v1/media?favorite=true&status=all',
      headers: { Authorization: `Bearer ${userToken}` },
    });

    expect(favFilterRes.statusCode).toBe(200);
    const favData = JSON.parse(favFilterRes.body).data;
    expect(favData.some((m: any) => m.id === testMediaId)).toBe(true);

    // 3. Search query
    const searchRes = await app.inject({
      method: 'GET',
      url: '/v1/media?q=Golden_Hour&status=all',
      headers: { Authorization: `Bearer ${userToken}` },
    });

    expect(searchRes.statusCode).toBe(200);
    const searchData = JSON.parse(searchRes.body).data;
    expect(searchData.some((m: any) => m.id === testMediaId)).toBe(true);

    // 4. Pagination metadata
    const pageRes = await app.inject({
      method: 'GET',
      url: '/v1/media?limit=2&offset=0&status=all',
      headers: { Authorization: `Bearer ${userToken}` },
    });

    expect(pageRes.statusCode).toBe(200);
    const pageBody = JSON.parse(pageRes.body);
    expect(pageBody.meta.total).toBeGreaterThan(0);
    expect(pageBody.meta.limit).toBe(2);
    expect(pageBody.meta.page).toBe(1);
  });

  // ============================================================================
  // TEST 8: CHECKSUM SHA-256 DEDUPLICATION
  // ============================================================================
  it('Test 8: SHA-256 Checksum deduplication prevents redundant uploads and storage bloat', async () => {
    const existingAsset = mockMediaAssets.get(testMediaId)!;

    // Client requests upload for identical file with matching SHA-256 checksum and size
    const duplicateRes = await app.inject({
      method: 'POST',
      url: '/v1/media/presign',
      headers: { Authorization: `Bearer ${userToken}` },
      payload: {
        fileName: 'duplicate_copy_nature.mp4',
        mimeType: 'video/mp4',
        fileSizeBytes: existingAsset.fileSizeBytes,
        checksumSha256: testChecksum,
      },
    });

    expect(duplicateRes.statusCode).toBe(200);
    const dupBody = JSON.parse(duplicateRes.body);
    expect(dupBody.success).toBe(true);
    expect(dupBody.data.isDuplicate).toBe(true);
    expect(dupBody.data.mediaId).toBe(testMediaId);
    expect(dupBody.data.fileKey).toBe(testFileKey);
  });

  // ============================================================================
  // TEST 9: SECURITY VALIDATION & PATH TRAVERSAL DEFENSES
  // ============================================================================
  it('Test 9: Security validation against path traversal, dangerous extensions, and isolation', async () => {
    // 1. Path traversal attempt in filename
    const traversalRes = await app.inject({
      method: 'POST',
      url: '/v1/media/presign',
      headers: { Authorization: `Bearer ${userToken}` },
      payload: {
        fileName: '../../../../etc/passwd.mp4',
        mimeType: 'video/mp4',
        fileSizeBytes: 1024,
      },
    });
    expect(traversalRes.statusCode).toBe(400);

    // 2. Dangerous executable extension
    const exeRes = await app.inject({
      method: 'POST',
      url: '/v1/media/presign',
      headers: { Authorization: `Bearer ${userToken}` },
      payload: {
        fileName: 'malware_payload.exe',
        mimeType: 'video/mp4',
        fileSizeBytes: 1024,
      },
    });
    expect(exeRes.statusCode).toBe(400);

    // 3. User isolation: outsider user cannot access another user's asset
    const outsiderAccessRes = await app.inject({
      method: 'GET',
      url: `/v1/media/${testMediaId}`,
      headers: { Authorization: `Bearer ${outsiderToken}` },
    });
    expect(outsiderAccessRes.statusCode).toBe(403);

    // 4. Outsider cannot delete another user's asset
    const outsiderDeleteRes = await app.inject({
      method: 'DELETE',
      url: `/v1/media/${testMediaId}`,
      headers: { Authorization: `Bearer ${outsiderToken}` },
    });
    expect(outsiderDeleteRes.statusCode).toBe(403);
  });

  // ============================================================================
  // TEST 10: ADMIN DASHBOARD MEDIA TELEMETRY
  // ============================================================================
  it('Test 10: Admin dashboard media telemetry & summaries (count, storage, failures, largest, recent)', async () => {
    // Trigger a failed media asset to ensure failure counting works
    const failedId = `failed_${Date.now()}`;
    mockMediaAssets.set(failedId, {
      id: failedId,
      userId,
      name: 'corrupt_video.mp4',
      originalFilename: 'corrupt_video.mp4',
      category: 'video',
      fileKey: `users/${userId}/media/video/${failedId}.mp4`,
      mimeType: 'video/mp4',
      fileSizeBytes: 1024 * 800,
      uploadType: 'direct',
      status: 'FAILED',
      retentionDays: 30,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const summaryRes = await app.inject({
      method: 'GET',
      url: '/v1/admin/media/summary',
      headers: {
        'x-admin-key': process.env.ADMIN_API_KEY || 'adm_super_secret_production_key_32bytes',
      },
    });

    expect(summaryRes.statusCode).toBe(200);
    const summary = JSON.parse(summaryRes.body).data;

    expect(summary.mediaCount).toBeGreaterThan(0);
    expect(summary.storageUsageBytes).toBeGreaterThan(0);
    expect(summary.processingFailures.count).toBeGreaterThan(0);
    expect(Array.isArray(summary.largestAssets)).toBe(true);
    expect(summary.largestAssets.length).toBeGreaterThan(0);
    expect(Array.isArray(summary.recentUploads)).toBe(true);
    expect(summary.recentUploads.length).toBeGreaterThan(0);
  });
});
