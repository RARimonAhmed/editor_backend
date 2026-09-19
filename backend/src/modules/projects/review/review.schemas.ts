import { z } from 'zod';

export const createSnapshotSchema = z.object({
  name: z.string().min(1, 'Version name is required').max(100),
  description: z.string().max(500).optional(),
});

export const restoreSnapshotSchema = z.object({
  expectedVersion: z.number().int().optional(),
});

export const compareVersionsSchema = z.object({
  sourceVersion: z.coerce.number().int().min(1),
  targetVersion: z.coerce.number().int().min(1),
});

export const createCommentSchema = z
  .object({
    type: z.enum(['timeline', 'project', 'asset']).default('timeline'),
    timecode: z.number().min(0).optional(),
    endTimecode: z.number().min(0).optional(),
    assetId: z.string().optional(),
    text: z.string().min(1, 'Comment text is required').max(2000),
  })
  .refine(
    (data) => {
      if (data.type === 'timeline' && data.timecode === undefined) {
        return false;
      }
      if (data.type === 'asset' && !data.assetId) {
        return false;
      }
      if (data.timecode !== undefined && data.endTimecode !== undefined) {
        return data.endTimecode >= data.timecode;
      }
      return true;
    },
    {
      message:
        'Timeline comments require a valid non-negative timecode; asset comments require an assetId; endTimecode cannot precede timecode',
    }
  );

export const updateCommentSchema = z.object({
  status: z.enum(['OPEN', 'RESOLVED']).optional(),
  text: z.string().min(1).max(2000).optional(),
});

export const listCommentsQuerySchema = z.object({
  type: z.enum(['timeline', 'project', 'asset']).optional(),
  status: z.enum(['OPEN', 'RESOLVED', 'all']).default('all'),
  assetId: z.string().optional(),
  startTimecode: z.coerce.number().min(0).optional(),
  endTimecode: z.coerce.number().min(0).optional(),
});
