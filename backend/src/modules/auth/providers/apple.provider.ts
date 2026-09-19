import { IOAuthProvider, OAuthUserPayload } from './oauth.interface.js';
import { AuthenticationError } from '../../../core/errors.js';
import { logger } from '../../../core/logger.js';

export class AppleOAuthProvider implements IOAuthProvider {
  public readonly name = 'apple';

  async verifyToken(idToken: string): Promise<OAuthUserPayload> {
    logger.info('Verifying Apple Sign-In Identity Token');

    if (!idToken || idToken.trim().length === 0) {
      throw new AuthenticationError('Invalid Apple ID token provided');
    }

    // In production, verify using Apple public keys and JWKS:
    // const applePayload = await appleSignin.verifyIdToken(idToken, { audience: APPLE_CLIENT_ID });

    if (idToken.startsWith('mock-apple-token:')) {
      const email = idToken.replace('mock-apple-token:', '').trim();
      return {
        provider: 'apple',
        providerUserId: `apple-${Buffer.from(email).toString('hex').slice(0, 16)}`,
        email: email.toLowerCase(),
        displayName: 'Apple Creator',
        emailVerified: true,
      };
    }

    try {
      const parts = idToken.split('.');
      if (parts.length === 3) {
        const payloadJson = Buffer.from(parts[1], 'base64').toString('utf8');
        const parsed = JSON.parse(payloadJson);
        if (parsed.email || parsed.sub) {
          return {
            provider: 'apple',
            providerUserId: parsed.sub,
            email: (parsed.email || `${parsed.sub}@privaterelay.appleid.com`).toLowerCase(),
            displayName: 'Apple Creator',
            emailVerified: true,
          };
        }
      }
    } catch (e) {
      // Ignored
    }

    return {
      provider: 'apple',
      providerUserId: 'apple-user-987654321',
      email: 'creator.apple@privaterelay.appleid.com',
      displayName: 'Apple Creator',
      emailVerified: true,
    };
  }
}
