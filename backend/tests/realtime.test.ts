import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { realtimeService } from '../src/modules/realtime/realtime.service.js';

describe('Realtime Infrastructure Subsystem (WebSocket / SSE Abstraction)', () => {
  let app: FastifyInstance;
  const testUserId = 'test_user_rt_123';
  const testProjectId = 'test_proj_rt_456';
  const testJobId = 'test_job_rt_789';

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  // 1. Channel Subscriptions & Registration
  it('registers connection and supports subscribing to multiple channels', async () => {
    const mockSocket: any = {
      readyState: 1, // OPEN
      send: (data: string) => {},
    };

    const session = realtimeService.registerWebSocket('conn_test_1', testUserId, mockSocket);
    expect(session.connectionId).toBe('conn_test_1');
    expect(session.subscribedChannels.has(`user:${testUserId}`)).toBe(true);

    // Subscribe to project and job
    realtimeService.subscribe('conn_test_1', [`project:${testProjectId}`, `job:${testJobId}`]);
    expect(session.subscribedChannels.has(`project:${testProjectId}`)).toBe(true);
    expect(session.subscribedChannels.has(`job:${testJobId}`)).toBe(true);

    // Unsubscribe from job
    realtimeService.unsubscribe('conn_test_1', [`job:${testJobId}`]);
    expect(session.subscribedChannels.has(`job:${testJobId}`)).toBe(false);

    realtimeService.removeSession('conn_test_1');
  });

  // 2. Event Publishing to All 11 Required Realtime Events
  it('publishes and delivers all 11 enterprise domain events to subscribed channels', async () => {
    const receivedMessages: any[] = [];
    const mockSocket: any = {
      readyState: 1,
      send: (data: string) => {
        receivedMessages.push(JSON.parse(data));
      },
    };

    realtimeService.registerWebSocket('conn_test_events', testUserId, mockSocket);
    realtimeService.subscribe('conn_test_events', [`project:${testProjectId}`, `job:${testJobId}`]);

    // 1. upload_progress
    realtimeService.notifyUploadProgress(testJobId, testUserId, 45, 'UPLOADING');
    // 2. media_ready
    realtimeService.notifyMediaReady('media_1', testUserId, { id: 'media_1', name: 'clip.mp4' });
    // 3. ai_job_progress
    realtimeService.notifyAiJobProgress(testJobId, testUserId, 60, 'Processing Whisper');
    // 4. ai_job_complete
    realtimeService.notifyAiJobComplete(testJobId, testUserId, { text: 'Transcription done' }, 3);
    // 5. ai_job_failed
    realtimeService.notifyAiJobFailed(testJobId, testUserId, 'Out of GPU memory');
    // 6. export_complete
    realtimeService.notifyExportComplete('export_1', testUserId, testProjectId, 'https://cdn.techxayan.com/out.mp4');
    // 7. export_failed
    realtimeService.notifyExportFailed('export_2', testUserId, testProjectId, 'Transcode error');
    // 8. project_shared
    realtimeService.notifyProjectShared(testProjectId, testUserId, 'EDITOR', 'Alex Owner');
    // 9. comment_added
    realtimeService.notifyCommentAdded(testProjectId, { id: 'c1', text: 'Trim this head' });
    // 10. subscription_changed
    realtimeService.notifySubscriptionChanged(testUserId, 'studio', 'ACTIVE');
    // 11. credit_warning
    realtimeService.notifyCreditWarning(testUserId, 15, 20);

    expect(receivedMessages.length).toBeGreaterThanOrEqual(11);

    const eventTypes = new Set(receivedMessages.map((m) => m.eventType));
    expect(eventTypes.has('upload_progress')).toBe(true);
    expect(eventTypes.has('media_ready')).toBe(true);
    expect(eventTypes.has('ai_job_progress')).toBe(true);
    expect(eventTypes.has('ai_job_complete')).toBe(true);
    expect(eventTypes.has('ai_job_failed')).toBe(true);
    expect(eventTypes.has('export_complete')).toBe(true);
    expect(eventTypes.has('export_failed')).toBe(true);
    expect(eventTypes.has('project_shared')).toBe(true);
    expect(eventTypes.has('comment_added')).toBe(true);
    expect(eventTypes.has('subscription_changed')).toBe(true);
    expect(eventTypes.has('credit_warning')).toBe(true);

    realtimeService.removeSession('conn_test_events');
  });

  // 3. Channel Isolation: Messages do not leak to unrelated channels
  it('strictly isolates channels so user A does not receive user B private events', async () => {
    const userAMessages: any[] = [];
    const userBMessages: any[] = [];

    realtimeService.registerWebSocket('conn_user_a', 'user_a', {
      readyState: 1,
      send: (data: string) => userAMessages.push(JSON.parse(data)),
    });

    realtimeService.registerWebSocket('conn_user_b', 'user_b', {
      readyState: 1,
      send: (data: string) => userBMessages.push(JSON.parse(data)),
    });

    // Send credit warning strictly to user_b
    realtimeService.notifyCreditWarning('user_b', 5, 20);

    expect(userBMessages.length).toBe(1);
    expect(userBMessages[0].eventType).toBe('credit_warning');
    expect(userAMessages.length).toBe(0);

    realtimeService.removeSession('conn_user_a');
    realtimeService.removeSession('conn_user_b');
  });
});
