import { db } from '../database/client.js';
import { redisService } from '../services/redis/index.js';
import { storageService } from '../services/storage/index.js';
import { jobQueue } from '../services/queue/index.js';

export interface SystemMetrics {
  timestamp: string;
  uptimeSeconds: number;
  memory: {
    rssBytes: number;
    heapUsedBytes: number;
    heapTotalBytes: number;
  };
  http: {
    totalRequests: number;
    activeRequests: number;
    errorRatePercent: number;
  };
  queues: {
    activeJobs: number;
    waitingJobs: number;
    failedJobs: number;
    completedJobs: number;
  };
  dependencies: {
    database: 'healthy' | 'degraded';
    redis: 'healthy' | 'degraded';
    storage: 'healthy' | 'degraded';
  };
  ai: {
    totalInferences: number;
    tokensConsumed: number;
    providerFailures: number;
  };
}

export class MetricsService {
  private totalRequests = 0;
  private activeRequests = 0;
  private totalErrors = 0;
  private totalInferences = 0;
  private totalTokens = 0;
  private providerFailures = 0;

  recordRequestStart() {
    this.totalRequests++;
    this.activeRequests++;
  }

  recordRequestEnd(isError = false) {
    this.activeRequests = Math.max(0, this.activeRequests - 1);
    if (isError) this.totalErrors++;
  }

  recordAiInference(tokens = 0, failed = false) {
    this.totalInferences++;
    this.totalTokens += tokens;
    if (failed) this.providerFailures++;
  }

  async getMetrics(): Promise<SystemMetrics> {
    const mem = process.memoryUsage();
    const dbOk = await db.isHealthy().catch(() => false);
    const redisOk = await redisService.isHealthy().catch(() => false);
    const storageOk = await storageService.isHealthy().catch(() => false);

    // Queue depths
    const jq = jobQueue as any;
    const activeJobs = jq.getActiveCount ? await jq.getActiveCount() : 0;
    const waitingJobs = jq.getWaitingCount ? await jq.getWaitingCount() : 0;
    const failedJobs = jq.getFailedCount ? await jq.getFailedCount() : 0;
    const completedJobs = jq.getCompletedCount ? await jq.getCompletedCount() : 0;

    const errorRatePercent =
      this.totalRequests > 0 ? Number(((this.totalErrors / this.totalRequests) * 100).toFixed(2)) : 0;

    return {
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      memory: {
        rssBytes: mem.rss,
        heapUsedBytes: mem.heapUsed,
        heapTotalBytes: mem.heapTotal,
      },
      http: {
        totalRequests: this.totalRequests,
        activeRequests: this.activeRequests,
        errorRatePercent,
      },
      queues: {
        activeJobs,
        waitingJobs,
        failedJobs,
        completedJobs,
      },
      dependencies: {
        database: dbOk ? 'healthy' : 'degraded',
        redis: redisOk ? 'healthy' : 'degraded',
        storage: storageOk ? 'healthy' : 'degraded',
      },
      ai: {
        totalInferences: this.totalInferences,
        tokensConsumed: this.totalTokens,
        providerFailures: this.providerFailures,
      },
    };
  }
}

export const metricsService = new MetricsService();
