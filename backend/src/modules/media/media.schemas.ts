import { z } from 'zod';

export const requestUploadUrlSchema = z.object({
  fileName: z.string().min(1, 'File name is required'),
  mimeType: z.string().min(1, 'MIME type is required'),
  fileSizeBytes: z.number().int().positive('File size must be positive'),
  projectId: z.string().optional(),
});

export const confirmUploadSchema = z.object({
  fileKey: z.string().min(1, 'File key is required'),
  fileName: z.string().min(1, 'File name is required'),
  mimeType: z.string().min(1, 'MIME type is required'),
  fileSizeBytes: z.number().int().positive(),
  projectId: z.string().optional(),
  durationSeconds: z.number().optional(),
  width: z.number().int().optional(),
  height: z.number().int().optional(),
});

export type RequestUploadUrlInput = z.infer<typeof requestUploadUrlSchema>;
export type ConfirmUploadInput = z.infer<typeof confirmUploadSchema>;
