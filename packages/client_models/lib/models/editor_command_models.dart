/// Editor command models for AI-driven timeline manipulation via Flutter ProjectBloc.
library;

import 'media_models.dart';

enum EditorAction {
  deleteRange,
  splitClip,
  trimClip,
  setSpeed,
  addColorPreset,
  addCaptions,
  setCanvas,
  autoReframe,
  addAudio,
  duckAudio,
  unknown;

  static EditorAction fromString(String val) {
    switch (val.toUpperCase()) {
      case 'DELETE_RANGE':
        return EditorAction.deleteRange;
      case 'SPLIT_CLIP':
        return EditorAction.splitClip;
      case 'TRIM_CLIP':
        return EditorAction.trimClip;
      case 'SET_SPEED':
        return EditorAction.setSpeed;
      case 'ADD_COLOR_PRESET':
        return EditorAction.addColorPreset;
      case 'ADD_CAPTIONS':
        return EditorAction.addCaptions;
      case 'SET_CANVAS':
        return EditorAction.setCanvas;
      case 'AUTO_REFRAME':
        return EditorAction.autoReframe;
      case 'ADD_AUDIO':
        return EditorAction.addAudio;
      case 'DUCK_AUDIO':
        return EditorAction.duckAudio;
      default:
        return EditorAction.unknown;
    }
  }

  String toSerializedString() {
    switch (this) {
      case EditorAction.deleteRange:
        return 'DELETE_RANGE';
      case EditorAction.splitClip:
        return 'SPLIT_CLIP';
      case EditorAction.trimClip:
        return 'TRIM_CLIP';
      case EditorAction.setSpeed:
        return 'SET_SPEED';
      case EditorAction.addColorPreset:
        return 'ADD_COLOR_PRESET';
      case EditorAction.addCaptions:
        return 'ADD_CAPTIONS';
      case EditorAction.setCanvas:
        return 'SET_CANVAS';
      case EditorAction.autoReframe:
        return 'AUTO_REFRAME';
      case EditorAction.addAudio:
        return 'ADD_AUDIO';
      case EditorAction.duckAudio:
        return 'DUCK_AUDIO';
      case EditorAction.unknown:
        return 'UNKNOWN';
    }
  }
}

class EditorCommand {
  final String action;
  final String? trackId;
  final String? clipId;
  final TimeRange? timeRange;
  final Map<String, dynamic>? parameters;

  const EditorCommand({
    required this.action,
    this.trackId,
    this.clipId,
    this.timeRange,
    this.parameters,
  });

  EditorAction get parsedAction => EditorAction.fromString(action);

  factory EditorCommand.fromJson(Map<String, dynamic> json) {
    return EditorCommand(
      action: json['action'] as String,
      trackId: json['trackId'] as String?,
      clipId: json['clipId'] as String?,
      timeRange: json['timeRange'] != null
          ? TimeRange.fromJson(json['timeRange'] as Map<String, dynamic>)
          : null,
      parameters: json['parameters'] as Map<String, dynamic>?,
    );
  }

  Map<String, dynamic> toJson() => {
        'action': action,
        if (trackId != null) 'trackId': trackId,
        if (clipId != null) 'clipId': clipId,
        if (timeRange != null) 'timeRange': timeRange!.toJson(),
        if (parameters != null) 'parameters': parameters,
      };
}

class CommandExecutionPreview {
  final double originalDuration;
  final double estimatedDuration;
  final int affectedClipsCount;
  final int affectedTracksCount;
  final List<String> warnings;

  const CommandExecutionPreview({
    required this.originalDuration,
    required this.estimatedDuration,
    required this.affectedClipsCount,
    required this.affectedTracksCount,
    this.warnings = const [],
  });

  factory CommandExecutionPreview.fromJson(Map<String, dynamic> json) {
    return CommandExecutionPreview(
      originalDuration: (json['originalDuration'] as num?)?.toDouble() ?? 0.0,
      estimatedDuration: (json['estimatedDuration'] as num?)?.toDouble() ?? 0.0,
      affectedClipsCount: json['affectedClipsCount'] as int? ?? 0,
      affectedTracksCount: json['affectedTracksCount'] as int? ?? 0,
      warnings: (json['warnings'] as List<dynamic>?)?.map((w) => w.toString()).toList() ?? [],
    );
  }

  Map<String, dynamic> toJson() => {
        'originalDuration': originalDuration,
        'estimatedDuration': estimatedDuration,
        'affectedClipsCount': affectedClipsCount,
        'affectedTracksCount': affectedTracksCount,
        'warnings': warnings,
      };
}

class CommandValidationResult {
  final bool valid;
  final List<String> errors;
  final List<String> warnings;
  final List<EditorCommand> validatedCommands;

  const CommandValidationResult({
    required this.valid,
    this.errors = const [],
    this.warnings = const [],
    this.validatedCommands = const [],
  });

  factory CommandValidationResult.fromJson(Map<String, dynamic> json) {
    return CommandValidationResult(
      valid: json['valid'] as bool? ?? false,
      errors: (json['errors'] as List<dynamic>?)?.map((e) => e.toString()).toList() ?? [],
      warnings: (json['warnings'] as List<dynamic>?)?.map((w) => w.toString()).toList() ?? [],
      validatedCommands: (json['validatedCommands'] as List<dynamic>?)
              ?.map((c) => EditorCommand.fromJson(c as Map<String, dynamic>))
              .toList() ??
          [],
    );
  }

  Map<String, dynamic> toJson() => {
        'valid': valid,
        'errors': errors,
        'warnings': warnings,
        'validatedCommands': validatedCommands.map((c) => c.toJson()).toList(),
      };
}

class EditorCommandPlan {
  final String? intent;
  final List<EditorCommand> commands;
  final CommandExecutionPreview? preview;

  const EditorCommandPlan({
    this.intent,
    required this.commands,
    this.preview,
  });

  factory EditorCommandPlan.fromJson(Map<String, dynamic> json) {
    final data = json['data'] != null ? json['data'] as Map<String, dynamic> : json;
    return EditorCommandPlan(
      intent: data['intent'] as String?,
      commands: (data['commands'] as List<dynamic>?)
              ?.map((c) => EditorCommand.fromJson(c as Map<String, dynamic>))
              .toList() ??
          [],
      preview: data['preview'] != null
          ? CommandExecutionPreview.fromJson(data['preview'] as Map<String, dynamic>)
          : null,
    );
  }

  Map<String, dynamic> toJson() => {
        if (intent != null) 'intent': intent,
        'commands': commands.map((c) => c.toJson()).toList(),
        if (preview != null) 'preview': preview!.toJson(),
      };
}
