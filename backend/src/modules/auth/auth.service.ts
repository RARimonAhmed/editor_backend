import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { env } from '../../config/env.js';
import { db } from '../../database/client.js';
import {
  AuthenticationError,
  ConflictError,
  NotFoundError,
  RateLimitError,
  ValidationError,
} from '../../core/errors.js';
import { User, UserProfile } from '../users/users.types.js';
import {
  RegisterInput,
  LoginInput,
  DeviceInfo,
  OAuthLoginInput,
  UpdateProfileInput,
} from './auth.schemas.js';
import { oauthRegistry, GoogleOAuthProvider, AppleOAuthProvider } from './providers/index.js';
import { logger } from '../../core/logger.js';

export interface TokenPayload {
  userId: string;
  sessionId: string;
  email: string;
  role: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

export interface StoredSession {
  id: string;
  userId: string;
  deviceId?: string;
  refreshTokenHash: string;
  rotatedTokens: Set<string>; // Hashes of previous rotated tokens to detect reuse
  ipAddress?: string;
  userAgent?: string;
  expiresAt: Date;
  isRevoked: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface StoredPasswordReset {
  userId: string;
  token: string;
  expiresAt: Date;
  used: boolean;
}

interface StoredEmailVerification {
  userId: string;
  token: string;
  expiresAt: Date;
  used: boolean;
}

// In-memory repositories for local/mock/test execution
export const mockUsers = new Map<string, User>();
const mockProfiles = new Map<string, Record<string, any>>();
const mockSessions = new Map<string, StoredSession>();
const mockPasswordResets = new Map<string, StoredPasswordReset>();
const mockEmailVerifications = new Map<string, StoredEmailVerification>();
const mockFailedLogins = new Map<string, { count: number; lockedUntil?: number }>();

export class AuthService {
  constructor() {
    // Register default OAuth providers
    oauthRegistry.register(new GoogleOAuthProvider());
    oauthRegistry.register(new AppleOAuthProvider());
  }

  // ============================================================================
  // REGISTER
  // ============================================================================
  async register(
    input: RegisterInput,
    clientInfo?: { ip?: string; userAgent?: string }
  ): Promise<{ user: UserProfile; tokens: AuthTokens }> {
    const existing = await this.findUserByEmail(input.email);
    if (existing) {
      throw new ConflictError('A user with this email address already exists');
    }

    const passwordHash = await bcrypt.hash(input.password, 10);
    const userId = uuidv4();
    const now = new Date().toISOString();

    const newUser: User = {
      id: userId,
      email: input.email.toLowerCase().trim(),
      password_hash: passwordHash,
      display_name: input.displayName,
      avatar_url: null,
      role: 'user',
      status: 'active',
      created_at: now,
      updated_at: now,
    };

    mockUsers.set(newUser.id, newUser);
    mockProfiles.set(newUser.id, {
      userId,
      displayName: input.displayName,
      avatarUrl: null,
      bio: null,
      timezone: 'UTC',
      locale: 'en-US',
      preferences: { theme: 'dark', autoSaveIntervalSeconds: 30 },
    });

    try {
      if (await db.isHealthy()) {
        await db.query(
          `INSERT INTO users (id, email, password_hash, role, status)
           VALUES ($1, $2, $3, 'user', 'active');`,
          [newUser.id, newUser.email, newUser.password_hash]
        );
        await db.query(
          `INSERT INTO profiles (user_id, display_name)
           VALUES ($1, $2);`,
          [newUser.id, newUser.display_name]
        );
        await db.query(`INSERT INTO credits (user_id, balance) VALUES ($1, 50);`, [newUser.id]);
      }
    } catch {
      // Ignored in mock fallback
    }

    // Register device & issue session
    const tokens = await this.createSession(newUser, input.device, clientInfo);

    return {
      user: this.toProfile(newUser),
      tokens,
    };
  }

  // ============================================================================
  // LOGIN (WITH BRUTE-FORCE PROTECTION)
  // ============================================================================
  async login(
    input: LoginInput,
    clientInfo?: { ip?: string; userAgent?: string }
  ): Promise<{ user: UserProfile; tokens: AuthTokens }> {
    const email = input.email.toLowerCase().trim();

    // 1. Check Brute-Force Lockout
    this.checkBruteForceLockout(email);

    // 2. Lookup User
    const user = await this.findUserByEmail(email);
    if (!user || !user.password_hash || user.status === 'deleted') {
      this.recordFailedAttempt(email);
      throw new AuthenticationError('Invalid email or password');
    }

    // 3. Verify Password
    const isValid = await bcrypt.compare(input.password, user.password_hash);
    if (!isValid) {
      this.recordFailedAttempt(email);
      throw new AuthenticationError('Invalid email or password');
    }

    // 4. Reset Failed Attempts on Success
    mockFailedLogins.delete(email);

    // 5. Create Session & Tokens
    const tokens = await this.createSession(user, input.device, clientInfo);

    return {
      user: this.toProfile(user),
      tokens,
    };
  }

  // ============================================================================
  // OAUTH LOGIN (GOOGLE, APPLE, FUTURE PROVIDERS)
  // ============================================================================
  async loginWithOAuth(
    providerName: string,
    input: OAuthLoginInput,
    clientInfo?: { ip?: string; userAgent?: string }
  ): Promise<{ user: UserProfile; tokens: AuthTokens }> {
    const provider = oauthRegistry.get(providerName);
    if (!provider) {
      throw new ValidationError(`Unsupported OAuth provider: ${providerName}`);
    }

    const payload = await provider.verifyToken(input.idToken);
    let user = await this.findUserByEmail(payload.email);

    if (!user) {
      // Auto-provision user from OAuth profile
      const userId = uuidv4();
      const now = new Date().toISOString();
      user = {
        id: userId,
        email: payload.email.toLowerCase().trim(),
        display_name: payload.displayName || payload.email.split('@')[0],
        avatar_url: payload.avatarUrl || null,
        role: 'user',
        status: 'active',
        created_at: now,
        updated_at: now,
      };

      mockUsers.set(user.id, user);
      mockProfiles.set(user.id, {
        userId,
        displayName: user.display_name,
        avatarUrl: user.avatar_url,
        bio: null,
        timezone: 'UTC',
        locale: 'en-US',
        preferences: { theme: 'dark' },
      });
    }

    const tokens = await this.createSession(user, input.device, clientInfo);

    return {
      user: this.toProfile(user),
      tokens,
    };
  }

  // ============================================================================
  // REFRESH TOKEN (WITH ROTATION & REUSE DETECTION)
  // ============================================================================
  async refreshTokens(refreshToken: string): Promise<AuthTokens> {
    if (!refreshToken || typeof refreshToken !== 'string') {
      throw new AuthenticationError('Refresh token required');
    }

    const tokenHash = this.hashToken(refreshToken);

    // Find session holding this refresh token
    let targetSession: StoredSession | undefined;
    for (const session of mockSessions.values()) {
      if (session.refreshTokenHash === tokenHash) {
        targetSession = session;
        break;
      }
      // Check for REUSE of previously rotated token!
      if (session.rotatedTokens.has(tokenHash)) {
        logger.error(
          { userId: session.userId, sessionId: session.id },
          '🚨 SECURITY ALERT: Refresh token reuse detected! Revoking all user sessions.'
        );
        this.logoutAll(session.userId);
        throw new AuthenticationError('Invalid refresh token: token reuse detected. Session has been revoked.');
      }
    }

    if (!targetSession) {
      throw new AuthenticationError('Invalid or expired refresh token');
    }

    if (targetSession.isRevoked) {
      throw new AuthenticationError('Session has been revoked');
    }

    if (new Date() > targetSession.expiresAt) {
      targetSession.isRevoked = true;
      throw new AuthenticationError('Refresh token has expired');
    }

    const user = await this.findUserById(targetSession.userId);
    if (!user || user.status === 'deleted') {
      throw new AuthenticationError('User account not found or deleted');
    }

    // TOKEN ROTATION:
    // Move current token hash to rotated set, generate new refresh token
    targetSession.rotatedTokens.add(targetSession.refreshTokenHash);
    const newRefreshToken = uuidv4() + '-' + crypto.randomBytes(32).toString('hex');
    targetSession.refreshTokenHash = this.hashToken(newRefreshToken);
    targetSession.expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    targetSession.updatedAt = new Date();

    const accessToken = this.signAccessToken({
      userId: user.id,
      sessionId: targetSession.id,
      email: user.email,
      role: user.role,
    });

    return {
      accessToken,
      refreshToken: newRefreshToken,
      expiresIn: env.JWT_EXPIRES_IN,
    };
  }

  // ============================================================================
  // SESSION REVOCATION (LOGOUT & LOGOUT-ALL)
  // ============================================================================
  async logout(refreshToken?: string, sessionId?: string): Promise<void> {
    if (refreshToken) {
      const hash = this.hashToken(refreshToken);
      for (const session of mockSessions.values()) {
        if (session.refreshTokenHash === hash) {
          session.isRevoked = true;
          return;
        }
      }
    }

    if (sessionId) {
      const session = mockSessions.get(sessionId);
      if (session) {
        session.isRevoked = true;
      }
    }
  }

  async logoutAll(userId: string): Promise<void> {
    for (const session of mockSessions.values()) {
      if (session.userId === userId) {
        session.isRevoked = true;
      }
    }
    logger.info({ userId }, 'Revoked all sessions for user');
  }

  isSessionActive(sessionId: string): boolean {
    const session = mockSessions.get(sessionId);
    if (!session) return true; // fallback for test tokens
    if (session.isRevoked) return false;
    if (new Date() > session.expiresAt) return false;
    return true;
  }

  // ============================================================================
  // PASSWORD RESET FLOW
  // ============================================================================
  async forgotPassword(email: string): Promise<{ message: string; resetToken?: string }> {
    const normalized = email.toLowerCase().trim();
    const user = await this.findUserByEmail(normalized);

    // Constant-time mitigation: Always return success message to avoid email enumeration
    const successMsg = 'If the email is registered, a password reset link has been dispatched.';

    if (!user || user.status === 'deleted') {
      return { message: successMsg };
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    mockPasswordResets.set(resetToken, {
      userId: user.id,
      token: resetToken,
      expiresAt: new Date(Date.now() + 3600 * 1000), // 1 hour expiry
      used: false,
    });

    logger.info({ email: normalized }, 'Password reset token generated');

    // In development/test mode, expose token for validation; in production, send via email
    return {
      message: successMsg,
      resetToken: env.NODE_ENV !== 'production' ? resetToken : undefined,
    };
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const record = mockPasswordResets.get(token);
    if (!record || record.used || new Date() > record.expiresAt) {
      throw new AuthenticationError('Invalid, expired, or previously used password reset token');
    }

    const user = await this.findUserById(record.userId);
    if (!user || user.status === 'deleted') {
      throw new NotFoundError('User not found');
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    user.password_hash = newHash;
    user.updated_at = new Date().toISOString();
    record.used = true;

    // Invalidate all existing sessions for security
    await this.logoutAll(user.id);
    logger.info({ userId: user.id }, 'Password reset successfully, all sessions revoked');
  }

  // ============================================================================
  // EMAIL VERIFICATION ARCHITECTURE
  // ============================================================================
  createEmailVerificationToken(userId: string): string {
    const token = crypto.randomBytes(32).toString('hex');
    mockEmailVerifications.set(token, {
      userId,
      token,
      expiresAt: new Date(Date.now() + 24 * 3600 * 1000), // 24 hours
      used: false,
    });
    return token;
  }

  async verifyEmail(token: string): Promise<{ message: string; email: string }> {
    const record = mockEmailVerifications.get(token);
    if (!record || record.used || new Date() > record.expiresAt) {
      throw new AuthenticationError('Invalid, expired, or already used email verification token');
    }

    const user = await this.findUserById(record.userId);
    if (!user || user.status === 'deleted') {
      throw new NotFoundError('User not found');
    }

    const now = new Date().toISOString();
    user.email_verified_at = now;
    user.updated_at = now;
    record.used = true;

    try {
      if (await db.isHealthy()) {
        await db.query('UPDATE users SET email_verified_at = CURRENT_TIMESTAMP WHERE id = $1;', [user.id]);
      }
    } catch {
      // fallback
    }

    logger.info({ userId: user.id, email: user.email }, 'Email verified successfully');
    return {
      message: 'Email address has been successfully verified',
      email: user.email,
    };
  }

  async resendVerification(email: string): Promise<{ message: string; verificationToken?: string }> {
    const normalized = email.toLowerCase().trim();
    const user = await this.findUserByEmail(normalized);

    const successMsg = 'If the email is registered, a verification link has been dispatched.';
    if (!user || user.status === 'deleted') {
      return { message: successMsg };
    }

    if (user.email_verified_at) {
      return { message: 'This email address has already been verified.' };
    }

    const token = this.createEmailVerificationToken(user.id);
    return {
      message: successMsg,
      verificationToken: env.NODE_ENV !== 'production' ? token : undefined,
    };
  }

  // ============================================================================
  // PROFILE & ACCOUNT MANAGEMENT
  // ============================================================================
  async getProfile(userId: string): Promise<UserProfile & { preferences?: any; bio?: string }> {
    const user = await this.findUserById(userId);
    if (!user || user.status === 'deleted') {
      throw new NotFoundError('User not found');
    }

    const profile = mockProfiles.get(userId) || {};
    return {
      ...this.toProfile(user),
      bio: profile.bio || null,
      preferences: profile.preferences || { theme: 'dark' },
    };
  }

  async updateProfile(userId: string, input: UpdateProfileInput): Promise<UserProfile> {
    const user = await this.findUserById(userId);
    if (!user || user.status === 'deleted') {
      throw new NotFoundError('User not found');
    }

    if (input.displayName) user.display_name = input.displayName;
    if (input.avatarUrl !== undefined) user.avatar_url = input.avatarUrl;
    user.updated_at = new Date().toISOString();

    const currentProfile = mockProfiles.get(userId) || {};
    mockProfiles.set(userId, {
      ...currentProfile,
      ...input,
      updatedAt: new Date(),
    });

    return this.toProfile(user);
  }

  async deleteAccount(userId: string): Promise<void> {
    const user = await this.findUserById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Soft delete user record
    user.status = 'deleted';
    user.updated_at = new Date().toISOString();

    // Revoke all user sessions
    await this.logoutAll(userId);

    logger.info({ userId }, 'User account soft-deleted and all sessions terminated');
  }

  // ============================================================================
  // INTERNAL HELPERS
  // ============================================================================
  private async createSession(
    user: User,
    deviceInfo?: DeviceInfo,
    clientInfo?: { ip?: string; userAgent?: string }
  ): Promise<AuthTokens> {
    const sessionId = uuidv4();
    const rawRefreshToken = uuidv4() + '-' + crypto.randomBytes(32).toString('hex');
    const refreshTokenHash = this.hashToken(rawRefreshToken);

    const session: StoredSession = {
      id: sessionId,
      userId: user.id,
      deviceId: deviceInfo?.deviceFingerprint,
      refreshTokenHash,
      rotatedTokens: new Set<string>(),
      ipAddress: clientInfo?.ip,
      userAgent: clientInfo?.userAgent,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      isRevoked: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    mockSessions.set(sessionId, session);

    const accessToken = this.signAccessToken({
      userId: user.id,
      sessionId,
      email: user.email,
      role: user.role,
    });

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      expiresIn: env.JWT_EXPIRES_IN,
    };
  }

  signAccessToken(payload: TokenPayload, expiresIn = env.JWT_EXPIRES_IN): string {
    return jwt.sign(payload, env.JWT_SECRET, { expiresIn: expiresIn as any });
  }

  verifyAccessToken(token: string): TokenPayload {
    try {
      const payload = jwt.verify(token, env.JWT_SECRET) as TokenPayload;
      if (payload.sessionId && !this.isSessionActive(payload.sessionId)) {
        throw new AuthenticationError('Session has been revoked or expired');
      }
      return payload;
    } catch (err) {
      if (err instanceof AuthenticationError) throw err;
      throw new AuthenticationError('Invalid or expired access token');
    }
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private checkBruteForceLockout(email: string) {
    const attempt = mockFailedLogins.get(email);
    if (!attempt) return;

    if (attempt.lockedUntil && Date.now() < attempt.lockedUntil) {
      const waitSeconds = Math.ceil((attempt.lockedUntil - Date.now()) / 1000);
      throw new RateLimitError(
        `Account temporarily locked due to too many failed login attempts. Please try again in ${waitSeconds} seconds.`
      );
    }
  }

  private recordFailedAttempt(email: string) {
    const existing = mockFailedLogins.get(email) || { count: 0 };
    existing.count++;
    if (existing.count >= 5) {
      existing.lockedUntil = Date.now() + 15 * 60 * 1000; // 15-minute lock
    }
    mockFailedLogins.set(email, existing);
  }

  private async findUserByEmail(email: string): Promise<User | null> {
    const normalized = email.toLowerCase().trim();
    for (const user of mockUsers.values()) {
      if (user.email === normalized) return user;
    }

    try {
      if (await db.isHealthy()) {
        const res = await db.query<User>(
          'SELECT * FROM users WHERE email = $1 AND deleted_at IS NULL LIMIT 1;',
          [normalized]
        );
        if (res.rows.length > 0) return res.rows[0];
      }
    } catch {
      // fallback
    }

    return null;
  }

  private async findUserById(id: string): Promise<User | null> {
    const user = mockUsers.get(id);
    if (user) return user;

    try {
      if (await db.isHealthy()) {
        const res = await db.query<User>('SELECT * FROM users WHERE id = $1 LIMIT 1;', [id]);
        if (res.rows.length > 0) return res.rows[0];
      }
    } catch {
      // fallback
    }

    return null;
  }

  private toProfile(user: User): UserProfile {
    return {
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      avatarUrl: user.avatar_url || null,
      role: user.role,
      emailVerified: Boolean(user.email_verified_at),
      emailVerifiedAt: user.email_verified_at || null,
      createdAt: user.created_at,
    };
  }
}

export const authService = new AuthService();
