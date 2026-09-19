import { v4 as uuidv4 } from 'uuid';
import {
  EditorCommand,
  TimelinePreviewDiff,
  CommandValidationResult,
  DeleteRangeCommand,
} from './editing-analysis.types.js';

/**
 * Normalizes, validates, and merges Editor Commands.
 * Resolves overlapping cut intervals to prevent double-cutting errors in the timeline engine.
 */
export class CommandNormalizer {
  /**
   * Validates a batch of commands, checks boundaries, merges overlapping cut ranges,
   * and calculates projected preview metrics without touching the project timeline.
   */
  static validateAndNormalize(commands: EditorCommand[], mediaDuration = 0): CommandValidationResult {
    const errors: string[] = [];
    const normalized: EditorCommand[] = [];

    for (const cmd of commands) {
      const id = cmd.id || uuidv4();

      switch (cmd.type) {
        case 'DELETE_RANGE': {
          if (cmd.start < 0) {
            errors.push(`Command ${id} (DELETE_RANGE): start (${cmd.start}) cannot be negative.`);
            continue;
          }
          if (cmd.end <= cmd.start) {
            errors.push(`Command ${id} (DELETE_RANGE): end (${cmd.end}) must be greater than start (${cmd.start}).`);
            continue;
          }
          if (mediaDuration > 0 && cmd.start >= mediaDuration) {
            errors.push(`Command ${id} (DELETE_RANGE): start (${cmd.start}) exceeds duration (${mediaDuration}).`);
            continue;
          }

          const safeEnd = mediaDuration > 0 ? Math.min(cmd.end, mediaDuration) : cmd.end;
          const durationSaved = Math.max(0, Math.round((safeEnd - cmd.start) * 1000) / 1000);

          normalized.push({
            ...cmd,
            id,
            start: Math.round(cmd.start * 1000) / 1000,
            end: safeEnd,
            durationSaved,
            accepted: cmd.accepted !== undefined ? cmd.accepted : true,
          });
          break;
        }

        case 'REMOVE_FILLER': {
          if (cmd.start < 0) {
            errors.push(`Command ${id} (REMOVE_FILLER): start (${cmd.start}) cannot be negative.`);
            continue;
          }
          if (cmd.end <= cmd.start) {
            errors.push(`Command ${id} (REMOVE_FILLER): end (${cmd.end}) must be greater than start (${cmd.start}).`);
            continue;
          }

          const padding = cmd.padding !== undefined ? cmd.padding : 0.04;
          const cutStart = Math.max(0, cmd.start - padding);
          const cutEnd = mediaDuration > 0 ? Math.min(cmd.end + padding, mediaDuration) : cmd.end + padding;
          const durationSaved = Math.max(0, Math.round((cutEnd - cutStart) * 1000) / 1000);

          normalized.push({
            ...cmd,
            id,
            word: cmd.word.trim(),
            start: Math.round(cmd.start * 1000) / 1000,
            end: Math.round(cmd.end * 1000) / 1000,
            padding,
            durationSaved,
            accepted: cmd.accepted !== undefined ? cmd.accepted : true,
          });
          break;
        }

        case 'SHORTEN_PAUSE': {
          if (cmd.start < 0 || cmd.end <= cmd.start) {
            errors.push(`Command ${id} (SHORTEN_PAUSE): invalid range [${cmd.start}, ${cmd.end}].`);
            continue;
          }
          const rawDuration = cmd.end - cmd.start;
          const target = cmd.targetDuration !== undefined ? cmd.targetDuration : 0.4;
          const durationSaved = Math.max(0, Math.round((rawDuration - target) * 1000) / 1000);

          normalized.push({
            ...cmd,
            id,
            start: Math.round(cmd.start * 1000) / 1000,
            end: Math.round(cmd.end * 1000) / 1000,
            targetDuration: target,
            durationSaved,
            accepted: cmd.accepted !== undefined ? cmd.accepted : true,
          });
          break;
        }

        case 'SCENE_SPLIT': {
          if (cmd.time < 0) {
            errors.push(`Command ${id} (SCENE_SPLIT): time (${cmd.time}) cannot be negative.`);
            continue;
          }
          if (mediaDuration > 0 && cmd.time >= mediaDuration) {
            errors.push(`Command ${id} (SCENE_SPLIT): time (${cmd.time}) exceeds duration (${mediaDuration}).`);
            continue;
          }

          normalized.push({
            ...cmd,
            id,
            time: Math.round(cmd.time * 1000) / 1000,
            accepted: cmd.accepted !== undefined ? cmd.accepted : true,
          });
          break;
        }

        case 'CREATE_HIGHLIGHT_CLIP': {
          if (cmd.start < 0 || cmd.end <= cmd.start) {
            errors.push(`Command ${id} (CREATE_HIGHLIGHT_CLIP): invalid range [${cmd.start}, ${cmd.end}].`);
            continue;
          }
          normalized.push({
            ...cmd,
            id,
            start: Math.round(cmd.start * 1000) / 1000,
            end: Math.round(cmd.end * 1000) / 1000,
            accepted: cmd.accepted !== undefined ? cmd.accepted : true,
          });
          break;
        }

        case 'ADD_MARKER': {
          if (cmd.time < 0) {
            errors.push(`Command ${id} (ADD_MARKER): time (${cmd.time}) cannot be negative.`);
            continue;
          }
          normalized.push({
            ...cmd,
            id,
            time: Math.round(cmd.time * 1000) / 1000,
            accepted: cmd.accepted !== undefined ? cmd.accepted : true,
          });
          break;
        }
      }
    }

    // Calculate preview diff
    const previewMetrics = this.computePreviewDiff(normalized, mediaDuration);

    return {
      isValid: errors.length === 0,
      errors,
      normalizedCommands: normalized,
      previewMetrics,
    };
  }

  /**
   * Merges overlapping cut ranges (DELETE_RANGE, REMOVE_FILLER, SHORTEN_PAUSE)
   * into clean, non-overlapping spans.
   */
  static mergeOverlappingCutSpans(
    cutCommands: Array<{ start: number; end: number; id: string }>
  ): Array<{ start: number; end: number; sourceIds: string[] }> {
    if (cutCommands.length === 0) return [];

    // Sort by start time ascending
    const sorted = [...cutCommands].sort((a, b) => a.start - b.start);
    const merged: Array<{ start: number; end: number; sourceIds: string[] }> = [];

    let current = {
      start: sorted[0].start,
      end: sorted[0].end,
      sourceIds: [sorted[0].id],
    };

    for (let i = 1; i < sorted.length; i++) {
      const next = sorted[i];

      // If overlapping or contiguous
      if (next.start <= current.end) {
        current.end = Math.max(current.end, next.end);
        current.sourceIds.push(next.id);
      } else {
        merged.push(current);
        current = {
          start: next.start,
          end: next.end,
          sourceIds: [next.id],
        };
      }
    }
    merged.push(current);

    return merged;
  }

  /**
   * Computes high-level preview diff metrics
   */
  static computePreviewDiff(commands: EditorCommand[], originalDuration: number): TimelinePreviewDiff {
    const acceptedCommands = commands.filter((c) => c.accepted !== false);

    // Extract all cutting intervals
    const cutIntervals: Array<{ start: number; end: number; id: string }> = [];

    let splitsCount = 0;

    for (const cmd of acceptedCommands) {
      if (cmd.type === 'DELETE_RANGE') {
        cutIntervals.push({ start: cmd.start, end: cmd.end, id: cmd.id });
      } else if (cmd.type === 'REMOVE_FILLER') {
        const pad = cmd.padding || 0.04;
        cutIntervals.push({ start: Math.max(0, cmd.start - pad), end: cmd.end + pad, id: cmd.id });
      } else if (cmd.type === 'SHORTEN_PAUSE') {
        // Cut portion is end - targetDuration
        const cutSpan = (cmd.end - cmd.start) - (cmd.targetDuration || 0.4);
        if (cutSpan > 0) {
          cutIntervals.push({ start: cmd.start, end: cmd.start + cutSpan, id: cmd.id });
        }
      } else if (cmd.type === 'SCENE_SPLIT') {
        splitsCount++;
      }
    }

    const mergedCuts = this.mergeOverlappingCutSpans(cutIntervals);
    const totalDurationSaved = mergedCuts.reduce((acc, cut) => acc + (cut.end - cut.start), 0);

    const roundedSaved = Math.round(totalDurationSaved * 1000) / 1000;
    const projectedDuration = Math.max(0, Math.round((originalDuration - roundedSaved) * 1000) / 1000);

    return {
      originalDuration: Math.round(originalDuration * 1000) / 1000,
      projectedDuration,
      totalDurationSaved: roundedSaved,
      cutsCount: mergedCuts.length,
      splitsCount,
      affectedTracksCount: mergedCuts.length > 0 ? 2 : 0, // Typical A/V track count
      affectedClipsCount: (mergedCuts.length * 2) + splitsCount,
    };
  }
}
