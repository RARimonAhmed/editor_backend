import { FastifyRequest, FastifyReply } from 'fastify';
import { billingService } from './billing.service.js';
import { checkoutSessionSchema, usageQuerySchema, webhookPayloadSchema } from './billing.schemas.js';
import { createSuccessResponse } from '../../core/response.js';
import { ValidationError } from '../../core/errors.js';

export class BillingController {
  /**
   * GET /v1/billing/usage
   * Aggregated usage records and credit consumption history.
   */
  async getUsage(request: FastifyRequest, reply: FastifyReply) {
    const parse = usageQuerySchema.safeParse(request.query);
    if (!parse.success) {
      throw new ValidationError('Invalid usage query parameters', parse.error.format());
    }

    const userId = request.user!.userId;
    const history = await billingService.getUsageHistory(userId, parse.data);
    return reply.status(200).send(createSuccessResponse(history));
  }

  /**
   * GET /v1/billing/credits
   * Detailed wallet status, reserved credits, and available balance.
   */
  async getCredits(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.user!.userId;
    const status = await billingService.getCreditsStatus(userId);
    return reply.status(200).send(createSuccessResponse(status));
  }

  /**
   * GET /v1/billing/plans
   * Available subscription tiers and credit allocations.
   */
  async getPlans(_request: FastifyRequest, reply: FastifyReply) {
    const plans = billingService.getPlans();
    return reply.status(200).send(createSuccessResponse(plans));
  }

  /**
   * POST /v1/billing/checkout
   * Initiates payment provider checkout session.
   */
  async createCheckout(request: FastifyRequest, reply: FastifyReply) {
    const parse = checkoutSessionSchema.safeParse(request.body);
    if (!parse.success) {
      throw new ValidationError('Invalid checkout parameters', parse.error.format());
    }

    const user = request.user!;
    const targetPlanId = parse.data.planId || parse.data.planTier || 'plan_pro';
    const session = await billingService.createCheckoutSession(user.userId, user.email, targetPlanId);
    return reply.status(200).send(createSuccessResponse(session));
  }

  /**
   * POST /v1/billing/webhook
   * Idempotent payment provider webhook processor.
   */
  async handleWebhook(request: FastifyRequest, reply: FastifyReply) {
    const signature = (request.headers['stripe-signature'] || request.headers['x-webhook-signature'] || '') as string;
    const rawBody = typeof request.body === 'string' ? request.body : JSON.stringify(request.body);

    const parse = webhookPayloadSchema.safeParse(request.body);
    if (!parse.success) {
      throw new ValidationError('Invalid webhook payload structure', parse.error.format());
    }

    const rawData = parse.data.data as Record<string, any>;
    const dataObj = ('object' in rawData && rawData.object) ? rawData : { object: rawData, ...rawData };
    const result = await billingService.processWebhook(rawBody, signature, {
      id: parse.data.id,
      type: parse.data.type,
      data: dataObj,
      createdAt: parse.data.createdAt || new Date().toISOString(),
    });

    return reply.status(200).send({
      success: true,
      processed: result.handled,
      duplicate: result.isDuplicate ?? false,
      data: result,
    });
  }
}

export const billingController = new BillingController();
