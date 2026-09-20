import { v4 as uuidv4 } from 'uuid';
import {
  AdminUserView,
  AdminProjectView,
  AdminUsageReport,
  AdminAuditLogEntry,
} from './admin.types.js';
import { mockUsers } from '../auth/auth.service.js';
import { mockProjects } from '../projects/projects.service.js';
import { mockAIJobs, aiJobService } from '../ai/jobs/ai-job.service.js';
import { mockCreditBalances, mockCreditLedger } from '../credits/credits.service.js';
import { BILLING_PLANS } from '../credits/billing.service.js';
import { NotFoundError } from '../../core/errors.js';
import { logger } from '../../core/logger.js';

// In-memory audit log ledger
export const mockAuditLogs: AdminAuditLogEntry[] = [];

export class AdminService {
  /**
   * List platform users with balances and subscriptions
   */
  async listUsers(limit = 50, offset = 0, search?: string): Promise<{ users: AdminUserView[]; total: number }> {
    let all: any[] = Array.from(mockUsers.values());

    if (search) {
      const q = search.toLowerCase();
      all = all.filter((u: any) => u.email?.toLowerCase().includes(q) || u.id.includes(q));
    }

    const total = all.length;
    const paginated: AdminUserView[] = all.slice(offset, offset + limit).map((u: any) => {
      const balance = mockCreditBalances.get(u.id);
      return {
        id: u.id,
        email: u.email,
        role: u.role || 'USER',
        status: u.status || 'active',
        creditBalance: balance !== undefined ? balance : 100,
        subscriptionTier: u.subscriptionTier || 'free',
        createdAt: u.createdAt || new Date().toISOString(),
        lastLoginAt: u.lastLoginAt,
      };
    });

    return { users: paginated, total };
  }

  /**
   * List platform projects with size and track telemetry
   */
  async listProjects(limit = 50, offset = 0, status?: string): Promise<{ projects: AdminProjectView[]; total: number }> {
    let all: any[] = Array.from(mockProjects.values());

    if (status) {
      all = all.filter((p: any) => p.status === status);
    }

    const total = all.length;
    const paginated: AdminProjectView[] = all.slice(offset, offset + limit).map((p: any) => ({
      id: p.id,
      title: p.title,
      ownerId: p.userId,
      status: p.status,
      version: p.version,
      durationSeconds: p.timeline?.duration || 0,
      tracksCount: p.timeline?.tracks?.length || 0,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }));

    return { projects: paginated, total };
  }

  /**
   * List all AI and background jobs across users
   */
  async listJobs(limit = 50, offset = 0, status?: string, type?: string) {
    let all: any[] = Array.from(mockAIJobs.values());

    if (status) {
      all = all.filter((j: any) => j.status === status);
    }
    if (type) {
      all = all.filter((j: any) => j.type === type);
    }

    // Sort newest first
    all.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const total = all.length;
    return { jobs: all.slice(offset, offset + limit), total };
  }

  /**
   * List failed and dead-lettered jobs
   */
  async listFailedJobs(limit = 50, offset = 0) {
    const allFailed = Array.from(mockAIJobs.values())
      .filter((j: any) => j.status === 'FAILED')
      .sort((a: any, b: any) => new Date(b.completedAt || b.createdAt).getTime() - new Date(a.completedAt || a.createdAt).getTime());

    return {
      failedJobs: allFailed.slice(offset, offset + limit),
      total: allFailed.length,
    };
  }

  /**
   * Admin-initiated retry of a failed job
   */
  async retryFailedJob(jobId: string, adminUserId: string) {
    const job = mockAIJobs.get(jobId);
    if (!job) {
      throw new NotFoundError(`Job not found: ${jobId}`);
    }

    const retried = await aiJobService.retryJob(jobId, job.userId);
    this.recordAuditLog('JOB_RETRIED', adminUserId, { jobId, previousStatus: 'FAILED' });
    return retried;
  }

  /**
   * System-wide AI usage and credit consumption telemetry
   */
  async getUsageReport(): Promise<AdminUsageReport> {
    const allJobs: any[] = Array.from(mockAIJobs.values());
    const totalCredits = allJobs.reduce((sum: number, j: any) => sum + (j.cost || 0), 0);

    const opMap = new Map<string, { count: number; credits: number }>();
    for (const job of allJobs) {
      const current = opMap.get(job.type) || { count: 0, credits: 0 };
      current.count++;
      current.credits += job.cost || 0;
      opMap.set(job.type, current);
    }

    const topOperations = Array.from(opMap.entries())
      .map(([operation, data]) => ({ operation, count: data.count, credits: data.credits }))
      .sort((a, b) => b.count - a.count);

    return {
      period: 'all-time',
      totalAiJobs: allJobs.length,
      totalCreditsConsumed: totalCredits,
      totalExportsCompleted: allJobs.filter((j: any) => j.type === 'render_export' && j.status === 'COMPLETED').length,
      activeUsersCount: mockUsers.size,
      topOperations,
    };
  }

  /**
   * Subscription and plan distribution report
   */
  async getSubscriptionsReport() {
    const users: any[] = Array.from(mockUsers.values());
    const tiers: Record<string, number> = { free: 0, pro: 0, studio: 0 };

    for (const u of users) {
      const tier = u.subscriptionTier || 'free';
      tiers[tier] = (tiers[tier] || 0) + 1;
    }

    const mrrEstimate = (tiers['pro'] || 0) * 19 + (tiers['studio'] || 0) * 49;

    return {
      totalSubscribers: users.length,
      tierBreakdown: tiers,
      estimatedMrrUsd: mrrEstimate,
      availablePlans: BILLING_PLANS,
    };
  }

  /**
   * System-wide credit issuance vs redemption stats
   */
  async getCreditsTelemetry() {
    const balances = Array.from(mockCreditBalances.values());
    const totalCirculatingBalance = balances.reduce((acc: number, b: number) => acc + b, 0);
    const ledger = mockCreditLedger;

    return {
      totalWallets: mockCreditBalances.size,
      totalCirculatingCredits: totalCirculatingBalance,
      totalTransactionsRecorded: ledger.length,
    };
  }

  /**
   * List security audit logs
   */
  listAuditLogs(limit = 50, offset = 0): { logs: AdminAuditLogEntry[]; total: number } {
    const total = mockAuditLogs.length;
    const sorted = [...mockAuditLogs].reverse();
    return { logs: sorted.slice(offset, offset + limit), total };
  }

  /**
   * Records a security audit event
   */
  recordAuditLog(action: string, actorId: string, details?: Record<string, any>, targetId?: string) {
    const entry: AdminAuditLogEntry = {
      id: uuidv4(),
      action,
      actorId,
      targetId,
      timestamp: new Date().toISOString(),
      details,
    };
    mockAuditLogs.push(entry);
    logger.info({ action, actorId, targetId }, 'Security audit log recorded');
    return entry;
  }
}

export const adminService = new AdminService();
