import { z } from 'zod';

export const createAIJobSchema = z
  .object({
    type: z.string().min(1, 'Job type is required'),
    input: z.record(z.any()).default({}),
    parameters: z.record(z.any()).optional(),
    projectId: z.string().optional(),
    provider: z.string().optional(),
    model: z.string().optional(),
    idempotencyKey: z.string().max(255).optional(),
    timeoutMs: z.number().int().min(10).max(600000).optional(),
  })
  .passthrough();

export const getAIJobParamsSchema = z.object({
  id: z.string().min(1, 'Job ID is required'),
});

export const listAIJobsQuerySchema = z.object({
  status: z.enum(['QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED']).optional(),
  type: z.string().optional(),
  projectId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export type CreateAIJobBody = z.infer<typeof createAIJobSchema>;
export type GetAIJobParams = z.infer<typeof getAIJobParamsSchema>;
export type ListAIJobsQuery = z.infer<typeof listAIJobsQuerySchema>;
