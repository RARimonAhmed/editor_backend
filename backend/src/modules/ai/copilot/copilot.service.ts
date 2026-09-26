import { v4 as uuidv4 } from 'uuid';
import {
  CopilotRequestInput,
  EditorCommandPlan,
  CopilotTimelineContext,
} from './copilot.types.js';
import { copilotProvider } from './copilot.provider.js';
import { copilotValidator } from './copilot.validator.js';
import { copilotStore } from './copilot.store.js';
import { copilotEvents } from './copilot.events.js';
import { creditsService } from '../../credits/credits.service.js';
import { projectsService } from '../../projects/projects.service.js';
import {
  NotFoundError,
  ForbiddenError,
  ValidationError,
  AppError,
  InsufficientCreditsError,
} from '../../../core/errors.js';
import { logger } from '../../../core/logger.js';
import { db } from '../../../database/client.js';

export class CopilotService {
  /**
   * Main pipeline flow:
   * authenticate -> authorize project -> reserve credits -> AI provider -> validate -> store plan -> realtime -> return plan
   */
  async generateCommandPlan(userId: string, input: CopilotRequestInput): Promise<EditorCommandPlan> {
    const jobId = uuidv4();
    const reservationId = uuidv4();
    const creditCost = 2; // Fixed nominal cost for AI Copilot intent plan

    logger.info({ userId, projectId: input.projectId, prompt: input.prompt }, 'Initiating AI Copilot command planning');

    // 1. Authorize Project & Fetch Context
    let currentProjectVersion = input.projectVersion ?? 1;
    let enrichedContext = input.timelineContext;

    try {
      const project = await projectsService.getById(input.projectId, userId);
      currentProjectVersion = input.projectVersion ?? project.projectVersion ?? project.version ?? 1;

      // Enrich timeline context if omitted by client
      if (!enrichedContext && project.timeline) {
        enrichedContext = {
          duration: project.timeline.duration ?? 0,
          currentPlayhead: input.playheadPosition ?? 0,
          selectedClipId: input.selectedClipId,
          selectedTrackId: input.selectedTrackId,
          aspectRatio: project.canvas?.aspectRatio ?? '16:9',
          resolutionWidth: project.canvas?.resolutionWidth ?? 1920,
          resolutionHeight: project.canvas?.resolutionHeight ?? 1080,
          tracks: (project.timeline.tracks || []).map((t: any) => ({
            id: t.id,
            name: t.name,
            type: t.type || 'video',
            clips: (t.clips || []).map((c: any) => ({
              id: c.id,
              name: c.name,
              startTime: c.start ?? 0,
              endTime: (c.start ?? 0) + (c.duration ?? 0),
              duration: c.duration ?? 0,
            })),
          })),
        };
      }
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ForbiddenError) {
        throw err;
      }
      logger.warn({ error: (err as any).message }, 'Could not fetch project document, using provided input context');
    }

    // 2. Reserve Credits
    const userBalance = await creditsService.getBalance(userId);
    if (userBalance < creditCost) {
      throw new InsufficientCreditsError(
        `Insufficient credit balance for AI Copilot: required ${creditCost}, available ${userBalance}`
      );
    }

    await creditsService.deductCredits(
      userId,
      creditCost,
      `AI Copilot Planning: "${input.prompt.substring(0, 40)}"`,
      reservationId
    );

    // 3. Emit AI_JOB_CREATED
    copilotEvents.emitJobCreated(jobId, userId, input.projectId, input.prompt);

    let plan: EditorCommandPlan;

    try {
      // 4. Emit AI_JOB_PROGRESS (Calling AI Provider)
      copilotEvents.emitJobProgress(jobId, userId, input.projectId, 30, 'generating_plan');

      // 5. AI Provider Execution
      plan = await copilotProvider.generateCommandPlan(
        userId,
        {
          ...input,
          timelineContext: enrichedContext,
        },
        currentProjectVersion
      );

      // Attach credit reservation reference
      if (plan.metadata) {
        plan.metadata.jobId = jobId;
        plan.metadata.creditReservationId = reservationId;
      }

      // 6. Emit AI_JOB_PROGRESS (Validating Plan)
      copilotEvents.emitJobProgress(jobId, userId, input.projectId, 70, 'validating_plan');

      // 7. Strict Validation
      const validation = copilotValidator.validatePlan(plan, {
        expectedProjectVersion: currentProjectVersion,
        timelineContext: enrichedContext,
      });

      if (!validation.valid) {
        const errorMsg = `AI Copilot plan failed strict validation: ${validation.errors.join('; ')}`;
        logger.warn({ errors: validation.errors }, errorMsg);
        throw new ValidationError(errorMsg);
      }

      plan.status = 'validated';

      // 8. Store Plan (Persistent Storage)
      await copilotStore.savePlan(plan, userId, jobId);

      // 9. Emit AI_JOB_COMPLETED
      copilotEvents.emitJobCompleted(jobId, userId, input.projectId, plan);

      return plan;
    } catch (err: any) {
      logger.error({ error: err.message, jobId }, 'AI Copilot execution failed, refunding credits');

      // Refund reserved credits
      await creditsService.grantCredits(
        userId,
        creditCost,
        'job_refund',
        `Compensating refund for failed AI Copilot job ${jobId}`
      );

      copilotEvents.emitJobFailed(jobId, userId, input.projectId, err.message);
      throw err;
    }
  }

  /**
   * Get plan by ID
   */
  async getPlan(planId: string, userId: string): Promise<EditorCommandPlan> {
    const plan = await copilotStore.getPlan(planId);
    if (!plan) {
      throw new NotFoundError(`Copilot plan not found: ${planId}`);
    }

    // Authorize project ownership
    await projectsService.getById(plan.projectId, userId);

    return plan;
  }

  /**
   * Apply plan safely with version verification
   * "A plan generated against version 10 must not silently apply to version 12."
   */
  async applyPlan(planId: string, userId: string, targetVersion?: number): Promise<EditorCommandPlan> {
    const plan = await this.getPlan(planId, userId);

    const project = await projectsService.getById(plan.projectId, userId);
    const activeVersion = project.projectVersion ?? project.version ?? 1;

    // 1. If caller explicitly provides targetVersion, ensure it matches plan version
    if (targetVersion !== undefined && plan.projectVersion !== targetVersion) {
      throw new ValidationError(
        `Version conflict: Plan was generated for project version ${plan.projectVersion}, but target version is ${targetVersion}. Cannot silently apply outdated plan.`
      );
    }

    // 2. If targetVersion is not provided, verify against current active project version
    if (targetVersion === undefined && plan.projectVersion !== activeVersion) {
      throw new ValidationError(
        `Version conflict: Plan was generated for project version ${plan.projectVersion}, but active project version is ${activeVersion}. Cannot silently apply outdated plan.`
      );
    }

    await copilotStore.markPlanApplied(planId);
    plan.status = 'applied';
    plan.appliedAt = new Date().toISOString();

    return plan;
  }
}

export const copilotService = new CopilotService();
