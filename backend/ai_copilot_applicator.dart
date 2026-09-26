import 'dart:math' as math;
import '../../domain/ai/copilot/ai_copilot_models.dart';
import '../../domain/entities/project/editor_project.dart';
import '../../domain/entities/timeline/clip_transform.dart';
import '../../domain/entities/timeline/text_properties.dart';
import '../../domain/entities/timeline/timeline_clip.dart';
import '../../domain/entities/timeline/timeline_track.dart';
import '../timeline/timeline_command.dart';

class AICopilotApplicator {
  const AICopilotApplicator();

  /// Validates the plan against current project state
  bool isPlanStale(EditorProject project, AICopilotPlan plan) {
    // Project version mismatch
    if (project.schemaVersion != plan.projectVersion &&
        (project as dynamic).projectVersion != null &&
        (project as dynamic).projectVersion != plan.projectVersion) {
      return true;
    }
    return false;
  }

  /// Translates backend AI Copilot commands into a single undoable CompositeCommand
  CompositeCommand translatePlan(EditorProject project, AICopilotPlan plan) {
    final commands = <TimelineCommand>[];

    for (final cmd in plan.commands) {
      final translated = _translateSingleCommand(project, cmd);
      if (translated != null) {
        commands.add(translated);
      }
    }

    return CompositeCommand(
      description: plan.explanation.isNotEmpty
          ? plan.explanation
          : 'Apply AI Copilot Edits (${commands.length} changes)',
      commands: commands,
    );
  }

  TimelineCommand? _translateSingleCommand(
    EditorProject project,
    AICopilotCommand cmd,
  ) {
    final timeline = project.timeline;

    switch (cmd.action) {
      // 1. DELETE_CLIP / RIPPLE_DELETE
      case AICopilotAction.deleteClip:
      case AICopilotAction.rippleDelete:
        final clipId = cmd.targetClipId;
        if (clipId == null) return null;
        final track = timeline.findTrackForClip(clipId);
        final clip = timeline.findClip(clipId);
        if (track == null || clip == null) return null;
        return RemoveClipCommand(trackId: track.id, clip: clip);

      // 2. SET_TRANSFORM
      case AICopilotAction.setTransform:
        final clipId = cmd.targetClipId;
        if (clipId == null) return null;
        final clip = timeline.findClip(clipId);
        if (clip == null) return null;

        final params = cmd.parameters;
        final scaleVal = (params['scale'] as num?)?.toDouble() ??
            (params['scaleX'] as num?)?.toDouble() ??
            1.0;
        final scaleX = (params['scaleX'] as num?)?.toDouble() ?? scaleVal;
        final scaleY = (params['scaleY'] as num?)?.toDouble() ?? scaleVal;
        final posX = (params['positionX'] as num?)?.toDouble() ?? clip.transform.positionX;
        final posY = (params['positionY'] as num?)?.toDouble() ?? clip.transform.positionY;
        final rotation = (params['rotation'] as num?)?.toDouble() ?? clip.transform.rotationDegrees;

        final newTransform = clip.transform.copyWith(
          scale: scaleVal,
          scaleX: scaleX,
          scaleY: scaleY,
          positionX: posX,
          positionY: posY,
          rotationDegrees: rotation,
        );

        return UpdateClipTransformCommand(
          clipId: clip.id,
          newTransform: newTransform,
          oldTransform: clip.transform,
        );

      // 3. ADD_EFFECT (Fade-In / Transitions)
      case AICopilotAction.addEffect:
      case AICopilotAction.updateEffect:
        final clipId = cmd.targetClipId;
        if (clipId == null) return null;
        final clip = timeline.findClip(clipId);
        if (clip == null) return null;

        final effectType = cmd.parameters['effectType']?.toString().toLowerCase() ?? '';
        final durationSec = (cmd.parameters['duration'] as num?)?.toDouble() ?? 1.0;
        final fadeDuration = Duration(milliseconds: (durationSec * 1000).round());

        if (effectType.contains('fade') || effectType.contains('in')) {
          return SetClipFadeCommand(
            clipId: clip.id,
            newFadeIn: fadeDuration,
            newFadeOut: clip.fadeOutDuration,
            oldFadeIn: clip.fadeInDuration,
            oldFadeOut: clip.fadeOutDuration,
          );
        }
        return null;

      // 4. MOVE_CLIP
      case AICopilotAction.moveClip:
        final clipId = cmd.targetClipId;
        if (clipId == null) return null;
        final track = timeline.findTrackForClip(clipId);
        final clip = timeline.findClip(clipId);
        if (track == null || clip == null) return null;

        final offsetSec = (cmd.parameters['offsetSeconds'] as num?)?.toDouble() ?? 2.0;
        final offset = Duration(milliseconds: (offsetSec * 1000).round());
        final newStart = clip.timelineStart + offset;

        return MoveClipCommand(
          oldTrackId: track.id,
          newTrackId: track.id,
          clipId: clip.id,
          oldStart: clip.timelineStart,
          newStart: newStart,
        );

      // 5. ADD_TEXT
      case AICopilotAction.addText:
        // Find existing text track or first video track
        TimelineTrack? targetTrack;
        if (cmd.targetTrackId != null) {
          targetTrack = timeline.findTrack(cmd.targetTrackId!);
        }
        targetTrack ??= timeline.tracks.firstWhere(
          (t) => t.type == TrackType.text,
          orElse: () => timeline.tracks.firstWhere(
            (t) => t.type == TrackType.video,
            orElse: () => timeline.tracks.first,
          ),
        );

        final text = cmd.parameters['text']?.toString() ?? 'Welcome';
        final startSec = cmd.timeRangeStart ?? 0.0;
        final endSec = cmd.timeRangeEnd ?? (startSec + 5.0);
        final duration = Duration(milliseconds: ((endSec - startSec) * 1000).round().clamp(500, 60000));

        final newClip = TimelineClip(
          id: 'ai_text_${DateTime.now().millisecondsSinceEpoch}',
          assetId: 'asset_ai_text_${DateTime.now().millisecondsSinceEpoch}',
          name: text,
          trackId: targetTrack.id,
          timelineStart: Duration(milliseconds: (startSec * 1000).round()),
          duration: duration,
          textProperties: TextProperties(
            text: text,
            role: TextRole.title,
            fontSize: (cmd.parameters['fontSize'] as num?)?.toDouble() ?? 48.0,
            colorHex: cmd.parameters['color']?.toString() ?? '#FFFFFF',
            fontFamily: cmd.parameters['fontFamily']?.toString() ?? 'Inter',
          ),
        );

        return AddClipCommand(trackId: targetTrack.id, clip: newClip);

      // 6. UPDATE_TEXT
      case AICopilotAction.updateText:
        final clipId = cmd.targetClipId;
        if (clipId == null) return null;
        final clip = timeline.findClip(clipId);
        if (clip == null) return null;

        final newText = cmd.parameters['text']?.toString() ?? '';
        return UpdateTextContentCommand(
          clipId: clip.id,
          newText: newText,
          oldText: clip.textProperties?.text ?? clip.name,
        );

      // 7. SET_AUDIO
      case AICopilotAction.setAudio:
        final volume = (cmd.parameters['volume'] as num?)?.toDouble() ?? 1.2;

        if (cmd.targetClipId != null) {
          final clip = timeline.findClip(cmd.targetClipId!);
          if (clip != null) {
            return UpdateClipVolumeCommand(
              clipId: clip.id,
              newVolume: volume,
              oldVolume: clip.volume,
            );
          }
        }

        // Target track
        final trackId = cmd.targetTrackId ??
            timeline.tracks.firstWhere(
              (t) => t.type == TrackType.audio,
              orElse: () => timeline.tracks.first,
            ).id;

        final track = timeline.findTrack(trackId);
        if (track != null) {
          return UpdateTrackVolumeCommand(
            trackId: track.id,
            newVolume: volume,
            oldVolume: track.volume,
          );
        }
        return null;

      // 8. SET_SPEED
      case AICopilotAction.setSpeed:
        final clipId = cmd.targetClipId;
        if (clipId == null) return null;
        final clip = timeline.findClip(clipId);
        if (clip == null) return null;

        final newSpeed = (cmd.parameters['speed'] as num?)?.toDouble() ?? 1.5;
        return SetClipSpeedCommand(
          clipId: clip.id,
          newSpeed: newSpeed,
          oldSpeed: clip.speed,
          oldDuration: clip.duration,
        );

      default:
        return null;
    }
  }
}
