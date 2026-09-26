import fs from 'fs';
import path from 'path';

const myEditorTest = 'd:/Tech/my_editor/test';

function safeWrite(relPath, content) {
  const full = path.join(myEditorTest, relPath);
  const dir = path.dirname(full);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(full, content, 'utf8');
  console.log('Wrote test:', relPath);
}

// 1. Auth Bloc Test
const authBlocTest = `import 'package:flutter_test/flutter_test.dart';
import 'package:my_editor/application/auth/auth_bloc.dart';
import 'package:my_editor/domain/auth/auth_failure.dart';
import 'package:my_editor/domain/auth/auth_tokens.dart';
import 'package:my_editor/domain/auth/user.dart';
import 'package:my_editor/domain/repositories/auth_repository.dart';

class FakeAuthRepository implements AuthRepository {
  User? currentUser;
  AuthTokens? currentTokens;
  bool shouldFailLogin = false;
  bool shouldFailRegister = false;
  bool shouldFailRefresh = false;

  @override
  Future<({User user, AuthTokens tokens})> login({
    required String email,
    required String password,
  }) async {
    if (shouldFailLogin) {
      throw const InvalidCredentialsFailure('Invalid email or password.');
    }
    final user = User(
      id: 'test_user_1',
      email: email,
      displayName: 'Test User',
      role: 'user',
      createdAt: DateTime(2026, 1, 1),
    );
    final tokens = const AuthTokens(
      accessToken: 'access_token_123',
      refreshToken: 'refresh_token_456',
      expiresIn: '15m',
    );
    currentUser = user;
    currentTokens = tokens;
    return (user: user, tokens: tokens);
  }

  @override
  Future<({User user, AuthTokens tokens})> register({
    required String email,
    required String password,
    required String displayName,
  }) async {
    if (shouldFailRegister) {
      throw const EmailAlreadyInUseFailure('Account with this email already exists.');
    }
    final user = User(
      id: 'test_user_2',
      email: email,
      displayName: displayName,
      role: 'user',
      createdAt: DateTime(2026, 1, 1),
    );
    final tokens = const AuthTokens(
      accessToken: 'access_token_new',
      refreshToken: 'refresh_token_new',
      expiresIn: '15m',
    );
    currentUser = user;
    currentTokens = tokens;
    return (user: user, tokens: tokens);
  }

  @override
  Future<AuthTokens> refreshSession() async {
    if (shouldFailRefresh || currentTokens == null) {
      throw const SessionExpiredFailure('Session expired.');
    }
    final tokens = const AuthTokens(
      accessToken: 'rotated_access_token',
      refreshToken: 'rotated_refresh_token',
      expiresIn: '15m',
    );
    currentTokens = tokens;
    return tokens;
  }

  @override
  Future<void> logout() async {
    await clearSession();
  }

  @override
  Future<User?> getMe() async => currentUser;

  @override
  Future<User?> restoreSession() async => currentUser;

  @override
  Future<bool> isAuthenticated() async => currentTokens != null;

  @override
  Future<String?> getAccessToken() async => currentTokens?.accessToken;

  @override
  Future<void> clearSession() async {
    currentUser = null;
    currentTokens = null;
  }
}

void main() {
  group('AuthBloc', () {
    late FakeAuthRepository repository;
    late AuthBloc authBloc;

    setUp(() {
      repository = FakeAuthRepository();
      authBloc = AuthBloc(repository: repository);
    });

    tearDown(() {
      authBloc.close();
    });

    test('initial state is AuthInitial', () {
      expect(authBloc.state, equals(const AuthInitial()));
    });

    test('emits [AuthLoading, Unauthenticated] when CheckAuthStatus finds no session', () async {
      final expectedStates = [
        const AuthLoading(),
        const Unauthenticated(),
      ];

      expectLater(authBloc.stream, emitsInOrder(expectedStates));
      authBloc.add(const CheckAuthStatusEvent());
    });

    test('emits [AuthLoading, Authenticated] when CheckAuthStatus restores active session', () async {
      final existingUser = User(
        id: 'user_restored',
        email: 'restored@techxayan.com',
        displayName: 'Restored User',
        role: 'user',
        createdAt: DateTime(2026, 1, 1),
      );
      repository.currentUser = existingUser;

      final expectedStates = [
        const AuthLoading(),
        Authenticated(existingUser),
      ];

      expectLater(authBloc.stream, emitsInOrder(expectedStates));
      authBloc.add(const CheckAuthStatusEvent());
    });

    test('emits [AuthLoading, Authenticated] on successful login', () async {
      expectLater(
        authBloc.stream,
        emitsInOrder([
          const AuthLoading(),
          predicate<AuthState>((s) => s is Authenticated && s.user.email == 'test@techxayan.com'),
        ]),
      );

      authBloc.add(const LoginRequestedEvent(
        email: 'test@techxayan.com',
        password: 'Password123!',
      ));
    });

    test('emits [AuthLoading, AuthFailureState] on invalid credentials', () async {
      repository.shouldFailLogin = true;

      expectLater(
        authBloc.stream,
        emitsInOrder([
          const AuthLoading(),
          predicate<AuthState>((s) => s is AuthFailureState && s.failure is InvalidCredentialsFailure),
        ]),
      );

      authBloc.add(const LoginRequestedEvent(
        email: 'wrong@techxayan.com',
        password: 'badpassword',
      ));
    });

    test('emits [AuthLoading, Authenticated] on successful registration', () async {
      expectLater(
        authBloc.stream,
        emitsInOrder([
          const AuthLoading(),
          predicate<AuthState>((s) => s is Authenticated && s.user.displayName == 'New Creator'),
        ]),
      );

      authBloc.add(const RegisterRequestedEvent(
        email: 'new@techxayan.com',
        password: 'Password123!',
        displayName: 'New Creator',
      ));
    });

    test('emits [AuthLoading, AuthFailureState] when email is already in use', () async {
      repository.shouldFailRegister = true;

      expectLater(
        authBloc.stream,
        emitsInOrder([
          const AuthLoading(),
          predicate<AuthState>((s) => s is AuthFailureState && s.failure is EmailAlreadyInUseFailure),
        ]),
      );

      authBloc.add(const RegisterRequestedEvent(
        email: 'existing@techxayan.com',
        password: 'Password123!',
        displayName: 'Existing User',
      ));
    });

    test('emits [AuthLoading, Unauthenticated] on logout', () async {
      expectLater(
        authBloc.stream,
        emitsInOrder([
          const AuthLoading(),
          predicate<AuthState>((s) => s is Unauthenticated),
        ]),
      );

      authBloc.add(const LogoutRequestedEvent());
    });

    test('emits Unauthenticated when SessionExpiredEvent is received', () async {
      expectLater(
        authBloc.stream,
        emitsInOrder([
          predicate<AuthState>((s) => s is Unauthenticated && s.message == 'Session expired.'),
        ]),
      );

      authBloc.add(const SessionExpiredEvent('Session expired.'));
    });
  });
}
`;

// 2. Auth Infrastructure & Interceptor Test
const authInfrastructureTest = `import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:my_editor/core/storage/app_storage_directory.dart';
import 'package:my_editor/domain/auth/auth_tokens.dart';
import 'package:my_editor/infrastructure/auth/auth_interceptor.dart';
import 'package:my_editor/infrastructure/auth/secure_token_storage.dart';

void main() {
  group('SecureTokenStorage', () {
    test('InMemoryTokenStorage saves, retrieves, and clears tokens', () async {
      final storage = InMemoryTokenStorage();
      expect(await storage.getTokens(), isNull);

      const tokens = AuthTokens(
        accessToken: 'access_1',
        refreshToken: 'refresh_1',
        expiresIn: '15m',
      );

      await storage.saveTokens(tokens);
      final retrieved = await storage.getTokens();
      expect(retrieved?.accessToken, equals('access_1'));
      expect(retrieved?.refreshToken, equals('refresh_1'));

      await storage.clear();
      expect(await storage.getTokens(), isNull);
    });

    test('EncryptedTokenStorage encrypts tokens and does not store raw plaintext', () async {
      final testDir = TestStorageDirectory(rootPath: '.test_vault');
      final storage = EncryptedTokenStorage(storageDirectory: testDir);

      const tokens = AuthTokens(
        accessToken: 'SUPER_SECRET_ACCESS_TOKEN_XYZ',
        refreshToken: 'SUPER_SECRET_REFRESH_TOKEN_ABC',
      );

      await storage.saveTokens(tokens);
      final retrieved = await storage.getTokens();
      expect(retrieved?.accessToken, equals('SUPER_SECRET_ACCESS_TOKEN_XYZ'));

      // Check encrypted file contents on disk
      final file = await (storage as dynamic)._getFile();
      final bytes = await file.readAsBytes();
      final fileContentString = String.fromCharCodes(bytes);

      // Verify that plain text token string does NOT exist anywhere in the raw file
      expect(fileContentString.contains('SUPER_SECRET_ACCESS_TOKEN_XYZ'), isFalse);

      await storage.clear();
      expect(await file.exists(), isFalse);
    });
  });

  group('AuthInterceptor & Refresh Synchronization Lock', () {
    test('injects Bearer token into non-auth requests', () async {
      final storage = InMemoryTokenStorage();
      await storage.saveTokens(const AuthTokens(
        accessToken: 'valid_bearer_token',
        refreshToken: 'refresh_token',
      ));

      final interceptor = AuthInterceptor(
        tokenStorage: storage,
        onRefreshToken: () async => 'new_token',
        onSessionExpired: () {},
      );

      final options = RequestOptions(path: '/api/v1/projects');
      final handler = RequestInterceptorHandler();

      await interceptor.onRequest(options, handler);
      expect(options.headers['Authorization'], equals('Bearer valid_bearer_token'));
    });

    test('does NOT inject Bearer token into auth endpoints', () async {
      final storage = InMemoryTokenStorage();
      await storage.saveTokens(const AuthTokens(
        accessToken: 'valid_bearer_token',
        refreshToken: 'refresh_token',
      ));

      final interceptor = AuthInterceptor(
        tokenStorage: storage,
        onRefreshToken: () async => 'new_token',
        onSessionExpired: () {},
      );

      final loginOptions = RequestOptions(path: '/api/v1/auth/login');
      final handler = RequestInterceptorHandler();

      await interceptor.onRequest(loginOptions, handler);
      expect(loginOptions.headers['Authorization'], isNull);
    });

    test('synchronized refresh triggers only ONE refresh operation for concurrent requests', () async {
      final storage = InMemoryTokenStorage();
      await storage.saveTokens(const AuthTokens(
        accessToken: 'expired_token',
        refreshToken: 'valid_refresh',
      ));

      int refreshCallCount = 0;
      final completer = Completer<String>();

      final interceptor = AuthInterceptor(
        tokenStorage: storage,
        onRefreshToken: () async {
          refreshCallCount++;
          // Simulate network delay
          await Future<void>.delayed(const Duration(milliseconds: 50));
          return 'new_rotated_access_token';
        },
        onSessionExpired: () {},
      );

      // Call synchronized refresh twice concurrently
      final future1 = (interceptor as dynamic)._synchronizedRefreshToken();
      final future2 = (interceptor as dynamic)._synchronizedRefreshToken();

      final results = await Future.wait<String>([future1, future2]);

      expect(refreshCallCount, equals(1), reason: 'Only 1 refresh operation must execute');
      expect(results[0], equals('new_rotated_access_token'));
      expect(results[1], equals('new_rotated_access_token'));
    });
  });
}
`;

safeWrite('application/auth_bloc_test.dart', authBlocTest);
safeWrite('infrastructure/auth_system_test.dart', authInfrastructureTest);
console.log('Test suites created successfully.');
