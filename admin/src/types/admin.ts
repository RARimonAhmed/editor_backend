export type SystemProbeStatus = 'HEALTHY' | 'DEGRADED' | 'DOWN';

export interface SystemProbe {
  service: string;
  status: SystemProbeStatus;
  latencyMs: number;
  lastChecked: string;
  details?: Record<string, unknown>;
}

export interface AdminSystemHealthReport {
  overallStatus: SystemProbeStatus;
  probes: Record<string, SystemProbe>;
  memoryUsageMb: {
    rss: number;
    heapTotal: number;
    heapUsed: number;
    external: number;
  };
  uptimeSeconds: number;
  timestamp: string;
}

export interface AdminStatsOverview {
  totalUsers: number;
  activeUsers: number;
  totalProjects: number;
  totalMediaAssets: number;
  storageUsageBytes: number;
  totalAiJobs: number;
  completedAiJobs: number;
  failedAiJobs: number;
  totalRenderJobs: number;
  completedRenderJobs: number;
  failedRenderJobs: number;
  totalCreditsConsumed: number;
  activeSubscriptions: number;
  recentActivity: Array<{
    id: string;
    type: string;
    title: string;
    timestamp: string;
    status: string;
    actor?: string;
  }>;
}

export interface AdminChartsReport {
  usersGrowth: Array<{ date: string; value: number }>;
  projectsCreated: Array<{ date: string; value: number }>;
  aiJobsVolume: Array<{ date: string; value: number }>;
  renderJobsVolume: Array<{ date: string; value: number }>;
  creditsConsumption: Array<{ date: string; value: number }>;
  storageGrowthMb: Array<{ date: string; value: number }>;
  jobSuccessVsFailure: {
    completed: number;
    failed: number;
    cancelled: number;
  };
}

export interface AdminUserView {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string | null;
  role: string;
  status: string;
  creditBalance: number;
  projectsCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminProjectView {
  id: string;
  title: string;
  userId: string;
  width: number;
  height: number;
  fps: number;
  durationSeconds: number;
  tracksCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminMediaView {
  id: string;
  userId: string;
  projectId?: string;
  fileName: string;
  fileSizeBytes: number;
  mimeType: string;
  category: 'video' | 'audio' | 'image' | 'other';
  durationSeconds?: number;
  width?: number;
  height?: number;
  status: string;
  createdAt: string;
}

export interface AdminCommentView {
  id: string;
  projectId: string;
  userId: string;
  authorName: string;
  text: string;
  timecodeSeconds?: number;
  trackId?: string;
  createdAt: string;
}

export interface AdminAuditLogEntry {
  id: string;
  action: string;
  actorId: string;
  targetId?: string;
  timestamp: string;
  details?: Record<string, unknown>;
}

export interface AdminJobView {
  id: string;
  userId: string;
  projectId?: string;
  jobType: string;
  status: string;
  progress: number;
  creditCost: number;
  payload: Record<string, unknown>;
  result?: Record<string, unknown>;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdminAIJobView {
  id: string;
  userId: string;
  projectId?: string;
  type: string;
  provider: string;
  model: string;
  status: string;
  prompt?: string;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCostUsd?: number;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdminSubscriptionView {
  id: string;
  userId: string;
  tier: string;
  status: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  priceUsd: number;
  interval: string;
}

export interface AdminCreditTransactionView {
  id: string;
  userId: string;
  amount: number;
  type: string;
  description: string;
  createdAt: string;
}
