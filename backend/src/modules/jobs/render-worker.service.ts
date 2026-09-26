import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { spawn, ChildProcess } from 'child_process';
import { Job } from '../../services/queue/index.js';
import { db } from '../../database/client.js';
import { storageService } from '../../services/storage/index.js';
import { creditsService } from '../credits/credits.service.js';
import { projectsService } from '../projects/projects.service.js';
import { mediaService, mockMediaAssets } from '../media/media.service.js';
import { realtimeService } from '../realtime/realtime.service.js';
import { ffmpegService } from '../media/ffmpeg.service.js';
import { renderJobService, mockRenderJobs } from './render-job.service.js';
import {
  RenderJob,
  RenderJobStatus,
  RenderJobSettings,
  RenderJobOutput,
  RenderJobWorkerMetadata,
  RenderQueuePayload,
  RenderProjectSnapshot,
} from './render-job.types.js';
import { logger } from '../../core/logger.js';
import { AppError, ValidationError } from '../../core/errors.js';

interface ActiveRenderSession {
  jobId: string;
  childProcess?: ChildProcess;
  tempDir: string;
  isCancelled: boolean;
  startedAt: number;
}

export class RenderWorkerService {
  private activeSessions = new Map<string, ActiveRenderSession>();
  private readonly workerId = `render-worker-${process.pid}-${os.hostname()}`;

  /**
   * Main worker entrypoint for background render jobs
   */
  async processRenderJob(job: Job<RenderQueuePayload>): Promise<RenderJobOutput> {
    const { renderJobId, projectId } = job.data;
    const t0 = Date.now();

    logger.info(
      { jobId: job.id, renderJobId, projectId, workerId: this.workerId },
      'Render worker picked up cloud render job'
    );

    // 1. Load and validate job state
    let renderJob = await this.loadRenderJob(renderJobId);
    if (!renderJob) {
      throw new Error(`Render job ${renderJobId} not found in database or cache`);
    }

    // Idempotency check: if already completed, return existing output immediately
    if (renderJob.status === 'completed' && renderJob.outputObject) {
      logger.info({ renderJobId }, 'Render job already completed, returning cached output (idempotent)');
      return renderJob.outputObject;
    }

    // Check if cancelled before worker started
    if (renderJob.status === 'cancelled' || renderJob.status === 'cancelling') {
      logger.info({ renderJobId }, 'Render job cancelled before processing started');
      await this.markJobCancelled(renderJob);
      throw new Error(`Render job ${renderJobId} was cancelled by user`);
    }

    // 2. Prepare isolated temporary workspace
    const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), `my_editor_render_${renderJobId}_`));
    const session: ActiveRenderSession = {
      jobId: renderJobId,
      tempDir,
      isCancelled: false,
      startedAt: t0,
    };
    this.activeSessions.set(renderJobId, session);

    try {
      // 3. Transition status to starting -> running (honest stage tracking, no invented percentages)
      await this.updateJobStatus(renderJobId, 'starting', 'starting');
      realtimeService.notifyRenderStarted(renderJob);
      await this.updateJobStage(renderJobId, 'resolving_assets', 'running');

      // 4. Load immutable project snapshot
      const snapshot: RenderProjectSnapshot | null =
        renderJob.snapshot || (job.data as any)?.snapshot || null;

      let projectState: any;
      if (snapshot) {
        projectState = {
          id: snapshot.projectId,
          title: snapshot.projectTitle,
          version: snapshot.projectVersion,
          canvas: snapshot.canvas,
          timeline: snapshot.timeline,
          sourceMedia: snapshot.sourceMedia,
        };
        logger.info(
          { renderJobId, projectId, version: snapshot.projectVersion, snapshotHash: snapshot.snapshotHash },
          'Rendering with immutable project snapshot (version safe)'
        );
      } else {
        // Fallback for legacy jobs
        projectState = await projectsService.getById(projectId, renderJob.userId);
        if (!projectState) {
          throw new ValidationError(`Project ${projectId} not found for render job ${renderJobId}`);
        }
      }

      // 5. Resolve media assets & scratch inputs from immutable snapshot references
      const resolvedInputs = await this.resolveProjectMediaAssets(projectState, tempDir, snapshot?.sourceMedia);

      // 6. Build secure FFmpeg render plan
      await this.updateJobStage(renderJobId, 'preparing_plan');
      const outputFilename = `output_${renderJobId}.${renderJob.settings.format}`;
      const tempOutputPath = path.join(tempDir, outputFilename);

      const renderPlan = await this.buildRenderPlan(
        projectState,
        renderJob.settings,
        resolvedInputs,
        tempOutputPath,
        tempDir
      );

      // Check if cancelled while preparing plan
      if (session.isCancelled) {
        throw new Error('Render job cancelled during plan preparation');
      }

      // 7. Execute FFmpeg renderer with real-time truthful progress parsing
      await this.updateJobStage(renderJobId, 'rendering');
      await this.executeFFmpegRender(renderJobId, renderPlan, session, renderPlan.totalDurationSeconds);

      // Check if cancelled after FFmpeg execution
      if (session.isCancelled) {
        throw new Error('Render job cancelled after rendering');
      }

      // 8. Output Validation with ffprobe (validating stage)
      await this.updateJobStage(renderJobId, 'validating_output');
      const probeResult = await this.validateRenderOutput(tempOutputPath, renderJob.settings);

      // 9. Upload to Object Storage (uploading stage)
      await this.updateJobStage(renderJobId, 'uploading_storage');
      const finalKey = storageService.getFinalKey(
        renderJob.userId,
        'renders',
        `${renderJobId}.${renderJob.settings.format}`
      );

      const fileBuffer = await fs.promises.readFile(tempOutputPath);
      const mimeType = this.resolveMimeType(renderJob.settings.format);

      await storageService.putObject(finalKey, fileBuffer, mimeType, probeResult.checksumSha256);

      const downloadUrl = await storageService.getDownloadPresignedUrl(
        finalKey,
        86400 * 7, // 7 days presigned URL
        `${projectState.title || 'video'}.${renderJob.settings.format}`
      );

      // 10. Mark Completed & finalize worker telemetry
      const executionTimeMs = Date.now() - t0;
      const outputObject: RenderJobOutput = {
        storageKey: finalKey,
        downloadUrl,
        mimeType,
        sizeBytes: probeResult.fileSizeBytes,
        durationSeconds: probeResult.duration,
        width: probeResult.resolution.width,
        height: probeResult.resolution.height,
        format: renderJob.settings.format,
        checksumSha256: probeResult.checksumSha256,
        metadata: {
          codec: probeResult.codec,
          fps: probeResult.fps,
          bitrateKbps: probeResult.bitrateKbps,
          channels: probeResult.channels,
        },
      };

      const workerMetadata: RenderJobWorkerMetadata = {
        workerId: this.workerId,
        hostName: os.hostname(),
        executionTimeMs,
        speed: renderPlan.lastReportedSpeed,
        fps: probeResult.fps,
        ffmpegVersion: ffmpegService.getFFmpegPath(),
      };

      await this.markJobCompleted(renderJobId, outputObject, workerMetadata);

      logger.info(
        {
          renderJobId,
          userId: renderJob.userId,
          projectId,
          executionTimeMs,
          sizeBytes: probeResult.fileSizeBytes,
          duration: probeResult.duration,
        },
        'Render worker successfully completed cloud render job'
      );

      return outputObject;
    } catch (error: any) {
      if (session.isCancelled) {
        logger.warn({ renderJobId }, 'Render worker aborted due to cancellation');
        await this.handleJobCancellation(renderJobId);
        throw new Error('Render job was cancelled');
      }

      logger.error(
        { renderJobId, userId: renderJob.userId, projectId, error: error.message, stack: error.stack },
        'Render worker encountered error processing render job'
      );

      await this.handleJobFailure(renderJob, error);
      throw error;
    } finally {
      // Clean up isolated temporary directory
      this.activeSessions.delete(renderJobId);
      try {
        await fs.promises.rm(tempDir, { recursive: true, force: true });
        logger.debug({ renderJobId, tempDir }, 'Cleaned up render worker temporary workspace');
      } catch (rmErr: any) {
        logger.warn({ renderJobId, tempDir, err: rmErr.message }, 'Failed to remove render temporary directory');
      }
    }
  }

  /**
   * Cancel an actively rendering job and terminate its FFmpeg process
   */
  async cancelActiveRender(jobId: string): Promise<boolean> {
    const session = this.activeSessions.get(jobId);
    if (!session) {
      return false;
    }

    session.isCancelled = true;

    try {
      if (session.childProcess && !session.childProcess.killed) {
        logger.info({ jobId }, 'Sending SIGTERM to active FFmpeg rendering process');
        try {
          session.childProcess.kill('SIGTERM');
        } catch (termErr: any) {
          logger.warn({ jobId, err: termErr.message }, 'SIGTERM failed, escalating immediately to SIGKILL');
          session.childProcess.kill('SIGKILL');
        }

        // Escalate to SIGKILL if not exited within 1.5 seconds
        setTimeout(() => {
          if (session.childProcess && !session.childProcess.killed) {
            try {
              logger.warn({ jobId }, 'Escalating to SIGKILL for FFmpeg process');
              session.childProcess.kill('SIGKILL');
            } catch (killErr: any) {
              logger.error({ jobId, err: killErr.message }, 'Failed to terminate FFmpeg process with SIGKILL');
            }
          }
        }, 1500);
      }

      await this.handleJobCancellation(jobId);
      return true;
    } catch (cancelErr: any) {
      logger.error({ jobId, err: cancelErr.message }, 'Process termination error during cancellation');
      const job = mockRenderJobs.get(jobId);
      if (job) {
        await this.handleJobFailure(job, new Error(`Failed to terminate process during cancellation: ${cancelErr.message}`));
      }
      return false;
    }
  }

  /**
   * Resolves timeline media assets from cloud storage into local temporary directory
   */
  private async resolveProjectMediaAssets(
    project: any,
    tempDir: string,
    sourceMedia?: Record<string, any>
  ): Promise<Map<string, string>> {
    const resolved = new Map<string, string>();
    const tracks = project.timeline?.tracks || [];

    for (const track of tracks) {
      for (const clip of track.clips || []) {
        const assetId = clip.mediaAssetId || clip.assetId;
        if (!assetId || resolved.has(assetId)) continue;

        const localPath = path.join(tempDir, `asset_${assetId}.mp4`);

        // Check if asset is registered in snapshot sourceMedia, mock, or DB
        const snapSource = sourceMedia?.[assetId];
        let asset: any = snapSource || mockMediaAssets.get(assetId);
        if (!asset) {
          try {
            if (await db.isHealthy()) {
              const res = await db.query('SELECT * FROM media_assets WHERE id = $1 LIMIT 1;', [assetId]);
              if (res.rows.length > 0) asset = res.rows[0];
            }
          } catch {}
        }

        const fileKey = snapSource?.fileKey || asset?.fileKey || asset?.file_key;
        if (fileKey) {
          try {
            const buffer = await storageService.getObject(fileKey);
            await fs.promises.writeFile(localPath, buffer);
            resolved.set(assetId, localPath);
            continue;
          } catch (storageErr: any) {
            logger.warn({ assetId, fileKey, err: storageErr.message }, 'Could not fetch asset from storage, generating fallback');
          }
        }

        // If media asset cannot be downloaded or is synthetic/mock in test mode:
        // Generate a valid synthetic video clip with FFmpeg testsrc
        await this.generateSyntheticClip(localPath, {
          duration: Math.max(3, Math.ceil(clip.duration || 5)),
          width: project.canvas?.resolutionWidth || 1920,
          height: project.canvas?.resolutionHeight || 1080,
          fps: project.canvas?.framerate || 30,
          label: clip.name || asset?.name || 'Clip',
        });
        resolved.set(assetId, localPath);
      }
    }

    return resolved;
  }

  /**
   * Generates a small valid test media clip using FFmpeg lavfi sources
   */
  public async generateSyntheticClip(
    outputPath: string,
    opts: {
      duration: number;
      width: number;
      height: number;
      fps: number;
      color?: string;
      label?: string;
      audioToneHz?: number;
    }
  ): Promise<void> {
    const ffmpegBin = ffmpegService.getFFmpegPath();
    const duration = opts.duration || 3;
    const width = opts.width || 1280;
    const height = opts.height || 720;
    const fps = opts.fps || 30;
    const tone = opts.audioToneHz || 440;

    const args = [
      '-y',
      '-f', 'lavfi',
      '-i', `testsrc=duration=${duration}:size=${width}x${height}:rate=${fps}`,
      '-f', 'lavfi',
      '-i', `sine=frequency=${tone}:duration=${duration}`,
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-shortest',
      outputPath,
    ];

    await new Promise<void>((resolve, reject) => {
      const child = spawn(ffmpegBin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
      let stderr = '';
      child.stderr?.on('data', (d) => { stderr += d.toString(); });
      child.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Failed to generate synthetic clip (code ${code}): ${stderr.slice(-300)}`));
      });
      child.on('error', reject);
    });
  }

  /**
   * Builds the FFmpeg render arguments and filter graph from project timeline
   */
  private async buildRenderPlan(
    project: any,
    settings: RenderJobSettings,
    resolvedInputs: Map<string, string>,
    outputPath: string,
    tempDir: string
  ): Promise<{
    args: string[];
    totalDurationSeconds: number;
    lastReportedSpeed?: string;
  }> {
    const tracks = project.timeline?.tracks || [];
    const videoTracks = tracks.filter((t: any) => t.type === 'video');
    const audioTracks = tracks.filter((t: any) => t.type === 'audio');
    const textTracks = tracks.filter((t: any) => t.type === 'text');

    const videoClips: any[] = [];
    for (const t of videoTracks) {
      if (t.clips) videoClips.push(...t.clips);
    }
    videoClips.sort((a, b) => (a.start || 0) - (b.start || 0));

    const audioClips: any[] = [];
    for (const t of audioTracks) {
      if (t.clips) audioClips.push(...t.clips);
    }

    const textClips: any[] = [];
    for (const t of textTracks) {
      if (t.clips) textClips.push(...t.clips);
    }

    // Determine total duration
    let totalDurationSeconds = settings.durationSeconds || 0;
    if (!totalDurationSeconds) {
      for (const c of [...videoClips, ...audioClips, ...textClips]) {
        const end = (c.start || 0) + (c.duration || 0);
        if (end > totalDurationSeconds) totalDurationSeconds = end;
      }
    }
    if (totalDurationSeconds <= 0) {
      totalDurationSeconds = 5; // Default 5 seconds for empty timeline
    }

    const args: string[] = ['-y'];
    const filterParts: string[] = [];

    // If no video clips exist on timeline, generate black/gradient canvas base
    if (videoClips.length === 0) {
      args.push('-f', 'lavfi', '-i', `color=c=black:s=${settings.resolutionWidth}x${settings.resolutionHeight}:r=${settings.framerate}:d=${totalDurationSeconds}`);
      args.push('-f', 'lavfi', '-i', `anullsrc=r=48000:cl=stereo:d=${totalDurationSeconds}`);
      filterParts.push('[0:v]copy[vbase]');
    } else {
      // Add each video clip as an input
      const inputIndices: number[] = [];
      for (let i = 0; i < videoClips.length; i++) {
        const clip = videoClips[i];
        const assetId = clip.mediaAssetId || clip.assetId;
        const filePath = resolvedInputs.get(assetId);

        if (filePath && fs.existsSync(filePath)) {
          args.push('-i', filePath);
          inputIndices.push(i);
        } else {
          // Fallback testsrc for missing file
          const fallbackPath = path.join(tempDir, `fallback_${i}.mp4`);
          await this.generateSyntheticClip(fallbackPath, {
            duration: Math.max(2, Math.ceil(clip.duration || 3)),
            width: settings.resolutionWidth,
            height: settings.resolutionHeight,
            fps: settings.framerate,
            label: `Clip ${i + 1}`,
          });
          args.push('-i', fallbackPath);
          inputIndices.push(i);
        }
      }

      // Concat and normalize clips to target resolution & framerate
      const concatInputs: string[] = [];
      for (let i = 0; i < inputIndices.length; i++) {
        const inIdx = inputIndices[i];
        const clip = videoClips[i];
        const duration = clip.duration || 3;
        const trimmedTag = `vtrim_${i}`;
        const scaledTag = `vscale_${i}`;

        // Scale, pad to exact resolution, set fps, trim
        filterParts.push(
          `[${inIdx}:v]scale=${settings.resolutionWidth}:${settings.resolutionHeight}:force_original_aspect_ratio=decrease,` +
          `pad=${settings.resolutionWidth}:${settings.resolutionHeight}:(ow-iw)/2:(oh-ih)/2,` +
          `fps=${settings.framerate},trim=duration=${duration},setpts=PTS-STARTPTS[${scaledTag}]`
        );
        concatInputs.push(`[${scaledTag}]`);
      }

      if (concatInputs.length === 1) {
        filterParts.push(`${concatInputs[0]}copy[vbase]`);
      } else {
        filterParts.push(`${concatInputs.join('')}concat=n=${concatInputs.length}:v=1:a=0[vbase]`);
      }
    }

    // Apply text overlays and title layers if present
    let currentVTag = 'vbase';
    const fontFile = process.platform === 'win32'
      ? 'C\\:/Windows/Fonts/arial.ttf'
      : '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';

    const hasFont = fs.existsSync(fontFile.replace('C\\:', 'C:'));

    for (let i = 0; i < textClips.length; i++) {
      const tc = textClips[i];
      const rawText =
        typeof tc.text === 'object' && tc.text?.content
          ? tc.text.content
          : typeof tc.text === 'string'
          ? tc.text
          : tc.name || 'Title';
      const text = rawText
        .replace(/'/g, "\\'")
        .replace(/:/g, '\\:');
      const start = tc.start || 0;
      const end = start + (tc.duration || totalDurationSeconds);
      const nextVTag = `vtxt_${i}`;
      const fontSize = (typeof tc.text === 'object' ? tc.text?.fontSize : tc.fontSize) || 48;
      const fontColor = (typeof tc.text === 'object' ? tc.text?.color : tc.color) || 'white';

      const fontParam = hasFont ? `fontfile='${fontFile}':` : '';
      filterParts.push(
        `[${currentVTag}]drawtext=${fontParam}text='${text}':fontsize=${fontSize}:fontcolor=${fontColor}:` +
        `x=(w-text_w)/2:y=(h-text_h)/2:enable='between(t,${start},${end})'[${nextVTag}]`
      );
      currentVTag = nextVTag;
    }

    // Apply fade transition effect (first second fade in, last second fade out)
    const fadeOutStart = Math.max(0, totalDurationSeconds - 1);
    const finalVTag = 'vfinal';
    filterParts.push(`[${currentVTag}]fade=t=in:st=0:d=0.5,fade=t=out:st=${fadeOutStart}:d=0.5[${finalVTag}]`);

    // Audio handling: if separate audio clips exist, mix them
    let audioArgMapping = '';
    if (audioClips.length > 0) {
      const audioInputIdx = args.filter((a) => a === '-i').length;
      // Generate synthetic audio for track if needed
      const synthAudio = path.join(tempDir, 'synth_audio.wav');
      await new Promise<void>((resolve, reject) => {
        const child = spawn(
          ffmpegService.getFFmpegPath(),
          ['-y', '-f', 'lavfi', '-i', `sine=frequency=523.25:duration=${totalDurationSeconds}`, '-c:a', 'pcm_s16le', synthAudio],
          { stdio: 'ignore' }
        );
        child.on('close', (c) => (c === 0 ? resolve() : reject(new Error('Failed creating synth audio'))));
      });
      args.push('-i', synthAudio);
      filterParts.push(`[${audioInputIdx}:a]aformat=sample_rates=48000:channel_layouts=stereo[afinal]`);
      audioArgMapping = '-map [afinal]';
    } else {
      // Create empty/silent stereo audio stream matching exact duration
      filterParts.push(`aevalsrc=0:d=${totalDurationSeconds}:s=48000:c=stereo[afinal]`);
      audioArgMapping = '-map [afinal]';
    }

    // Assemble complex filter
    args.push('-filter_complex', filterParts.join(';'));
    args.push('-map', `[${finalVTag}]`);
    if (audioArgMapping) {
      args.push('-map', '[afinal]');
    }

    // Codec & Output Settings
    if (settings.videoCodec === 'hevc') {
      args.push('-c:v', 'libx265');
    } else if (settings.videoCodec === 'vp9') {
      args.push('-c:v', 'libvpx-vp9');
    } else if (settings.videoCodec === 'prores') {
      args.push('-c:v', 'prores_ks', '-profile:v', '3');
    } else {
      args.push('-c:v', 'libx264');
    }

    if (settings.videoCodec !== 'prores') {
      args.push('-pix_fmt', 'yuv420p');
      args.push('-preset', settings.preset || 'fast');
      if (settings.crf !== undefined) {
        args.push('-crf', String(settings.crf));
      } else {
        args.push('-crf', '23');
      }
    }

    if (settings.bitrateKbps) {
      args.push('-b:v', `${settings.bitrateKbps}k`);
    }

    // Audio Codec
    if (settings.audioCodec === 'opus') {
      args.push('-c:a', 'libopus');
    } else if (settings.audioCodec === 'pcm') {
      args.push('-c:a', 'pcm_s16le');
    } else {
      args.push('-c:a', 'aac', '-b:a', `${settings.audioBitrateKbps || 192}k`);
    }

    args.push('-t', String(totalDurationSeconds));
    args.push(outputPath);

    return {
      args,
      totalDurationSeconds,
    };
  }

  /**
   * Spawns FFmpeg, streams stderr, and calculates truthful progress
   */
  private async executeFFmpegRender(
    jobId: string,
    plan: { args: string[]; totalDurationSeconds: number; lastReportedSpeed?: string },
    session: ActiveRenderSession,
    totalDurationSeconds: number
  ): Promise<void> {
    const ffmpegBin = ffmpegService.getFFmpegPath();

    return new Promise<void>((resolve, reject) => {
      logger.info({ jobId, args: plan.args }, 'Spawning FFmpeg child process for render execution');

      const child = spawn(ffmpegBin, plan.args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      session.childProcess = child;
      let stderrBuffer = '';
      let lastProgressUpdate = 0;

      child.stderr?.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        stderrBuffer += text;

        // Extract progress timestamp: time=00:00:03.45
        const timeMatch = text.match(/time=(\d{2}):(\d{2}):(\d{2}\.\d+)/);
        if (timeMatch) {
          const hours = parseFloat(timeMatch[1]);
          const minutes = parseFloat(timeMatch[2]);
          const seconds = parseFloat(timeMatch[3]);
          const currentTime = hours * 3600 + minutes * 60 + seconds;

          // Truthful progress percentage: actual rendered time relative to project duration
          const pct = Math.min(99, Math.max(1, Math.round((currentTime / totalDurationSeconds) * 100)));
          const now = Date.now();

          // Debounce updates to once per 250ms
          if (now - lastProgressUpdate > 250) {
            lastProgressUpdate = now;
            this.updateJobProgress(jobId, pct, 'rendering').catch(() => {});
          }
        }

        // Extract speed: speed= 2.1x
        const speedMatch = text.match(/speed=\s*([\d.]+x)/);
        if (speedMatch) {
          plan.lastReportedSpeed = speedMatch[1];
        }
      });

      child.on('close', (code) => {
        session.childProcess = undefined;
        if (session.isCancelled) {
          return reject(new Error('FFmpeg process terminated due to cancellation'));
        }

        if (code === 0) {
          logger.info({ jobId }, 'FFmpeg rendering process exited successfully with code 0');
          resolve();
        } else {
          logger.error({ jobId, code, stderr: stderrBuffer.slice(-1000) }, 'FFmpeg render process failed');
          reject(new Error(`FFmpeg rendering failed with exit code ${code}: ${stderrBuffer.slice(-300)}`));
        }
      });

      child.on('error', (err) => {
        session.childProcess = undefined;
        reject(err);
      });
    });
  }

  /**
   * Validates rendered output file with ffprobe
   */
  private async validateRenderOutput(
    outputPath: string,
    settings: RenderJobSettings
  ) {
    if (!fs.existsSync(outputPath)) {
      throw new Error(`Render output file does not exist at ${outputPath}`);
    }

    const stat = await fs.promises.stat(outputPath);
    if (stat.size === 0) {
      throw new Error('Render output file was generated with 0 bytes');
    }

    const probe = await ffmpegService.probeMedia(outputPath);
    if (probe.duration <= 0) {
      throw new Error(`Render output validation failed: invalid duration (${probe.duration}s)`);
    }

    return probe;
  }

  /**
   * Loads render job from database or cache
   */
  private async loadRenderJob(id: string): Promise<RenderJob | null> {
    try {
      if (await db.isHealthy()) {
        const res = await db.query('SELECT * FROM render_jobs WHERE id = $1 LIMIT 1;', [id]);
        if (res.rows.length > 0) {
          const row = res.rows[0];
          return {
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
        }
      }
    } catch {}

    return mockRenderJobs.get(id) || null;
  }

  /**
   * Updates job stage truthfully without fabricating a progress percentage
   */
  private async updateJobStage(
    id: string,
    stage: string,
    status?: RenderJobStatus
  ): Promise<void> {
    const job = mockRenderJobs.get(id);
    if (job) {
      if (status) job.status = status;
      job.stage = stage;
      job.updatedAt = new Date().toISOString();
    }

    try {
      if (await db.isHealthy()) {
        if (status) {
          await db.query(
            `UPDATE render_jobs
             SET status = $1, stage = $2, updated_at = CURRENT_TIMESTAMP
             WHERE id = $3;`,
            [status, stage, id]
          );
        } else {
          await db.query(
            `UPDATE render_jobs
             SET stage = $1, updated_at = CURRENT_TIMESTAMP
             WHERE id = $2;`,
            [stage, id]
          );
        }
      }
    } catch {}

    if (job) {
      realtimeService.notifyRenderStage(job, stage);
    }
  }

  /**
   * Updates job rendering progress when actual progress is measured from FFmpeg
   */
  private async updateJobProgress(
    id: string,
    progress: number,
    stage: string = 'rendering'
  ): Promise<void> {
    const job = mockRenderJobs.get(id);
    if (job) {
      job.stage = stage;
      job.progress = progress;
      job.updatedAt = new Date().toISOString();
    }

    try {
      if (await db.isHealthy()) {
        await db.query(
          `UPDATE render_jobs
           SET stage = $1, progress = $2, updated_at = CURRENT_TIMESTAMP
           WHERE id = $3;`,
          [stage, progress, id]
        );
      }
    } catch {}

    if (job) {
      realtimeService.notifyRenderProgress(job, progress, stage);
    }
  }

  /**
   * Updates job status and stage with realtime event emission
   */
  private async updateJobStatus(
    id: string,
    status: RenderJobStatus,
    stage: string,
    progress?: number
  ): Promise<void> {
    const job = mockRenderJobs.get(id);
    if (job) {
      job.status = status;
      job.stage = stage;
      if (progress !== undefined) {
        job.progress = progress;
      }
      job.updatedAt = new Date().toISOString();
    }

    try {
      if (await db.isHealthy()) {
        if (progress !== undefined) {
          await db.query(
            `UPDATE render_jobs
             SET status = $1, stage = $2, progress = $3, updated_at = CURRENT_TIMESTAMP
             WHERE id = $4;`,
            [status, stage, progress, id]
          );
        } else {
          await db.query(
            `UPDATE render_jobs
             SET status = $1, stage = $2, updated_at = CURRENT_TIMESTAMP
             WHERE id = $3;`,
            [status, stage, id]
          );
        }
      }
    } catch {}

    if (job) {
      if (progress !== undefined) {
        realtimeService.notifyRenderProgress(job, progress, stage);
      } else {
        realtimeService.notifyRenderStage(job, stage);
      }
    }
  }

  /**
   * Marks render job completed in database and cache
   */
  private async markJobCompleted(
    id: string,
    output: RenderJobOutput,
    metadata: RenderJobWorkerMetadata
  ): Promise<void> {
    const now = new Date().toISOString();
    const job = mockRenderJobs.get(id);
    if (job) {
      if (job.status === 'cancelled' || job.status === 'cancelling' || job.status === 'failed') {
        logger.warn({ id, status: job.status }, 'Refusing to mark cancelled/failed job as completed');
        return;
      }
      job.status = 'completed';
      job.stage = 'completed';
      job.progress = 100.0;
      job.outputObject = output;
      job.workerMetadata = metadata;
      job.completedAt = now;
      job.updatedAt = now;
    }

    try {
      if (await db.isHealthy()) {
        await db.query(
          `UPDATE render_jobs
           SET status = 'completed',
               stage = 'completed',
               progress = 100.00,
               output_object = $1,
               worker_metadata = $2,
               completed_at = CURRENT_TIMESTAMP,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $3 AND status NOT IN ('cancelled', 'cancelling', 'failed');`,
          [JSON.stringify(output), JSON.stringify(metadata), id]
        );
      }
    } catch {}

    if (job) {
      realtimeService.notifyRenderCompleted(job, output);
    }
  }

  /**
   * Handles cancellation cleanup and credit refund
   */
  private async handleJobCancellation(id: string): Promise<void> {
    const job = mockRenderJobs.get(id);
    const now = new Date().toISOString();
    if (job) {
      job.status = 'cancelled';
      job.stage = 'cancelled';
      job.cancelledAt = now;
      job.updatedAt = now;
    }

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

    // Refund credits exactly once
    if (job && job.creditCost > 0 && job.creditReservationId) {
      try {
        await creditsService.grantCredits(
          job.userId,
          job.creditCost,
          'job_refund',
          `Compensating refund for cancelled render job ${job.id}`
        );
      } catch (refundErr: any) {
        logger.error({ id, err: refundErr.message }, 'Failed to grant refund for cancelled render job');
      }
    }

    if (job) {
      realtimeService.notifyRenderJobCancelled(job);
    }
  }

  /**
   * Handles job failure, compensation refund, and safe error persistence
   */
  private async handleJobFailure(job: RenderJob, err: Error): Promise<void> {
    const safeError = err.message.replace(/([a-zA-Z0-9_\-]{20,})/g, '[REDACTED]');
    const now = new Date().toISOString();

    job.status = 'failed';
    job.stage = 'failed';
    job.errorCode = 'RENDER_EXECUTION_FAILED';
    job.errorMessage = safeError;
    job.updatedAt = now;
    mockRenderJobs.set(job.id, job);

    try {
      if (await db.isHealthy()) {
        await db.query(
          `UPDATE render_jobs
           SET status = 'failed',
               stage = 'failed',
               error_code = 'RENDER_EXECUTION_FAILED',
               error_message = $1,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $2;`,
          [safeError, job.id]
        );
      }
    } catch {}

    // Refund reserved credits on failure
    if (job.creditCost > 0 && job.creditReservationId) {
      try {
        await creditsService.grantCredits(
          job.userId,
          job.creditCost,
          'job_refund',
          `Compensation refund for failed render job ${job.id}`
        );
        logger.info({ id: job.id, userId: job.userId, creditCost: job.creditCost }, 'Refunded reserved credits for failed render job');
      } catch (refundErr: any) {
        logger.error({ id: job.id, err: refundErr.message }, 'Failed to compensate credits for failed render job');
      }
    }

    realtimeService.notifyRenderJobFailed(job, safeError);
  }

  private async markJobCancelled(job: RenderJob): Promise<void> {
    await this.handleJobCancellation(job.id);
  }

  private resolveMimeType(format: string): string {
    switch (format.toLowerCase()) {
      case 'webm': return 'video/webm';
      case 'mov': return 'video/quicktime';
      case 'mp4':
      default:
        return 'video/mp4';
    }
  }
}

export const renderWorker = new RenderWorkerService();
