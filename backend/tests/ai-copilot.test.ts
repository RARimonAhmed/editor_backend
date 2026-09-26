import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { buildApp } from '../src/app.js';
import { copilotValidator } from '../src/modules/ai/copilot/copilot.validator.js';
import { copilotProvider } from '../src/modules/ai/copilot/copilot.provider.js';
import { copilotStore } from '../src/modules/ai/copilot/copilot.store.js';
import { creditsService } from '../src/modules/credits/credits.service.js';
import { projectsService, mockProjects } from '../src/modules/projects/projects.service.js';

describe('DAY 4 — COMMAND 18: Real AI Copilot Backend Pipeline', () => {
  let app: FastifyInstance;
  let authToken: string;
  let testUserId: string;
  let testProjectId: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    // 1. Register test user
    const regRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email: `copilot_user_${Date.now()}@techxayan.com`,
        password: 'Password123!',
        displayName: 'Copilot Test Editor',
      },
    });

    const body = JSON.parse(regRes.body);
    authToken = body.data.tokens.accessToken;
    testUserId = body.data.user.id;

    // Grant ample credits for testing
    await creditsService.grantCredits(testUserId, 100, 'test_initial_grant', 'Initial Copilot Test Credits');

    // 2. Create test project (version 10)
    const project = await projectsService.create(testUserId, {
      title: 'Copilot Cinematic Edit',
      canvas: {
        aspectRatio: '16:9',
        resolutionWidth: 1920,
        resolutionHeight: 1080,
      },
      timeline: {
        duration: 120.0,
        tracks: [
          {
            id: 'track-v1',
            name: 'Main Video',
            type: 'video',
            clips: [
              {
                id: 'clip-hero-1',
                name: 'Intro Hero Shot.mp4',
                start: 0,
                duration: 10.0,
              },
            ],
          },
          {
            id: 'track-audio-1',
            name: 'Background Music',
            type: 'audio',
            clips: [
              {
                id: 'clip-music-1',
                name: 'Epic Ambient Track.mp3',
                start: 0,
                duration: 60.0,
              },
            ],
          },
        ],
      },
    });

    testProjectId = project.id;
    // Set version to 10 for version safety testing
    const storedDoc = mockProjects.get(testProjectId);
    if (storedDoc) {
      storedDoc.projectVersion = 10;
      storedDoc.version = 10;
    }
  });

  afterAll(async () => {
    await app.close();
  });

  // --------------------------------------------------------------------------
  // 1. AUTHENTICATION & ACCESS CONTROL
  // --------------------------------------------------------------------------
  describe('Authentication & Project Authorization', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/ai/copilot',
        payload: {
          projectId: testProjectId,
          prompt: 'Delete the selected clip.',
        },
      });

      expect(res.statusCode).toBe(401);
    });

    it('rejects requests targeting non-existent or unauthorized projects with 404', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/ai/copilot',
        headers: { Authorization: `Bearer ${authToken}` },
        payload: {
          projectId: uuidv4(),
          prompt: 'Delete the selected clip.',
        },
      });

      expect(res.statusCode).toBe(404);
    });
  });

  // --------------------------------------------------------------------------
  // 2. THE 6 MANDATORY PROMPTS VERIFICATION
  // --------------------------------------------------------------------------
  describe('Mandatory Editor Command Prompts', () => {
    it('1. "Delete the selected clip." -> produces schema-valid DELETE_CLIP command', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/ai/copilot',
        headers: { Authorization: `Bearer ${authToken}` },
        payload: {
          projectId: testProjectId,
          projectVersion: 10,
          prompt: 'Delete the selected clip.',
          selectedClipId: 'clip-hero-1',
          selectedTrackId: 'track-v1',
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);

      const plan = body.data;
      expect(plan.planId).toBeDefined();
      expect(plan.projectId).toBe(testProjectId);
      expect(plan.projectVersion).toBe(10);
      expect(plan.commands).toHaveLength(1);

      const cmd = plan.commands[0];
      expect(cmd.action).toBe('DELETE_CLIP');
      expect(cmd.targetClipId).toBe('clip-hero-1');
      expect(cmd.confidence).toBeGreaterThan(0.9);

      // Validate against strict validator
      const validation = copilotValidator.validatePlan(plan, { expectedProjectVersion: 10 });
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('2. "Make the selected clip 50% smaller." -> produces schema-valid SET_TRANSFORM command', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/ai/copilot',
        headers: { Authorization: `Bearer ${authToken}` },
        payload: {
          projectId: testProjectId,
          projectVersion: 10,
          prompt: 'Make the selected clip 50% smaller.',
          selectedClipId: 'clip-hero-1',
          selectedTrackId: 'track-v1',
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);

      const plan = body.data;
      const cmd = plan.commands[0];
      expect(cmd.action).toBe('SET_TRANSFORM');
      expect(cmd.targetClipId).toBe('clip-hero-1');
      expect(cmd.parameters.scale).toBe(0.5);

      const validation = copilotValidator.validatePlan(plan, { expectedProjectVersion: 10 });
      expect(validation.valid).toBe(true);
    });

    it('3. "Add a fade-in." -> produces schema-valid ADD_EFFECT command', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/ai/copilot',
        headers: { Authorization: `Bearer ${authToken}` },
        payload: {
          projectId: testProjectId,
          projectVersion: 10,
          prompt: 'Add a fade-in.',
          selectedClipId: 'clip-hero-1',
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);

      const plan = body.data;
      const cmd = plan.commands[0];
      expect(cmd.action).toBe('ADD_EFFECT');
      expect(cmd.parameters.effectType).toBe('fade_in');
      expect(cmd.parameters.duration).toBeGreaterThan(0);

      const validation = copilotValidator.validatePlan(plan, { expectedProjectVersion: 10 });
      expect(validation.valid).toBe(true);
    });

    it('4. "Move selected clip 2 seconds later." -> produces schema-valid MOVE_CLIP command', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/ai/copilot',
        headers: { Authorization: `Bearer ${authToken}` },
        payload: {
          projectId: testProjectId,
          projectVersion: 10,
          prompt: 'Move selected clip 2 seconds later.',
          selectedClipId: 'clip-hero-1',
          selectedTrackId: 'track-v1',
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);

      const plan = body.data;
      const cmd = plan.commands[0];
      expect(cmd.action).toBe('MOVE_CLIP');
      expect(cmd.parameters.offsetSeconds).toBe(2.0);

      const validation = copilotValidator.validatePlan(plan, { expectedProjectVersion: 10 });
      expect(validation.valid).toBe(true);
    });

    it('5. "Add title Welcome." -> produces schema-valid ADD_TEXT command', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/ai/copilot',
        headers: { Authorization: `Bearer ${authToken}` },
        payload: {
          projectId: testProjectId,
          projectVersion: 10,
          prompt: 'Add title Welcome.',
          playheadPosition: 5.0,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);

      const plan = body.data;
      const cmd = plan.commands[0];
      expect(cmd.action).toBe('ADD_TEXT');
      expect(cmd.parameters.text).toBe('Welcome');
      expect(cmd.timeRange.start).toBe(5.0);

      const validation = copilotValidator.validatePlan(plan, { expectedProjectVersion: 10 });
      expect(validation.valid).toBe(true);
    });

    it('6. "Increase music volume." -> produces schema-valid SET_AUDIO command', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/ai/copilot',
        headers: { Authorization: `Bearer ${authToken}` },
        payload: {
          projectId: testProjectId,
          projectVersion: 10,
          prompt: 'Increase music volume.',
          selectedTrackId: 'track-audio-1',
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);

      const plan = body.data;
      const cmd = plan.commands[0];
      expect(cmd.action).toBe('SET_AUDIO');
      expect(cmd.parameters.volume).toBeGreaterThan(1.0);

      const validation = copilotValidator.validatePlan(plan, { expectedProjectVersion: 10 });
      expect(validation.valid).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // 3. VERSION SAFETY: "A plan generated against version 10 must not silently apply to version 12"
  // --------------------------------------------------------------------------
  describe('Version Safety Protection', () => {
    it('rejects applying a version 10 plan against active version 12', async () => {
      // 1. Generate plan for version 10
      const genRes = await app.inject({
        method: 'POST',
        url: '/api/v1/ai/copilot',
        headers: { Authorization: `Bearer ${authToken}` },
        payload: {
          projectId: testProjectId,
          projectVersion: 10,
          prompt: 'Make the selected clip 50% smaller.',
          selectedClipId: 'clip-hero-1',
        },
      });

      expect(genRes.statusCode).toBe(200);
      const plan = JSON.parse(genRes.body).data;
      expect(plan.projectVersion).toBe(10);

      // 2. Attempt to apply against version 12
      const applyRes = await app.inject({
        method: 'POST',
        url: `/api/v1/ai/copilot/${plan.planId}/apply`,
        headers: { Authorization: `Bearer ${authToken}` },
        payload: {
          targetVersion: 12,
        },
      });

      expect(applyRes.statusCode).toBe(400);
      const applyBody = JSON.parse(applyRes.body);
      expect(applyBody.success).toBe(false);
      expect(applyBody.error.message).toContain('Version conflict');
    });

    it('successfully applies when version matches exactly', async () => {
      const genRes = await app.inject({
        method: 'POST',
        url: '/api/v1/ai/copilot',
        headers: { Authorization: `Bearer ${authToken}` },
        payload: {
          projectId: testProjectId,
          projectVersion: 10,
          prompt: 'Add title Welcome.',
        },
      });

      const plan = JSON.parse(genRes.body).data;

      const applyRes = await app.inject({
        method: 'POST',
        url: `/api/v1/ai/copilot/${plan.planId}/apply`,
        headers: { Authorization: `Bearer ${authToken}` },
        payload: {
          targetVersion: 10,
        },
      });

      expect(applyRes.statusCode).toBe(200);
      const applyBody = JSON.parse(applyRes.body);
      expect(applyBody.success).toBe(true);
      expect(applyBody.data.status).toBe('applied');
      expect(applyBody.data.appliedAt).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // 4. STRICT SECURITY & VALIDATOR DEFENSES
  // --------------------------------------------------------------------------
  describe('Strict Security & Validator Defenses', () => {
    it('rejects unknown commands', () => {
      const invalidPlan = {
        planId: uuidv4(),
        projectId: testProjectId,
        projectVersion: 10,
        explanation: 'Invalid command execution attempt',
        commands: [
          {
            id: 'cmd-1',
            action: 'EXECUTE_ARBITRARY_SQL',
            parameters: {},
            explanation: 'Bad command',
          },
        ],
        warnings: [],
        estimatedImpact: { affectedTracks: [], affectedClips: [], durationDelta: 0 },
        createdAt: new Date().toISOString(),
        status: 'generated',
      };

      const result = copilotValidator.validatePlan(invalidPlan);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Unknown command action') || e.includes('Invalid enum value'))).toBe(true);
    });

    it('rejects code injection / script tags in parameters or explanations', () => {
      const maliciousPlan = {
        planId: uuidv4(),
        projectId: testProjectId,
        projectVersion: 10,
        explanation: 'Injected script <script>alert(1)</script>',
        commands: [
          {
            id: 'cmd-1',
            action: 'ADD_TEXT',
            parameters: { text: '<script>evil()</script>' },
            explanation: 'Malicious text',
          },
        ],
        warnings: [],
        estimatedImpact: { affectedTracks: [], affectedClips: [], durationDelta: 0 },
        createdAt: new Date().toISOString(),
        status: 'generated',
      };

      const result = copilotValidator.validatePlan(maliciousPlan);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Security violation') || e.includes('forbidden characters'))).toBe(true);
    });

    it('rejects inverted time ranges (end < start)', () => {
      const invertedRangePlan = {
        planId: uuidv4(),
        projectId: testProjectId,
        projectVersion: 10,
        explanation: 'Inverted range',
        commands: [
          {
            id: 'cmd-1',
            action: 'ADD_TEXT',
            timeRange: { start: 10, end: 5 },
            parameters: { text: 'Valid Text' },
            explanation: 'Inverted start end',
          },
        ],
        warnings: [],
        estimatedImpact: { affectedTracks: [], affectedClips: [], durationDelta: 0 },
        createdAt: new Date().toISOString(),
        status: 'generated',
      };

      const result = copilotValidator.validatePlan(invertedRangePlan);
      expect(result.valid).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // 5. CREDIT RESERVATION & PERSISTENT STORAGE RETRIEVAL
  // --------------------------------------------------------------------------
  describe('Credits & Persistent Storage', () => {
    it('deducts credits upon plan generation and records metadata', async () => {
      const initialBalance = await creditsService.getBalance(testUserId);

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/ai/copilot',
        headers: { Authorization: `Bearer ${authToken}` },
        payload: {
          projectId: testProjectId,
          projectVersion: 10,
          prompt: 'Add title Welcome.',
        },
      });

      expect(res.statusCode).toBe(200);
      const plan = JSON.parse(res.body).data;

      const finalBalance = await creditsService.getBalance(testUserId);
      expect(finalBalance).toBe(initialBalance - 2);

      // Verify persistent store retrieval
      const storedPlan = await copilotStore.getPlan(plan.planId);
      expect(storedPlan).toBeDefined();
      expect(storedPlan?.planId).toBe(plan.planId);
    });

    it('GET /api/v1/ai/copilot/:planId retrieves previously stored plan', async () => {
      const genRes = await app.inject({
        method: 'POST',
        url: '/api/v1/ai/copilot',
        headers: { Authorization: `Bearer ${authToken}` },
        payload: {
          projectId: testProjectId,
          projectVersion: 10,
          prompt: 'Make the selected clip 50% smaller.',
          selectedClipId: 'clip-hero-1',
        },
      });

      const plan = JSON.parse(genRes.body).data;

      const getRes = await app.inject({
        method: 'GET',
        url: `/api/v1/ai/copilot/${plan.planId}`,
        headers: { Authorization: `Bearer ${authToken}` },
      });

      expect(getRes.statusCode).toBe(200);
      const getBody = JSON.parse(getRes.body);
      expect(getBody.success).toBe(true);
      expect(getBody.data.planId).toBe(plan.planId);
    });

    it('admin telemetry endpoint reports generated plans count', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/ai/copilot/metrics',
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(body.data.totalPlansGenerated).toBeGreaterThan(0);
      expect(body.data.totalCommandsGenerated).toBeGreaterThan(0);
    });
  });
});
