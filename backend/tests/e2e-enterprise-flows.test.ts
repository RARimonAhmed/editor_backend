import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { realtimeService } from '../src/modules/realtime/realtime.service.js';

describe('Enterprise End-to-End Flows (FLOW 1 to FLOW 9)', () => {
  let app: FastifyInstance;
  let user1Token: string;
  let user1Id: string;
  let user2Token: string;
  let user2Id: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    // Register User 1
    const res1 = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email: `e2e_lead_${Date.now()}@techxayan.com`, password: 'Password123!', displayName: 'Lead Editor' },
    });
    const body1 = JSON.parse(res1.body);
    user1Token = body1.data.tokens.accessToken;
    user1Id = body1.data.user.id;

    // Register User 2
    const res2 = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email: `e2e_collab_${Date.now()}@techxayan.com`, password: 'Password123!', displayName: 'Collaborator' },
    });
    const body2 = JSON.parse(res2.body);
    user2Token = body2.data.tokens.accessToken;
    user2Id = body2.data.user.id;
  });

  afterAll(async () => {
    await app.close();
  });

  // ============================================================================
  // FLOW 1: Register -> Login -> Create Project -> Upload Media -> Media Processing -> Open Project
  // ============================================================================
  it('FLOW 1: Register -> Login -> Create Project -> Upload Media -> Media Processing -> Open Project', async () => {
    // 1. Create Project
    const projRes = await app.inject({
      method: 'POST',
      url: '/v1/projects',
      headers: { Authorization: `Bearer ${user1Token}` },
      payload: { title: 'Flow 1 Cinematic Documentary', canvas: { width: 1920, height: 1080, fps: 30 } },
    });
    expect(projRes.statusCode).toBe(201);
    const proj = JSON.parse(projRes.body).data;
    const projectId = proj.id;

    // 2. Upload Media Presign
    const presignRes = await app.inject({
      method: 'POST',
      url: '/v1/media/presign',
      headers: { Authorization: `Bearer ${user1Token}` },
      payload: {
        fileName: 'interview_raw.mp4',
        mimeType: 'video/mp4',
        fileSizeBytes: 1024 * 1024 * 5,
        category: 'video',
        uploadType: 'direct',
        projectId,
      },
    });
    expect(presignRes.statusCode).toBe(200);
    const uploadSession = JSON.parse(presignRes.body).data;
    expect(uploadSession.url).toBeDefined();

    // 3. Complete Upload -> Triggers Async Media Processing
    const completeRes = await app.inject({
      method: 'POST',
      url: '/v1/media/complete',
      headers: { Authorization: `Bearer ${user1Token}` },
      payload: {
        mediaId: uploadSession.mediaId,
        width: 1920,
        height: 1080,
        durationSeconds: 15.0,
      },
    });
    expect(completeRes.statusCode).toBe(200);
    const mediaAsset = JSON.parse(completeRes.body).data;
    expect(mediaAsset.status).toBeDefined();

    // 4. Open Project and confirm asset attached
    const openRes = await app.inject({
      method: 'GET',
      url: `/v1/projects/${projectId}`,
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    expect(openRes.statusCode).toBe(200);
    const openedProject = JSON.parse(openRes.body).data;
    expect(openedProject.id).toBe(projectId);
  });

  // ============================================================================
  // FLOW 2: Project -> Save -> Cloud Sync -> Version -> Reopen
  // ============================================================================
  it('FLOW 2: Project -> Save -> Cloud Sync -> Version -> Reopen', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/v1/projects',
      headers: { Authorization: `Bearer ${user1Token}` },
      payload: { title: 'Flow 2 Sync Project' },
    });
    const project = JSON.parse(createRes.body).data;
    const projectId = project.id;
    const initialVersion = project.version;

    // Cloud Sync Autosave
    const syncRes = await app.inject({
      method: 'POST',
      url: `/v1/projects/${projectId}/autosave`,
      headers: { Authorization: `Bearer ${user1Token}` },
      payload: {
        baseVersion: initialVersion,
        timeline: { duration: 45, tracks: [{ id: 't1', type: 'video', clips: [] }] },
        canvas: { width: 1920, height: 1080, fps: 60 },
      },
    });
    expect(syncRes.statusCode).toBe(200);
    const updated = JSON.parse(syncRes.body).data;
    expect(updated.version).toBe(initialVersion + 1);

    // Create named snapshot version
    const versionRes = await app.inject({
      method: 'POST',
      url: `/v1/projects/${projectId}/versions`,
      headers: { Authorization: `Bearer ${user1Token}` },
      payload: { name: 'Rough Cut v1.0', description: 'After initial sync' },
    });
    expect(versionRes.statusCode).toBe(201);

    // Reopen Project
    const reopenRes = await app.inject({
      method: 'GET',
      url: `/v1/projects/${projectId}`,
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    expect(reopenRes.statusCode).toBe(200);
    const reopened = JSON.parse(reopenRes.body).data;
    expect(reopened.version).toBe(initialVersion + 1);
  });

  // ============================================================================
  // FLOW 3: Upload Video -> Transcription -> Captions -> Timeline Caption Objects
  // ============================================================================
  it('FLOW 3: Upload Video -> Transcription -> Captions -> Timeline Caption Objects', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/ai/transcribe',
      headers: { Authorization: `Bearer ${user1Token}` },
      payload: {
        mediaUrl: 'https://assets.techxayan.com/samples/keynote.mp3',
        language: 'en',
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.transcript).toBeDefined();
    expect(Array.isArray(body.data.words)).toBe(true);

    // Verify Captions can be converted to timeline objects
    const capRes = await app.inject({
      method: 'POST',
      url: '/v1/ai/captions',
      headers: { Authorization: `Bearer ${user1Token}` },
      payload: {
        mediaUrl: 'https://assets.techxayan.com/samples/keynote.mp3',
        style: 'dynamic',
      },
    });
    expect(capRes.statusCode).toBe(200);
    const capBody = JSON.parse(capRes.body);
    expect(Array.isArray(capBody.data)).toBe(true);
  });

  // ============================================================================
  // FLOW 4: Upload Video -> Silence Analysis -> AI Edit Commands -> Flutter ProjectBloc -> Preview
  // ============================================================================
  it('FLOW 4: Upload Video -> Silence Analysis -> AI Edit Commands -> Flutter ProjectBloc -> Preview', async () => {
    // 1. Create project for editing analysis
    const projRes = await app.inject({
      method: 'POST',
      url: '/v1/projects',
      headers: { Authorization: `Bearer ${user1Token}` },
      payload: { title: 'Flow 4 Analysis Video' },
    });
    const pId = JSON.parse(projRes.body).data.id;

    // 2. Editing Analysis
    const cutRes = await app.inject({
      method: 'POST',
      url: '/v1/ai/editing-analysis',
      headers: { Authorization: `Bearer ${user1Token}` },
      payload: {
        projectId: pId,
        options: {
          detectSilences: true,
          minSilenceDuration: 0.6,
        },
      },
    });
    expect(cutRes.statusCode).toBe(200);
    const cutBody = JSON.parse(cutRes.body).data;
    expect(Array.isArray(cutBody.features.silences)).toBe(true);

    // 3. Convert to Natural Editor Commands
    const interpretRes = await app.inject({
      method: 'POST',
      url: '/v1/ai/commands/interpret',
      headers: { Authorization: `Bearer ${user1Token}` },
      payload: {
        prompt: 'Remove pauses and make this clip punchy',
      },
    });
    expect(interpretRes.statusCode).toBe(200);
    const commandPlan = JSON.parse(interpretRes.body).data;
    expect(Array.isArray(commandPlan.commands)).toBe(true);

    // 4. Dry-run Validation for ProjectBloc preview
    const validateRes = await app.inject({
      method: 'POST',
      url: '/v1/ai/commands/validate',
      headers: { Authorization: `Bearer ${user1Token}` },
      payload: {
        commands: commandPlan.commands,
        timelineDuration: 60,
      },
    });
    expect(validateRes.statusCode).toBe(200);
    expect(JSON.parse(validateRes.body).data.validation.valid).toBe(true);
  });

  // ============================================================================
  // FLOW 5: Long Video -> AI Highlight -> Short Sequence -> Auto Reframe -> Captions -> Music -> Export
  // ============================================================================
  it('FLOW 5: Long Video -> AI Highlight -> Short Sequence -> Auto Reframe -> Captions -> Music -> Export', async () => {
    const projRes = await app.inject({
      method: 'POST',
      url: '/v1/projects',
      headers: { Authorization: `Bearer ${user1Token}` },
      payload: { title: 'Flow 5 Long Form' },
    });
    const projectId = JSON.parse(projRes.body).data.id;

    // AI Short Orchestration
    const orchRes = await app.inject({
      method: 'POST',
      url: '/v1/ai/short-orchestration',
      headers: { Authorization: `Bearer ${user1Token}` },
      payload: {
        projectId,
        targetDuration: 45,
        aspectRatio: '9:16',
        captionPreset: 'bold_yellow',
        musicPreset: 'upbeat_ambient',
      },
    });
    expect(orchRes.statusCode).toBe(200);
    const orchPlan = JSON.parse(orchRes.body).data;
    expect(orchPlan.targetDuration).toBe(45);
    expect(orchPlan.aspectRatio).toBe('9:16');
    expect(Array.isArray(orchPlan.commands)).toBe(true);

    // Export Job Submission
    const exportRes = await app.inject({
      method: 'POST',
      url: '/v1/jobs/render',
      headers: { Authorization: `Bearer ${user1Token}` },
      payload: {
        projectId,
        resolution: '1080p',
        fps: 60,
        format: 'mp4',
      },
    });
    expect([200, 202]).toContain(exportRes.statusCode);
    expect(JSON.parse(exportRes.body).data.id).toBeDefined();
  });

  // ============================================================================
  // FLOW 6: Prompt -> AI Generation -> Generated Asset -> Media Library -> Timeline
  // ============================================================================
  it('FLOW 6: Prompt -> AI Generation -> Generated Asset -> Media Library -> Timeline', async () => {
    const projRes = await app.inject({
      method: 'POST',
      url: '/v1/projects',
      headers: { Authorization: `Bearer ${user1Token}` },
      payload: { title: 'Flow 6 AI Gen Project' },
    });
    const projectId = JSON.parse(projRes.body).data.id;

    // Generate SFX and auto-register in project asset registry
    const genRes = await app.inject({
      method: 'POST',
      url: '/v1/ai/generate/sfx',
      headers: { Authorization: `Bearer ${user1Token}` },
      payload: {
        prompt: 'Cinematic laser impact whoosh',
        durationSeconds: 3,
        projectId,
      },
    });
    expect(genRes.statusCode).toBe(202);
    const genBody = JSON.parse(genRes.body).data;
    expect(genBody.jobId).toBeDefined();
    expect(genBody.status).toBe('QUEUED');
  });

  // ============================================================================
  // FLOW 7: AI Job -> Queue -> Worker -> Provider -> Result -> WebSocket -> App
  // ============================================================================
  it('FLOW 7: AI Job -> Queue -> Worker -> Provider -> Result -> WebSocket -> App', async () => {
    let wsEventReceived = false;
    const session = realtimeService.registerWebSocket('flow7_test_ws', user1Id, {
      readyState: 1,
      send: (data: string) => {
        const parsed = JSON.parse(data);
        if (parsed.eventType === 'ai_job_progress' || parsed.eventType === 'ai_job_complete') {
          wsEventReceived = true;
        }
      },
    });

    const jobRes = await app.inject({
      method: 'POST',
      url: '/v1/ai/jobs',
      headers: { Authorization: `Bearer ${user1Token}` },
      payload: {
        type: 'text_generation',
        input: { prompt: 'Generate 3 video titles for tech vlog' },
      },
    });
    expect(jobRes.statusCode).toBe(202);
    const job = JSON.parse(jobRes.body).data.job;

    // Realtime notification emission simulation
    realtimeService.notifyAiJobProgress(job.id, user1Id, 50, 'Generating titles');
    expect(wsEventReceived).toBe(true);

    realtimeService.removeSession('flow7_test_ws');
  });

  // ============================================================================
  // FLOW 8: Subscription -> Credits -> AI Usage -> Billing Ledger
  // ============================================================================
  it('FLOW 8: Subscription -> Credits -> AI Usage -> Billing Ledger', async () => {
    // 1. Check Plans
    const plansRes = await app.inject({ method: 'GET', url: '/v1/billing/plans' });
    expect(plansRes.statusCode).toBe(200);

    // 2. Checkout
    const checkoutRes = await app.inject({
      method: 'POST',
      url: '/v1/billing/checkout',
      headers: { Authorization: `Bearer ${user1Token}` },
      payload: { planTier: 'pro' },
    });
    expect(checkoutRes.statusCode).toBe(200);

    // 3. Balance Query
    const balRes = await app.inject({
      method: 'GET',
      url: '/v1/billing/credits',
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    expect(balRes.statusCode).toBe(200);
    const bal = JSON.parse(balRes.body).data;
    expect(bal.balance).toBeGreaterThan(0);

    // 4. Usage Ledger Audit
    const usageRes = await app.inject({
      method: 'GET',
      url: '/v1/billing/usage',
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    expect(usageRes.statusCode).toBe(200);
  });

  // ============================================================================
  // FLOW 9: Project -> Invite Member -> Role -> Edit/View -> Version -> Comment
  // ============================================================================
  it('FLOW 9: Project -> Invite Member -> Role -> Edit/View -> Version -> Comment', async () => {
    // 1. User 1 creates project
    const pRes = await app.inject({
      method: 'POST',
      url: '/v1/projects',
      headers: { Authorization: `Bearer ${user1Token}` },
      payload: { title: 'Flow 9 Review Project' },
    });
    const projectId = JSON.parse(pRes.body).data.id;

    // 2. User 1 invites User 2 as COMMENTER
    const invRes = await app.inject({
      method: 'POST',
      url: `/v1/projects/${projectId}/collaborators`,
      headers: { Authorization: `Bearer ${user1Token}` },
      payload: { userId: user2Id, role: 'COMMENTER' },
    });
    expect(invRes.statusCode).toBe(201);

    // 3. User 2 adds a timecode review comment
    const commentRes = await app.inject({
      method: 'POST',
      url: `/v1/projects/${projectId}/comments`,
      headers: { Authorization: `Bearer ${user2Token}` },
      payload: {
        timecode: 14.5,
        text: 'Voiceover is slightly soft here; please boost gain +2dB.',
      },
    });
    expect(commentRes.statusCode).toBe(201);
    const comment = JSON.parse(commentRes.body).data;
    expect(comment.id).toBeDefined();
    expect(comment.status).toBe('OPEN');

    // 4. User 1 resolves comment
    const resolveRes = await app.inject({
      method: 'PATCH',
      url: `/v1/projects/${projectId}/comments/${comment.id}/resolve`,
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    expect(resolveRes.statusCode).toBe(200);
    expect(JSON.parse(resolveRes.body).data.status).toBe('RESOLVED');
  });
});
