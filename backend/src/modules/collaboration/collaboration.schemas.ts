import { z } from 'zod';

export const projectRoleSchema = z.enum(['OWNER', 'EDITOR', 'COMMENTER', 'VIEWER']);

export const inviteCollaboratorSchema = z.object({
  email: z.string().email().optional(),
  userId: z.string().optional(),
  role: z.enum(['EDITOR', 'COMMENTER', 'VIEWER']).default('VIEWER'),
}).refine((data) => data.email || data.userId, {
  message: 'Either email or userId must be specified for collaborator invitation',
});

export const updateCollaboratorRoleSchema = z.object({
  role: z.enum(['EDITOR', 'COMMENTER', 'VIEWER']),
});

export const createShareLinkSchema = z.object({
  role: z.enum(['COMMENTER', 'VIEWER']).default('VIEWER'),
  allowComments: z.boolean().default(true),
  password: z.string().min(4).max(64).optional(),
  expiresInDays: z.number().int().min(1).max(365).optional(),
  maxUses: z.number().int().min(1).optional(),
});

export const accessShareLinkSchema = z.object({
  password: z.string().optional(),
});
