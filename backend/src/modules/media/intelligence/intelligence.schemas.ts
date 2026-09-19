import { z } from 'zod';

export const semanticSearchQuerySchema = z.object({
  query: z.string().min(1, 'Search query is required'),
  mode: z.enum(['semantic', 'hybrid', 'object', 'speech', 'scene']).default('hybrid'),
  objects: z.array(z.string()).optional(),
  speechQuery: z.string().optional(),
  sceneQuery: z.string().optional(),
  audioEvents: z.array(z.string()).optional(),
  minDuration: z.number().nonnegative().optional(),
  maxDuration: z.number().positive().optional(),
  createdAfter: z.string().optional(),
  createdBefore: z.string().optional(),
  category: z.string().optional(),
  projectId: z.string().uuid().optional(),
  limit: z.coerce.number().int().positive().max(100).default(20),
  offset: z.coerce.number().int().nonnegative().default(0),
});

export const generateIntelligenceSchema = z.object({
  mediaId: z.string().uuid().optional(),
  sourceMetadata: z.record(z.unknown()).optional(),
  forceRefresh: z.boolean().default(false),
});

export const mediaIntelligenceParamsSchema = z.object({
  id: z.string().uuid('Invalid media ID format'),
});
