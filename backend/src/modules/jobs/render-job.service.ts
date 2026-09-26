import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { db, withTransaction } from '../../database/client.js';
import { jobQueue } from '../../services/queue/index.js';
import { storageService } from '../../services/storage/index.js';
import { creditsService } from '../credits/credits.service.js';
import { projectsService } from '../projects/projects.service.js';
import { mockMediaAssets } from '../media/media.service.js';
import { realtimeService } from '../realtime/realtime.service.js';
import {
  NotFoundError,
  ForbiddenError,
  ValidationError,
  AppError,
  InsufficientCreditsError,
} from '../../core/errors.js';
import { logger } from '../../core/logger.js';
import {
  RenderJob,
  RenderJobStatus,
  RenderJobSettings,
  RenderProjectSnapshot,
  RenderSourceMediaEntry,
  CreateRenderJobInput,
  ListRenderJobsQuery,
  PaginatedRenderJobsDto,
  RenderQueuePayload,
  isValidStatusTransition,
} from './render-job.types.js';

export const mockRenderJobs = new Map<string, RenderJob>();

export class RenderJobService {
  /**
   * Validate render settings matrix (container, codecs, resolution, limits)
   */
  public validateSettings(settings: Partial<RenderJobSettings>): RenderJobSettings {
    const format = settings.format || 'mp4';
    const resolutionWidth = settings.resolutionWidth ?? 1920;
    const resolutionHeight = settings.resolutionHeight ?? 1080;
    const framerate = settings.framerate ?? 30.0;

    // Check bounds
    if (resolutionWidth < 320 || resolutionWidth > 7680) {
      throw new ValidationError(`Resolution width ${resolutionWidth} is out of supported bounds (320 - 7680)`);
    }
    if (resolutionHeight < 240 || resolutionHeight > 4320) {
      throw new ValidationError(`Resolution height ${resolutionHeight} is out of supported bounds (240 - 4320)`);
    }
    if (framerate < 1 || framerate > 120) {
      throw new ValidationError(`Framerate ${framerate} is out of supported bounds (1 - 120)`);
    }

    let videoCodec = settings.videoCodec;
    let audioCodec = settings.audioCodec;

    // Default codec mappings per container
    if (!videoCodec) {
      if (format === 'mp4') videoCodec = 'h264';
      else if (format === 'mov') videoCodec = 'prores';
      else if (format === 'webm') videoCodec = 'vp9';
      else videoCodec = 'h264';
    }

    if (!audioCodec) {
      if (format === 'webm') audioCodec = 'opus';
      else audioCodec = 'aac';
    }

    // Matrix compatibility validation
    if (format === 'mp4' && !['h264', 'hevc'].includes(videoCodec)) {
      throw new ValidationError(`Container MP4 does not support video codec: ${videoCodec}. Use h264 or hevc.`);
    }
    if (format === 'mov' && !['h264', 'hevc', 'prores'].includes(videoCodec)) {
      throw new ValidationError(`Container MOV does not support video codec: ${videoCodec}. Use h264, hevc, or prores.`);
    }
    if (format === 'webm' && videoCodec !== 'vp9') {
      throw new ValidationError(`Container WebM only supports video codec: vp9 (requested: ${videoCodec}).`);
    }
    if (format === 'webm' && audioCodec !== 'opus') {
      throw new ValidationError(`Container WebM requires audio codec: opus (requested: ${audioCodec}).`);
    }

    if (settings.bitrateKbps !== undefined && (settings.bitrateKbps < 100 || settings.bitrateKbps > 100000)) {
      throw new ValidationError('Bitrate must be between 100 and 100000 kbps');
    }

    return {
      format,
      resolutionWidth,
      resolutionHeight,
      framerate,
      videoCodec,
      audioCodec,
      bitrateKbps: settings.bitrateKbps,
      audioBitrateKbps: settings.audioBitrateKbps ?? 192,
      crf: settings.crf,
      preset: settings.preset ?? 'fast',
      durationSeconds: settings.durationSeconds,
    };
  }

  /**
   * Calculate render credit cost based on resolution, duration, and codec complexity
   */
  public calculateCreditCost(settings: RenderJobSettings): number {
    let cost = 10; // Base cost for standard 1080p export

    // 4K and 8K scaling
    if (settings.resolutionWidth > 3840 || settings.resolutionHeight > 2160) {
      cost += 30; // 8K
    } else if (settings.resolutionWidth > 1920 || settings.resolutionHeight > 1080) {
      cost += 10; // 4K
    }

    // High framerate (e.g. 60fps)
    if (settings.framerate > 30) {
      cost += 5;
    }

    // ProRes mastering codec
    if (settings.videoCodec === 'prores') {
      cost += 10;
    }

    return cost;
  }

  /**
   * Verify project ownership or access
   */
  public async verifyProjectAccess(projectId: string, userId: string): Promise<boolean> {
    try {
      if (await db.isHealthy()) {
        const res = await db.query(
          `SELECT p.id, p.owner_id
           FROM projects p
           WHERE p.id = $1 AND p.deleted_at IS NULL
           LIMIT 1;`,
          [projectId]
        );

        if (res.rows.length > 0) {
          if (res.rows[0].owner_id === userId) {
            return true;
          }
          // Check collaboration permissions
          const memberRes = await db.query(
            `SELECT pm.role, pp.can_export
             FROM project_members pm
             LEFT JOIN project_permissions pp ON pp.member_id = pm.id
             WHERE pm.project_id = $1 AND pm.user_id = $2
             LIMIT 1;`,
            [projectId, userId]
          );
          if (memberRes.rows.length > 0) {
            const role = memberRes.rows[0].role;
            const canExport = memberRes.rows[0].can_export;
            if (role === 'owner' || role === 'admin' || canExport === true) {
              return true;
            }
          }
          return false;
        }
      }
    } catch {
      // Fallback to in-memory check
    }

    // In-memory fallback
    try {
      const project = await projectsService.getById(projectId, userId);
      return !!project;
    } catch (err) {
      if (err instanceof ForbiddenError || err instanceof NotFoundError) {
        throw err;
      }
      return false;
    }
  }

  /**
   * Deterministic canonical JSON serialization ensuring consistent hashing
   */
  private canonicalize(obj: any): string {
    if (obj === null || typeof obj !== 'object') {
      return JSON.stringify(obj);
    }
    if (Array.isArray(obj)) {
      return '[' + obj.map((item) => this.canonicalize(item)).join(',') + ']';
    }
    const keys = Object.keys(obj).sort();
    return (
      '{' +
      keys
        .map((key) => JSON.stringify(key) + ':' + this.canonicalize(obj[key]))
        .join(',') +
      '}'
    );
  }

  /**
   * Locates any active or completed render job that matches the exact snapshot hash and export settings
   */
  public findIdempotentJob(
    userId: string,
    projectId: string,
    snapshotHash: string,
    settings: RenderJobSettings
  ): RenderJob | null {
    const settingsStr = JSON.stringify(settings);
    for (const job of mockRenderJobs.values()) {
      if (
        job.userId === userId &&
        job.projectId === projectId &&
        job.snapshotHash === snapshotHash &&
        JSON.stringify(job.settings) === settingsStr &&
        ['queued', 'starting', 'running', 'completed'].includes(job.status)
      ) {
        return job;
      }
    }
    return null;
  }

  /**
   * Builds an immutable render snapshot containing the complete render-relevant project state:
   * timeline, tracks, clips, trims, transforms, keyframes, effects, transitions, masks, chroma,
   * audio, text, captions, and export settings.
   * Validates referenced media assets and rejects missing/deleted media before queueing.
   */
  public async buildRenderSnapshot(
    projectId: string,
    userId: string,
    requestedVersion?: number,
    projectVersionId?: string | null,
    validatedSettings?: RenderJobSettings
  ): Promise<RenderProjectSnapshot> {
    const project = await projectsService.getById(projectId, userId);
    if (!project) {
      throw new NotFoundError(`Project not found: ${projectId}`);
    }

    let targetVersion = requestedVersion ?? project.version;
    let targetVersionId = projectVersionId || null;
    let canvas = project.canvas;
    let timeline = project.timeline;

    // If a specific historical version is requested
    if (requestedVersion !== undefined) {
      const versionRecord = await projectsService.getProjectVersion(projectId, requestedVersion, userId);
      if (!versionRecord) {
        throw new NotFoundError(`Project version ${requestedVersion} not found for project ${projectId}`);
      }
      targetVersion = versionRecord.versionNumber;
      targetVersionId = versionRecord.id;
      canvas = versionRecord.snapshotData.canvas || canvas;
      timeline = versionRecord.snapshotData.timeline || timeline;
    }

    // 1. Validate Canvas
    const resolutionWidth = canvas?.resolutionWidth || 1920;
    const resolutionHeight = canvas?.resolutionHeight || 1080;
    const framerate = canvas?.framerate || 30.0;
    const aspectRatio = canvas?.aspectRatio || '16:9';
    const colorSpace = canvas?.colorSpace || 'rec709';
    const backgroundColor = canvas?.backgroundColor || '#000000';

    if (resolutionWidth <= 0 || resolutionHeight <= 0) {
      throw new ValidationError('Invalid canvas configuration: resolution width and height must be positive numbers');
    }

    // 2. Validate Timeline & Tracks
    const rawTracks = timeline?.tracks || [];
    if (!Array.isArray(rawTracks) || rawTracks.length === 0) {
      throw new ValidationError('Cannot render project: Timeline contains no tracks');
    }

    let computedDuration = timeline?.duration || 0;
    let maxClipEnd = 0;
    let totalClipCount = 0;
    const sourceMediaMap: Record<string, RenderSourceMediaEntry> = {};

    // 3. Scan clips, validate timings, and resolve/detect source media assets
    for (const track of rawTracks) {
      const clips = track.clips || [];
      for (const clip of clips) {
        totalClipCount++;
        const clipDuration = clip.duration ?? 0;
        const clipStart = clip.start ?? 0;

        if (clipDuration <= 0) {
          throw new ValidationError(
            `Invalid clip duration on clip '${clip.name || clip.id}': duration must be greater than zero`
          );
        }
        if (clipStart < 0) {
          throw new ValidationError(
            `Invalid clip start on clip '${clip.name || clip.id}': start cannot be negative`
          );
        }

        const clipEnd = clipStart + clipDuration;
        if (clipEnd > maxClipEnd) {
          maxClipEnd = clipEnd;
        }

        // Validate media asset reference if present
        const rawAssetId = (clip as any).mediaAssetId || (clip as any).assetId;
        const assetId = typeof rawAssetId === 'string' ? rawAssetId : (rawAssetId?.id ? String(rawAssetId.id) : '');
        if (assetId) {
          let asset: any = mockMediaAssets.get(assetId);
          if (!asset) {
            try {
              if (await db.isHealthy()) {
                const res = await db.query('SELECT * FROM media_assets WHERE id = $1 LIMIT 1;', [assetId]);
                if (res.rows.length > 0) asset = res.rows[0];
              }
            } catch {}
          }

          if (!asset || asset.status === 'DELETED' || asset.deletedAt != null || asset.deleted_at != null) {
            throw new ValidationError(
              `Render snapshot validation failed: Referenced media asset '${assetId}' (clip: '${clip.name || clip.id}') is missing or has been deleted`
            );
          }

          if (asset.status === 'FAILED' || asset.status === 'failed') {
            throw new ValidationError(
              `Render snapshot validation failed: Referenced media asset '${assetId}' is in failed status`
            );
          }

          if (!sourceMediaMap[assetId]) {
            sourceMediaMap[assetId] = {
              assetId: asset.id || assetId,
              name: asset.name || asset.originalFilename || 'Asset',
              fileKey: asset.fileKey || asset.file_key || '',
              mimeType: asset.mimeType || asset.mime_type || 'video/mp4',
              fileSizeBytes: Number(asset.fileSizeBytes || asset.file_size_bytes || 0),
              durationSeconds: asset.durationSeconds || asset.duration_seconds,
              sha256: asset.checksumSha256 || asset.checksum_sha256,
              status: asset.status || 'READY',
            };
          }
        }
      }
    }

    if (computedDuration <= 0) {
      computedDuration = maxClipEnd;
    }

    if (computedDuration <= 0 || totalClipCount === 0) {
      throw new ValidationError('Cannot render empty project timeline with zero duration');
    }

    // 4. Normalize tracks and clips to immutable render state
    const normalizedTracks = rawTracks.map((t: any) => ({
      id: t.id,
      type: t.type,
      name: t.name || 'Track',
      muted: Boolean(t.muted || t.isMuted),
      locked: Boolean(t.locked || t.isLocked),
      clips: (t.clips || []).map((c: any) => {
        const dur = c.duration || 1;
        const st = c.start || 0;
        const srcSt = c.sourceStart || 0;

        return {
          id: c.id,
          name: c.name || 'Clip',
          mediaAssetId: c.mediaAssetId || c.assetId,
          assetId: c.mediaAssetId || c.assetId,
          start: st,
          duration: dur,
          sourceStart: srcSt,
          speed: c.speed || 1.0,
          volume: c.volume ?? 1.0,
          trims: {
            inPointSeconds: srcSt,
            outPointSeconds: srcSt + dur,
            sourceDurationSeconds: dur,
          },
          transform: {
            scaleX: c.transform?.scaleX ?? 1.0,
            scaleY: c.transform?.scaleY ?? 1.0,
            positionX: c.transform?.positionX ?? 0,
            positionY: c.transform?.positionY ?? 0,
            rotationDegrees: c.transform?.rotationDegrees ?? 0,
            opacity: c.transform?.opacity ?? 1.0,
            anchorX: c.transform?.anchorX ?? 0.5,
            anchorY: c.transform?.anchorY ?? 0.5,
          },
          keyframes: Array.isArray(c.keyframes) ? c.keyframes : [],
          effects: Array.isArray(c.effects) ? c.effects : [],
          transitions: c.transitions || {},
          masks: Array.isArray(c.masks) ? c.masks : [],
          chroma: c.chroma || { enabled: false },
          audio: {
            volume: c.audio?.volume ?? c.volume ?? 1.0,
            gainDb: c.audio?.gainDb ?? 0,
            pan: c.audio?.pan ?? 0,
            fadeInMs: c.audio?.fadeInMs ?? 0,
            fadeOutMs: c.audio?.fadeOutMs ?? 0,
            pitchShift: c.audio?.pitchShift ?? 0,
            equalizer: c.audio?.equalizer,
          },
          text: c.text
            ? {
                content: typeof c.text === 'object' ? (c.text.content || '') : String(c.text),
                fontFamily: c.text.fontFamily || 'Inter',
                fontSize: c.text.fontSize || 32,
                fontWeight: c.text.fontWeight || 'normal',
                fontStyle: c.text.fontStyle || 'normal',
                color: c.text.color || '#FFFFFF',
                backgroundColor: c.text.backgroundColor,
                outlineColor: c.text.outlineColor,
                outlineWidth: c.text.outlineWidth,
                shadowColor: c.text.shadowColor,
                alignment: c.text.alignment || 'center',
                letterSpacing: c.text.letterSpacing,
                lineHeight: c.text.lineHeight,
                position: c.text.position || { x: 0, y: 0 },
              }
            : undefined,
          captions: Array.isArray(c.captions) ? c.captions : [],
        };
      }),
    }));

    // 5. Assemble data payload for cryptographic hashing
    const stateToHash = {
      snapshotVersion: 1,
      projectId,
      projectVersion: targetVersion,
      projectTitle: project.title,
      canvas: {
        resolutionWidth,
        resolutionHeight,
        framerate,
        aspectRatio,
        colorSpace,
        backgroundColor,
      },
      timeline: {
        duration: computedDuration,
        framerate,
        tracks: normalizedTracks,
        markers: timeline?.markers || [],
      },
      sourceMedia: sourceMediaMap,
      exportSettings: validatedSettings,
    };

    const canonicalJson = this.canonicalize(stateToHash);
    const snapshotHash = crypto.createHash('sha256').update(canonicalJson).digest('hex');

    const snapshot: RenderProjectSnapshot = {
      snapshotVersion: 1,
      snapshotHash,
      projectId,
      projectVersion: targetVersion,
      projectVersionId: targetVersionId,
      projectTitle: project.title,
      createdAt: new Date().toISOString(),
      canvas: {
        resolutionWidth,
        resolutionHeight,
        framerate,
        aspectRatio,
        colorSpace,
        backgroundColor,
      },
      timeline: {
        duration: computedDuration,
        framerate,
        tracks: normalizedTracks,
        markers: timeline?.markers || [],
      },
      sourceMedia: sourceMediaMap,
      exportSettings: validatedSettings!,
    };

    return snapshot;
  }

  /**
   * Create and enqueue a new cloud render job with an immutable project snapshot
   */
  async createRenderJob(
    userId: string,
    input: CreateRenderJobInput,
    userRole?: string
  ): Promise<RenderJob> {
    if (!userId) {
      throw new ForbiddenError('Authentication required to submit render job');
    }

    // 1. Validate project ownership/access
    const hasAccess = await this.verifyProjectAccess(input.projectId, userId);
    if (!hasAccess && userRole !== 'admin' && userRole !== 'system') {
      throw new ForbiddenError(`You do not have permission to export project ${input.projectId}`);
    }

    // 2. Validate render settings
    const validatedSettings = this.validateSettings(input.settings);

    // 3. Build & Validate Immutable Project Snapshot (including missing/deleted media detection)
    const snapshot = await this.buildRenderSnapshot(
      input.projectId,
      userId,
      input.versionNumber ?? input.version,
      input.projectVersionId,
      validatedSettings
    );

    // 4. Idempotency Check: Safely identify duplicate request with same snapshot hash + settings
    const existingJob = this.findIdempotentJob(
      userId,
      input.projectId,
      snapshot.snapshotHash,
      validatedSettings
    );
    if (existingJob) {
      logger.info(
        { existingJobId: existingJob.id, snapshotHash: snapshot.snapshotHash, status: existingJob.status },
        'Idempotent render job match: returning existing job without duplicate charge or queueing'
      );
      return existingJob;
    }

    // 5. Calculate credit cost
    const creditCost = this.calculateCreditCost(validatedSettings);

    // 6. Reserve credits via CreditsService
    const reservationId = uuidv4();
    try {
      await creditsService.deductCredits(
        userId,
        creditCost,
        `Render export reservation for project ${input.projectId}`,
        reservationId
      );
    } catch (err: any) {
      logger.warn({ userId, creditCost, err: err.message }, 'Credit deduction failed for render job');
      throw err;
    }

    // 7. Persist render_jobs row in DB with immutable snapshot
    const id = uuidv4();
    const now = new Date().toISOString();

    const jobData: RenderJob = {
      id,
      userId,
      projectId: input.projectId,
      projectVersionId: snapshot.projectVersionId || input.projectVersionId || null,
      projectVersion: snapshot.projectVersion,
      status: 'queued',
      settings: validatedSettings,
      progress: 0.0,
      stage: 'queued',
      errorCode: null,
      errorMessage: null,
      outputObject: null,
      workerMetadata: {},
      attempts: 0,
      maxAttempts: 3,
      creditReservationId: reservationId,
      creditCost,
      snapshot,
      snapshotHash: snapshot.snapshotHash,
      createdAt: now,
      startedAt: null,
      completedAt: null,
      cancelledAt: null,
      updatedAt: now,
    };

    mockRenderJobs.set(id, jobData);

    try {
      if (await db.isHealthy()) {
        await withTransaction(async (client) => {
          await client.query(
            `INSERT INTO render_jobs (
              id, user_id, project_id, project_version_id, status, settings,
              progress, stage, worker_metadata, attempts, max_attempts,
              credit_reservation_id, credit_cost, snapshot_data, snapshot_hash,
              snapshot_version, project_version, created_at, updated_at
            ) VALUES (
              $1, $2, $3, $4, 'queued', $5,
              0.00, 'queued', $6, 0, $7,
              $8, $9, $10, $11, $12, $13, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            );`,
            [
              jobData.id,
              jobData.userId,
              jobData.projectId,
              jobData.projectVersionId,
              JSON.stringify(jobData.settings),
              JSON.stringify(jobData.workerMetadata),
              jobData.maxAttempts,
              jobData.creditReservationId,
              jobData.creditCost,
              JSON.stringify(jobData.snapshot),
              jobData.snapshotHash,
              jobData.snapshot?.snapshotVersion || 1,
              jobData.projectVersion,
            ]
          );
        });
      }
    } catch (dbErr: any) {
      // Compensate reserved credits if DB insert fails
      logger.error({ id, userId, error: dbErr.message }, 'Failed to persist render job, refunding credits');
      await creditsService.grantCredits(
        userId,
        creditCost,
        'job_refund',
        `Compensating refund for DB failure on render job ${id}`
      );
      mockRenderJobs.delete(id);
      throw new AppError(`Failed to persist render job: ${dbErr.message}`, 500, 'DATABASE_ERROR');
    }

    // 8. Enqueue BullMQ render job with immutable snapshot
    try {
      const queuePayload: RenderQueuePayload = {
        renderJobId: id,
        projectId: input.projectId,
        projectVersionId: jobData.projectVersionId,
        projectVersion: jobData.projectVersion,
        snapshotHash: jobData.snapshotHash,
        snapshot: jobData.snapshot,
      };

      await jobQueue.add('render_jobs', queuePayload, {
        jobId: id,
        maxAttempts: jobData.maxAttempts,
      });

      logger.info(
        { renderJobId: id, userId, projectId: input.projectId, version: jobData.projectVersion, snapshotHash: jobData.snapshotHash, creditCost },
        'Cloud render job persisted and submitted to queue with immutable snapshot'
      );
    } catch (queueErr: any) {
      // 9. Compensation if queue submission fails
      logger.error({ id, userId, error: queueErr.message }, 'Queue submission failed, compensating render job');
      jobData.status = 'failed';
      jobData.errorCode = 'QUEUE_SUBMISSION_FAILED';
      jobData.errorMessage = queueErr.message || 'Failed to submit render job to queue';
      jobData.updatedAt = new Date().toISOString();
      mockRenderJobs.set(id, jobData);

      try {
        if (await db.isHealthy()) {
          await db.query(
            `UPDATE render_jobs
             SET status = 'failed',
                 error_code = 'QUEUE_SUBMISSION_FAILED',
                 error_message = $1,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $2;`,
            [queueErr.message, id]
          );
        }
      } catch {}

      // Refund credit reservation
      await creditsService.grantCredits(
        userId,
        creditCost,
        'job_refund',
        `Refund for failed queue submission on render job ${id}`
      );

      // Emit failure event
      realtimeService.notifyRenderJobFailed(jobData, jobData.errorMessage || 'Failed to submit render job to queue');

      throw new AppError('Failed to dispatch render job to processing queue', 503, 'QUEUE_ERROR');
    }

    // 10. Emit RENDER_JOB_CREATED realtime event
    realtimeService.notifyRenderJobCreated(jobData);

    return jobData;
  }

  /**
   * Get render job by ID with strict ownership validation and RBAC
   */
  async getRenderJob(id: string, userId?: string, userRole?: string): Promise<RenderJob> {
    let job: RenderJob | undefined;

    // Check DB
    try {
      if (await db.isHealthy()) {
        const res = await db.query(
          `SELECT * FROM render_jobs WHERE id = $1 LIMIT 1;`,
          [id]
        );
        if (res.rows.length > 0) {
          const row = res.rows[0];
          job = {
            id: row.id,
            userId: row.user_id,
            projectId: row.project_id,
            projectVersionId: row.project_version_id,
            projectVersion: row.project_version,
            snapshot: row.snapshot_data ? (typeof row.snapshot_data === 'string' ? JSON.parse(row.snapshot_data) : row.snapshot_data) : (mockRenderJobs.get(id)?.snapshot),
            snapshotHash: row.snapshot_hash || mockRenderJobs.get(id)?.snapshotHash,
            status: row.status,
            settings: typeof row.settings === 'string' ? JSON.parse(row.settings) : row.settings,
            progress: parseFloat(row.progress) || 0,
            stage: row.stage,
            errorCode: row.error_code,
            errorMessage: row.error_message,
            outputObject: row.output_object ? (typeof row.output_object === 'string' ? JSON.parse(row.output_object) : row.output_object) : null,
            workerMetadata: typeof row.worker_metadata === 'string' ? JSON.parse(row.worker_metadata) : (row.worker_metadata || {}),
            attempts: row.attempts,
            maxAttempts: row.max_attempts,
            creditReservationId: row.credit_reservation_id,
            creditCost: row.credit_cost,
            createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
            startedAt: row.started_at ? (row.started_at instanceof Date ? row.started_at.toISOString() : String(row.started_at)) : null,
            completedAt: row.completed_at ? (row.completed_at instanceof Date ? row.completed_at.toISOString() : String(row.completed_at)) : null,
            cancelledAt: row.cancelled_at ? (row.cancelled_at instanceof Date ? row.cancelled_at.toISOString() : String(row.cancelled_at)) : null,
            updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
          };
          mockRenderJobs.set(id, job);
        }
      }
    } catch {
      // Fallback
    }

    if (!job) {
      job = mockRenderJobs.get(id);
    }

    if (!job) {
      throw new NotFoundError(`Render job not found: ${id}`);
    }

    // Normal users can only access their own jobs; admin can inspect any
    const isAdmin = userRole === 'admin' || userRole === 'system';
    if (!isAdmin && userId && job.userId !== userId) {
      throw new ForbiddenError('You do not have permission to view this render job');
    }

    return job;
  }

  /**
   * Request a fresh signed download URL for completed render job
   */
  async getDownloadUrl(
    id: string,
    userId: string,
    expiresInSeconds = 3600,
    userRole?: string
  ): Promise<{ downloadUrl: string; expiresInSeconds: number; storageKey: string; sizeBytes?: number; format: string }> {
    const job = await this.getRenderJob(id, userId, userRole);
    if (job.status !== 'completed') {
      throw new ValidationError(`Render job ${id} is not completed (current status: ${job.status})`);
    }
    if (!job.outputObject?.storageKey) {
      throw new NotFoundError(`No output object found for render job ${id}`);
    }

    const downloadUrl = await storageService.getDownloadPresignedUrl(
      job.outputObject.storageKey,
      expiresInSeconds,
      `${job.snapshot?.projectTitle || 'render_output'}.${job.settings.format}`
    );

    return {
      downloadUrl,
      expiresInSeconds,
      storageKey: job.outputObject.storageKey,
      sizeBytes: job.outputObject.sizeBytes,
      format: job.settings.format,
    };
  }

  /**
   * List render jobs with pagination, filtering, and sorting
   */
  async listRenderJobs(
    userId: string,
    query: ListRenderJobsQuery,
    userRole?: string
  ): Promise<PaginatedRenderJobsDto> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const offset = (page - 1) * limit;

    const isAdmin = userRole === 'admin' || userRole === 'system';
    const isAllUsers = isAdmin && query.allUsers === true;

    try {
      if (await db.isHealthy()) {
        const conditions: string[] = [];
        const params: any[] = [];
        let paramIdx = 1;

        if (!isAllUsers) {
          conditions.push(`user_id = $${paramIdx++}`);
          params.push(userId);
        }

        if (query.projectId) {
          conditions.push(`project_id = $${paramIdx++}`);
          params.push(query.projectId);
        }

        if (query.status) {
          conditions.push(`status = $${paramIdx++}`);
          params.push(query.status);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const validSortFields: Record<string, string> = {
          created_at: 'created_at',
          updated_at: 'updated_at',
          status: 'status',
          progress: 'progress',
        };
        const sortBy = validSortFields[query.sortBy || 'created_at'] || 'created_at';
        const order = query.order?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

        const countRes = await db.query(
          `SELECT COUNT(*) as count FROM render_jobs ${whereClause};`,
          params
        );
        const total = parseInt(countRes.rows[0]?.count || '0', 10);

        const listQuery = `
          SELECT * FROM render_jobs
          ${whereClause}
          ORDER BY ${sortBy} ${order}
          LIMIT $${paramIdx++} OFFSET $${paramIdx++};
        `;
        const listParams = [...params, limit, offset];
        const listRes = await db.query(listQuery, listParams);

        const items: RenderJob[] = listRes.rows.map((row) => ({
          id: row.id,
          userId: row.user_id,
          projectId: row.project_id,
          projectVersionId: row.project_version_id,
          projectVersion: row.project_version,
          snapshotHash: row.snapshot_hash || undefined,
          status: row.status,
          settings: typeof row.settings === 'string' ? JSON.parse(row.settings) : row.settings,
          progress: parseFloat(row.progress) || 0,
          stage: row.stage,
          errorCode: row.error_code,
          errorMessage: row.error_message,
          outputObject: row.output_object ? (typeof row.output_object === 'string' ? JSON.parse(row.output_object) : row.output_object) : null,
          workerMetadata: typeof row.worker_metadata === 'string' ? JSON.parse(row.worker_metadata) : (row.worker_metadata || {}),
          attempts: row.attempts,
          maxAttempts: row.max_attempts,
          creditReservationId: row.credit_reservation_id,
          creditCost: row.credit_cost,
          createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
          startedAt: row.started_at ? (row.started_at instanceof Date ? row.started_at.toISOString() : String(row.started_at)) : null,
          completedAt: row.completed_at ? (row.completed_at instanceof Date ? row.completed_at.toISOString() : String(row.completed_at)) : null,
          cancelledAt: row.cancelled_at ? (row.cancelled_at instanceof Date ? row.cancelled_at.toISOString() : String(row.cancelled_at)) : null,
          updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
        }));

        return {
          items,
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit) || 1,
        };
      }
    } catch {
      // Fallback to in-memory mock map
    }

    // In-memory fallback
    let all = Array.from(mockRenderJobs.values());
    if (!isAllUsers) {
      all = all.filter((j) => j.userId === userId);
    }
    if (query.projectId) {
      all = all.filter((j) => j.projectId === query.projectId);
    }
    if (query.status) {
      all = all.filter((j) => j.status === query.status);
    }

    all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const total = all.length;
    const items = all.slice(offset, offset + limit);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  /**
   * Cancel render job safely with credit refund and state machine validation
   */
  async cancelRenderJob(id: string, userId: string, userRole?: string): Promise<RenderJob> {
    const job = await this.getRenderJob(id, userId, userRole);

    if (job.status === 'completed') {
      throw new ValidationError('Cannot cancel a completed render job');
    }

    if (job.status === 'cancelled') {
      // Idempotent return
      return job;
    }

    if (job.status === 'failed') {
      throw new ValidationError('Cannot cancel a failed render job');
    }

    if (!isValidStatusTransition(job.status, 'cancelled') && !isValidStatusTransition(job.status, 'cancelling')) {
      throw new ValidationError(`Invalid transition from status ${job.status} to cancelled`);
    }

    const now = new Date().toISOString();

    // If job is queued: transition directly to cancelled and refund reservation
    if (job.status === 'queued') {
      job.status = 'cancelled';
      job.stage = 'cancelled';
      job.cancelledAt = now;
      job.updatedAt = now;
      mockRenderJobs.set(id, job);

      try {
        if (await db.isHealthy()) {
          await db.query(
            `UPDATE render_jobs
             SET status = 'cancelled',
                 stage = 'cancelled',
                 cancelled_at = CURRENT_TIMESTAMP,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $1 AND status = 'queued';`,
            [id]
          );
        }
      } catch {}

      // Refund reserved credits exactly once
      if (job.creditCost > 0 && job.creditReservationId) {
        await creditsService.grantCredits(
          job.userId,
          job.creditCost,
          'job_refund',
          `Refund for cancelled render job ${job.id}`
        );
      }

      await jobQueue.cancelJob(id);
      realtimeService.notifyRenderCancelled(job);
      return job;
    }

    // If job is starting or running: transition to cancelling (Worker will abort FFmpeg process)
    if (job.status === 'starting' || job.status === 'running') {
      job.status = 'cancelling';
      job.stage = 'cancelling';
      job.updatedAt = now;
      mockRenderJobs.set(id, job);

      try {
        if (await db.isHealthy()) {
          await db.query(
            `UPDATE render_jobs
             SET status = 'cancelling',
                 stage = 'cancelling',
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $1 AND status IN ('starting', 'running');`,
            [id]
          );
        }
      } catch {}

      realtimeService.notifyRenderCancelling(job);

      // Abort active FFmpeg process in renderWorker
      try {
        const { renderWorker } = await import('./render-worker.service.js');
        const handledByWorker = await renderWorker.cancelActiveRender(id);
        if (!handledByWorker) {
          // If not handled by an active in-memory session, mark cancelled directly
          job.status = 'cancelled';
          job.stage = 'cancelled';
          job.cancelledAt = new Date().toISOString();
          mockRenderJobs.set(id, job);

          try {
            if (await db.isHealthy()) {
              await db.query(
                `UPDATE render_jobs
                 SET status = 'cancelled',
                     stage = 'cancelled',
                     cancelled_at = CURRENT_TIMESTAMP,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = $1;`,
                [id]
              );
            }
          } catch {}

          if (job.creditCost > 0 && job.creditReservationId) {
            await creditsService.grantCredits(
              job.userId,
              job.creditCost,
              'job_refund',
              `Refund for cancelled render job ${job.id}`
            );
          }

          realtimeService.notifyRenderCancelled(job);
        }
      } catch (workerErr: any) {
        logger.warn({ id, err: workerErr.message }, 'Could not notify renderWorker of cancellation');
      }

      await jobQueue.cancelJob(id);
      return job;
    }

    return job;
  }

  /**
   * Retry a failed render job safely with atomic attempt increment
   */
  async retryRenderJob(id: string, userId: string, userRole?: string): Promise<RenderJob> {
    const job = await this.getRenderJob(id, userId, userRole);

    if (job.status !== 'failed' && job.status !== 'cancelled') {
      throw new ValidationError(`Cannot retry a render job with status: ${job.status}. Only failed or cancelled jobs may be retried.`);
    }

    if (job.attempts >= job.maxAttempts) {
      throw new ValidationError(
        `Render job has reached maximum retry attempts (${job.attempts}/${job.maxAttempts})`
      );
    }

    // Validate credit requirement if previous was refunded
    const currentBalance = await creditsService.getBalance(job.userId);
    if (currentBalance < job.creditCost) {
      throw new InsufficientCreditsError(
        `Insufficient credits to retry render job: requires ${job.creditCost}, balance is ${currentBalance}`
      );
    }

    // Re-reserve credits for retry
    const retryReservationId = uuidv4();
    await creditsService.deductCredits(
      job.userId,
      job.creditCost,
      `Render retry reservation for job ${job.id}`,
      retryReservationId
    );

    const now = new Date().toISOString();
    job.status = 'queued';
    job.progress = 0.0;
    job.stage = 'queued';
    job.errorCode = null;
    job.errorMessage = null;
    job.attempts += 1;
    job.creditReservationId = retryReservationId;
    job.updatedAt = now;
    mockRenderJobs.set(id, job);

    try {
      if (await db.isHealthy()) {
        await db.query(
          `UPDATE render_jobs
           SET status = 'queued',
               progress = 0.00,
               stage = 'queued',
               error_code = NULL,
               error_message = NULL,
               attempts = attempts + 1,
               credit_reservation_id = $1,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $2 AND status IN ('failed', 'cancelled') AND attempts < max_attempts;`,
          [retryReservationId, id]
        );
      }
    } catch (err: any) {
      // Refund if DB update failed
      await creditsService.grantCredits(
        job.userId,
        job.creditCost,
        'job_refund',
        `Compensating refund for retry failure on render job ${id}`
      );
      throw err;
    }

    // Enqueue to BullMQ
    const queuePayload: RenderQueuePayload = {
      renderJobId: job.id,
      projectId: job.projectId,
      projectVersionId: job.projectVersionId,
    };

    await jobQueue.add('render_jobs', queuePayload, {
      jobId: `${job.id}-retry-${job.attempts}`,
      maxAttempts: job.maxAttempts,
    });

    realtimeService.notifyRenderJobCreated(job);
    return job;
  }
}

export const renderJobService = new RenderJobService();
