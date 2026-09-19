import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { env } from '../../config/env.js';
import { db } from '../../database/client.js';
import { AuthenticationError, ConflictError, NotFoundError } from '../../core/errors.js';
import { User, UserProfile } from '../users/users.types.js';
import { RegisterInput, LoginInput } from './auth.schemas.js';

export interface TokenPayload {
  userId: string;
  email: string;
  role: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

// In-memory user store for standalone / test environment
const mockUserStore = new Map<string, User>();

export class AuthService {
  async register(input: RegisterInput): Promise<{ user: UserProfile; tokens: AuthTokens }> {
    const existing = await this.findUserByEmail(input.email);
    if (existing) {
      throw new ConflictError('A user with this email address already exists');
    }

    const passwordHash = await bcrypt.hash(input.password, 10);
    const userId = uuidv4();
    const now = new Date().toISOString();

    const newUser: User = {
      id: userId,
      email: input.email.toLowerCase(),
      password_hash: passwordHash,
      display_name: input.displayName,
      avatar_url: null,
      role: 'user',
      status: 'active',
      created_at: now,
      updated_at: now,
    };

    // Save to mock store
    mockUserStore.set(newUser.id, newUser);

    // Save to DB if live
    try {
      if (await db.isHealthy()) {
        await db.query(
          `INSERT INTO users (id, email, password_hash, display_name, role)
           VALUES ($1, $2, $3, $4, $5);`,
          [newUser.id, newUser.email, newUser.password_hash, newUser.display_name, newUser.role]
        );
        // Initialize default free subscription and credit wallet
        await db.query(`INSERT INTO subscriptions (user_id, tier) VALUES ($1, 'free');`, [newUser.id]);
        await db.query(`INSERT INTO credit_wallets (user_id, balance) VALUES ($1, 50);`, [newUser.id]);
      }
    } catch {
      // Ignored in mock mode
    }

    const tokens = this.generateTokens({
      userId: newUser.id,
      email: newUser.email,
      role: newUser.role,
    });

    return {
      user: this.toProfile(newUser),
      tokens,
    };
  }

  async login(input: LoginInput): Promise<{ user: UserProfile; tokens: AuthTokens }> {
    const user = await this.findUserByEmail(input.email);
    if (!user || !user.password_hash) {
      throw new AuthenticationError('Invalid email or password');
    }

    const isValid = await bcrypt.compare(input.password, user.password_hash);
    if (!isValid) {
      throw new AuthenticationError('Invalid email or password');
    }

    const tokens = this.generateTokens({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    return {
      user: this.toProfile(user),
      tokens,
    };
  }

  async refreshTokens(refreshToken: string): Promise<AuthTokens> {
    try {
      const decoded = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET) as TokenPayload;
      const user = await this.findUserById(decoded.userId);
      if (!user) {
        throw new AuthenticationError('Invalid refresh token');
      }

      return this.generateTokens({
        userId: user.id,
        email: user.email,
        role: user.role,
      });
    } catch {
      throw new AuthenticationError('Invalid or expired refresh token');
    }
  }

  async getProfile(userId: string): Promise<UserProfile> {
    const user = await this.findUserById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }
    return this.toProfile(user);
  }

  generateTokens(payload: TokenPayload): AuthTokens {
    const accessToken = jwt.sign(payload, env.JWT_SECRET, {
      expiresIn: env.JWT_EXPIRES_IN as any,
    });

    const refreshToken = jwt.sign(payload, env.JWT_REFRESH_SECRET, {
      expiresIn: env.JWT_REFRESH_EXPIRES_IN as any,
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: env.JWT_EXPIRES_IN,
    };
  }

  verifyAccessToken(token: string): TokenPayload {
    try {
      return jwt.verify(token, env.JWT_SECRET) as TokenPayload;
    } catch {
      throw new AuthenticationError('Invalid or expired access token');
    }
  }

  private async findUserByEmail(email: string): Promise<User | null> {
    const normalized = email.toLowerCase();
    for (const user of mockUserStore.values()) {
      if (user.email === normalized) return user;
    }

    try {
      if (await db.isHealthy()) {
        const res = await db.query<User>('SELECT * FROM users WHERE email = $1 LIMIT 1;', [normalized]);
        if (res.rows.length > 0) return res.rows[0];
      }
    } catch {
      // fallback
    }

    return null;
  }

  private async findUserById(id: string): Promise<User | null> {
    const user = mockUserStore.get(id);
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
      createdAt: user.created_at,
    };
  }
}

export const authService = new AuthService();
