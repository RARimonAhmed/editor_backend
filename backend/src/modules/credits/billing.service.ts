import { v4 as uuidv4 } from 'uuid';
import {
  CreditReservation,
  UsageRecord,
  BillingPlan,
  CheckoutSession,
  IPaymentProvider,
  WebhookEventPayload,
} from './billing.types.js';
import { MockPaymentProvider } from './payment.provider.js';
import { creditsService } from './credits.service.js';
import { InsufficientCreditsError, ValidationError, NotFoundError } from '../../core/errors.js';
import { logger } from '../../core/logger.js';

// In-memory repositories for reservations, usage, and webhook idempotency
const mockReservations = new Map<string, CreditReservation>();
const mockUsageRecords: UsageRecord[] = [];
const processedWebhookEvents = new Set<string>();

// Simple in-memory user mutex locks to eliminate concurrent double-spending
const userMutexLocks = new Map<string, Promise<void>>();

export const BILLING_PLANS: BillingPlan[] = [
  {
    id: 'plan_free',
    tier: 'free',
    name: 'Free Creator',
    priceMonthly: 0,
    priceYearly: 0,
    monthlyCredits: 50,
    features: ['1080p 30fps export', 'Standard AI Transcription', '2GB Cloud Storage', 'Watermark-free exports'],
    maxExportResolution: '1080p',
    cloudStorageGb: 2,
    maxTeamSeats: 1,
  },
  {
    id: 'plan_pro',
    tier: 'pro',
    name: 'Pro Editor',
    priceMonthly: 19,
    priceYearly: 190,
    monthlyCredits: 500,
    features: [
      '4K 60fps export',
      'Unlimited Whisper AI subtitles',
      'AI Short-Video Orchestration',
      '50GB Cloud Storage',
      'Multi-track Ripple Editing',
    ],
    maxExportResolution: '4k',
    cloudStorageGb: 50,
    maxTeamSeats: 3,
  },
  {
    id: 'plan_studio',
    tier: 'studio',
    name: 'Studio Team',
    priceMonthly: 49,
    priceYearly: 490,
    monthlyCredits: 2000,
    features: [
      '8K HDR ProRes export',
      'Team multiplayer collaboration & RBAC',
      'Priority GPU AI render queue',
      '500GB Cloud Storage',
      'Custom Voice Cloning & Sound Design',
    ],
    maxExportResolution: '8k',
    cloudStorageGb: 500,
    maxTeamSeats: 10,
  },
];

export class BillingService {
  private paymentProvider: IPaymentProvider;

  constructor(provider?: IPaymentProvider) {
    this.paymentProvider = provider || new MockPaymentProvider();
  }

  setPaymentProvider(provider: IPaymentProvider) {
    this.paymentProvider = provider;
  }

  // --------------------------------------------------------------------------
  // CONCURRENCY MUTEX LOCK
  // --------------------------------------------------------------------------
  private async acquireUserLock<T>(userId: string, action: () => Promise<T>): Promise<T> {
    while (userMutexLocks.has(userId)) {
      await userMutexLocks.get(userId);
    }

    let releaseLock: () => void;
    const lockPromise = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    userMutexLocks.set(userId, lockPromise);

    try {
      return await action();
    } finally {
      userMutexLocks.delete(userId);
      releaseLock!();
    }
  }

  // --------------------------------------------------------------------------
  // ATOMIC CREDIT RESERVATION
  // --------------------------------------------------------------------------
  async reserveCredits(
    userId: string,
    amount: number,
    operationType: string,
    referenceId?: string
  ): Promise<CreditReservation> {
    if (amount <= 0) {
      throw new ValidationError('Reservation amount must be positive');
    }

    return this.acquireUserLock(userId, async () => {
      const currentBalance = await creditsService.getBalance(userId);
      if (currentBalance < amount) {
        throw new InsufficientCreditsError(
          `Insufficient credits: Operation '${operationType}' requires ${amount} credits, but current balance is ${currentBalance}`
        );
      }

      // Deduct from balance atomically
      await creditsService.deductCredits(
        userId,
        amount,
        `Credit Reservation for ${operationType}`,
        referenceId
      );

      const reservationId = uuidv4();
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 15 * 60 * 1000).toISOString(); // 15 min reservation TTL

      const reservation: CreditReservation = {
        id: reservationId,
        userId,
        amount,
        reservedAmount: amount,
        operationType,
        referenceId,
        status: 'RESERVED',
        createdAt: now.toISOString(),
        expiresAt,
      };

      mockReservations.set(reservationId, reservation);

      logger.info(
        { userId, reservationId, amount, operationType, remainingBalance: currentBalance - amount },
        'Credits atomically reserved'
      );

      return reservation;
    });
  }

  // --------------------------------------------------------------------------
  // SETTLE CREDITS
  // --------------------------------------------------------------------------
  // SETTLE CREDITS
  // --------------------------------------------------------------------------
  async settleCredits(
    reservationIdOrUserId: string,
    actualCostOrReservationId: number | string,
    usageDetailsOrActualCost?: Partial<UsageRecord> | number | string,
    detailsParam?: any
  ): Promise<{ settled: boolean; settledCost: number; settledAmount: number; refundedCost: number; refundedAmount: number; newBalance: number }> {
    let reservationId = reservationIdOrUserId;
    let actualCost = Number(actualCostOrReservationId);
    let usageDetails: Partial<UsageRecord> | undefined = typeof usageDetailsOrActualCost === 'object' ? usageDetailsOrActualCost : undefined;

    if (!mockReservations.has(reservationIdOrUserId) && typeof actualCostOrReservationId === 'string' && mockReservations.has(actualCostOrReservationId)) {
      reservationId = actualCostOrReservationId;
      actualCost = Number(usageDetailsOrActualCost);
      usageDetails = typeof detailsParam === 'object' ? detailsParam : undefined;
    }

    const reservation = mockReservations.get(reservationId);
    if (!reservation) {
      throw new NotFoundError(`Reservation not found: ${reservationId}`);
    }

    if (reservation.status !== 'RESERVED') {
      throw new ValidationError(`Cannot settle reservation in '${reservation.status}' state`);
    }

    return this.acquireUserLock(reservation.userId, async () => {
      const now = new Date().toISOString();
      const reserved = reservation.reservedAmount;
      const finalCost = Math.max(0, Math.min(reserved, actualCost));
      const unusedRefund = reserved - finalCost;

      // If actual usage was less than reserved amount, refund difference atomically
      let currentBalance = await creditsService.getBalance(reservation.userId);
      if (unusedRefund > 0) {
        currentBalance = await creditsService.grantCredits(
          reservation.userId,
          unusedRefund,
          'reservation_refund',
          `Refund unused reservation (${unusedRefund} credits) for ${reservation.operationType}`
        );
      }

      reservation.status = 'SETTLED';
      reservation.settledAmount = finalCost;
      reservation.settledAt = now;
      mockReservations.set(reservationId, reservation);

      // Record detailed usage record
      const usageRecord: UsageRecord = {
        id: uuidv4(),
        userId: reservation.userId,
        projectId: usageDetails?.projectId,
        operationType: reservation.operationType,
        units: usageDetails?.units ?? 1,
        unitType: usageDetails?.unitType ?? 'operations',
        tokens: usageDetails?.tokens,
        costCredits: finalCost,
        timestamp: now,
        idempotencyKey: usageDetails?.idempotencyKey,
        metadata: usageDetails?.metadata,
      };
      mockUsageRecords.unshift(usageRecord);

      logger.info(
        {
          reservationId,
          userId: reservation.userId,
          finalCost,
          unusedRefund,
          newBalance: currentBalance,
        },
        'Credit reservation settled successfully'
      );

      return {
        settled: true,
        settledCost: finalCost,
        settledAmount: finalCost,
        refundedCost: unusedRefund,
        refundedAmount: unusedRefund,
        newBalance: currentBalance,
      };
    });
  }

  // --------------------------------------------------------------------------
  // REFUND RESERVATION
  // --------------------------------------------------------------------------
  async refundReservation(
    reservationIdOrUserId: string,
    reasonOrReservationId?: string,
    reasonParam = 'Operation cancelled or failed'
  ): Promise<{ refunded: boolean; refundedAmount: number; newBalance: number }> {
    let reservationId = reservationIdOrUserId;
    let reason = reasonOrReservationId || reasonParam;

    if (!mockReservations.has(reservationIdOrUserId) && typeof reasonOrReservationId === 'string' && mockReservations.has(reasonOrReservationId)) {
      reservationId = reasonOrReservationId;
      reason = reasonParam;
    }

    const reservation = mockReservations.get(reservationId);
    if (!reservation) {
      throw new NotFoundError(`Reservation not found: ${reservationId}`);
    }

    if (reservation.status !== 'RESERVED') {
      return { refunded: false, refundedAmount: 0, newBalance: await creditsService.getBalance(reservation.userId) };
    }

    return this.acquireUserLock(reservation.userId, async () => {
      const refundAmount = reservation.reservedAmount;
      const newBalance = await creditsService.grantCredits(
        reservation.userId,
        refundAmount,
        'reservation_refund',
        `Full refund for cancelled ${reservation.operationType}: ${reason}`
      );

      reservation.status = 'REFUNDED';
      reservation.settledAmount = 0;
      reservation.settledAt = new Date().toISOString();
      mockReservations.set(reservationId, reservation);

      logger.info({ reservationId, userId: reservation.userId, refundAmount, newBalance }, 'Credit reservation refunded in full');

      return {
        refunded: true,
        refundedAmount: refundAmount,
        newBalance,
      };
    });
  }

  // --------------------------------------------------------------------------
  // USAGE & CREDITS TELEMETRY
  // --------------------------------------------------------------------------
  async getUsageHistory(
    userId: string,
    query: { fromDate?: string; toDate?: string; operationType?: string; projectId?: string; limit?: number; offset?: number } = {}
  ): Promise<{ usage: UsageRecord[]; records: UsageRecord[]; totalCreditsConsumed: number; total: number }> {
    let records = mockUsageRecords.filter((r) => r.userId === userId);

    if (query.operationType) {
      records = records.filter((r) => r.operationType === query.operationType);
    }
    if (query.projectId) {
      records = records.filter((r) => r.projectId === query.projectId);
    }
    if (query.fromDate) {
      const from = new Date(query.fromDate).getTime();
      records = records.filter((r) => new Date(r.timestamp).getTime() >= from);
    }
    if (query.toDate) {
      const to = new Date(query.toDate).getTime();
      records = records.filter((r) => new Date(r.timestamp).getTime() <= to);
    }

    const totalCreditsConsumed = records.reduce((sum, r) => sum + r.costCredits, 0);
    const total = records.length;

    const limit = query.limit || 50;
    const offset = query.offset || 0;
    const paginated = records.slice(offset, offset + limit);

    return {
      usage: paginated,
      records: paginated,
      totalCreditsConsumed,
      total,
    };
  }

  async getCreditsStatus(userId: string): Promise<{
    balance: number;
    reservedCredits: number;
    availableCredits: number;
    lifetimeConsumed: number;
  }> {
    const balance = await creditsService.getBalance(userId);

    // Sum active reserved credits
    const userReservations = Array.from(mockReservations.values()).filter(
      (r) => r.userId === userId && r.status === 'RESERVED'
    );
    const reservedCredits = userReservations.reduce((sum, r) => sum + r.reservedAmount, 0);

    const userUsage = mockUsageRecords.filter((r) => r.userId === userId);
    const lifetimeConsumed = userUsage.reduce((sum, r) => sum + r.costCredits, 0);

    return {
      balance,
      reservedCredits,
      availableCredits: Math.max(0, balance),
      lifetimeConsumed,
    };
  }

  // --------------------------------------------------------------------------
  // PLANS & CHECKOUT
  // --------------------------------------------------------------------------
  getPlans(): BillingPlan[] {
    return BILLING_PLANS;
  }

  async createCheckoutSession(userId: string, userEmail: string, planId: string): Promise<CheckoutSession> {
    const normalized = planId.toLowerCase();
    const plan = BILLING_PLANS.find(
      (p) =>
        p.id === planId ||
        p.tier === normalized ||
        p.id === `plan_${normalized}` ||
        p.tier === normalized.replace(/^plan_/, '') ||
        (normalized === 'creator' && p.tier === 'pro')
    );
    if (!plan) {
      throw new NotFoundError(`Subscription plan not found: ${planId}`);
    }

    return this.paymentProvider.createCheckoutSession(userId, userEmail, plan.id);
  }

  // --------------------------------------------------------------------------
  // IDEMPOTENT WEBHOOK HANDLING
  // --------------------------------------------------------------------------
  async processWebhook(
    rawBody: string,
    signature: string,
    event: WebhookEventPayload
  ): Promise<{ handled: boolean; action: string; isDuplicate?: boolean }> {
    // 1. Verify cryptographic signature
    const isValid = this.paymentProvider.verifyWebhookSignature(rawBody, signature);
    if (!isValid) {
      throw new ValidationError('Invalid payment provider webhook signature');
    }

    // 2. Idempotency Check (prevent replay attacks)
    if (processedWebhookEvents.has(event.id)) {
      logger.info({ eventId: event.id }, 'Webhook event was already processed; returning idempotent 200');
      return { handled: true, action: 'ALREADY_PROCESSED', isDuplicate: true };
    }

    // 3. Mark processed
    processedWebhookEvents.add(event.id);

    // 4. Process event action
    if (event.type === 'checkout.session.completed') {
      const obj: any = (event.data as any)?.object || event.data;
      const targetUserId = obj.client_reference_id || obj.userId;
      const planId = obj.planId || 'plan_pro';
      const plan = BILLING_PLANS.find((p) => p.id === planId) || BILLING_PLANS[1];
      const creditAmount = obj.amountCredits || plan.monthlyCredits || 250;

      if (targetUserId) {
        await creditsService.grantCredits(
          targetUserId,
          creditAmount,
          'subscription_credit',
          `Allowance for ${plan.name}`
        );
      }
      return { handled: true, action: 'SUBSCRIPTION_PROVISIONED' };
    }

    return this.paymentProvider.processWebhookEvent(event);
  }
}

export const billingService = new BillingService();
