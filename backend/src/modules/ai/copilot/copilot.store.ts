import { v4 as uuidv4 } from 'uuid';
import { db } from '../../../database/client.js';
import { EditorCommandPlan } from './copilot.types.js';
import { logger } from '../../../core/logger.js';

export const mockCopilotPlans = new Map<string, EditorCommandPlan>();

export class CopilotStore {
  /**
   * Persist generated command plan into PostgreSQL ai_jobs and ai_outputs tables
   */
  async savePlan(plan: EditorCommandPlan, userId: string, jobId: string): Promise<void> {
    mockCopilotPlans.set(plan.planId, plan);

    try {
      if (await db.isHealthy()) {
        // 1. Insert or update ai_jobs record
        await db.query(
          `INSERT INTO ai_jobs (
            id, user_id, project_id, job_type, provider, status,
            credits_reserved, credits_deducted, input_payload, error_message,
            started_at, completed_at, created_at, updated_at
          ) VALUES (
            $1, $2, $3, 'copilot_plan', $4, 'completed',
            $5, $5, $6, NULL,
            CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
          )
          ON CONFLICT (id) DO UPDATE SET
            status = 'completed',
            completed_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP;`,
          [
            jobId,
            userId,
            plan.projectId,
            plan.metadata?.provider || 'mock',
            plan.metadata?.cost || 2,
            JSON.stringify({ prompt: plan.explanation }),
          ]
        );

        // 2. Insert into ai_outputs
        await db.query(
          `INSERT INTO ai_outputs (
            id, job_id, output_type, content_json, created_at
          ) VALUES (
            $1, $2, 'copilot_plan', $3, CURRENT_TIMESTAMP
          );`,
          [uuidv4(), jobId, JSON.stringify(plan)]
        );

        logger.debug({ planId: plan.planId, jobId }, 'Copilot plan saved to database');
      }
    } catch (err: any) {
      logger.warn({ error: err.message, planId: plan.planId }, 'Could not persist copilot plan to DB, retained in memory');
    }
  }

  /**
   * Retrieve stored plan by ID
   */
  async getPlan(planId: string): Promise<EditorCommandPlan | undefined> {
    const mem = mockCopilotPlans.get(planId);
    if (mem) return mem;

    try {
      if (await db.isHealthy()) {
        const res = await db.query(
          `SELECT content_json FROM ai_outputs
           WHERE output_type = 'copilot_plan'
             AND content_json->>'planId' = $1
           LIMIT 1;`,
          [planId]
        );
        if (res.rows.length > 0) {
          const content = res.rows[0].content_json;
          const plan: EditorCommandPlan = typeof content === 'string' ? JSON.parse(content) : content;
          mockCopilotPlans.set(planId, plan);
          return plan;
        }
      }
    } catch {}

    return undefined;
  }

  /**
   * Mark plan as applied (version safety transition)
   */
  async markPlanApplied(planId: string): Promise<void> {
    const plan = await this.getPlan(planId);
    if (plan) {
      plan.status = 'applied';
      plan.appliedAt = new Date().toISOString();
      mockCopilotPlans.set(planId, plan);
    }
  }

  /**
   * Telemetry metrics for admin dashboard
   */
  async getMetrics(): Promise<{ totalPlansGenerated: number; totalCommandsGenerated: number }> {
    let totalPlans = mockCopilotPlans.size;
    let totalCommands = 0;
    for (const plan of mockCopilotPlans.values()) {
      totalCommands += plan.commands.length;
    }

    try {
      if (await db.isHealthy()) {
        const res = await db.query(
          `SELECT COUNT(*) as count FROM ai_outputs WHERE output_type = 'copilot_plan';`
        );
        const dbCount = parseInt(res.rows[0]?.count || '0', 10);
        if (dbCount > totalPlans) totalPlans = dbCount;
      }
    } catch {}

    return {
      totalPlansGenerated: totalPlans,
      totalCommandsGenerated: totalCommands,
    };
  }
}

export const copilotStore = new CopilotStore();
