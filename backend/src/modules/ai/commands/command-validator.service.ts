import {
  EditorCommand,
  CommandValidationResult,
  CommandExecutionPreview,
} from './editor-command.types.js';
import { editorCommandSchema } from './editor-command.schemas.js';
import { logger } from '../../../core/logger.js';

export class CommandValidatorService {
  /**
   * Validates a batch of EditorCommands against strict schema and domain constraints.
   * Ensures zero arbitrary code execution and guarantees physical timeline feasibility.
   */
  validate(commands: EditorCommand[], timelineDuration: number = 60): CommandValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const validatedCommands: EditorCommand[] = [];

    if (!Array.isArray(commands) || commands.length === 0) {
      errors.push('Command list cannot be empty');
      return { valid: false, errors, warnings, validatedCommands: [] };
    }

    for (let i = 0; i < commands.length; i++) {
      const rawCmd = commands[i];
      const parseResult = editorCommandSchema.safeParse(rawCmd);

      if (!parseResult.success) {
        errors.push(`Command #${i + 1} (${rawCmd.action || 'unknown'}) failed schema validation: ${parseResult.error.message}`);
        continue;
      }

      const cmd = parseResult.data as EditorCommand;

      // 1. Time range bounds checking
      if (cmd.timeRange) {
        if (cmd.timeRange.start < 0) {
          errors.push(`Command #${i + 1} (${cmd.action}): start time must be non-negative (got ${cmd.timeRange.start})`);
        }
        if (cmd.timeRange.end < cmd.timeRange.start) {
          errors.push(`Command #${i + 1} (${cmd.action}): end time (${cmd.timeRange.end}) cannot precede start time (${cmd.timeRange.start})`);
        }
        if (cmd.timeRange.start > timelineDuration && timelineDuration > 0) {
          warnings.push(`Command #${i + 1} (${cmd.action}): start time (${cmd.timeRange.start}s) is past current timeline end (${timelineDuration}s)`);
        }
      }

      // 2. Action-specific parameter constraints
      switch (cmd.action) {
        case 'DELETE_RANGE': {
          const start = cmd.parameters.start as number;
          const end = cmd.parameters.end as number;
          if (typeof start === 'number' && typeof end === 'number' && start >= end) {
            errors.push(`Command #${i + 1} DELETE_RANGE: start (${start}) must be strictly less than end (${end})`);
          }
          break;
        }

        case 'ADD_CONTRAST': {
          const contrast = cmd.parameters.contrast as number;
          if (typeof contrast === 'number' && (contrast < 0 || contrast > 5)) {
            errors.push(`Command #${i + 1} ADD_CONTRAST: contrast multiplier must be between 0.0 and 5.0 (got ${contrast})`);
          }
          break;
        }

        case 'ADD_SATURATION': {
          const saturation = cmd.parameters.saturation as number;
          if (typeof saturation === 'number' && (saturation < 0 || saturation > 5)) {
            errors.push(`Command #${i + 1} ADD_SATURATION: saturation multiplier must be between 0.0 and 5.0 (got ${saturation})`);
          }
          break;
        }

        case 'ADJUST_VOLUME': {
          const volume = cmd.parameters.volume as number;
          if (typeof volume === 'number' && (volume < 0 || volume > 10)) {
            errors.push(`Command #${i + 1} ADJUST_VOLUME: volume multiplier must be between 0 and 10 (got ${volume})`);
          }
          break;
        }

        case 'SET_CANVAS_ASPECT_RATIO': {
          const ratio = cmd.parameters.aspectRatio as string;
          const validRatios = ['16:9', '9:16', '1:1', '4:5', '21:9'];
          if (ratio && !validRatios.includes(ratio)) {
            errors.push(`Command #${i + 1} SET_CANVAS_ASPECT_RATIO: unsupported aspect ratio "${ratio}"`);
          }
          break;
        }
      }

      validatedCommands.push(cmd);
    }

    const valid = errors.length === 0;
    logger.info({ valid, commandCount: commands.length, errorCount: errors.length }, 'Completed command validation');

    return {
      valid,
      errors,
      warnings,
      validatedCommands,
    };
  }

  /**
   * Generates execution preview diff and ProjectBloc-compatible event stream
   */
  generatePreview(commands: EditorCommand[], currentDuration: number = 60): CommandExecutionPreview {
    const affectedClips = new Set<string>();
    const affectedTracks = new Set<string>();
    let timelineDurationDelta = 0;
    const blocActions: Array<{ type: string; payload: Record<string, unknown> }> = [];

    for (const cmd of commands) {
      if (cmd.targetClipId) affectedClips.add(cmd.targetClipId);
      if (cmd.targetTrackId) affectedTracks.add(cmd.targetTrackId);

      // Duration Delta Calculations
      if (cmd.action === 'DELETE_RANGE') {
        const start = (cmd.timeRange?.start ?? cmd.parameters.start ?? 0) as number;
        const end = (cmd.timeRange?.end ?? cmd.parameters.end ?? 0) as number;
        const diff = Math.max(0, end - start);
        timelineDurationDelta -= diff;

        blocActions.push({
          type: 'ProjectBloc.DeleteTimelineRange',
          payload: { start, end, ripple: cmd.parameters.ripple ?? true },
        });
      } else if (cmd.action === 'SET_TIMELINE_DURATION') {
        const target = cmd.parameters.targetDurationSeconds as number;
        if (typeof target === 'number') {
          timelineDurationDelta = target - currentDuration;
        }
        blocActions.push({
          type: 'ProjectBloc.SetTimelineDuration',
          payload: { duration: target },
        });
      } else if (cmd.action === 'ADD_COLOR_PRESET') {
        blocActions.push({
          type: 'ProjectBloc.ApplyColorPreset',
          payload: { clipId: cmd.targetClipId, preset: cmd.parameters.preset, intensity: cmd.parameters.intensity },
        });
      } else if (cmd.action === 'SET_CANVAS_ASPECT_RATIO') {
        blocActions.push({
          type: 'ProjectBloc.SetCanvasAspectRatio',
          payload: { aspectRatio: cmd.parameters.aspectRatio, width: cmd.parameters.width, height: cmd.parameters.height },
        });
      } else if (cmd.action === 'AUTO_REFRAME') {
        blocActions.push({
          type: 'ProjectBloc.AutoReframe',
          payload: { trackingMode: cmd.parameters.trackingMode, smoothing: cmd.parameters.smoothing },
        });
      } else if (cmd.action === 'GENERATE_CAPTIONS') {
        blocActions.push({
          type: 'ProjectBloc.AddCaptionTrack',
          payload: { style: cmd.parameters.style, uppercase: cmd.parameters.uppercase },
        });
      } else {
        blocActions.push({
          type: `ProjectBloc.${cmd.action}`,
          payload: { ...cmd.parameters, targetClipId: cmd.targetClipId, targetTrackId: cmd.targetTrackId },
        });
      }
    }

    const newEstimatedDuration = Math.max(0, currentDuration + timelineDurationDelta);
    const summary = `Preview: ${commands.length} command(s) will modify ${affectedClips.size} clip(s), ${affectedTracks.size} track(s). Timeline duration changes by ${timelineDurationDelta > 0 ? '+' : ''}${timelineDurationDelta.toFixed(1)}s (new length: ${newEstimatedDuration.toFixed(1)}s).`;

    return {
      affectedClips: Array.from(affectedClips),
      affectedTracks: Array.from(affectedTracks),
      timelineDurationDelta,
      newEstimatedDuration,
      summary,
      projectBlocActions: blocActions,
    };
  }
}

export const commandValidatorService = new CommandValidatorService();
