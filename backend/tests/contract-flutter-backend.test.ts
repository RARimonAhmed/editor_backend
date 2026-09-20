import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { aiGatewayService } from '../src/modules/ai/ai-gateway.service.js';
import { FakeAIProviderAdapter } from '../src/modules/ai/providers/fake.provider.js';
import { realtimeService } from '../src/modules/realtime/realtime.service.js';

describe('Flutter <-> Backend Unified Contract Integration Test', () => {
  let app: FastifyInstance;
  let userToken: string;
  let userId: string;
  let refreshToken: string;
  let projectId: string;
  let fakeAdapter: FakeAIProviderAdapter;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    fakeAdapter = aiGatewayService.getAdapter('fake') as FakeAIProviderAdapter;
    fakeAdapter.resetSimulation();
  });

  afterAll(async () => {
    fakeAdapter.resetSimulation();
    await app.close();
  });

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  // ==========================================================================
  // 1. FLUTTER LOGIN & TOKEN ACQUISITION
  // ==========================================================================
  it('Step 1 & 2: Login -> Receive Access & Refresh Tokens', async () => {
    const email = `flutter_lead_${Date.now()}@techxayan.com`;
    const password = 'Password123!';

    // Register user
    const regRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email,
        password,
        displayName: 'Flutter Lead Architect',
      },
    });
    expect(regRes.statusCode).toBe(201);

    // Login user
    const loginRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: {
        email,
        password,
      },
    });

    expect(loginRes.statusCode).toBe(200);
    const body = JSON.parse(loginRes.body);
    expect(body.success).toBe(true);
    expect(body.data.tokens.accessToken).toBeTypeOf('string');
    expect(body.data.tokens.refreshToken).toBeTypeOf('string');

    userToken = body.data.tokens.accessToken;
    refreshToken = body.data.tokens.refreshToken;
    userId = body.data.user.id;
    expect(userId).toBeTypeOf('string');
  });

  // ==========================================================================
  // 2. CREATE PROJECT VIA EXACT FLUTTER ProjectModel.toJson() DTO
  // ==========================================================================
  it('Step 3: Create Project using Flutter ProjectModel serialization format', async () => {
    // Exact payload structure emitted by Flutter's ProjectModel.toJson()
    const flutterProjectPayload = {
      schemaVersion: 1,
      id: `proj_${Date.now()}`,
      title: 'Contract Verification 4K Project',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastOpenedAt: new Date().toISOString(),
      resolution: {
        width: 3840,
        height: 2160,
      },
      fitMode: 'contain',
      backgroundColorValue: 4278190080, // 0xFF000000
      frameRate: 60,
      durationMs: 45000,
      assets: [
        {
          id: 'asset-video-1',
          name: 'drone_shot_4k.mp4',
          type: 'video',
          source: {
            pathOrUri: 'd:/Media/drone_shot_4k.mp4',
            type: 'localFile',
            fileName: 'drone_shot_4k.mp4',
          },
          fileSizeBytes: 104857600,
          createdAt: new Date().toISOString(),
          importedAt: new Date().toISOString(),
          status: 'available',
        },
      ],
      tracks: [
        {
          id: 'track-v1',
          name: 'Video Main',
          type: 'video',
          audioRole: 'ambient',
          isLocked: false,
          isMuted: false,
          isHidden: false,
          isSolo: false,
          volume: 1.0,
          pan: 0.0,
          orderIndex: 0,
          height: 64.0,
          clips: [
            {
              id: 'clip-1',
              assetId: 'asset-video-1',
              name: 'Drone Intro',
              trackId: 'track-v1',
              timelineStartMs: 0,
              durationMs: 15000,
              sourceInPointMs: 2000,
              speed: 1.0,
              volume: 1.0,
              isMuted: false,
              fadeInDurationMs: 500,
              fadeOutDurationMs: 500,
              isLocked: false,
              isEnabled: true,
            },
          ],
          transitions: [],
        },
        {
          id: 'track-a1',
          name: 'Voiceover',
          type: 'audio',
          audioRole: 'voice',
          isLocked: false,
          isMuted: false,
          clips: [],
          transitions: [],
        },
      ],
      markers: [
        {
          id: 'marker-1',
          positionMs: 5000,
          label: 'Beat Drop',
          colorValue: 4294951431,
        },
      ],
      markInMs: 0,
      markOutMs: 15000,
      groups: [],
      ducking: null,
      nestedSequences: [],
    };

    const res = await app.inject({
      method: 'POST',
      url: '/v1/projects',
      headers: { authorization: `Bearer ${userToken}` },
      payload: flutterProjectPayload,
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);

    const project = body.data;
    expect(project.id).toBeDefined();
    projectId = project.id;

    // Verify backend enriched the response with Flutter DTO compatibility fields
    expect(project.resolution).toEqual({ width: 3840, height: 2160 });
    expect(project.frameRate).toBe(60);
    expect(project.durationMs).toBe(45000);
    expect(project.version).toBe(1);
    expect(project.tracks).toBeInstanceOf(Array);
    expect(project.tracks.length).toBe(2);

    const firstTrack = project.tracks[0];
    expect(firstTrack.id).toBe('track-v1');
    expect(firstTrack.type).toBe('video');
    expect(firstTrack.isLocked).toBe(false);
    expect(firstTrack.clips.length).toBe(1);

    const firstClip = firstTrack.clips[0];
    expect(firstClip.id).toBe('clip-1');
    expect(firstClip.timelineStartMs).toBe(0);
    expect(firstClip.durationMs).toBe(15000);
    expect(firstClip.sourceInPointMs).toBe(2000);
    expect(firstClip.assetId).toBe('asset-video-1');

    // Also verify web-native structures are preserved
    expect(project.canvas.resolutionWidth).toBe(3840);
    expect(project.canvas.resolutionHeight).toBe(2160);
    expect(project.timeline.tracks.length).toBe(2);
  });

  // ==========================================================================
  // 3. GET PROJECT & VERIFY FLUTTER DESERIALIZATION INTEGRITY
  // ==========================================================================
  it('Step 4: Get Project returns complete contract matching Flutter ProjectModel.fromJson()', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/projects/${projectId}`,
      headers: { authorization: `Bearer ${userToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);

    const project = body.data;
    expect(project.id).toBe(projectId);
    expect(project.title).toBe('Contract Verification 4K Project');
    expect(project.schemaVersion).toBe(1);
    expect(project.resolution.width).toBe(3840);
    expect(project.resolution.height).toBe(2160);
    expect(project.frameRate).toBe(60);
    expect(project.durationMs).toBe(45000);

    // Verify clips and markers have millisecond timestamps
    expect(project.tracks[0].clips[0].timelineStartMs).toBe(0);
    expect(project.tracks[0].clips[0].durationMs).toBe(15000);
    expect(project.markers[0].positionMs).toBe(5000);
  });

  // ==========================================================================
  // 4. UPDATE PROJECT (VERSION INCREMENT)
  // ==========================================================================
  it('Step 5: Update Project with OCC expectedVersion increments version', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/v1/projects/${projectId}`,
      headers: { authorization: `Bearer ${userToken}` },
      payload: {
        title: 'Contract Verification 4K Project (Director Cut)',
        expectedVersion: 1,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.version).toBe(2);
    expect(body.data.title).toBe('Contract Verification 4K Project (Director Cut)');
  });

  // ==========================================================================
  // 5. VERSION CONFLICT HANDLING (HTTP 409 RFC 7807)
  // ==========================================================================
  it('Step 6: Version Conflict yields HTTP 409 Conflict with RFC 7807 problem details', async () => {
    // Current project version is 2. Submitting expectedVersion: 1 must trigger conflict.
    const res = await app.inject({
      method: 'PUT',
      url: `/v1/projects/${projectId}`,
      headers: { authorization: `Bearer ${userToken}` },
      payload: {
        title: 'Stale Concurrency Update',
        expectedVersion: 1, // Stale!
      },
    });

    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe('CONCURRENCY_CONFLICT');
    expect(body.error.message).toContain('Conflict');
    expect(body.error.details.currentVersion).toBe(2);
    expect(body.error.details.expectedVersion).toBe(1);
  });

  // ==========================================================================
  // 6. SAVE & AUTOSAVE SYNC
  // ==========================================================================
  it('Step 7: Autosave Project increments version and persists snapshot', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/v1/projects/${projectId}/autosave`,
      headers: { authorization: `Bearer ${userToken}` },
      payload: {
        baseVersion: 2,
        changeSummary: 'Autosave after adding voiceover track',
        device: {
          deviceName: 'Windows Creative Workstation',
          deviceType: 'desktop',
          appVersion: '2.4.0',
        },
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.version).toBe(3);
  });

  // ==========================================================================
  // 7. REOPEN PROJECT
  // ==========================================================================
  it('Step 8: Reopen Project verifies latest version 3 is retrieved', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/projects/${projectId}`,
      headers: { authorization: `Bearer ${userToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.version).toBe(3);
  });

  // ==========================================================================
  // 8. MEDIA REGISTRATION & MULTIPART UPLOADS
  // ==========================================================================
  it('Step 9: Media Registration & Client Uploads', async () => {
    // Test Flutter BackendAIProvider upload endpoint
    const uploadRes = await app.inject({
      method: 'POST',
      url: '/ai/uploads',
      payload: {
        kind: 'video',
        fileName: 'interview_clip.mp4',
      },
    });

    expect(uploadRes.statusCode).toBe(200);
    const uploadData = JSON.parse(uploadRes.body);
    expect(uploadData.uploadId).toBeDefined();
    expect(uploadData.uploaded).toBe(true);
    expect(uploadData.remoteUrl).toContain('interview_clip.mp4');

    // Register asset in media service
    const mediaRes = await app.inject({
      method: 'POST',
      url: '/v1/media/presign',
      headers: { authorization: `Bearer ${userToken}` },
      payload: {
        fileName: 'interview_clip.mp4',
        mimeType: 'video/mp4',
        fileSizeBytes: 25000000,
        category: 'video',
      },
    });

    expect(mediaRes.statusCode).toBe(200);
    const mediaBody = JSON.parse(mediaRes.body);
    expect(mediaBody.data.mediaId).toBeTypeOf('string');
  });

  // ==========================================================================
  // 9. AI JOB REQUEST, PROGRESS & RESULT (FLUTTER BackendAIProvider COMPATIBILITY)
  // ==========================================================================
  it('Step 10, 11, 12: AI Job Submission -> Polling Progress -> Completed Cues Result', async () => {
    // 1. Submit AI Job using Flutter's exact AIJobRequest.toMap() format to /ai/jobs
    const submitRes = await app.inject({
      method: 'POST',
      url: '/ai/jobs',
      headers: { authorization: `Bearer ${userToken}` },
      payload: {
        type: 'autoCaption',
        input: {
          clipId: 'clip-1',
          durationMs: 5000,
        },
        parameters: {
          language: 'en',
        },
        provider: 'fake',
        model: 'fake-caption-v1',
      },
    });

    expect([200, 202]).toContain(submitRes.statusCode);
    const submitBody = JSON.parse(submitRes.body);

    // Verify Flutter BackendAIProvider._parseJob compatibility
    const jobId = submitBody.jobId || submitBody.id;
    expect(jobId).toBeDefined();
    expect(submitBody.type).toBe('autoCaption');
    expect(['queued', 'processing']).toContain(submitBody.status);

    // 2. Poll progress until complete
    let completedJob: any = null;
    for (let i = 0; i < 30; i++) {
      await sleep(100);
      const pollRes = await app.inject({
        method: 'GET',
        url: `/ai/jobs/${jobId}`,
        headers: { authorization: `Bearer ${userToken}` },
      });

      expect(pollRes.statusCode).toBe(200);
      const pollBody = JSON.parse(pollRes.body);
      if (pollBody.status === 'completed') {
        completedJob = pollBody;
        break;
      }
    }

    expect(completedJob).not.toBeNull();
    expect(completedJob.status).toBe('completed');
    expect(completedJob.progress).toBe(1);

    // 3. Verify Result contains AICaptionCue cues matching Flutter domain entity
    expect(completedJob.result).toBeDefined();
    expect(completedJob.result.captions).toBeInstanceOf(Array);
    expect(completedJob.result.captions.length).toBeGreaterThan(0);

    const firstCue = completedJob.result.captions[0];
    expect(firstCue.startMs).toBeTypeOf('number');
    expect(firstCue.endMs).toBeTypeOf('number');
    expect(firstCue.text).toBeTypeOf('string');
  });

  // ==========================================================================
  // 10. APPLY NATURAL LANGUAGE EDITOR COMMAND (CommandPlan & ProjectBloc)
  // ==========================================================================
  it('Step 13: Apply EditorCommand yields structured plan and ProjectBloc actions', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/ai/commands/interpret',
      headers: { authorization: `Bearer ${userToken}` },
      payload: {
        prompt: 'Remove the first 5 seconds and add captions',
        timelineContext: {
          duration: 45,
          currentPlayhead: 0,
        },
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);

    const data = body.data;
    expect(data.intent).toBeDefined();
    expect(data.commands).toBeInstanceOf(Array);
    expect(data.commands.length).toBeGreaterThan(0);

    // Verify preview contains ProjectBloc actions
    expect(data.preview).toBeDefined();
    expect(data.preview.projectBlocActions).toBeInstanceOf(Array);
    expect(data.preview.projectBlocActions.length).toBeGreaterThan(0);

    const firstAction = data.preview.projectBlocActions[0];
    expect(firstAction.type).toBeTypeOf('string');
    expect(firstAction.payload).toBeDefined();
  });

  // ==========================================================================
  // 11. REALTIME EVENT SUBSCRIPTION & ENVELOPE VERIFICATION
  // ==========================================================================
  it('Step 14: Realtime Envelope delivery and channel subscription', async () => {
    const receivedEvents: any[] = [];
    const mockSocket: any = {
      readyState: 1, // OPEN
      send: (data: string) => {
        receivedEvents.push(JSON.parse(data));
      },
    };

    // 1. Client connects and registers to user and project channels
    const connectionId = `flutter_client_${Date.now()}`;
    realtimeService.registerWebSocket(connectionId, userId, mockSocket);
    realtimeService.subscribe(connectionId, [`project:${projectId}`]);

    // 2. Broadcast AI job progress event to user channel
    const eventPayload = {
      jobId: 'ai_job_realtime_flutter',
      progress: 0.8,
      status: 'processing',
    };
    const envelope = realtimeService.broadcast(`user:${userId}`, 'ai_job_progress', eventPayload);

    // 3. Verify envelope structure conforms to RealtimeEnvelope contract
    expect(envelope.eventId).toBeDefined();
    expect(envelope.eventType).toBe('ai_job_progress');
    expect(envelope.channel).toBe(`user:${userId}`);
    expect(envelope.timestamp).toBeDefined();
    expect(envelope.payload).toEqual(eventPayload);

    // 4. Verify client received event
    expect(receivedEvents.length).toBe(1);
    expect(receivedEvents[0].eventType).toBe('ai_job_progress');
    expect(receivedEvents[0].payload.progress).toBe(0.8);

    // Clean up session
    realtimeService.removeSession(connectionId);
  });
});
