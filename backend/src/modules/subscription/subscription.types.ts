// Subscription domain types
export type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'cancelled' | 'expired';

export interface Subscription {
  id: string;
  userId: string;
  planId: string;
  status: SubscriptionStatus;
  providerCustomerId?: string;
  periodStart: string; // ISO date
  periodEnd: string;   // ISO date
}
