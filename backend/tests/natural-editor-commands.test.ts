import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { projectsService } from '../src/modules/projects/projects.service.js';
import { commandValidatorService } from '../src/modules/ai/commands/command-validator.service.js';

describe('Natural-Language AI Editor Command System', () => {
  let app: FastifyInstance;
  let authToken: string;
  let userId: string;
  let testProjectId: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    // Register test user
    const regRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email: `command_tester_${Date.now()}@techxayan.com`,
        password: 'Password123!',
        displayName: 'NLE Commands Architect',
      },
    });

    const body = JSON.parse(regRes.body);
    authToken = body.data.tokens.accessToken;
    userId = body.data.user.id;

    // Create test project
    const proj = await projectsService.create(userId, {
      title: 'Commands Test Timeline',
      timeline: {
        duration: 120.0,
        tracks: [
          {
            id: 'video-track-1',
            type: 'video',
            name: 'Main Video',
            clips: [
              {
                id: 'clip-001',
                name: 'Interview Shot A',
                startTime: 0,
                duration: 60,
              },
            ],
          },
        ],
      },
    });
    testProjectId = proj.id;
  });

  afterAll(async () => {
    await app.close();
  });

  // 1. "Remove the first 5 seconds."
  it('Interprets "Remove the first 5 seconds." -> DELETE_RANGE start=0 end=5', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/ai/commands/interpret',
      headers: { Authorization: `Bearer ${authToken}` },
      payload: {
        prompt: 'Remove the first 5 seconds.',
        projectId: testProjectId,
        timelineContext: { duration: 120, currentPlayhead: 0 },
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);

    const commands = body.data.commands;
    expect(commands.length).toBeGreaterThanOrEqual(1);

    const deleteCmd = commands.find((c: any) => c.action === 'DELETE_RANGE');
    expect(deleteCmd).toBeDefined();
    expect(deleteCmd.category).toBe('delete');
    expect(deleteCmd.timeRange.start).toBe(0);
    expect(deleteCmd.timeRange.end).toBe(5);
    expect(deleteCmd.confidence).toBeGreaterThanOrEqual(0.9);

    // Verify preview duration delta
    expect(body.data.preview.timelineDurationDelta).toBe(-5);
  });

  // 2. "Make this clip cinematic."
  it('Interprets "Make this clip cinematic." -> ADD_COLOR_PRESET, ADD_CONTRAST, ADD_SATURATION, ADD_VIGNETTE', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/ai/commands/interpret',
      headers: { Authorization: `Bearer ${authToken}` },
      payload: {
        prompt: 'Make this clip cinematic.',
        selectedClipId: 'clip-001',
        projectId: testProjectId,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);

    const commands = body.data.commands;
    const actions = commands.map((c: any) => c.action);
    expect(actions).toContain('ADD_COLOR_PRESET');
    expect(actions).toContain('ADD_CONTRAST');
    expect(actions).toContain('ADD_SATURATION');
    expect(actions).toContain('ADD_VIGNETTE');

    // All color commands target selected clip
    for (const cmd of commands) {
      expect(cmd.targetClipId).toBe('clip-001');
    }
  });

  // 3. "Make a 45 second Instagram Reel."
  it('Interprets "Make a 45 second Instagram Reel." -> ordered command plan for vertical social short', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/ai/commands/interpret',
      headers: { Authorization: `Bearer ${authToken}` },
      payload: {
        prompt: 'Make a 45 second Instagram Reel.',
        projectId: testProjectId,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);

    const commands = body.data.commands;
    const actions = commands.map((c: any) => c.action);
    expect(actions).toContain('SET_CANVAS_ASPECT_RATIO');
    expect(actions).toContain('AUTO_REFRAME');
    expect(actions).toContain('SET_TIMELINE_DURATION');
    expect(actions).toContain('GENERATE_CAPTIONS');
    expect(actions).toContain('ADD_AUDIO_DUCKING');

    const canvasCmd = commands.find((c: any) => c.action === 'SET_CANVAS_ASPECT_RATIO');
    expect(canvasCmd.parameters.aspectRatio).toBe('9:16');
  });

  // 4. COMMAND VALIDATION & ANTI-CODE INJECTION SECURITY
  it('Command Validator strictly blocks arbitrary code execution and invalid ranges', async () => {
    // 1. Invalid time range (start > end)
    const invalidRange = commandValidatorService.validate([
      {
        id: 'cmd-bad-1',
        category: 'delete',
        action: 'DELETE_RANGE',
        timeRange: { start: 10, end: 5 },
        parameters: { start: 10, end: 5 },
        confidence: 1.0,
        explanation: 'Invalid backwards time range',
      },
    ]);
    expect(invalidRange.valid).toBe(false);
    expect(invalidRange.errors.some((e) => e.toLowerCase().includes('end time') && e.toLowerCase().includes('start time'))).toBe(true);

    // 2. Anti-code injection: parameter contains code injection tokens
    const maliciousPayload = {
      commands: [
        {
          id: 'cmd-hack',
          category: 'clip',
          action: 'CUSTOM_COMMAND',
          parameters: { payload: '<script>alert(document.cookie)</script>' },
        },
      ],
    };

    const res = await app.inject({
      method: 'POST',
      url: '/v1/ai/commands/validate',
      headers: { Authorization: `Bearer ${authToken}` },
      payload: maliciousPayload,
    });

    // Zod schema regex disallows '<' and '>'
    expect(res.statusCode).toBe(400);
  });

  // 5. EXECUTE COMMANDS WITH OPTIMISTIC CONCURRENCY
  it('POST /v1/ai/commands/execute applies validated commands to project and checks concurrency version', async () => {
    const projectBefore = await projectsService.getById(testProjectId, userId);
    const expectedVersion = projectBefore.version;

    const res = await app.inject({
      method: 'POST',
      url: '/v1/ai/commands/execute',
      headers: { Authorization: `Bearer ${authToken}` },
      payload: {
        projectId: testProjectId,
        expectedVersion,
        commands: [
          {
            id: 'cmd-exec-1',
            category: 'delete',
            action: 'DELETE_RANGE',
            timeRange: { start: 0, end: 5 },
            parameters: { start: 0, end: 5, ripple: true },
            confidence: 1.0,
            explanation: 'Remove first 5 seconds',
          },
        ],
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.version).toBe(expectedVersion + 1);
    expect(body.data.appliedCommandsCount).toBe(1);
    expect(body.data.projectBlocActions.length).toBeGreaterThan(0);

    // Attempting to execute with stale version throws 409 conflict
    const staleRes = await app.inject({
      method: 'POST',
      url: '/v1/ai/commands/execute',
      headers: { Authorization: `Bearer ${authToken}` },
      payload: {
        projectId: testProjectId,
        expectedVersion, // Stale!
        commands: [
          {
            id: 'cmd-exec-2',
            category: 'delete',
            action: 'DELETE_RANGE',
            timeRange: { start: 0, end: 5 },
            parameters: { start: 0, end: 5 },
            confidence: 1.0,
            explanation: 'Stale update',
          },
        ],
      },
    });

    expect(staleRes.statusCode).toBe(409);
  });
});
