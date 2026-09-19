/**
 * Domain types for Production Billing & Credit Architecture
 * Supports atomic credit reservation, settlements, usage accounting, and payment provider abstraction.
 */

export type ReservationStatus = 'RESERVED' | 'SETTLED' | 'REFUNDED' | 'EXPIRED';

export interface CreditReservation {
  id: string;
  userId: string;
  amount: number;
  reservedAmount: number;
  settledAmount?: number;
  operationType: string;
  referenceId?: string;
  status: ReservationStatus;
  createdAt: string;
  expiresAt: string;
  settledAt?: string;
}

export interface UsageRecord {
  id: string;
  userId: string;
  projectId?: string;
  operationType: string;
  units: number;
  unitType: 'seconds' | 'tokens' | 'images' | 'operations' | 'edits';
  tokens?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
  costCredits: number;
  timestamp: string;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
}

export interface BillingPlan {
  id: string;
  tier: 'free' | 'pro' | 'studio';
  name: string;
  priceMonthly: number;
  priceYearly: number;
  monthlyCredits: number;
  features: string[];
  maxExportResolution: '1080p' | '4k' | '8k';
  cloudStorageGb: number;
  maxTeamSeats: number;
}

export interface CheckoutSession {
  sessionId: string;
  userId: string;
  planId: string;
  checkoutUrl: string;
  status: 'open' | 'complete' | 'expired';
  createdAt: string;
}

export interface WebhookEventPayload {
  id: string;
  type: string;
  data: {
    object?: Record<string, any>;
    [key: string]: any;
  };
  createdAt: string;
}

export interface IPaymentProvider {
  id: string;
  createCheckoutSession(userId: string, userEmail: string, planId: string): Promise<CheckoutSession>;
  verifyWebhookSignature(rawBody: string, signature: string): boolean;
  processWebhookEvent(event: WebhookEventPayload): Promise<{ handled: boolean; action: string }>;
}
