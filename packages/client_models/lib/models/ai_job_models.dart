/// Asynchronous AI jobs and speech-to-text models for TechXayan Creative / my_editor.
library;

enum AiJobStatus { queued, running, completed, failed, cancelled }

class AiJob {
  final String id;
  final String userId;
  final String? projectId;
  final String type;
  final String status;
  final int progress;
  final Map<String, dynamic>? input;
  final Map<String, dynamic>? output;
  final String? provider;
  final String? model;
  final int? creditCost;
  final String? error;
  final DateTime? createdAt;
  final DateTime? completedAt;

  const AiJob({
    required this.id,
    required this.userId,
    this.projectId,
    required this.type,
    required this.status,
    this.progress = 0,
    this.input,
    this.output,
    this.provider,
    this.model,
    this.creditCost,
    this.error,
    this.createdAt,
    this.completedAt,
  });

  factory AiJob.fromJson(Map<String, dynamic> json) {
    final data = json['data'] != null ? json['data'] as Map<String, dynamic> : json;
    return AiJob(
      id: data['id'] as String,
      userId: data['userId'] as String? ?? '',
      projectId: data['projectId'] as String?,
      type: data['type'] as String? ?? 'generic',
      status: (data['status'] as String? ?? 'QUEUED').toUpperCase(),
      progress: data['progress'] as int? ?? 0,
      input: data['input'] as Map<String, dynamic>?,
      output: data['output'] as Map<String, dynamic>?,
      provider: data['provider'] as String?,
      model: data['model'] as String?,
      creditCost: data['creditCost'] as int? ?? data['cost'] as int?,
      error: data['error'] as String?,
      createdAt: data['createdAt'] != null
          ? DateTime.tryParse(data['createdAt'] as String)
          : null,
      completedAt: data['completedAt'] != null
          ? DateTime.tryParse(data['completedAt'] as String)
          : null,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'userId': userId,
        if (projectId != null) 'projectId': projectId,
        'type': type,
        'status': status,
        'progress': progress,
        if (input != null) 'input': input,
        if (output != null) 'output': output,
        if (provider != null) 'provider': provider,
        if (model != null) 'model': model,
        if (creditCost != null) 'creditCost': creditCost,
        if (error != null) 'error': error,
        if (createdAt != null) 'createdAt': createdAt!.toIso8601String(),
        if (completedAt != null) 'completedAt': completedAt!.toIso8601String(),
      };
}

class TimedWord {
  final String word;
  final double start;
  final double end;
  final double? confidence;

  const TimedWord({
    required this.word,
    required this.start,
    required this.end,
    this.confidence,
  });

  factory TimedWord.fromJson(Map<String, dynamic> json) {
    return TimedWord(
      word: json['word'] as String,
      start: (json['start'] as num).toDouble(),
      end: (json['end'] as num).toDouble(),
      confidence: (json['confidence'] as num?)?.toDouble(),
    );
  }

  Map<String, dynamic> toJson() => {
        'word': word,
        'start': start,
        'end': end,
        if (confidence != null) 'confidence': confidence,
      };
}

class CaptionSegment {
  final String id;
  final double start;
  final double end;
  final String text;
  final String? speaker;
  final List<TimedWord> words;

  const CaptionSegment({
    required this.id,
    required this.start,
    required this.end,
    required this.text,
    this.speaker,
    this.words = const [],
  });

  factory CaptionSegment.fromJson(Map<String, dynamic> json) {
    return CaptionSegment(
      id: json['id'] as String? ?? '',
      start: (json['start'] as num).toDouble(),
      end: (json['end'] as num).toDouble(),
      text: json['text'] as String? ?? '',
      speaker: json['speaker'] as String?,
      words: (json['words'] as List<dynamic>?)
              ?.map((w) => TimedWord.fromJson(w as Map<String, dynamic>))
              .toList() ??
          [],
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'start': start,
        'end': end,
        'text': text,
        if (speaker != null) 'speaker': speaker,
        'words': words.map((w) => w.toJson()).toList(),
      };
}
