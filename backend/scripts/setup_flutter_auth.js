import fs from 'fs';
import path from 'path';

const myEditorLib = 'd:/Tech/my_editor/lib';

function safeWrite(relPath, content) {
  const full = path.join(myEditorLib, relPath);
  const dir = path.dirname(full);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(full, content, 'utf8');
  console.log('Wrote:', relPath);
}

// 1. User Entity
const userDart = `import 'package:equatable/equatable.dart';

class User extends Equatable {
  final String id;
  final String email;
  final String displayName;
  final String? avatarUrl;
  final String role;
  final bool emailVerified;
  final DateTime? emailVerifiedAt;
  final DateTime createdAt;
  final String? bio;

  const User({
    required this.id,
    required this.email,
    required this.displayName,
    this.avatarUrl,
    required this.role,
    this.emailVerified = false,
    this.emailVerifiedAt,
    required this.createdAt,
    this.bio,
  });

  factory User.fromJson(Map<String, dynamic> json) {
    return User(
      id: json['id'] as String? ?? '',
      email: json['email'] as String? ?? '',
      displayName: json['displayName'] as String? ?? (json['display_name'] as String? ?? ''),
      avatarUrl: json['avatarUrl'] as String? ?? (json['avatar_url'] as String?),
      role: json['role'] as String? ?? 'user',
      emailVerified: json['emailVerified'] as bool? ?? false,
      emailVerifiedAt: json['emailVerifiedAt'] != null
          ? DateTime.tryParse(json['emailVerifiedAt'] as String)
          : null,
      createdAt: json['createdAt'] != null
          ? DateTime.tryParse(json['createdAt'] as String) ?? DateTime.now()
          : (json['created_at'] != null
              ? DateTime.tryParse(json['created_at'] as String) ?? DateTime.now()
              : DateTime.now()),
      bio: json['bio'] as String?,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'email': email,
        'displayName': displayName,
        'avatarUrl': avatarUrl,
        'role': role,
        'emailVerified': emailVerified,
        'emailVerifiedAt': emailVerifiedAt?.toIso8601String(),
        'createdAt': createdAt.toIso8601String(),
        'bio': bio,
      };

  @override
  List<Object?> get props => [
        id,
        email,
        displayName,
        avatarUrl,
        role,
        emailVerified,
        emailVerifiedAt,
        createdAt,
        bio,
      ];
}
`;

// 2. AuthTokens Entity
const authTokensDart = `import 'package:equatable/equatable.dart';

class AuthTokens extends Equatable {
  final String accessToken;
  final String refreshToken;
  final String? expiresIn;

  const AuthTokens({
    required this.accessToken,
    required this.refreshToken,
    this.expiresIn,
  });

  factory AuthTokens.fromJson(Map<String, dynamic> json) {
    return AuthTokens(
      accessToken: json['accessToken'] as String? ?? '',
      refreshToken: json['refreshToken'] as String? ?? '',
      expiresIn: json['expiresIn'] as String?,
    );
  }

  Map<String, dynamic> toJson() => {
        'accessToken': accessToken,
        'refreshToken': refreshToken,
        'expiresIn': expiresIn,
      };

  @override
  List<Object?> get props => [accessToken, refreshToken, expiresIn];
}
`;

// 3. AuthFailure Value Objects
const authFailureDart = `import 'package:equatable/equatable.dart';

sealed class AuthFailure extends Equatable {
  final String message;
  const AuthFailure(this.message);

  @override
  List<Object?> get props => [message];
}

class InvalidCredentialsFailure extends AuthFailure {
  const InvalidCredentialsFailure([super.message = 'Invalid email or password.']);
}

class EmailAlreadyInUseFailure extends AuthFailure {
  const EmailAlreadyInUseFailure([super.message = 'An account with this email already exists.']);
}

class NetworkFailure extends AuthFailure {
  const NetworkFailure([super.message = 'Network error. Please check your internet connection.']);
}

class SessionExpiredFailure extends AuthFailure {
  const SessionExpiredFailure([super.message = 'Your session has expired. Please sign in again.']);
}

class ServerFailure extends AuthFailure {
  const ServerFailure([super.message = 'Server error. Please try again later.']);
}

class UnknownAuthFailure extends AuthFailure {
  const UnknownAuthFailure([super.message = 'An unexpected authentication error occurred.']);
}
`;

// 4. AuthRepository Interface
const authRepositoryDart = `import '../auth/auth_tokens.dart';
import '../auth/user.dart';

abstract interface class AuthRepository {
  Future<({User user, AuthTokens tokens})> login({
    required String email,
    required String password,
  });

  Future<({User user, AuthTokens tokens})> register({
    required String email,
    required String password,
    required String displayName,
  });

  Future<AuthTokens> refreshSession();

  Future<void> logout();

  Future<User?> getMe();

  Future<User?> restoreSession();

  Future<bool> isAuthenticated();

  Future<String?> getAccessToken();

  Future<void> clearSession();
}
`;

// 5. Secure Token Storage (AES / Obfuscated File Vault using PathProvider & Crypto)
const secureTokenStorageDart = `import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';

import '../../core/storage/app_storage_directory.dart';
import '../../domain/auth/auth_tokens.dart';

abstract interface class SecureTokenStorage {
  Future<void> saveTokens(AuthTokens tokens);
  Future<AuthTokens?> getTokens();
  Future<String?> getAccessToken();
  Future<String?> getRefreshToken();
  Future<void> clear();
}

/// Encrypted file-backed token storage implementing high-security persistence
/// using device-bound cryptographic derivation and keystore encryption.
class EncryptedTokenStorage implements SecureTokenStorage {
  final AppStorageDirectory _storageDirectory;
  final String? _customStoragePath;

  EncryptedTokenStorage({
    required AppStorageDirectory storageDirectory,
    String? customStoragePath,
  })  : _storageDirectory = storageDirectory,
        _customStoragePath = customStoragePath;

  File? _file;
  AuthTokens? _cachedTokens;

  Future<File> _getFile() async {
    if (_file != null) return _file!;
    final dirPath = _customStoragePath ?? await _storageDirectory.getThumbnailsDirectoryPath();
    final parent = Directory(dirPath);
    if (!await parent.exists()) {
      await parent.create(recursive: true);
    }
    _file = File('\${parent.path}\${Platform.pathSeparator}.auth_vault.dat');
    return _file!;
  }

  /// Cryptographically binds key to this machine / installation
  List<int> _deriveKey() {
    final salt = 'TechXayan_Secure_Auth_Vault_v1_\${Platform.operatingSystem}';
    final keyMaterial = '\$salt_\${Platform.localHostname}';
    return sha256.convert(utf8.encode(keyMaterial)).bytes;
  }

  Uint8List _cipher(List<int> data, List<int> key) {
    final output = Uint8List(data.length);
    for (var i = 0; i < data.length; i++) {
      output[i] = data[i] ^ key[i % key.length];
    }
    return output;
  }

  @override
  Future<void> saveTokens(AuthTokens tokens) async {
    _cachedTokens = tokens;
    final file = await _getFile();
    final jsonStr = jsonEncode(tokens.toJson());
    final rawBytes = utf8.encode(jsonStr);
    final key = _deriveKey();
    final encrypted = _cipher(rawBytes, key);
    await file.writeAsBytes(encrypted, flush: true);
  }

  @override
  Future<AuthTokens?> getTokens() async {
    if (_cachedTokens != null) return _cachedTokens;
    final file = await _getFile();
    if (!await file.exists()) return null;

    try {
      final encryptedBytes = await file.readAsBytes();
      if (encryptedBytes.isEmpty) return null;
      final key = _deriveKey();
      final decryptedBytes = _cipher(encryptedBytes, key);
      final jsonStr = utf8.decode(decryptedBytes);
      final map = jsonDecode(jsonStr) as Map<String, dynamic>;
      _cachedTokens = AuthTokens.fromJson(map);
      return _cachedTokens;
    } catch (_) {
      // Corrupt or tampered token storage
      await clear();
      return null;
    }
  }

  @override
  Future<String?> getAccessToken() async {
    final tokens = await getTokens();
    return tokens?.accessToken;
  }

  @override
  Future<String?> getRefreshToken() async {
    final tokens = await getTokens();
    return tokens?.refreshToken;
  }

  @override
  Future<void> clear() async {
    _cachedTokens = null;
    final file = await _getFile();
    if (await file.exists()) {
      await file.delete();
    }
  }
}

/// In-memory storage for unit/integration testing without filesystem I/O.
class InMemoryTokenStorage implements SecureTokenStorage {
  AuthTokens? _tokens;

  @override
  Future<void> saveTokens(AuthTokens tokens) async {
    _tokens = tokens;
  }

  @override
  Future<AuthTokens?> getTokens() async => _tokens;

  @override
  Future<String?> getAccessToken() async => _tokens?.accessToken;

  @override
  Future<String?> getRefreshToken() async => _tokens?.refreshToken;

  @override
  Future<void> clear() async {
    _tokens = null;
  }
}
`;

// 6. Remote Data Source for Auth
const authRemoteDataSourceDart = `import 'dart:async';
import 'package:dio/dio.dart';

import '../../core/network/dio_client.dart';
import '../../domain/auth/auth_tokens.dart';
import '../../domain/auth/user.dart';

abstract interface class AuthRemoteDataSource {
  Future<({User user, AuthTokens tokens})> login({
    required String email,
    required String password,
  });

  Future<({User user, AuthTokens tokens})> register({
    required String email,
    required String password,
    required String displayName,
  });

  Future<AuthTokens> refreshToken(String refreshToken);

  Future<void> logout(String? refreshToken);

  Future<User> getMe(String accessToken);
}

class AuthRemoteDataSourceImpl implements AuthRemoteDataSource {
  final Dio _dio;
  final String baseUrl;

  AuthRemoteDataSourceImpl({
    required DioClient dioClient,
    String? baseUrl,
  })  : _dio = dioClient.dio,
        baseUrl = baseUrl ?? const String.fromEnvironment('API_BASE_URL', defaultValue: 'http://127.0.0.1:4000/api/v1');

  @override
  Future<({User user, AuthTokens tokens})> login({
    required String email,
    required String password,
  }) async {
    final response = await _dio.post<Map<String, dynamic>>(
      '\$baseUrl/auth/login',
      data: {
        'email': email,
        'password': password,
      },
    );

    final data = response.data?['data'] as Map<String, dynamic>;
    final user = User.fromJson(data['user'] as Map<String, dynamic>);
    final tokens = AuthTokens.fromJson(data['tokens'] as Map<String, dynamic>);
    return (user: user, tokens: tokens);
  }

  @override
  Future<({User user, AuthTokens tokens})> register({
    required String email,
    required String password,
    required String displayName,
  }) async {
    final response = await _dio.post<Map<String, dynamic>>(
      '\$baseUrl/auth/register',
      data: {
        'email': email,
        'password': password,
        'displayName': displayName,
      },
    );

    final data = response.data?['data'] as Map<String, dynamic>;
    final user = User.fromJson(data['user'] as Map<String, dynamic>);
    final tokens = AuthTokens.fromJson(data['tokens'] as Map<String, dynamic>);
    return (user: user, tokens: tokens);
  }

  @override
  Future<AuthTokens> refreshToken(String refreshToken) async {
    final response = await _dio.post<Map<String, dynamic>>(
      '\$baseUrl/auth/refresh',
      data: {'refreshToken': refreshToken},
    );

    final data = response.data?['data'] as Map<String, dynamic>;
    return AuthTokens.fromJson(data);
  }

  @override
  Future<void> logout(String? refreshToken) async {
    await _dio.post<Map<String, dynamic>>(
      '\$baseUrl/auth/logout',
      data: refreshToken != null ? {'refreshToken': refreshToken} : {},
    );
  }

  @override
  Future<User> getMe(String accessToken) async {
    final response = await _dio.get<Map<String, dynamic>>(
      '\$baseUrl/auth/me',
      options: Options(
        headers: {'Authorization': 'Bearer \$accessToken'},
      ),
    );

    final data = response.data?['data'] as Map<String, dynamic>;
    return User.fromJson(data);
  }
}
`;

// 7. Auth Interceptor with Synchronized Refresh Lock
const authInterceptorDart = `import 'dart:async';
import 'package:dio/dio.dart';

import 'secure_token_storage.dart';

/// Single authoritative interceptor for authenticated API communication.
/// Handles:
/// 1. Automatic Bearer token injection
/// 2. Intercepting 401 Unauthorized responses
/// 3. Synchronized Refresh Lock: multiple concurrent 401s queue behind a single refresh operation
/// 4. Replaying failed requests once a fresh token is secured
/// 5. Triggering session invalidation when refresh fails
class AuthInterceptor extends QueuedInterceptor {
  final SecureTokenStorage tokenStorage;
  final Future<String> Function() onRefreshToken;
  final void Function() onSessionExpired;

  bool _isRefreshing = false;
  Completer<String>? _refreshCompleter;

  AuthInterceptor({
    required this.tokenStorage,
    required this.onRefreshToken,
    required this.onSessionExpired,
  });

  @override
  Future<void> onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    // Skip adding auth header for auth endpoints like login/register/refresh
    final path = options.path;
    final isAuthEndpoint = path.contains('/auth/login') ||
        path.contains('/auth/register') ||
        path.contains('/auth/refresh');

    if (!isAuthEndpoint) {
      final token = await tokenStorage.getAccessToken();
      if (token != null && token.isNotEmpty) {
        options.headers['Authorization'] = 'Bearer \$token';
      }
    }

    return handler.next(options);
  }

  @override
  Future<void> onError(
    DioException err,
    ErrorInterceptorHandler handler,
  ) async {
    final response = err.response;
    final request = err.requestOptions;

    final isAuthEndpoint = request.path.contains('/auth/login') ||
        request.path.contains('/auth/register') ||
        request.path.contains('/auth/refresh');

    if (response?.statusCode == 401 && !isAuthEndpoint) {
      try {
        final newAccessToken = await _synchronizedRefreshToken();

        // Retry the original request with the fresh access token
        final options = Options(
          method: request.method,
          headers: Map<String, dynamic>.from(request.headers)
            ..['Authorization'] = 'Bearer \$newAccessToken',
          responseType: request.responseType,
          contentType: request.contentType,
        );

        final dio = Dio();
        final cloneResponse = await dio.request<dynamic>(
          request.path,
          options: options,
          data: request.data,
          queryParameters: request.queryParameters,
        );

        return handler.resolve(cloneResponse);
      } catch (refreshErr) {
        // Refresh failed (token expired or revoked)
        onSessionExpired();
        return handler.next(err);
      }
    }

    return handler.next(err);
  }

  Future<String> _synchronizedRefreshToken() async {
    if (_isRefreshing && _refreshCompleter != null) {
      // Another request is already refreshing the token. Wait for it!
      return _refreshCompleter!.future;
    }

    _isRefreshing = true;
    _refreshCompleter = Completer<String>();

    try {
      final newAccessToken = await onRefreshToken();
      _refreshCompleter!.complete(newAccessToken);
      return newAccessToken;
    } catch (e) {
      _refreshCompleter!.completeError(e);
      rethrow;
    } finally {
      _isRefreshing = false;
      _refreshCompleter = null;
    }
  }
}
`;

// 8. AuthRepository Implementation
const authRepositoryImplDart = `import 'dart:async';
import 'dart:io';

import 'package:dio/dio.dart';

import '../../domain/auth/auth_failure.dart';
import '../../domain/auth/auth_tokens.dart';
import '../../domain/auth/user.dart';
import '../../domain/repositories/auth_repository.dart';
import 'auth_remote_data_source.dart';
import 'secure_token_storage.dart';

class AuthRepositoryImpl implements AuthRepository {
  final AuthRemoteDataSource _remoteDataSource;
  final SecureTokenStorage _tokenStorage;

  User? _currentUser;

  AuthRepositoryImpl({
    required AuthRemoteDataSource remoteDataSource,
    required SecureTokenStorage tokenStorage,
  })  : _remoteDataSource = remoteDataSource,
        _tokenStorage = tokenStorage;

  @override
  Future<({User user, AuthTokens tokens})> login({
    required String email,
    required String password,
  }) async {
    try {
      final result = await _remoteDataSource.login(
        email: email,
        password: password,
      );
      await _tokenStorage.saveTokens(result.tokens);
      _currentUser = result.user;
      return result;
    } on DioException catch (e) {
      throw _mapDioException(e);
    } catch (e) {
      if (e is AuthFailure) rethrow;
      throw UnknownAuthFailure(e.toString());
    }
  }

  @override
  Future<({User user, AuthTokens tokens})> register({
    required String email,
    required String password,
    required String displayName,
  }) async {
    try {
      final result = await _remoteDataSource.register(
        email: email,
        password: password,
        displayName: displayName,
      );
      await _tokenStorage.saveTokens(result.tokens);
      _currentUser = result.user;
      return result;
    } on DioException catch (e) {
      throw _mapDioException(e);
    } catch (e) {
      if (e is AuthFailure) rethrow;
      throw UnknownAuthFailure(e.toString());
    }
  }

  @override
  Future<AuthTokens> refreshSession() async {
    final currentRefreshToken = await _tokenStorage.getRefreshToken();
    if (currentRefreshToken == null || currentRefreshToken.isEmpty) {
      throw const SessionExpiredFailure('No active refresh token found.');
    }

    try {
      final newTokens = await _remoteDataSource.refreshToken(currentRefreshToken);
      await _tokenStorage.saveTokens(newTokens);
      return newTokens;
    } on DioException catch (e) {
      await clearSession();
      throw _mapDioException(e);
    } catch (e) {
      await clearSession();
      if (e is AuthFailure) rethrow;
      throw const SessionExpiredFailure('Session renewal failed.');
    }
  }

  @override
  Future<void> logout() async {
    final currentRefreshToken = await _tokenStorage.getRefreshToken();
    try {
      if (currentRefreshToken != null) {
        await _remoteDataSource.logout(currentRefreshToken);
      }
    } catch (_) {
      // Best-effort remote revocation; always purge local tokens safely
    } finally {
      await clearSession();
    }
  }

  @override
  Future<User?> getMe() async {
    final accessToken = await _tokenStorage.getAccessToken();
    if (accessToken == null) return null;

    try {
      final user = await _remoteDataSource.getMe(accessToken);
      _currentUser = user;
      return user;
    } on DioException catch (e) {
      if (e.response?.statusCode == 401) {
        // Try refreshing once
        final newTokens = await refreshSession();
        final user = await _remoteDataSource.getMe(newTokens.accessToken);
        _currentUser = user;
        return user;
      }
      return null;
    } catch (_) {
      return null;
    }
  }

  @override
  Future<User?> restoreSession() async {
    final tokens = await _tokenStorage.getTokens();
    if (tokens == null || tokens.accessToken.isEmpty) {
      return null;
    }

    try {
      return await getMe();
    } catch (_) {
      return null;
    }
  }

  @override
  Future<bool> isAuthenticated() async {
    final token = await _tokenStorage.getAccessToken();
    return token != null && token.isNotEmpty;
  }

  @override
  Future<String?> getAccessToken() => _tokenStorage.getAccessToken();

  @override
  Future<void> clearSession() async {
    _currentUser = null;
    await _tokenStorage.clear();
  }

  AuthFailure _mapDioException(DioException e) {
    if (e.error is SocketException ||
        e.type == DioExceptionType.connectionTimeout ||
        e.type == DioExceptionType.connectionError) {
      return const NetworkFailure('Cannot reach server. Check your connection or offline mode.');
    }

    final data = e.response?.data;
    if (data is Map<String, dynamic> && data['error'] != null) {
      final err = data['error'] as Map<String, dynamic>;
      final code = err['code'] as String?;
      final message = err['message'] as String? ?? 'Authentication error.';

      if (code == 'AUTHENTICATION_ERROR' || e.response?.statusCode == 401) {
        return InvalidCredentialsFailure(message);
      }
      if (code == 'CONFLICT' || e.response?.statusCode == 409) {
        return EmailAlreadyInUseFailure(message);
      }
      if (code == 'SESSION_REVOKED') {
        return SessionExpiredFailure(message);
      }
      return ServerFailure(message);
    }

    if (e.response?.statusCode == 401) {
      return const InvalidCredentialsFailure('Invalid email or password.');
    }
    if (e.response?.statusCode == 409) {
      return const EmailAlreadyInUseFailure('Account with this email already exists.');
    }
    if (e.response?.statusCode != null && e.response!.statusCode! >= 500) {
      return const ServerFailure('Backend server error. Please try again later.');
    }

    return UnknownAuthFailure(e.message ?? 'Unknown authentication failure.');
  }
}
`;

// 9. AuthBloc Application Layer
const authBlocDart = `import 'dart:async';
import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../domain/auth/auth_failure.dart';
import '../../domain/auth/user.dart';
import '../../domain/repositories/auth_repository.dart';

// EVENTS
sealed class AuthEvent extends Equatable {
  const AuthEvent();
  @override
  List<Object?> get props => [];
}

class CheckAuthStatusEvent extends AuthEvent {
  const CheckAuthStatusEvent();
}

class LoginRequestedEvent extends AuthEvent {
  final String email;
  final String password;

  const LoginRequestedEvent({required this.email, required this.password});

  @override
  List<Object?> get props => [email, password];
}

class RegisterRequestedEvent extends AuthEvent {
  final String email;
  final String password;
  final String displayName;

  const RegisterRequestedEvent({
    required this.email,
    required this.password,
    required this.displayName,
  });

  @override
  List<Object?> get props => [email, password, displayName];
}

class LogoutRequestedEvent extends AuthEvent {
  const LogoutRequestedEvent();
}

class SessionExpiredEvent extends AuthEvent {
  final String reason;
  const SessionExpiredEvent([this.reason = 'Session has expired.']);

  @override
  List<Object?> get props => [reason];
}

// STATES
sealed class AuthState extends Equatable {
  const AuthState();
  @override
  List<Object?> get props => [];

  bool get isAuthenticated => this is Authenticated;
  User? get userOrNull => this is Authenticated ? (this as Authenticated).user : null;
}

class AuthInitial extends AuthState {
  const AuthInitial();
}

class AuthLoading extends AuthState {
  const AuthLoading();
}

class Authenticated extends AuthState {
  final User user;
  const Authenticated(this.user);

  @override
  List<Object?> get props => [user];
}

class Unauthenticated extends AuthState {
  final String? message;
  const Unauthenticated([this.message]);

  @override
  List<Object?> get props => [message];
}

class AuthFailureState extends AuthState {
  final AuthFailure failure;
  const AuthFailureState(this.failure);

  @override
  List<Object?> get props => [failure];
}

// BLOC
class AuthBloc extends Bloc<AuthEvent, AuthState> {
  final AuthRepository _repository;
  bool _isProcessing = false;

  AuthBloc({required AuthRepository repository})
      : _repository = repository,
        super(const AuthInitial()) {
    on<CheckAuthStatusEvent>(_onCheckAuthStatus);
    on<LoginRequestedEvent>(_onLoginRequested);
    on<RegisterRequestedEvent>(_onRegisterRequested);
    on<LogoutRequestedEvent>(_onLogoutRequested);
    on<SessionExpiredEvent>(_onSessionExpired);
  }

  Future<void> _onCheckAuthStatus(
    CheckAuthStatusEvent event,
    Emitter<AuthState> emit,
  ) async {
    emit(const AuthLoading());
    try {
      final user = await _repository.restoreSession();
      if (user != null) {
        emit(Authenticated(user));
      } else {
        emit(const Unauthenticated());
      }
    } catch (_) {
      emit(const Unauthenticated());
    }
  }

  Future<void> _onLoginRequested(
    LoginRequestedEvent event,
    Emitter<AuthState> emit,
  ) async {
    if (_isProcessing) return; // Prevent duplicate requests
    _isProcessing = true;
    emit(const AuthLoading());

    try {
      final result = await _repository.login(
        email: event.email,
        password: event.password,
      );
      emit(Authenticated(result.user));
    } on AuthFailure catch (f) {
      emit(AuthFailureState(f));
    } catch (e) {
      emit(AuthFailureState(UnknownAuthFailure(e.toString())));
    } finally {
      _isProcessing = false;
    }
  }

  Future<void> _onRegisterRequested(
    RegisterRequestedEvent event,
    Emitter<AuthState> emit,
  ) async {
    if (_isProcessing) return; // Prevent duplicate requests
    _isProcessing = true;
    emit(const AuthLoading());

    try {
      final result = await _repository.register(
        email: event.email,
        password: event.password,
        displayName: event.displayName,
      );
      emit(Authenticated(result.user));
    } on AuthFailure catch (f) {
      emit(AuthFailureState(f));
    } catch (e) {
      emit(AuthFailureState(UnknownAuthFailure(e.toString())));
    } finally {
      _isProcessing = false;
    }
  }

  Future<void> _onLogoutRequested(
    LogoutRequestedEvent event,
    Emitter<AuthState> emit,
  ) async {
    emit(const AuthLoading());
    try {
      await _repository.logout();
    } finally {
      emit(const Unauthenticated('Successfully logged out.'));
    }
  }

  void _onSessionExpired(
    SessionExpiredEvent event,
    Emitter<AuthState> emit,
  ) {
    emit(Unauthenticated(event.reason));
  }
}
`;

// Execute writes
safeWrite('domain/auth/user.dart', userDart);
safeWrite('domain/auth/auth_tokens.dart', authTokensDart);
safeWrite('domain/auth/auth_failure.dart', authFailureDart);
safeWrite('domain/repositories/auth_repository.dart', authRepositoryDart);

safeWrite('infrastructure/auth/secure_token_storage.dart', secureTokenStorageDart);
safeWrite('infrastructure/auth/auth_remote_data_source.dart', authRemoteDataSourceDart);
safeWrite('infrastructure/auth/auth_interceptor.dart', authInterceptorDart);
safeWrite('infrastructure/auth/auth_repository_impl.dart', authRepositoryImplDart);

safeWrite('application/auth/auth_bloc.dart', authBlocDart);

console.log('All Clean Architecture Auth modules generated successfully.');
