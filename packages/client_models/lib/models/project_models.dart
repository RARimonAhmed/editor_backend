/// Project and timeline models for TechXayan Creative / my_editor.
library;

class CanvasConfig {
  final int resolutionWidth;
  final int resolutionHeight;
  final double framerate;
  final String aspectRatio;
  final String colorSpace;
  final String backgroundColor;

  const CanvasConfig({
    this.resolutionWidth = 1920,
    this.resolutionHeight = 1080,
    this.framerate = 30.0,
    this.aspectRatio = '16:9',
    this.colorSpace = 'rec709',
    this.backgroundColor = '#000000',
  });

  factory CanvasConfig.fromJson(Map<String, dynamic> json) {
    return CanvasConfig(
      resolutionWidth: json['resolutionWidth'] as int? ?? json['width'] as int? ?? 1920,
      resolutionHeight: json['resolutionHeight'] as int? ?? json['height'] as int? ?? 1080,
      framerate: (json['framerate'] as num?)?.toDouble() ?? (json['fps'] as num?)?.toDouble() ?? 30.0,
      aspectRatio: json['aspectRatio'] as String? ?? '16:9',
      colorSpace: json['colorSpace'] as String? ?? 'rec709',
      backgroundColor: json['backgroundColor'] as String? ?? '#000000',
    );
  }

  Map<String, dynamic> toJson() => {
        'resolutionWidth': resolutionWidth,
        'resolutionHeight': resolutionHeight,
        'framerate': framerate,
        'aspectRatio': aspectRatio,
        'colorSpace': colorSpace,
        'backgroundColor': backgroundColor,
      };
}

class TimelineClip {
  final String id;
  final String name;
  final String? mediaAssetId;
  final double start;
  final double duration;
  final double sourceStart;
  final double speed;
  final double volume;
  final Map<String, dynamic>? transform;
  final Map<String, dynamic>? style;

  const TimelineClip({
    required this.id,
    this.name = 'Clip',
    this.mediaAssetId,
    required this.start,
    required this.duration,
    this.sourceStart = 0.0,
    this.speed = 1.0,
    this.volume = 1.0,
    this.transform,
    this.style,
  });

  factory TimelineClip.fromJson(Map<String, dynamic> json) {
    return TimelineClip(
      id: json['id'] as String,
      name: json['name'] as String? ?? 'Clip',
      mediaAssetId: json['mediaAssetId'] as String?,
      start: (json['start'] as num).toDouble(),
      duration: (json['duration'] as num).toDouble(),
      sourceStart: (json['sourceStart'] as num?)?.toDouble() ?? 0.0,
      speed: (json['speed'] as num?)?.toDouble() ?? 1.0,
      volume: (json['volume'] as num?)?.toDouble() ?? 1.0,
      transform: json['transform'] as Map<String, dynamic>?,
      style: json['style'] as Map<String, dynamic>?,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        if (mediaAssetId != null) 'mediaAssetId': mediaAssetId,
        'start': start,
        'duration': duration,
        'sourceStart': sourceStart,
        'speed': speed,
        'volume': volume,
        if (transform != null) 'transform': transform,
        if (style != null) 'style': style,
      };
}

class TimelineTrack {
  final String id;
  final String type; // 'video' | 'audio' | 'text' | 'effect'
  final String name;
  final bool muted;
  final bool locked;
  final List<TimelineClip> clips;

  const TimelineTrack({
    required this.id,
    required this.type,
    this.name = 'Track',
    this.muted = false,
    this.locked = false,
    this.clips = const [],
  });

  factory TimelineTrack.fromJson(Map<String, dynamic> json) {
    return TimelineTrack(
      id: json['id'] as String,
      type: json['type'] as String,
      name: json['name'] as String? ?? 'Track',
      muted: json['muted'] as bool? ?? false,
      locked: json['locked'] as bool? ?? false,
      clips: (json['clips'] as List<dynamic>?)
              ?.map((c) => TimelineClip.fromJson(c as Map<String, dynamic>))
              .toList() ??
          [],
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'type': type,
        'name': name,
        'muted': muted,
        'locked': locked,
        'clips': clips.map((c) => c.toJson()).toList(),
      };
}

class TimelineData {
  final double duration;
  final double framerate;
  final List<TimelineTrack> tracks;

  const TimelineData({
    this.duration = 0.0,
    this.framerate = 30.0,
    this.tracks = const [],
  });

  factory TimelineData.fromJson(Map<String, dynamic> json) {
    return TimelineData(
      duration: (json['duration'] as num?)?.toDouble() ?? 0.0,
      framerate: (json['framerate'] as num?)?.toDouble() ?? 30.0,
      tracks: (json['tracks'] as List<dynamic>?)
              ?.map((t) => TimelineTrack.fromJson(t as Map<String, dynamic>))
              .toList() ??
          [],
    );
  }

  Map<String, dynamic> toJson() => {
        'duration': duration,
        'framerate': framerate,
        'tracks': tracks.map((t) => t.toJson()).toList(),
      };
}

class ProjectAsset {
  final String id;
  final String name;
  final String type;
  final String? uri;
  final double? duration;
  final String? thumbnailUrl;

  const ProjectAsset({
    required this.id,
    required this.name,
    required this.type,
    this.uri,
    this.duration,
    this.thumbnailUrl,
  });

  factory ProjectAsset.fromJson(Map<String, dynamic> json) {
    return ProjectAsset(
      id: json['id'] as String,
      name: json['name'] as String,
      type: json['type'] as String,
      uri: json['uri'] as String?,
      duration: (json['duration'] as num?)?.toDouble(),
      thumbnailUrl: json['thumbnailUrl'] as String?,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'type': type,
        if (uri != null) 'uri': uri,
        if (duration != null) 'duration': duration,
        if (thumbnailUrl != null) 'thumbnailUrl': thumbnailUrl,
      };
}

class Project {
  final String id;
  final String title;
  final String? description;
  final int version;
  final CanvasConfig canvas;
  final TimelineData timeline;
  final List<ProjectAsset> assets;
  final DateTime? createdAt;
  final DateTime? updatedAt;

  const Project({
    required this.id,
    required this.title,
    this.description,
    this.version = 1,
    required this.canvas,
    required this.timeline,
    this.assets = const [],
    this.createdAt,
    this.updatedAt,
  });

  factory Project.fromJson(Map<String, dynamic> json) {
    final data = json['data'] != null ? json['data'] as Map<String, dynamic> : json;
    return Project(
      id: data['id'] as String,
      title: data['title'] as String,
      description: data['description'] as String?,
      version: data['version'] as int? ?? 1,
      canvas: data['canvas'] != null
          ? CanvasConfig.fromJson(data['canvas'] as Map<String, dynamic>)
          : const CanvasConfig(),
      timeline: data['timeline'] != null
          ? TimelineData.fromJson(data['timeline'] as Map<String, dynamic>)
          : const TimelineData(),
      assets: (data['assets'] as List<dynamic>?)
              ?.map((a) => ProjectAsset.fromJson(a as Map<String, dynamic>))
              .toList() ??
          [],
      createdAt: data['createdAt'] != null ? DateTime.tryParse(data['createdAt'] as String) : null,
      updatedAt: data['updatedAt'] != null ? DateTime.tryParse(data['updatedAt'] as String) : null,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'title': title,
        if (description != null) 'description': description,
        'version': version,
        'canvas': canvas.toJson(),
        'timeline': timeline.toJson(),
        'assets': assets.map((a) => a.toJson()).toList(),
        if (createdAt != null) 'createdAt': createdAt!.toIso8601String(),
        if (updatedAt != null) 'updatedAt': updatedAt!.toIso8601String(),
      };
}
