/// Collaboration, sharing, and review comment models for TechXayan Creative / my_editor.
library;

class Collaborator {
  final String userId;
  final String email;
  final String role; // 'OWNER' | 'EDITOR' | 'COMMENTER' | 'VIEWER'
  final DateTime? addedAt;

  const Collaborator({
    required this.userId,
    required this.email,
    required this.role,
    this.addedAt,
  });

  factory Collaborator.fromJson(Map<String, dynamic> json) {
    return Collaborator(
      userId: json['userId'] as String? ?? json['id'] as String,
      email: json['email'] as String? ?? '',
      role: json['role'] as String? ?? 'VIEWER',
      addedAt: json['addedAt'] != null ? DateTime.tryParse(json['addedAt'] as String) : null,
    );
  }

  Map<String, dynamic> toJson() => {
        'userId': userId,
        'email': email,
        'role': role,
        if (addedAt != null) 'addedAt': addedAt!.toIso8601String(),
      };
}

class ReviewComment {
  final String id;
  final String projectId;
  final String userId;
  final String? userName;
  final double timecode;
  final String content;
  final String status; // 'OPEN' | 'RESOLVED'
  final DateTime? createdAt;
  final DateTime? resolvedAt;

  const ReviewComment({
    required this.id,
    required this.projectId,
    required this.userId,
    this.userName,
    required this.timecode,
    required this.content,
    this.status = 'OPEN',
    this.createdAt,
    this.resolvedAt,
  });

  factory ReviewComment.fromJson(Map<String, dynamic> json) {
    return ReviewComment(
      id: json['id'] as String,
      projectId: json['projectId'] as String? ?? '',
      userId: json['userId'] as String? ?? '',
      userName: json['userName'] as String?,
      timecode: (json['timecode'] as num).toDouble(),
      content: json['content'] as String,
      status: json['status'] as String? ?? 'OPEN',
      createdAt: json['createdAt'] != null ? DateTime.tryParse(json['createdAt'] as String) : null,
      resolvedAt: json['resolvedAt'] != null ? DateTime.tryParse(json['resolvedAt'] as String) : null,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'projectId': projectId,
        'userId': userId,
        if (userName != null) 'userName': userName,
        'timecode': timecode,
        'content': content,
        'status': status,
        if (createdAt != null) 'createdAt': createdAt!.toIso8601String(),
        if (resolvedAt != null) 'resolvedAt': resolvedAt!.toIso8601String(),
      };
}
