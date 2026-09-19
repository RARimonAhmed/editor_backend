import { v4 as uuidv4 } from 'uuid';
import { TimelineData, TimelineTrack, TimelineClip } from '../../projects/projects.schemas.js';
import { EditorCommand, SceneSplitCommand } from './editing-analysis.types.js';
import { CommandNormalizer } from './command-normalizer.js';

/**
 * Pure timeline mutator engine.
 * Applies validated Editor Commands to a project's TimelineData with ripple editing.
 * Guarantees that AI never mutates database records directly; this function is only invoked
 * when the user explicitly triggers an Apply action via ProjectBloc.
 */
export class TimelineCommandExecutor {
  /**
   * Applies commands to a clone of the timeline and returns the resulting TimelineData.
   */
  static applyCommands(
    timeline: TimelineData,
    commands: EditorCommand[],
    options: { rippleEditing?: boolean } = { rippleEditing: true }
  ): TimelineData {
    // Deep clone timeline to guarantee immutability of input
    const newTimeline: TimelineData = {
      duration: timeline.duration,
      framerate: timeline.framerate || 30,
      tracks: (timeline.tracks || []).map((t: TimelineTrack) => ({
        ...t,
        clips: (t.clips || []).map((c: TimelineClip) => ({ ...c })),
      })),
      markers: [...(timeline.markers || [])],
    };

    const acceptedCommands = commands.filter((c) => c.accepted !== false);

    // 1. Process Scene Splits first (so split clips can be cut subsequently if needed)
    const splitCommands = acceptedCommands.filter((c): c is SceneSplitCommand => c.type === 'SCENE_SPLIT');
    // Sort splits descending so splitting later clips does not alter earlier time coordinates
    splitCommands.sort((a, b) => b.time - a.time);

    for (const cmd of splitCommands) {
      if (cmd.type === 'SCENE_SPLIT') {
        this.splitClipsAt(newTimeline, cmd.time);
      }
    }

    // 2. Process Delete Ranges & Filler Cuts
    const cutIntervals: Array<{ start: number; end: number; id: string }> = [];
    for (const cmd of acceptedCommands) {
      if (cmd.type === 'DELETE_RANGE') {
        cutIntervals.push({ start: cmd.start, end: cmd.end, id: cmd.id });
      } else if (cmd.type === 'REMOVE_FILLER') {
        const pad = cmd.padding !== undefined ? cmd.padding : 0.04;
        cutIntervals.push({ start: Math.max(0, cmd.start - pad), end: cmd.end + pad, id: cmd.id });
      } else if (cmd.type === 'SHORTEN_PAUSE') {
        const cutSpan = (cmd.end - cmd.start) - (cmd.targetDuration || 0.4);
        if (cutSpan > 0) {
          cutIntervals.push({ start: cmd.start, end: cmd.start + cutSpan, id: cmd.id });
        }
      }
    }

    const mergedCuts = CommandNormalizer.mergeOverlappingCutSpans(cutIntervals);
    // Sort cuts from latest to earliest so ripple shift does not alter earlier intervals
    mergedCuts.sort((a, b) => b.start - a.start);

    for (const cut of mergedCuts) {
      this.rippleDeleteRange(newTimeline, cut.start, cut.end, options.rippleEditing !== false);
    }

    // 3. Process Markers & Highlights
    for (const cmd of acceptedCommands) {
      if (cmd.type === 'ADD_MARKER') {
        newTimeline.markers.push({
          id: cmd.id || uuidv4(),
          time: cmd.time,
          label: cmd.label,
          color: cmd.color || '#4A90E2',
        });
      } else if (cmd.type === 'CREATE_HIGHLIGHT_CLIP') {
        newTimeline.markers.push({
          id: cmd.id || uuidv4(),
          time: cmd.start,
          label: `Highlight: ${cmd.label} (${Math.round(cmd.score * 100)}%)`,
          color: '#FFD700',
        });
      }
    }

    // Sort markers by time
    (newTimeline.markers || []).sort((a: { time: number }, b: { time: number }) => a.time - b.time);

    // Recalculate duration if needed
    let maxEnd = 0;
    for (const track of newTimeline.tracks) {
      for (const clip of track.clips) {
        maxEnd = Math.max(maxEnd, clip.start + clip.duration);
      }
    }
    newTimeline.duration = Math.max(0, Math.round(maxEnd * 1000) / 1000);

    return newTimeline;
  }

  /**
   * Splits clips on all unlocked tracks at a specific timecode.
   */
  private static splitClipsAt(timeline: TimelineData, splitTime: number) {
    for (const track of timeline.tracks) {
      if (track.locked) continue;

      const newClips: TimelineClip[] = [];

      for (const clip of track.clips) {
        const clipEnd = clip.start + clip.duration;

        // Clip strictly spans across split time
        if (clip.start < splitTime && clipEnd > splitTime) {
          const firstDuration = splitTime - clip.start;
          const secondDuration = clipEnd - splitTime;
          const speed = clip.speed || 1.0;

          const firstClip: TimelineClip = {
            ...clip,
            duration: Math.round(firstDuration * 1000) / 1000,
          };

          const secondClip: TimelineClip = {
            ...clip,
            id: uuidv4(),
            name: `${clip.name} (Part 2)`,
            start: Math.round(splitTime * 1000) / 1000,
            duration: Math.round(secondDuration * 1000) / 1000,
            sourceStart: Math.round((clip.sourceStart + firstDuration * speed) * 1000) / 1000,
          };

          newClips.push(firstClip, secondClip);
        } else {
          newClips.push(clip);
        }
      }

      track.clips = newClips;
    }
  }

  /**
   * Deletes a range and ripples remaining clips backward.
   */
  private static rippleDeleteRange(
    timeline: TimelineData,
    cutStart: number,
    cutEnd: number,
    ripple: boolean
  ) {
    const cutDuration = cutEnd - cutStart;
    if (cutDuration <= 0) return;

    for (const track of timeline.tracks) {
      if (track.locked) continue;

      const newClips: TimelineClip[] = [];

      for (const clip of track.clips) {
        const clipEnd = clip.start + clip.duration;

        // 1. Clip entirely before cut
        if (clipEnd <= cutStart) {
          newClips.push(clip);
          continue;
        }

        // 2. Clip entirely inside cut
        if (clip.start >= cutStart && clipEnd <= cutEnd) {
          // Drop clip
          continue;
        }

        // 3. Clip entirely after cut
        if (clip.start >= cutEnd) {
          newClips.push({
            ...clip,
            start: ripple ? Math.max(0, Math.round((clip.start - cutDuration) * 1000) / 1000) : clip.start,
          });
          continue;
        }

        // 4. Clip starts before cut, ends inside cut
        if (clip.start < cutStart && clipEnd > cutStart && clipEnd <= cutEnd) {
          const newDur = cutStart - clip.start;
          if (newDur > 0.01) {
            newClips.push({
              ...clip,
              duration: Math.round(newDur * 1000) / 1000,
            });
          }
          continue;
        }

        // 5. Clip starts inside cut, ends after cut
        if (clip.start >= cutStart && clip.start < cutEnd && clipEnd > cutEnd) {
          const shift = cutEnd - clip.start;
          const newDur = clip.duration - shift;
          const speed = clip.speed || 1.0;
          if (newDur > 0.01) {
            newClips.push({
              ...clip,
              start: ripple ? cutStart : cutEnd,
              duration: Math.round(newDur * 1000) / 1000,
              sourceStart: Math.round((clip.sourceStart + shift * speed) * 1000) / 1000,
            });
          }
          continue;
        }

        // 6. Clip spans across entire cut: split into 2 clips
        if (clip.start < cutStart && clipEnd > cutEnd) {
          const firstDur = cutStart - clip.start;
          const secondDur = clipEnd - cutEnd;
          const speed = clip.speed || 1.0;
          const secondSourceStart = clip.sourceStart + (cutEnd - clip.start) * speed;

          if (firstDur > 0.01) {
            newClips.push({
              ...clip,
              duration: Math.round(firstDur * 1000) / 1000,
            });
          }

          if (secondDur > 0.01) {
            newClips.push({
              ...clip,
              id: uuidv4(),
              name: `${clip.name} (Split)`,
              start: ripple ? cutStart : cutEnd,
              duration: Math.round(secondDur * 1000) / 1000,
              sourceStart: Math.round(secondSourceStart * 1000) / 1000,
            });
          }
        }
      }

      track.clips = newClips;
    }
  }
}
