import { z } from 'zod';

export const deviceInfoSchema = z.object({
  deviceFingerprint: z.string().default('unknown-device'),
  deviceType: z.enum(['windows', 'android', 'web', 'macos']).default('windows'),
  deviceName: z.string().default('Generic Device'),
  osVersion: z.string().optional(),
  appVersion: z.string().optional(),
});

export const registerSchema = z.object({
  email: z.string().email('Valid email is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  displayName: z.string().min(2, 'Display name must be at least 2 characters'),
  device: deviceInfoSchema.optional(),
});

export const loginSchema = z.object({
  email: z.string().email('Valid email is required'),
  password: z.string().min(1, 'Password is required'),
  device: deviceInfoSchema.optional(),
});

export const oauthLoginSchema = z.object({
  idToken: z.string().min(1, 'OAuth ID token is required'),
  device: deviceInfoSchema.optional(),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export const logoutSchema = z.object({
  refreshToken: z.string().optional(),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email('Valid email is required'),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters'),
});

export const verifyEmailSchema = z.object({
  token: z.string().min(1, 'Verification token is required'),
});

export const resendVerificationSchema = z.object({
  email: z.string().email('Valid email is required'),
});

export const updateProfileSchema = z.object({
  displayName: z.string().min(2).optional(),
  avatarUrl: z.string().url().nullable().optional(),
  bio: z.string().max(500).nullable().optional(),
  timezone: z.string().optional(),
  locale: z.string().optional(),
  preferences: z.record(z.unknown()).optional(),
});

export type DeviceInfo = z.infer<typeof deviceInfoSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type OAuthLoginInput = z.infer<typeof oauthLoginSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
export type LogoutInput = z.infer<typeof logoutSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
export type ResendVerificationInput = z.infer<typeof resendVerificationSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
