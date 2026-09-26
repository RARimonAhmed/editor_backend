import 'package:equatable/equatable.dart';

/// Supported action types from the backend AI Copilot command vocabulary.
enum AICopilotAction {
  addClip,
  deleteClip,
  splitClip,
  trimClip,
  moveClip,
  rippleDelete,
  duplicateClip,
  setTransform,
  setCrop,
  setCanvas,
  addText,
  updateText,
  addEffect,
  removeEffect,
  updateEffect,
  addKeyframe,
  updateKeyframe,
  setAudio,
  addCaption,
  updateCaption,
  setSpeed;

  static AICopilotAction fromString(String raw) {
    final normalized = raw.toUpperCase().replaceAll('-', '_');
    switch (normalized) {
      case 'ADD_CLIP':
        return AICopilotAction.addClip;
      case 'DELETE_CLIP':
        return AICopilotAction.deleteClip;
      case 'SPLIT_CLIP':
        return AICopilotAction.splitClip;
      case 'TRIM_CLIP':
        return AICopilotAction.trimClip;
      case 'MOVE_CLIP':
        return AICopilotAction.moveClip;
      case 'RIPPLE_DELETE':
        return AICopilotAction.rippleDelete;
      case 'DUPLICATE_CLIP':
        return AICopilotAction.duplicateClip;
      case 'SET_TRANSFORM':
        return AICopilotAction.setTransform;
      case 'SET_CROP':
        return AICopilotAction.setCrop;
      case 'SET_CANVAS':
        return AICopilotAction.setCanvas;
      case 'ADD_TEXT':
        return AICopilotAction.addText;
      case 'UPDATE_TEXT':
        return AICopilotAction.updateText;
      case 'ADD_EFFECT':
        return AICopilotAction.addEffect;
      case 'REMOVE_EFFECT':
        return AICopilotAction.removeEffect;
      case 'UPDATE_EFFECT':
        return AICopilotAction.updateEffect;
      case 'ADD_KEYFRAME':
        return AICopilotAction.addKeyframe;
      case 'UPDATE_KEYFRAME':
        return AICopilotAction.updateKeyframe;
      case 'SET_AUDIO':
        return AICopilotAction.setAudio;
      case 'ADD_CAPTION':
        return AICopilotAction.addCaption;
      case 'UPDATE_CAPTION':
        return AICopilotAction.updateCaption;
      case 'SET_SPEED':
        return AICopilotAction.setSpeed;
      default:
        return AICopilotAction.updateText;
    }
  }

  String get displayName {
    switch (this) {
      case AICopilotAction.addClip:
        return 'Add Clip';
      case AICopilotAction.deleteClip:
        return 'Delete Clip';
      case AICopilotAction.splitClip:
        return 'Split Clip';
      case AICopilotAction.trimClip:
        return 'Trim Clip';
      case AICopilotAction.moveClip:
        return 'Move Clip';
      case AICopilotAction.rippleDelete:
        return 'Ripple Delete';
      case AICopilotAction.duplicateClip:
        return 'Duplicate Clip';
      case AICopilotAction.setTransform:
        return 'Change Scale & Transform';
      case AICopilotAction.setCrop:
        return 'Set Crop';
      case AICopilotAction.setCanvas:
        return 'Change Canvas Aspect';
      case AICopilotAction.addText:
        return 'Add Title / Text';
      case AICopilotAction.updateText:
        return 'Update Text';
      case AICopilotAction.addEffect:
        return 'Add Effect';
      case AICopilotAction.removeEffect:
        return 'Remove Effect';
      case AICopilotAction.updateEffect:
        return 'Update Effect';
      case AICopilotAction.addKeyframe:
        return 'Add Keyframe';
      case AICopilotAction.updateKeyframe:
        return 'Update Keyframe';
      case AICopilotAction.setAudio:
        return 'Adjust Audio Volume';
      case AICopilotAction.addCaption:
        return 'Add Caption';
      case AICopilotAction.updateCaption:
        return 'Update Caption';
      case AICopilotAction.setSpeed:
        return 'Adjust Playback Speed';
    }
  }
}

/// Represents an individual command inside an AI Copilot Plan.
class AICopilotCommand extends Equatable {
  final String id;
  final AICopilotAction action;
  final String? targetClipId;
  final String? targetTrackId;
  final double? timeRangeStart;
  final double? timeRangeEnd;
  final Map<String, dynamic> parameters;
  final String explanation;
  final double confidence;

  const AICopilotCommand({
    required this.id,
    required this.action,
    this.targetClipId,
    this.targetTrackId,
    this.timeRangeStart,
    this.timeRangeEnd,
    this.parameters = const {},
    this.explanation = '',
    this.confidence = 1.0,
  });

  factory AICopilotCommand.fromMap(Map<String, dynamic> map) {
    final tr = map['timeRange'] as Map<String, dynamic>?;
    return AICopilotCommand(
      id: map['id']?.toString() ?? '',
      action: AICopilotAction.fromString(map['action']?.toString() ?? ''),
      targetClipId: map['targetClipId']?.toString(),
      targetTrackId: map['targetTrackId']?.toString(),
      timeRangeStart: (tr?['start'] as num?)?.toDouble(),
      timeRangeEnd: (tr?['end'] as num?)?.toDouble(),
      parameters: (map['parameters'] as Map<String, dynamic>?) ?? const {},
      explanation: map['explanation']?.toString() ?? '',
      confidence: (map['confidence'] as num?)?.toDouble() ?? 1.0,
    );
  }

  Map<String, dynamic> toMap() => {
        'id': id,
        'action': action.name,
        'targetClipId': targetClipId,
        'targetTrackId': targetTrackId,
        if (timeRangeStart != null && timeRangeEnd != null)
          'timeRange': {'start': timeRangeStart, 'end': timeRangeEnd},
        'parameters': parameters,
        'explanation': explanation,
        'confidence': confidence,
      };

  @override
  List<Object?> get props => [
        id,
        action,
        targetClipId,
        targetTrackId,
        timeRangeStart,
        timeRangeEnd,
        parameters,
        explanation,
        confidence,
      ];
}

/// Estimated impact metrics of the generated plan.
class AICopilotImpact extends Equatable {
  final List<String> affectedTracks;
  final List<String> affectedClips;
  final double durationDelta;
  final double? newEstimatedDuration;

  const AICopilotImpact({
    this.affectedTracks = const [],
    this.affectedClips = const [],
    this.durationDelta = 0.0,
    this.newEstimatedDuration,
  });

  factory AICopilotImpact.fromMap(Map<String, dynamic> map) {
    return AICopilotImpact(
      affectedTracks: (map['affectedTracks'] as List<dynamic>?)
              ?.map((e) => e.toString())
              .toList() ??
          const [],
      affectedClips: (map['affectedClips'] as List<dynamic>?)
              ?.map((e) => e.toString())
              .toList() ??
          const [],
      durationDelta: (map['durationDelta'] as num?)?.toDouble() ?? 0.0,
      newEstimatedDuration:
          (map['newEstimatedDuration'] as num?)?.toDouble(),
    );
  }

  Map<String, dynamic> toMap() => {
        'affectedTracks': affectedTracks,
        'affectedClips': affectedClips,
        'durationDelta': durationDelta,
        'newEstimatedDuration': newEstimatedDuration,
      };

  @override
  List<Object?> get props => [
        affectedTracks,
        affectedClips,
        durationDelta,
        newEstimatedDuration,
      ];
}

/// Complete plan structure generated by backend AI Copilot and validated for approval.
class AICopilotPlan extends Equatable {
  final String planId;
  final String projectId;
  final int projectVersion;
  final String explanation;
  final List<AICopilotCommand> commands;
  final List<String> warnings;
  final AICopilotImpact estimatedImpact;
  final DateTime createdAt;
  final String status;
  final String? provider;
  final String? model;

  const AICopilotPlan({
    required this.planId,
    required this.projectId,
    required this.projectVersion,
    required this.explanation,
    required this.commands,
    this.warnings = const [],
    this.estimatedImpact = const AICopilotImpact(),
    required this.createdAt,
    this.status = 'generated',
    this.provider,
    this.model,
  });

  factory AICopilotPlan.fromMap(Map<String, dynamic> map) {
    final meta = map['metadata'] as Map<String, dynamic>?;
    return AICopilotPlan(
      planId: map['planId']?.toString() ?? '',
      projectId: map['projectId']?.toString() ?? '',
      projectVersion: (map['projectVersion'] as num?)?.toInt() ?? 1,
      explanation: map['explanation']?.toString() ?? '',
      commands: (map['commands'] as List<dynamic>?)
              ?.map((c) => AICopilotCommand.fromMap(c as Map<String, dynamic>))
              .toList() ??
          const [],
      warnings: (map['warnings'] as List<dynamic>?)
              ?.map((w) => w.toString())
              .toList() ??
          const [],
      estimatedImpact: map['estimatedImpact'] != null
          ? AICopilotImpact.fromMap(
              map['estimatedImpact'] as Map<String, dynamic>)
          : const AICopilotImpact(),
      createdAt: DateTime.tryParse(map['createdAt']?.toString() ?? '') ??
          DateTime.now(),
      status: map['status']?.toString() ?? 'generated',
      provider: meta?['provider']?.toString(),
      model: meta?['model']?.toString(),
    );
  }

  Map<String, dynamic> toMap() => {
        'planId': planId,
        'projectId': projectId,
        'projectVersion': projectVersion,
        'explanation': explanation,
        'commands': commands.map((c) => c.toMap()).toList(),
        'warnings': warnings,
        'estimatedImpact': estimatedImpact.toMap(),
        'createdAt': createdAt.toIso8601String(),
        'status': status,
        if (provider != null || model != null)
          'metadata': {
            if (provider != null) 'provider': provider,
            if (model != null) 'model': model,
          },
      };

  AICopilotPlan copyWith({
    String? planId,
    String? projectId,
    int? projectVersion,
    String? explanation,
    List<AICopilotCommand>? commands,
    List<String>? warnings,
    AICopilotImpact? estimatedImpact,
    DateTime? createdAt,
    String? status,
    String? provider,
    String? model,
  }) {
    return AICopilotPlan(
      planId: planId ?? this.planId,
      projectId: projectId ?? this.projectId,
      projectVersion: projectVersion ?? this.projectVersion,
      explanation: explanation ?? this.explanation,
      commands: commands ?? this.commands,
      warnings: warnings ?? this.warnings,
      estimatedImpact: estimatedImpact ?? this.estimatedImpact,
      createdAt: createdAt ?? this.createdAt,
      status: status ?? this.status,
      provider: provider ?? this.provider,
      model: model ?? this.model,
    );
  }

  @override
  List<Object?> get props => [
        planId,
        projectId,
        projectVersion,
        explanation,
        commands,
        warnings,
        estimatedImpact,
        createdAt,
        status,
        provider,
        model,
      ];
}
