/// Authentication models for TechXayan Creative / my_editor.
library;

class User {
  final String id;
  final String email;
  final String? name;
  final String role;
  final String plan;
  final int creditsBalance;
  final DateTime? createdAt;

  const User({
    required this.id,
    required this.email,
    this.name,
    this.role = 'USER',
    this.plan = 'free',
    this.creditsBalance = 100,
    this.createdAt,
  });

  factory User.fromJson(Map<String, dynamic> json) {
    return User(
      id: json['id'] as String,
      email: json['email'] as String,
      name: json['name'] as String?,
      role: json['role'] as String? ?? 'USER',
      plan: json['plan'] as String? ?? 'free',
      creditsBalance: json['creditsBalance'] as int? ?? 100,
      createdAt: json['createdAt'] != null
          ? DateTime.tryParse(json['createdAt'] as String)
          : null,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'email': email,
        if (name != null) 'name': name,
        'role': role,
        'plan': plan,
        'creditsBalance': creditsBalance,
        if (createdAt != null) 'createdAt': createdAt!.toIso8601String(),
      };
}

class AuthTokens {
  final String accessToken;
  final String refreshToken;
  final int expiresInSeconds;

  const AuthTokens({
    required this.accessToken,
    required this.refreshToken,
    required this.expiresInSeconds,
  });

  factory AuthTokens.fromJson(Map<String, dynamic> json) {
    return AuthTokens(
      accessToken: json['accessToken'] as String,
      refreshToken: json['refreshToken'] as String,
      expiresInSeconds: json['expiresInSeconds'] as int? ?? 3600,
    );
  }

  Map<String, dynamic> toJson() => {
        'accessToken': accessToken,
        'refreshToken': refreshToken,
        'expiresInSeconds': expiresInSeconds,
      };
}

class AuthResponse {
  final User user;
  final AuthTokens tokens;

  const AuthResponse({
    required this.user,
    required this.tokens,
  });

  factory AuthResponse.fromJson(Map<String, dynamic> json) {
    final data = json['data'] != null ? json['data'] as Map<String, dynamic> : json;
    return AuthResponse(
      user: User.fromJson(data['user'] as Map<String, dynamic>),
      tokens: AuthTokens.fromJson(data['tokens'] as Map<String, dynamic>),
    );
  }

  Map<String, dynamic> toJson() => {
        'user': user.toJson(),
        'tokens': tokens.toJson(),
      };
}
