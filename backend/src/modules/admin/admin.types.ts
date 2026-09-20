export interface AdminUserView {
  id: string;
  email: string;
  role: string;
  status: string;
  creditBalance: number;
  subscriptionTier: string;
  createdAt: string;
  lastLoginAt?: string;
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
