import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { aiGatewayService } from '../src/modules/ai/ai-gateway.service.js';
import { FakeAIProviderAdapter } from '../src/modules/ai/providers/fake.provider.js';

describe('AI-Assisted Editing Analysis & Editor Command Pipeline', () => {
  let app: FastifyInstance;
  let userToken: string;
  let userId: string;
  let otherToken: string;
  let testProjectId: string;
  let fakeAdapter: FakeAIProviderAdapter;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    // Register primary user
    const regRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email: `editor_analyst_${Date.now()}@techxayan.com`,
        password: 'Password123!',
        displayName: 'Senior Video Editor',
      },
    });
    const bodyA = JSON.parse(regRes.body);
    userToken = bodyA.data.tokens.accessToken;
    userId = bodyA.data.user.id;

    // Register second user for multi-tenant isolation tests
    const otherRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email: `other_analyst_${Date.now()}@techxayan.com`,
        password: 'Password123!',
        displayName: 'Unauthorized Editor',
      },
    });
    const bodyB = JSON.parse(otherRes.body);
    otherToken = bodyB.data.tokens.accessToken;

    fakeAdapter = aiGatewayService.getAdapter('fake') as FakeAIProviderAdapter;
    fakeAdapter.resetSimulation();

    // Create a sample project with multi-track clips to test non-destructive preview and apply
    const projRes = await app.inject({
      method: 'POST',
      url: '/v1/projects',
      headers: { authorization: `Bearer ${userToken}` },
      payload: {
        title: 'Interview Rough Cut',
        timeline: {
          duration: 30.0,
          framerate: 30,
          tracks: [
            {
              id: 'track-v1',
              type: 'video',
              name: 'Interview Video',
              muted: false,
              locked: false,
              clips: [
                {
                  id: 'clip-v1',
                  name: 'A-Roll Camera',
                  start: 0.0,
                  duration: 30.0,
                  sourceStart: 0.0,
                  speed: 1.0,
                  volume: 1.0,
                },
              ],
            },
            {
              id: 'track-a1',
              type: 'audio',
              name: 'Interview Audio',
              muted: false,
              locked: false,
              clips: [
                {
                  id: 'clip-a1',
                  name: 'Lavalier Mic',
                  start: 0.0,
                  duration: 30.0,
                  sourceStart: 0.0,
                  speed: 1.0,
                  volume: 1.0,
                },
              ],
            },
          ],
          markers: [],
        },
      },
    });
    const projBody = JSON.parse(projRes.body);
    testProjectId = projBody.data.id;
  });

  afterAll(async () => {
    fakeAdapter.resetSimulation();
    await app.close();
  });

  // --------------------------------------------------------------------------
  // 1. END-TO-END ANALYSIS EXECUTION
  // --------------------------------------------------------------------------
  it('POST /v1/ai/editing-analysis detects silences, fillers, pauses, speech segments, scene cuts, and highlights', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/ai/editing-analysis',
      headers: { authorization: `Bearer ${userToken}` },
      payload: {
        projectId: testProjectId,
        options: {
          detectSilences: true,
          minSilenceDuration: 0.6,
          detectFillerWords: true,
          detectPauses: true,
          minPauseDuration: 1.2,
          detectScenes: true,
          detectHighlights: true,
        },
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.id).toBeDefined();
    expect(body.data.userId).toBe(userId);
    expect(body.data.projectId).toBe(testProjectId);
    expect(body.data.duration).toBeGreaterThan(0);

    // 6 Feature categories must all be populated
    const { features, summary, commands, previewMetrics } = body.data;
    expect(features.silences.length).toBeGreaterThan(0);
    expect(features.fillerWords.length).toBeGreaterThan(0);
    expect(features.pauses.length).toBeGreaterThan(0);
    expect(features.speechSegments.length).toBeGreaterThan(0);
    expect(features.sceneBoundaries.length).toBeGreaterThan(0);
    expect(features.highlightCandidates.length).toBeGreaterThan(0);

    // Summary counts
    expect(summary.totalSilences).toBe(features.silences.length);
    expect(summary.totalFillerWords).toBe(features.fillerWords.length);
    expect(summary.totalPauses).toBe(features.pauses.length);
    expect(summary.totalSceneSplits).toBe(features.sceneBoundaries.length);
    expect(summary.totalHighlights).toBe(features.highlightCandidates.length);
    expect(summary.potentialDurationReduction).toBeGreaterThan(0);
    expect(summary.speakingRateAvgWpm).toBeGreaterThan(0);

    // Structured Editor Commands
    expect(commands.length).toBeGreaterThan(0);
    const types = new Set(commands.map((c: any) => c.type));
    expect(types.has('DELETE_RANGE')).toBe(true);
    expect(types.has('REMOVE_FILLER')).toBe(true);
    expect(types.has('SHORTEN_PAUSE')).toBe(true);
    expect(types.has('SCENE_SPLIT')).toBe(true);
    expect(types.has('CREATE_HIGHLIGHT_CLIP')).toBe(true);

    // Preview metrics projection
    expect(previewMetrics.originalDuration).toBe(body.data.duration);
    expect(previewMetrics.projectedDuration).toBeLessThan(previewMetrics.originalDuration);
    expect(previewMetrics.totalDurationSaved).toBeGreaterThan(0);
    expect(previewMetrics.cutsCount).toBeGreaterThan(0);
  });

  // --------------------------------------------------------------------------
  // 2. CRITICAL INVARIANT: AI ANALYSIS MUST NOT DIRECTLY MUTATE PROJECT DATA
  // --------------------------------------------------------------------------
  it('CRITICAL: AI analysis does NOT modify the project timeline or increment project version', async () => {
    // 1. Fetch project state before analysis
    const preRes = await app.inject({
      method: 'GET',
      url: `/v1/projects/${testProjectId}`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    const preProject = JSON.parse(preRes.body).data;
    const initialVersion = preProject.version;
    const initialDuration = preProject.timeline.duration;
    const initialClipsCount = preProject.timeline.tracks[0].clips.length;

    // 2. Run analysis
    const analysisRes = await app.inject({
      method: 'POST',
      url: '/v1/ai/editing-analysis',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { projectId: testProjectId },
    });
    expect(analysisRes.statusCode).toBe(200);

    // 3. Fetch project state after analysis
    const postRes = await app.inject({
      method: 'GET',
      url: `/v1/projects/${testProjectId}`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    const postProject = JSON.parse(postRes.body).data;

    // Must be completely identical in database
    expect(postProject.version).toBe(initialVersion);
    expect(postProject.timeline.duration).toBe(initialDuration);
    expect(postProject.timeline.tracks[0].clips.length).toBe(initialClipsCount);
    expect(postProject.updatedAt).toBe(preProject.updatedAt);
  });

  // --------------------------------------------------------------------------
  // 3. BACKEND COMMAND VALIDATION & OVERLAP MERGING (PREVIEW WITHOUT MUTATION)
  // --------------------------------------------------------------------------
  it('POST /v1/ai/editing-analysis/validate validates commands and merges overlapping cut spans', async () => {
    // Commands with overlapping ranges [2.0, 4.0] and [3.5, 5.0]
    const testCommands = [
      {
        type: 'DELETE_RANGE',
        start: 2.0,
        end: 4.0,
        reason: 'Dead air silence',
        confidence: 0.95,
      },
      {
        type: 'REMOVE_FILLER',
        word: 'um',
        start: 3.5,
        end: 5.0,
        padding: 0.05,
        confidence: 0.9,
      },
      {
        type: 'SCENE_SPLIT',
        time: 12.5,
        sceneIndex: 1,
      },
    ];

    const res = await app.inject({
      method: 'POST',
      url: '/v1/ai/editing-analysis/validate',
      headers: { authorization: `Bearer ${userToken}` },
      payload: {
        projectId: testProjectId,
        duration: 30.0,
        commands: testCommands,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.isValid).toBe(true);
    expect(body.data.errors).toHaveLength(0);

    // Overlapping ranges [2.0, 4.0] and [3.5, 5.05] should be merged into 1 cut
    expect(body.data.previewMetrics.cutsCount).toBe(1);
    expect(body.data.previewMetrics.splitsCount).toBe(1);
    // Cut from 2.0 to ~5.05 (~3.05s saved)
    expect(body.data.previewMetrics.totalDurationSaved).toBeCloseTo(3.05, 1);
    expect(body.data.previewMetrics.projectedDuration).toBeLessThan(30.0);
  });

  it('POST /v1/ai/editing-analysis/validate detects invalid negative and out-of-order timestamps', async () => {
    const invalidCommands = [
      {
        type: 'DELETE_RANGE',
        start: -1.5,
        end: 2.0,
      },
      {
        type: 'REMOVE_FILLER',
        word: 'uh',
        start: 6.0,
        end: 4.0, // end < start
      },
    ];

    const res = await app.inject({
      method: 'POST',
      url: '/v1/ai/editing-analysis/validate',
      headers: { authorization: `Bearer ${userToken}` },
      payload: {
        commands: invalidCommands,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.isValid).toBe(false);
    expect(body.data.errors.length).toBeGreaterThanOrEqual(2);
  });

  // --------------------------------------------------------------------------
  // 4. TIMELINE MUTATION VIA CONTROLLED APPLY (PROJECTBLOC ACTION)
  // --------------------------------------------------------------------------
  it('POST /v1/ai/editing-analysis/apply mutates timeline with ripple cuts, increments version, and snapshots history', async () => {
    // 1. Fetch current version
    const currRes = await app.inject({
      method: 'GET',
      url: `/v1/projects/${testProjectId}`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    const currProj = JSON.parse(currRes.body).data;
    const baseVersion = currProj.version;

    // 2. Submit user-approved commands (cuts and split)
    const commandsToApply = [
      {
        type: 'SCENE_SPLIT',
        time: 15.0,
      },
      {
        type: 'DELETE_RANGE',
        start: 2.0,
        end: 5.0, // 3.0s cut
        reason: 'Dead air cut',
      },
    ];

    const applyRes = await app.inject({
      method: 'POST',
      url: '/v1/ai/editing-analysis/apply',
      headers: { authorization: `Bearer ${userToken}` },
      payload: {
        projectId: testProjectId,
        expectedVersion: baseVersion,
        commands: commandsToApply,
        rippleEditing: true,
      },
    });

    expect(applyRes.statusCode).toBe(200);
    const applyBody = JSON.parse(applyRes.body);
    expect(applyBody.success).toBe(true);

    const updatedProj = applyBody.data;
    // Version incremented by 1
    expect(updatedProj.version).toBe(baseVersion + 1);

    // Duration was reduced by 3.0s (from 30.0s to 27.0s)
    expect(updatedProj.timeline.duration).toBe(27.0);

    // Scene split and cut should have split clips into multiple segments
    const videoTrack = updatedProj.timeline.tracks.find((t: any) => t.type === 'video');
    expect(videoTrack.clips.length).toBeGreaterThan(1);
  });

  // --------------------------------------------------------------------------
  // 5. OPTIMISTIC CONCURRENCY CONFLICT PREVENTION
  // --------------------------------------------------------------------------
  it('POST /v1/ai/editing-analysis/apply rejects stale client with concurrency conflict', async () => {
    // Stale baseVersion 1 when server is at version 2
    const staleRes = await app.inject({
      method: 'POST',
      url: '/v1/ai/editing-analysis/apply',
      headers: { authorization: `Bearer ${userToken}` },
      payload: {
        projectId: testProjectId,
        expectedVersion: 1, // Stale!
        commands: [
          {
            type: 'DELETE_RANGE',
            start: 1.0,
            end: 2.0,
          },
        ],
      },
    });

    expect(staleRes.statusCode).toBe(400);
    const body = JSON.parse(staleRes.body);
    expect(body.error.message).toContain('Optimistic concurrency conflict');
  });

  // --------------------------------------------------------------------------
  // 6. RETRIEVE ANALYSIS DOCUMENT & MULTI-TENANT ISOLATION
  // --------------------------------------------------------------------------
  it('GET /v1/ai/editing-analysis/:id returns saved analysis, but blocks unauthorized cross-user access', async () => {
    // 1. Run analysis as User A
    const runRes = await app.inject({
      method: 'POST',
      url: '/v1/ai/editing-analysis',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { projectId: testProjectId },
    });
    const analysisId = JSON.parse(runRes.body).data.id;

    // 2. User A fetches analysis -> Success 200
    const ownerRes = await app.inject({
      method: 'GET',
      url: `/v1/ai/editing-analysis/${analysisId}`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(ownerRes.statusCode).toBe(200);
    const ownerBody = JSON.parse(ownerRes.body);
    expect(ownerBody.data.id).toBe(analysisId);

    // 3. User B fetches analysis -> Forbidden 403
    const unauthorizedRes = await app.inject({
      method: 'GET',
      url: `/v1/ai/editing-analysis/${analysisId}`,
      headers: { authorization: `Bearer ${otherToken}` },
    });
    expect(unauthorizedRes.statusCode).toBe(403);
    const unauthBody = JSON.parse(unauthorizedRes.body);
    expect(unauthBody.error.message).toContain('permission');
  });

  // --------------------------------------------------------------------------
  // 7. VALIDATION ERROR HANDLING
  // --------------------------------------------------------------------------
  it('POST /v1/ai/editing-analysis returns HTTP 400 when missing all media inputs', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/ai/editing-analysis',
      headers: { authorization: `Bearer ${userToken}` },
      payload: {},
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });
});
