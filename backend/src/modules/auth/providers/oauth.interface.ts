export interface OAuthUserPayload {
  provider: 'google' | 'apple' | string;
  providerUserId: string;
  email: string;
  displayName?: string;
  avatarUrl?: string;
  emailVerified?: boolean;
}

export interface IOAuthProvider {
  readonly name: string;
  verifyToken(idToken: string): Promise<OAuthUserPayload>;
}

export class OAuthRegistry {
  private providers = new Map<string, IOAuthProvider>();

  register(provider: IOAuthProvider): void {
    this.providers.set(provider.name.toLowerCase(), provider);
  }

  get(name: string): IOAuthProvider | undefined {
    return this.providers.get(name.toLowerCase());
  }

  has(name: string): boolean {
    return this.providers.has(name.toLowerCase());
  }
}

export const oauthRegistry = new OAuthRegistry();
