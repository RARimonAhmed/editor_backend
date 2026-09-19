export interface SubscriptionPlan {
  id: string;
  name: string;
  tier: 'free' | 'pro' | 'studio';
  priceMonthly: number;
  monthlyCredits: number;
  features: string[];
  maxExportResolution: '1080p' | '4k' | '8k';
  cloudStorageGb: number;
}

export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    id: 'plan_free',
    name: 'Free Creator',
    tier: 'free',
    priceMonthly: 0,
    monthlyCredits: 50,
    features: ['1080p 30fps export', 'Standard AI Transcription', '2GB Cloud Storage', 'Watermark-free exports'],
    maxExportResolution: '1080p',
    cloudStorageGb: 2,
  },
  {
    id: 'plan_pro',
    name: 'Pro Editor',
    tier: 'pro',
    priceMonthly: 19,
    monthlyCredits: 500,
    features: [
      '4K 60fps export',
      'Unlimited Whisper AI subtitles',
      'Smart Silence Cut',
      '50GB Cloud Storage',
      'Realtime multi-device sync',
    ],
    maxExportResolution: '4k',
    cloudStorageGb: 50,
  },
  {
    id: 'plan_studio',
    name: 'Studio Team',
    tier: 'studio',
    priceMonthly: 49,
    monthlyCredits: 2000,
    features: [
      '8K HDR ProRes export',
      'Priority GPU render queue',
      'Team multiplayer collaboration',
      '500GB Cloud Storage',
      'Custom AI Voice cloning',
    ],
    maxExportResolution: '8k',
    cloudStorageGb: 500,
  },
];

export class SubscriptionsService {
  getPlans(): SubscriptionPlan[] {
    return SUBSCRIPTION_PLANS;
  }

  async getUserSubscription(userId: string) {
    return {
      userId,
      tier: 'free',
      status: 'active',
      plan: SUBSCRIPTION_PLANS[0],
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      cancelAtPeriodEnd: false,
    };
  }
}

export const subscriptionsService = new SubscriptionsService();
