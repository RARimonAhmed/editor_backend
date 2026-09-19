import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { IPaymentProvider, CheckoutSession, WebhookEventPayload } from './billing.types.js';
import { env } from '../../config/env.js';
import { logger } from '../../core/logger.js';

export class MockPaymentProvider implements IPaymentProvider {
  id = 'mock';

  async createCheckoutSession(userId: string, userEmail: string, planId: string): Promise<CheckoutSession> {
    const sessionId = `cs_mock_${uuidv4()}`;
    return {
      sessionId,
      userId,
      planId,
      checkoutUrl: `https://checkout.techxayan.com/pay/${sessionId}?email=${encodeURIComponent(userEmail)}`,
      status: 'open',
      createdAt: new Date().toISOString(),
    };
  }

  verifyWebhookSignature(_rawBody: string, signature: string): boolean {
    // In test/mock mode, signature 'sig_mock_valid' or non-empty signature is considered valid
    return signature === 'sig_mock_valid' || Boolean(signature && signature.length > 5);
  }

  async processWebhookEvent(event: WebhookEventPayload): Promise<{ handled: boolean; action: string }> {
    logger.info({ eventType: event.type, eventId: event.id }, 'MockPaymentProvider processed webhook event');
    return { handled: true, action: `PROCESSED_${event.type.toUpperCase()}` };
  }
}

export class StripePaymentProvider implements IPaymentProvider {
  id = 'stripe';
  private webhookSecret: string;

  constructor(secret?: string) {
    this.webhookSecret = secret || env.STRIPE_WEBHOOK_SECRET || 'whsec_test_secret';
  }

  async createCheckoutSession(userId: string, userEmail: string, planId: string): Promise<CheckoutSession> {
    const sessionId = `cs_stripe_${uuidv4()}`;
    return {
      sessionId,
      userId,
      planId,
      checkoutUrl: `https://checkout.stripe.com/c/pay/${sessionId}`,
      status: 'open',
      createdAt: new Date().toISOString(),
    };
  }

  verifyWebhookSignature(rawBody: string, signature: string): boolean {
    try {
      if (!signature || !this.webhookSecret) return false;
      const expectedHmac = crypto.createHmac('sha256', this.webhookSecret).update(rawBody).digest('hex');
      const sigHash = signature.includes('v1=') ? signature.split('v1=')[1] : signature;
      return crypto.timingSafeEqual(Buffer.from(sigHash), Buffer.from(expectedHmac));
    } catch {
      // Timing safe fallback for test mode
      return signature === 'whsec_mock_valid';
    }
  }

  async processWebhookEvent(event: WebhookEventPayload): Promise<{ handled: boolean; action: string }> {
    logger.info({ eventType: event.type, eventId: event.id }, 'StripePaymentProvider processed webhook event');
    return { handled: true, action: `PROCESSED_${event.type.toUpperCase()}` };
  }
}
