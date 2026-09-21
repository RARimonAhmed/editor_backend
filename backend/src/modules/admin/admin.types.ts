export interface AdminUserView {
  id: string;
  displayName: string;
  email: string;
  role: string;
  status: string;
  creditBalance: number;
  subscriptionTier: string;
  projectsCount: number;
  createdAt: string;
  updatedAt?: string;
  lastLoginAt?: string;
  avatarUrl?: string | null;
}

export interface AdminUserSessionView {
  id: string;
  deviceId?: string;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  isRevoked: boolean;
  isActive: boolean;
}

export interface AdminUserDetailView {
  profile: {
    id: string;
    displayName: string;
    email: string;
    avatarUrl: string | null;
    role: string;
    status: string;
    emailVerified: boolean;
    createdAt: string;
    updatedAt: string;
    lastLoginAt?: string;
    bio?: string | null;
    timezone?: string;
    locale?: string;
    preferences?: Record<string, any>;
  };
  sessions: AdminUserSessionView[];
  projects: AdminProjectView[];
  mediaUsage: {
    totalFiles: number;
    totalBytes: number;
    videoCount: number;
    audioCount: number;
    imageCount: number;
    files: AdminMediaView[];
  };
  aiUsage: {
    totalJobs: number;
    totalTokens: number;
    estimatedCostUsd: number;
    recentJobs: any[];
  };
  creditTransactions: {
    balance: number;
    transactions: any[];
  };
  subscription: {
    tier: string;
    status: string;
    cancelAtPeriodEnd: boolean;
    currentPeriodEnd?: string;
    priceUsd?: number;
    interval?: string;
  };
  auditActivity: AdminAuditLogEntry[];
}

export interface AdminUsersQueryParams {
  search?: string;
  role?: string;
  status?: string;
  subscription?: string;
  createdFrom?: string;
  createdTo?: string;
  sortBy?: 'created' | 'createdAt' | 'lastActive' | 'lastLoginAt' | 'name' | 'displayName';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
  limit?: number;
  offset?: number;
}

export interface AdminProjectView {
  id: string;
  title: string;
  ownerId: string;
  status: string;
  version: number;
  durationSeconds: number;
  tracksCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminUsageReport {
  period: string;
  totalAiJobs: number;
  totalCreditsConsumed: number;
  totalExportsCompleted: number;
  activeUsersCount: number;
  topOperations: { operation: string; count: number; credits: number }[];
}

export interface AdminAuditLogEntry {
  id: string;
  action: string;
  actorId: string;
  actorEmail?: string;
  targetId?: string;
  targetType?: string;
  ipAddress?: string;
  timestamp: string;
  details?: Record<string, any>;
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
  totalCirculatingCredits: number;
  activeSubscriptions: {
    free: number;
    pro: number;
    studio: number;
  };
  recentActivity: {
    id: string;
    type: string;
    title: string;
    timestamp: string;
    status?: string;
    actor?: string;
  }[];
}

export interface AdminTimeSeriesPoint {
  date: string;
  value: number;
  secondaryValue?: number;
}

export interface AdminChartsReport {
  usersOverTime: AdminTimeSeriesPoint[];
  usersGrowth?: AdminTimeSeriesPoint[];
  projectsOverTime: AdminTimeSeriesPoint[];
  projectsCreated?: AdminTimeSeriesPoint[];
  mediaProcessingOverTime: AdminTimeSeriesPoint[];
  aiJobsOverTime: AdminTimeSeriesPoint[];
  aiJobsVolume?: AdminTimeSeriesPoint[];
  renderJobsOverTime: AdminTimeSeriesPoint[];
  renderJobsVolume?: AdminTimeSeriesPoint[];
  storageOverTime: AdminTimeSeriesPoint[];
  storageGrowthMb?: AdminTimeSeriesPoint[];
  creditsUsageOverTime: AdminTimeSeriesPoint[];
  creditsConsumption?: AdminTimeSeriesPoint[];
  jobSuccessVsFailure?: {
    completed: number;
    failed: number;
    cancelled: number;
  };
}

export type SystemProbeStatus = 'HEALTHY' | 'DEGRADED' | 'DOWN';

export interface SystemProbeResult {
  service: string;
  status: SystemProbeStatus;
  latencyMs: number;
  details?: Record<string, any>;
  lastChecked: string;
}

export interface AdminSystemHealthReport {
  overall: SystemProbeStatus;
  overallStatus?: SystemProbeStatus;
  probes: Record<string, SystemProbeResult>;
  uptimeSeconds: number;
  memoryUsageMb: {
    rss: number;
    heapUsed: number;
    heapTotal: number;
    external?: number;
  };
  timestamp?: string;
}

export interface AdminMediaView {
  id: string;
  userId: string;
  name: string;
  mimeType: string;
  fileSizeBytes: number;
  durationSeconds?: number;
  width?: number;
  height?: number;
  status: string;
  hasWaveform: boolean;
  hasThumbnail: boolean;
  createdAt: string;
}

export interface AdminCommentView {
  id: string;
  projectId: string;
  userId: string;
  authorName?: string;
  text: string;
  timecodeSeconds?: number;
  trackId?: string;
  resolved: boolean;
  createdAt: string;
}
