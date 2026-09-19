import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { aiGatewayService } from '../src/modules/ai/ai-gateway.service.js';
import { FakeAIProviderAdapter } from '../src/modules/ai/providers/fake.provider.js';
import { searchProviderRegistry } from '../src/modules/media/intelligence/search-provider.registry.js';
import { ISearchIndexProvider } from '../src/modules/media/intelligence/search-provider.interface.js';

describe('Media Intelligence & Semantic Search Pipeline', () => {
  let app: FastifyInstance;
  let userToken: string;
  let userId: string;
  let otherToken: string;
  let testMediaId: string;
  let testMediaWithLocationId: string;
  let fakeAdapter: FakeAIProviderAdapter;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    // 1. Register Primary User
    const regRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email: `intelligence_lead_${Date.now()}@techxayan.com`,
        password: 'Password123!',
        displayName: 'Media Intelligence Lead',
      },
    });
    const bodyA = JSON.parse(regRes.body);
    userToken = bodyA.data.tokens.accessToken;
    userId = bodyA.data.user.id;

    // 2. Register Secondary User for Multi-Tenant Isolation
    const regOther = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email: `other_creator_${Date.now()}@techxayan.com`,
        password: 'Password123!',
        displayName: 'External Creator',
      },
    });
    const bodyB = JSON.parse(regOther.body);
    otherToken = bodyB.data.tokens.accessToken;

    fakeAdapter = aiGatewayService.getAdapter('fake') as FakeAIProviderAdapter;
    fakeAdapter.resetSimulation();

    // 3. Upload a sample test video asset for User A
    const presignRes = await app.inject({
      method: 'POST',
      url: '/v1/media/presign',
      headers: { authorization: `Bearer ${userToken}` },
      payload: {
        fileName: 'car_review_interview.mp4',
        mimeType: 'video/mp4',
        fileSizeBytes: 15 * 1024 * 1024,
        category: 'video',
      },
    });
    const presignBody = JSON.parse(presignRes.body);
    testMediaId = presignBody.data.mediaId || presignBody.data.id;

    // Complete upload
    await app.inject({
      method: 'POST',
      url: '/v1/media/complete',
      headers: { authorization: `Bearer ${userToken}` },
      payload: {
        mediaId: testMediaId,
        durationSeconds: 30.0,
      },
    });

    // 4. Upload a second test media with explicit GPS EXIF metadata
    const presignLocRes = await app.inject({
      method: 'POST',
      url: '/v1/media/presign',
      headers: { authorization: `Bearer ${userToken}` },
      payload: {
        fileName: 'field_shoot_tokyo.mp4',
        mimeType: 'video/mp4',
        fileSizeBytes: 8 * 1024 * 1024,
        category: 'video',
      },
    });
    const presignLocBody = JSON.parse(presignLocRes.body);
    testMediaWithLocationId = presignLocBody.data.mediaId || presignLocBody.data.id;

    await app.inject({
      method: 'POST',
      url: '/v1/media/complete',
      headers: { authorization: `Bearer ${userToken}` },
      payload: {
        mediaId: testMediaWithLocationId,
        durationSeconds: 20.0,
      },
    });
  });

  afterAll(async () => {
    fakeAdapter.resetSimulation();
    await app.close();
  });

  // --------------------------------------------------------------------------
  // 1. EXTRACTION OF MULTI-MODAL SEARCHABLE METADATA
  // --------------------------------------------------------------------------
  it('POST /v1/media/:id/intelligence extracts visual objects, anonymous faces, speech, scenes, audio events, and embeddings', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/v1/media/${testMediaId}/intelligence`,
      headers: { authorization: `Bearer ${userToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);

    const intel = body.data;
    expect(intel.mediaId).toBe(testMediaId);
    expect(intel.userId).toBe(userId);
    expect(intel.durationSeconds).toBe(30.0);

    // Visual objects
    expect(intel.visualObjects.length).toBeGreaterThan(0);
    const objectLabels = intel.visualObjects.map((o: any) => o.label);
    expect(objectLabels).toContain('person');
    expect(objectLabels).toContain('car');
    expect(intel.visualObjects[0].box).toHaveLength(4); // normalized bounding box

    // PRIVACY INVARIANT: Anonymous face tracking without sensitive personal attributes
    expect(intel.faces.length).toBeGreaterThan(0);
    for (const face of intel.faces) {
      expect(face.box).toHaveLength(4);
      expect(face.faceCount).toBeGreaterThanOrEqual(1);
      // Strictly no sensitive personal attributes
      expect(face.race).toBeUndefined();
      expect(face.gender).toBeUndefined();
      expect(face.emotion).toBeUndefined();
      expect(face.biometricId).toBeUndefined();
    }

    // Speech, transcript, and speakers
    expect(intel.transcript).toBeDefined();
    expect(intel.transcript.length).toBeGreaterThan(10);
    expect(intel.speechSegments.length).toBeGreaterThan(0);
    expect(intel.speakers.length).toBeGreaterThan(0);

    // Scene boundaries
    expect(intel.scenes.length).toBeGreaterThan(0);
    expect(intel.scenes[0].tags).toContain('automotive');

    // Audio events
    expect(intel.audioEvents.length).toBeGreaterThan(0);
    const audioLabels = intel.audioEvents.map((a: any) => a.label);
    expect(audioLabels).toContain('engine_hum');

    // Multi-scale Vector embeddings
    expect(intel.assetEmbedding.length).toBeGreaterThan(100);
    expect(intel.segmentEmbeddings.length).toBeGreaterThan(0);
    expect(intel.segmentEmbeddings[0].embedding.length).toBeGreaterThan(100);

    // Location when NOT in source metadata must be strictly null (never hallucinated)
    expect(intel.location).toBeNull();
  });

  // --------------------------------------------------------------------------
  // 2. EXPLICIT SOURCE LOCATION PRESERVATION (EXIF GPS ONLY)
  // --------------------------------------------------------------------------
  it('POST /v1/media/:id/intelligence preserves explicit source location without hallucinating', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/v1/media/${testMediaWithLocationId}/intelligence`,
      headers: { authorization: `Bearer ${userToken}` },
      payload: {
        sourceMetadata: {
          location: {
            latitude: 35.6762,
            longitude: 139.6503,
            city: 'Tokyo',
            country: 'Japan',
          },
        },
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const loc = body.data.location;
    expect(loc).not.toBeNull();
    expect(loc.latitude).toBe(35.6762);
    expect(loc.longitude).toBe(139.6503);
    expect(loc.city).toBe('Tokyo');
    expect(loc.source).toBe('exif');
  });

  // --------------------------------------------------------------------------
  // 3. MULTI-MODAL NATURAL LANGUAGE SEMANTIC SEARCH
  // --------------------------------------------------------------------------
  it('POST /v1/media/search/semantic matches "person speaking beside a car" and returns precise timeline ranges', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/media/search/semantic',
      headers: { authorization: `Bearer ${userToken}` },
      payload: {
        query: 'Find clips where a person is speaking beside a car',
        mode: 'hybrid',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);

    // Primary test video should be top result
    const topHit = body.data.find((item: any) => item.assetId === testMediaId);
    expect(topHit).toBeDefined();
    expect(topHit.score).toBeGreaterThan(0.7);
    expect(topHit.assetName).toBe('car_review_interview.mp4');

    // Must return localized matching timeline ranges
    expect(topHit.matchingRanges.length).toBeGreaterThan(0);
    const primaryRange = topHit.matchingRanges[0];
    expect(primaryRange.start).toBeGreaterThanOrEqual(0);
    expect(primaryRange.end).toBeGreaterThan(primaryRange.start);
    expect(primaryRange.score).toBeGreaterThan(0.5);

    // Entity overlap: must detect person and car
    const matchedObjects = topHit.matchingRanges.flatMap((r: any) => r.matchedObjects);
    expect(matchedObjects).toContain('person');
    expect(matchedObjects).toContain('car');
  });

  // --------------------------------------------------------------------------
  // 4. STRUCTURED SEARCH MODES & FILTERS
  // --------------------------------------------------------------------------
  it('POST /v1/media/search/semantic supports object, speech, and duration filtering', async () => {
    // A. Object constraint search
    const objSearch = await app.inject({
      method: 'POST',
      url: '/v1/media/search/semantic',
      headers: { authorization: `Bearer ${userToken}` },
      payload: {
        query: 'vehicle showcase',
        objects: ['car'],
      },
    });
    expect(objSearch.statusCode).toBe(200);
    const objBody = JSON.parse(objSearch.body);
    expect(objBody.data.length).toBeGreaterThan(0);

    // B. Speech transcript constraint search
    const speechSearch = await app.inject({
      method: 'POST',
      url: '/v1/media/search/semantic',
      headers: { authorization: `Bearer ${userToken}` },
      payload: {
        query: 'technological innovation',
        speechQuery: 'aerodynamics',
      },
    });
    expect(speechSearch.statusCode).toBe(200);
    const speechBody = JSON.parse(speechSearch.body);
    expect(speechBody.data.length).toBeGreaterThan(0);

    // C. Duration filtering (exclude short clips)
    const durSearch = await app.inject({
      method: 'POST',
      url: '/v1/media/search/semantic',
      headers: { authorization: `Bearer ${userToken}` },
      payload: {
        query: 'electric vehicle',
        minDuration: 25.0, // testMediaId is 30s, testMediaWithLocationId is 20s
      },
    });
    expect(durSearch.statusCode).toBe(200);
    const durBody = JSON.parse(durSearch.body);
    const assetIds = durBody.data.map((d: any) => d.assetId);
    expect(assetIds).toContain(testMediaId);
    expect(assetIds).not.toContain(testMediaWithLocationId);
  });

  // --------------------------------------------------------------------------
  // 5. GET INTELLIGENCE DOCUMENT & MULTI-TENANT ISOLATION
  // --------------------------------------------------------------------------
  it('GET /v1/media/:id/intelligence returns document to owner, but blocks cross-tenant access', async () => {
    // Owner access -> 200
    const ownerRes = await app.inject({
      method: 'GET',
      url: `/v1/media/${testMediaId}/intelligence`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(ownerRes.statusCode).toBe(200);
    const body = JSON.parse(ownerRes.body);
    expect(body.data.mediaId).toBe(testMediaId);

    // Unauthorized User B access -> 403
    const unauthRes = await app.inject({
      method: 'GET',
      url: `/v1/media/${testMediaId}/intelligence`,
      headers: { authorization: `Bearer ${otherToken}` },
    });
    expect(unauthRes.statusCode).toBe(403);
    const unauthBody = JSON.parse(unauthRes.body);
    expect(unauthBody.error.message).toContain('permission');
  });

  it('POST /v1/media/search/semantic isolates results per user', async () => {
    // User B searches for car review -> Must be empty
    const otherSearch = await app.inject({
      method: 'POST',
      url: '/v1/media/search/semantic',
      headers: { authorization: `Bearer ${otherToken}` },
      payload: {
        query: 'car review interview',
      },
    });

    expect(otherSearch.statusCode).toBe(200);
    const body = JSON.parse(otherSearch.body);
    expect(body.data).toHaveLength(0);
  });

  // --------------------------------------------------------------------------
  // 6. REPLACEABLE SEARCH PROVIDER ARCHITECTURE
  // --------------------------------------------------------------------------
  it('SearchProviderRegistry allows registering and swapping search provider implementations', async () => {
    let mockCustomProviderCalled = false;

    // Create a mock custom search provider (e.g. simulating a future Qdrant/Pinecone provider)
    const mockCustomProvider: ISearchIndexProvider = {
      id: 'mock_custom_qdrant',
      name: 'Mock Custom Qdrant Search Provider',
      async indexMedia() {},
      async removeMedia() {},
      async getStats() {
        return { indexedAssetsCount: 42, totalSegmentsCount: 150, provider: 'mock_custom_qdrant' };
      },
      async search() {
        mockCustomProviderCalled = true;
        return [
          {
            assetId: testMediaId,
            assetName: 'custom_provider_match.mp4',
            category: 'video',
            duration: 30.0,
            score: 0.99,
            matchingRanges: [
              {
                start: 5.0,
                end: 10.0,
                score: 0.99,
                snippet: 'Custom external provider match',
                matchedObjects: ['person'],
              },
            ],
            intelligenceSummary: 'Indexed via custom provider',
          },
        ];
      },
    };

    // Register and activate
    searchProviderRegistry.registerProvider(mockCustomProvider);
    searchProviderRegistry.setActiveProvider('mock_custom_qdrant');

    expect(searchProviderRegistry.getActiveProvider().id).toBe('mock_custom_qdrant');

    // Execute search via API
    const res = await app.inject({
      method: 'POST',
      url: '/v1/media/search/semantic',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { query: 'test custom provider swap' },
    });

    expect(res.statusCode).toBe(200);
    expect(mockCustomProviderCalled).toBe(true);

    // Reset back to default memory vector search provider
    searchProviderRegistry.setActiveProvider('memory_vector_search');
    expect(searchProviderRegistry.getActiveProvider().id).toBe('memory_vector_search');
  });
});
