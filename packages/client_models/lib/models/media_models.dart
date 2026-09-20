/// Media ingestion and intelligence search models for TechXayan Creative / my_editor.
library;

class MediaMetadata {
  final double duration;
  final int resolutionWidth;
  final int resolutionHeight;
  final double framerate;
  final String codec;
  final String? audioCodec;
  final int? audioChannels;
  final int? sampleRate;
  final int? bitrate;
  final String? colorSpace;

  const MediaMetadata({
    this.duration = 0.0,
    this.resolutionWidth = 1920,
    this.resolutionHeight = 1080,
    this.framerate = 30.0,
    this.codec = 'h264',
    this.audioCodec,
    this.audioChannels,
    this.sampleRate,
    this.bitrate,
    this.colorSpace,
  });

  factory MediaMetadata.fromJson(Map<String, dynamic> json) {
    return MediaMetadata(
      duration: (json['duration'] as num?)?.toDouble() ?? 0.0,
      resolutionWidth: json['resolutionWidth'] as int? ?? json['width'] as int? ?? 1920,
      resolutionHeight: json['resolutionHeight'] as int? ?? json['height'] as int? ?? 1080,
      framerate: (json['framerate'] as num?)?.toDouble() ?? (json['fps'] as num?)?.toDouble() ?? 30.0,
      codec: json['codec'] as String? ?? 'h264',
      audioCodec: json['audioCodec'] as String?,
      audioChannels: json['audioChannels'] as int?,
      sampleRate: json['sampleRate'] as int?,
      bitrate: json['bitrate'] as int?,
      colorSpace: json['colorSpace'] as String?,
    );
  }

  Map<String, dynamic> toJson() => {
        'duration': duration,
        'resolutionWidth': resolutionWidth,
        'resolutionHeight': resolutionHeight,
        'framerate': framerate,
        'codec': codec,
        if (audioCodec != null) 'audioCodec': audioCodec,
        if (audioChannels != null) 'audioChannels': audioChannels,
        if (sampleRate != null) 'sampleRate': sampleRate,
        if (bitrate != null) 'bitrate': bitrate,
        if (colorSpace != null) 'colorSpace': colorSpace,
      };
}

class MediaAsset {
  final String id;
  final String originalName;
  final String mediaType;
  final String storageKey;
  final int fileSizeBytes;
  final String status;
  final MediaMetadata? metadata;
  final String? thumbnailUrl;
  final String? waveformUrl;
  final String? proxyUrl;
  final DateTime? createdAt;

  const MediaAsset({
    required this.id,
    required this.originalName,
    required this.mediaType,
    required this.storageKey,
    required this.fileSizeBytes,
    required this.status,
    this.metadata,
    this.thumbnailUrl,
    this.waveformUrl,
    this.proxyUrl,
    this.createdAt,
  });

  factory MediaAsset.fromJson(Map<String, dynamic> json) {
    return MediaAsset(
      id: json['id'] as String,
      originalName: json['originalName'] as String,
      mediaType: json['mediaType'] as String,
      storageKey: json['storageKey'] as String,
      fileSizeBytes: json['fileSizeBytes'] as int? ?? 0,
      status: json['status'] as String,
      metadata: json['metadata'] != null
          ? MediaMetadata.fromJson(json['metadata'] as Map<String, dynamic>)
          : null,
      thumbnailUrl: json['thumbnailUrl'] as String?,
      waveformUrl: json['waveformUrl'] as String?,
      proxyUrl: json['proxyUrl'] as String?,
      createdAt: json['createdAt'] != null
          ? DateTime.tryParse(json['createdAt'] as String)
          : null,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'originalName': originalName,
        'mediaType': mediaType,
        'storageKey': storageKey,
        'fileSizeBytes': fileSizeBytes,
        'status': status,
        if (metadata != null) 'metadata': metadata!.toJson(),
        if (thumbnailUrl != null) 'thumbnailUrl': thumbnailUrl,
        if (waveformUrl != null) 'waveformUrl': waveformUrl,
        if (proxyUrl != null) 'proxyUrl': proxyUrl,
        if (createdAt != null) 'createdAt': createdAt!.toIso8601String(),
      };
}

class TimeRange {
  final double start;
  final double end;

  const TimeRange({required this.start, required this.end});

  factory TimeRange.fromJson(Map<String, dynamic> json) {
    return TimeRange(
      start: (json['start'] as num).toDouble(),
      end: (json['end'] as num).toDouble(),
    );
  }

  Map<String, dynamic> toJson() => {'start': start, 'end': end};
}

class SearchResultItem {
  final String assetId;
  final double score;
  final String matchReason;
  final List<TimeRange> matchedRanges;
  final MediaAsset? asset;

  const SearchResultItem({
    required this.assetId,
    required this.score,
    required this.matchReason,
    this.matchedRanges = const [],
    this.asset,
  });

  factory SearchResultItem.fromJson(Map<String, dynamic> json) {
    return SearchResultItem(
      assetId: json['assetId'] as String,
      score: (json['score'] as num?)?.toDouble() ?? 0.0,
      matchReason: json['matchReason'] as String? ?? 'matched',
      matchedRanges: (json['matchedRanges'] as List<dynamic>?)
              ?.map((r) => TimeRange.fromJson(r as Map<String, dynamic>))
              .toList() ??
          [],
      asset: json['asset'] != null
          ? MediaAsset.fromJson(json['asset'] as Map<String, dynamic>)
          : null,
    );
  }

  Map<String, dynamic> toJson() => {
        'assetId': assetId,
        'score': score,
        'matchReason': matchReason,
        'matchedRanges': matchedRanges.map((r) => r.toJson()).toList(),
        if (asset != null) 'asset': asset!.toJson(),
      };
}
