import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';

describe('Video Projects & Timeline Module', () => {
  let app: FastifyInstance;
  let authToken: string;
  let createdProjectId: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    // Register a test user
    const regRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: `projects_${Date.now()}@techxayan.com`,
        password: 'Password123!',
        displayName: 'Project Editor',
      },
    });

    const body = JSON.parse(regRes.body);
    authToken = body.data.tokens.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /api/v1/projects creates a new 4K video project', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/projects',
      headers: { Authorization: `Bearer ${authToken}` },
      payload: {
        title: 'Cinematic Travel Vlog 4K',
        resolutionWidth: 3840,
        resolutionHeight: 2160,
        framerate: 60.0,
        aspectRatio: '16:9',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.title).toBe('Cinematic Travel Vlog 4K');
    expect(body.data.resolutionWidth).toBe(3840);
    expect(body.data.timelineData.tracks.length).toBeGreaterThan(0);
    createdProjectId = body.data.id;
  });

  it('GET /api/v1/projects lists projects for the user', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/projects',
      headers: { Authorization: `Bearer ${authToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.length).toBeGreaterThanOrEqual(1);
  });

  it('GET /api/v1/projects/:id returns full project timeline', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${createdProjectId}`,
      headers: { Authorization: `Bearer ${authToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(createdProjectId);
  });

  it('PUT /api/v1/projects/:id updates project title and timeline', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/projects/${createdProjectId}`,
      headers: { Authorization: `Bearer ${authToken}` },
      payload: {
        title: 'Cinematic Travel Vlog - Final Edit',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.title).toBe('Cinematic Travel Vlog - Final Edit');
    expect(body.data.version).toBe(2);
  });

  it('DELETE /api/v1/projects/:id removes project', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/projects/${createdProjectId}`,
      headers: { Authorization: `Bearer ${authToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.deleted).toBe(true);
  });
});
