/// Realtime domain event models streamed over WebSocket / SSE for TechXayan Creative / my_editor.
library;

enum RealtimeEventType {
  uploadProgress,
  mediaReady,
  aiJobProgress,
  aiJobComplete,
  aiJobFailed,
  exportComplete,
  exportFailed,
  projectShared,
  commentAdded,
  subscriptionChanged,
  creditWarning,
  unknown;

  static RealtimeEventType fromString(String val) {
    switch (val.toLowerCase()) {
      case 'upload_progress':
        return RealtimeEventType.uploadProgress;
      case 'media_ready':
        return RealtimeEventType.mediaReady;
      case 'ai_job_progress':
        return RealtimeEventType.aiJobProgress;
      case 'ai_job_complete':
        return RealtimeEventType.aiJobComplete;
      case 'ai_job_failed':
        return RealtimeEventType.aiJobFailed;
      case 'export_complete':
        return RealtimeEventType.exportComplete;
      case 'export_failed':
        return RealtimeEventType.exportFailed;
      case 'project_shared':
        return RealtimeEventType.projectShared;
      case 'comment_added':
        return RealtimeEventType.commentAdded;
      case 'subscription_changed':
        return RealtimeEventType.subscriptionChanged;
      case 'credit_warning':
        return RealtimeEventType.creditWarning;
      default:
        return RealtimeEventType.unknown;
    }
  }

  String toSerializedString() {
    switch (this) {
      case RealtimeEventType.uploadProgress:
        return 'upload_progress';
      case RealtimeEventType.mediaReady:
        return 'media_ready';
      case RealtimeEventType.aiJobProgress:
        return 'ai_job_progress';
      case RealtimeEventType.aiJobComplete:
        return 'ai_job_complete';
      case RealtimeEventType.aiJobFailed:
        return 'ai_job_failed';
      case RealtimeEventType.exportComplete:
        return 'export_complete';
      case RealtimeEventType.exportFailed:
        return 'export_failed';
      case RealtimeEventType.projectShared:
        return 'project_shared';
      case RealtimeEventType.commentAdded:
        return 'comment_added';
      case RealtimeEventType.subscriptionChanged:
        return 'subscription_changed';
      case RealtimeEventType.creditWarning:
        return 'credit_warning';
      case RealtimeEventType.unknown:
        return 'unknown';
    }
  }
}

class RealtimeEvent {
  final String id;
  final RealtimeEventType type;
  final String rawType;
  final String channel;
  final Map<String, dynamic> data;
  final DateTime timestamp;

  const RealtimeEvent({
    required this.id,
    required this.type,
    required this.rawType,
    required this.channel,
    required this.data,
    required this.timestamp,
  });

  factory RealtimeEvent.fromJson(Map<String, dynamic> json) {
    final raw = json['type'] as String? ?? 'unknown';
    return RealtimeEvent(
      id: json['id'] as String? ?? '',
      type: RealtimeEventType.fromString(raw),
      rawType: raw,
      channel: json['channel'] as String? ?? '',
      data: json['data'] as Map<String, dynamic>? ?? {},
      timestamp: json['timestamp'] != null
          ? DateTime.tryParse(json['timestamp'] as String) ?? DateTime.now()
          : DateTime.now(),
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'type': rawType,
        'channel': channel,
        'data': data,
        'timestamp': timestamp.toIso8601String(),
      };
}
