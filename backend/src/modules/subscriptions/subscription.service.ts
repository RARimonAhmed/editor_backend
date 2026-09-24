import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Connection } from 'typeorm';
import { Subscription, SubscriptionStatus } from './subscription.entity';
import { PlanService } from '../../config/plan.service'; // We'll create this service to read plans.json
import { SubscriptionProvider } from '../../payments/subscription.provider'; // abstract provider
import { StripeProvider } from '../../payments/stripe.provider'; // concrete implementation
import { CreditsService } from '../../credits/credits.service';

@Injectable()
export class SubscriptionService {
  private provider: SubscriptionProvider;

  constructor(
    @InjectRepository(Subscription)
    private readonly repo: Repository<Subscription>,
    private readonly conn: Connection,
    private readonly planService: PlanService,
    private readonly creditsService: CreditsService,
  ) {
    // For now instantiate StripeProvider; in production this could be injected via DI.
    this.provider = new StripeProvider();
  }

  async getSubscription(userId: string): Promise<Subscription> {
    const sub = await this.repo.findOne({ where: { userId } });
    if (!sub) throw new NotFoundException('Subscription not found');
    return sub;
  }

  /** Create a new subscription for a user */
  async createSubscription(userId: string, planId: string): Promise<Subscription> {
    const plan = await this.planService.getPlan(planId);
    if (!plan) throw new BadRequestException('Invalid plan');

    // atomic operation: create subscription record and grant credits
    return await this.conn.transaction(async (manager) => {
      const sub = manager.create(Subscription, {
        userId,
        planId,
        status: 'active' as SubscriptionStatus,
        providerCustomerId: undefined,
        periodStart: new Date(),
        periodEnd: undefined,
      });
      await manager.save(sub);

      // Grant initial credits defined in plan
      await this.creditsService.grantCredits(userId, plan.creditsPerPeriod, 'subscription_grant', `Plan ${planId} initial grant`);
      return sub;
    });
  }

  async cancelSubscription(userId: string): Promise<void> {
    const sub = await this.getSubscription(userId);
    if (sub.status === 'cancelled') return;
    await this.conn.transaction(async (manager) => {
      sub.status = 'cancelled';
      await manager.save(sub);
      // Optionally notify provider
      await this.provider.cancelSubscription(sub.providerCustomerId!);
    });
  }

  async changePlan(userId: string, newPlanId: string): Promise<Subscription> {
    const newPlan = await this.planService.getPlan(newPlanId);
    if (!newPlan) throw new BadRequestException('Invalid new plan');
    const sub = await this.getSubscription(userId);

    return await this.conn.transaction(async (manager) => {
      // simple implementation: just update planId and grant difference in credits if any
      const oldPlan = await this.planService.getPlan(sub.planId);
      const creditDiff = newPlan.creditsPerPeriod - (oldPlan?.creditsPerPeriod ?? 0);
      if (creditDiff > 0) {
        await this.creditsService.grantCredits(userId, creditDiff, 'subscription_grant', `Upgrade to ${newPlanId}`);
      }
      sub.planId = newPlanId;
      await manager.save(sub);
      // Provider side plan change – stubbed
      await this.provider.updatePlan(sub.providerCustomerId!, newPlanId);
      return sub;
    });
  }

  /** Called by webhook handling to reconcile status */
  async syncFromProvider(event: any): Promise<void> {
    // Example payload: {type: 'customer.subscription.updated', data: {object: {id, status, plan}}}
    const subId = event.data.object.id;
    const sub = await this.repo.findOne({ where: { providerCustomerId: subId } });
    if (!sub) return; // unknown, ignore
    const statusMap: Record<string, SubscriptionStatus> = {
      active: 'active',
      trialing: 'trialing',
      past_due: 'past_due',
      canceled: 'cancelled',
      incomplete: 'past_due',
    };
    const newStatus = statusMap[event.data.object.status] as SubscriptionStatus;
    if (newStatus && sub.status !== newStatus) {
      sub.status = newStatus;
      await this.repo.save(sub);
    }
  }
}
