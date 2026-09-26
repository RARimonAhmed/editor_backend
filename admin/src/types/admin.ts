export type SystemProbeStatus = 'HEALTHY' | 'DEGRADED' | 'DOWN';

export interface SystemProbe {
  service: string;
  status: SystemProbeStatus;
  latencyMs: number;
  lastChecked: string;
  errorSummary?: string | null;
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
  activeSubscriptions: number | { free: number; pro: number; studio: number };
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
  subscriptionTier: string;
  projectsCount: number;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
}

export interface UserSessionView {
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
  sessions: UserSessionView[];
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

export interface PaginatedUsersResponse {
  users: AdminUserView[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface AdminProjectView {
  id: string;
  title: string;
  userId?: string;
  ownerId: string;
  ownerName?: string;
  ownerEmail?: string;
  status: string;
  version: number;
  width?: number;
  height?: number;
  fps?: number;
  durationSeconds: number;
  tracksCount: number;
  estimatedSizeBytes: number;
  assetCount: number;
  resolution: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedProjectsResponse {
  projects: AdminProjectView[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface AdminProjectDetailView {
  project: AdminProjectView;
  metadata: Record<string, any>;
  versions: Array<{
    id: string;
    versionNumber: number;
    changeSummary: string;
    isAutoSave: boolean;
    deviceName?: string;
    createdAt: string;
  }>;
  members: Array<{
    userId: string;
    role: string;
    name?: string;
    email?: string;
    status: string;
    invitedAt?: string;
  }>;
  permissions: Record<string, string[]>;
  comments: AdminCommentView[];
  assets: Array<{
    id: string;
    name: string;
    category?: string;
    fileSizeBytes: number;
    fileKey?: string;
    mimeType?: string;
  }>;
  activity: AdminAuditLogEntry[];
  snapshots: Array<{
    id: string;
    name: string;
    versionNumber: number;
    description?: string;
    createdAt: string;
    createdBy: string;
    createdByName?: string;
  }>;
}

export interface AdminMediaView {
  id: string;
  userId: string;
  ownerId?: string;
  ownerName?: string;
  ownerEmail?: string;
  projectId?: string;
  name: string;
  fileName: string;
  fileSizeBytes: number;
  mimeType: string;
  category: 'video' | 'audio' | 'image' | 'other';
  durationSeconds?: number;
  width?: number;
  height?: number;
  resolution?: string;
  status: string;
  storageObject?: {
    fileKey: string;
    bucket: string;
    driver: string;
    exists: boolean;
  };
  hasWaveform?: boolean;
  hasThumbnail?: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface PaginatedMediaResponse {
  media: AdminMediaView[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface AdminMediaDetailView {
  asset: AdminMediaView;
  downloadUrl?: string;
  metadata: Record<string, any>;
  thumbnail: {
    available: boolean;
    exists?: boolean;
    fileKey?: string;
    url?: string;
    strip?: any[];
  };
  waveform: {
    available: boolean;
    exists?: boolean;
    fileKey?: string;
    url?: string;
    sampleCount?: number;
  };
  proxy: {
    available: boolean;
    exists?: boolean;
    fileKey?: string;
    url?: string;
    resolution?: string;
  };
  processingJobs: Array<{
    id: string;
    type: string;
    status: string;
    attempts: number;
    error?: string;
    createdAt: string;
  }>;
  storage: {
    bucket: string;
    fileKey: string;
    driver: string;
    exists: boolean;
    sizeBytes: number;
    downloadUrl?: string;
  };
  checksum: {
    algorithm?: string;
    expected?: string;
    sha256?: string;
    md5?: string;
  };
  auditActivity: AdminAuditLogEntry[];
}

export interface AdminCommentView {
  id: string;
  projectId: string;
  userId: string;
  authorName?: string;
  text: string;
  timecodeSeconds?: number;
  trackId?: string;
  resolved?: boolean;
  createdAt: string;
}

export interface AdminAuditLogEntry {
  id: string;
  action: string;
  actorId: string;
  actorEmail?: string;
  resource?: string;
  resourceId?: string;
  targetId?: string;
  targetType?: string;
  ipAddress?: string;
  result?: 'SUCCESS' | 'FAILED' | 'DENIED' | string;
  timestamp: string;
  details?: Record<string, unknown>;
}

export type AdminJobStatus =
  | 'QUEUED'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'RETRYING';

export interface AdminJobView {
  id: string;
  type: string;
  ownerId: string;
  ownerName?: string;
  ownerEmail?: string;
  projectId?: string;
  projectTitle?: string;
  status: AdminJobStatus;
  progress: number;
  worker: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  durationSeconds?: number;
  retryCount: number;
  error?: string;
  result?: any;
  payload?: any;
}

export interface AdminJobQueryParams {
  search?: string;
  status?: string;
  type?: string;
  owner?: string;
  project?: string;
  createdFrom?: string;
  createdTo?: string;
  sortBy?: 'created' | 'createdAt' | 'started' | 'startedAt' | 'duration' | 'progress' | 'type';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
  limit?: number;
  offset?: number;
}

export interface AdminJobMetrics {
  totalJobs: number;
  runningJobs: number;
  queuedJobs: number;
  completedJobs: number;
  failedJobs: number;
  cancelledJobs: number;
  retryingJobs: number;
  failureRatePercentage: number;
  averageDurationSeconds: number;
  queueDepth: number;
}

export interface AdminJobDetailView {
  job: AdminJobView;
  logs: Array<{
    timestamp: string;
    level: 'info' | 'warn' | 'error' | 'debug';
    message: string;
    step?: string;
  }>;
  workerNode?: {
    id: string;
    ip?: string;
    concurrency?: number;
    memoryUsageMb?: number;
  };
  errorDetails?: {
    message: string;
    stackTrace?: string;
    code?: string;
    occurredAt?: string;
  };
  steps?: Array<{
    name: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    durationMs?: number;
  }>;
  auditActivity: AdminAuditLogEntry[];
}

export interface AdminAIJobDetailView {
  id: string;
  job: AdminJobView;
  provider: string;
  model: string;
  jobType: string;
  input: {
    prompt?: string;
    parameters?: Record<string, any>;
    sourceFileKey?: string;
    mimeType?: string;
  };
  outputReference?: {
    text?: string;
    fileKey?: string;
    downloadUrl?: string;
    mimeType?: string;
    artifacts?: any[];
  };
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  estimatedCostUsd: number;
  actualCostCredits: number;
  durationMs?: number;
  error?: string;
  retryHistory: Array<{
    attemptNumber: number;
    timestamp: string;
    error?: string;
    worker?: string;
  }>;
  auditActivity: AdminAuditLogEntry[];
}

export interface AdminRenderJobDetailView {
  id: string;
  job: AdminJobView;
  projectId: string;
  projectTitle: string;
  canvas: {
    resolutionWidth: number;
    resolutionHeight: number;
    framerate: number;
    aspectRatio: string;
  };
  resolution: string;
  fps: number;
  codec: string;
  exportSettings: {
    format: string;
    quality: string;
    videoBitrateKbps?: number;
    audioBitrateKbps?: number;
    audioCodec?: string;
    preset?: string;
  };
  durationSeconds: number;
  worker: {
    id: string;
    node: string;
    processId?: number;
  };
  outputObject?: {
    fileKey: string;
    bucket: string;
    downloadUrl?: string;
    fileSizeBytes?: number;
  };
  progress: number;
  framesRendered?: number;
  totalFrames?: number;
  error?: string;
  auditActivity: AdminAuditLogEntry[];
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

export interface AdminCreditWalletView {
  userId: string;
  email: string;
  name?: string;
  balance: number;
  subscriptionTier: string;
  lastActive: string;
  totalConsumed: number;
  totalIssued: number;
}

export interface AdminSuspiciousCreditFailure {
  id: string;
  userId: string;
  userEmail?: string;
  reason: string;
  timestamp: string;
  attemptedAmount: number;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  anomalyType: 'INSUFFICIENT_CREDITS' | 'BURST_ATTEMPT' | 'NEGATIVE_EXPLOIT' | 'REVOKED_WALLET';
}

export interface AdminCreditsTelemetryReport {
  totalIssued: number;
  totalConsumed: number;
  totalRefunded: number;
  totalCirculatingCredits: number;
  totalWallets: number;
  wallets: AdminCreditWalletView[];
  balances: Array<{ userId: string; email: string; balance: number }>;
  ledger: AdminCreditTransactionView[];
  suspiciousFailures: AdminSuspiciousCreditFailure[];
}

export interface AdminWebhookStatusReport {
  status: 'HEALTHY' | 'DEGRADED' | 'DOWN';
  endpoint: string;
  lastEventReceived: string;
  lastEventType: string;
  pendingEvents: number;
  failureCount: number;
  latencyMs: number;
}

export interface AdminSubscriptionsReport {
  totalSubscribers: number;
  tierBreakdown: {
    free: number;
    pro: number;
    studio: number;
  };
  statusBreakdown: {
    active: number;
    trialing: number;
    cancelled: number;
    expired: number;
  };
  estimatedMrrUsd: number;
  webhookStatus: AdminWebhookStatusReport;
  availablePlans: any[];
  subscriptions: AdminSubscriptionView[];
}

export interface AdminOperationalSettings {
  server: {
    nodeEnv: string;
    host: string;
    port: number;
    corsOrigins: string[];
    rateLimitMax: number;
    rateLimitWindowMs: number;
    logLevel: string;
  };
  database: {
    driver: 'postgresql';
    host: string;
    port: number;
    databaseName: string;
    poolSize: number;
    ssl: boolean;
    authConfigured: boolean;
    status: 'CONFIGURED' | 'MISSING';
  };
  redis: {
    host: string;
    port: number;
    clusterMode: boolean;
    tls: boolean;
    authConfigured: boolean;
    status: 'CONFIGURED' | 'FALLBACK_MEMORY';
  };
  storage: {
    driver: string;
    bucket: string;
    region: string;
    endpoint: string;
    credentialsStatus: 'CONFIGURED' | 'MISSING';
    presignedUrlExpirySeconds: number;
  };
  aiGateway: {
    geminiStatus: 'CONFIGURED' | 'MISSING';
    geminiModel: string;
    openaiStatus: 'CONFIGURED' | 'MISSING';
    openaiModel: string;
    anthropicStatus: 'CONFIGURED' | 'MISSING';
    runwayStatus: 'CONFIGURED' | 'MISSING';
    automaticFailover: boolean;
  };
  billing: {
    stripeStatus: 'CONFIGURED' | 'MISSING';
    webhookSecretStatus: 'CONFIGURED' | 'MISSING';
    defaultTrialCredits: number;
    creditRatioUsd: number;
  };
  security: {
    jwtAlgorithm: string;
    jwtSecretStatus: 'CONFIGURED' | 'DEFAULT_DEV';
    adminApiKeyStatus: 'CONFIGURED' | 'UNPROTECTED';
    sessionTtlMinutes: number;
    csrfProtection: boolean;
  };
  mediaProcessing: {
    ffmpegPath: string;
    ffprobePath: string;
    maxUploadSizeBytes: number;
    maxConcurrency: number;
    hardwareAcceleration: string;
    supportedFormats: string[];
  };
}

export interface UpdateOperationalSettingsDto {
  rateLimitMax?: number;
  rateLimitWindowMs?: number;
  logLevel?: string;
  presignedUrlExpirySeconds?: number;
  automaticFailover?: boolean;
  defaultTrialCredits?: number;
  maxUploadSizeBytes?: number;
  maxConcurrency?: number;
}

