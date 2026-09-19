import { z } from 'zod';

export const checkoutSessionSchema = z
  .object({
    planId: z.string().optional(),
    planTier: z.string().optional(),
    interval: z.enum(['monthly', 'yearly']).optional(),
    successUrl: z.string().url().optional(),
    cancelUrl: z.string().url().optional(),
  })
  .refine((data) => data.planId || data.planTier, {
    message: 'Either planId or planTier is required',
  });

export const usageQuerySchema = z.object({
  fromDate: z.string().datetime().optional(),
  toDate: z.string().datetime().optional(),
  operationType: z.string().optional(),
  projectId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const webhookPayloadSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  data: z.union([
    z.object({
      object: z.record(z.unknown()),
    }),
    z.record(z.unknown()),
  ]),
  createdAt: z.string().optional(),
});
