import fs from 'fs';
import path from 'path';

const myEditorTest = 'd:/Tech/my_editor/test/integration';
if (!fs.existsSync(myEditorTest)) {
  fs.mkdirSync(myEditorTest, { recursive: true });
}

const liveAuthTest = `import 'dart:io';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:my_editor/core/network/dio_client.dart';
import 'package:my_editor/core/storage/app_storage_directory.dart';
import 'package:my_editor/data/datasources/project_local_data_source.dart';
import 'package:my_editor/data/migration/project_migration_manager.dart';
import 'package:my_editor/data/repositories/project_repository_impl.dart';
import 'package:my_editor/domain/auth/auth_failure.dart';
import 'package:my_editor/domain/auth/auth_tokens.dart';
import 'package:my_editor/domain/entities/project/editor_project.dart';
import 'package:my_editor/infrastructure/auth/auth_interceptor.dart';
import 'package:my_editor/infrastructure/auth/auth_remote_data_source.dart';
import 'package:my_editor/infrastructure/auth/auth_repository_impl.dart';
import 'package:my_editor/infrastructure/auth/secure_token_storage.dart';

void main() {
  const backendBaseUrl = 'http://127.0.0.1:4000/api/v1';

  group('DAY 5 COMMAND 21: Real Cloud Auth Integration E2E', () {
    late AppStorageDirectory testStorage;
    late EncryptedTokenStorage tokenStorage;
    late DioClient dioClient;
    late AuthRemoteDataSource remoteDataSource;
    late AuthRepositoryImpl authRepository;

    setUp(() async {
      testStorage = const TestStorageDirectory(rootPath: '.test_e2e_vault');
      tokenStorage = EncryptedTokenStorage(
        storageDirectory: testStorage,
        customStoragePath: '.test_e2e_vault',
      );
      dioClient = DioClient();
      remoteDataSource = AuthRemoteDataSourceImpl(
        dioClient: dioClient,
        baseUrl: backendBaseUrl,
      );
      authRepository = AuthRepositoryImpl(
        remoteDataSource: remoteDataSource,
        tokenStorage: tokenStorage,
      );
      await tokenStorage.clear();
    });

    tearDown(() async {
      await tokenStorage.clear();
      final dir = Directory('.test_e2e_vault');
      if (await dir.exists()) {
        try {
          await dir.delete(recursive: true);
        } catch (_) {}
      }
    });

    // 1. Fresh Install -> Login with Real Backend
    test('1. Real login against backend issues valid JWT and encrypts tokens', () async {
      final result = await authRepository.login(
        email: 'admin@techxayan.com',
        password: 'Admin123!',
      );

      expect(result.user.email, equals('admin@techxayan.com'));
      expect(result.user.role.toUpperCase(), equals('SUPERADMIN'));
      expect(result.tokens.accessToken, isNotEmpty);
      expect(result.tokens.refreshToken, isNotEmpty);

      // Verify token persisted in encrypted storage
      final storedAccessToken = await tokenStorage.getAccessToken();
      expect(storedAccessToken, equals(result.tokens.accessToken));
    });

    // 2. Kill App -> Reopen -> Session Restored
    test('2. App restart simulation restores authenticated user session from secure storage', () async {
      // Step A: Login in initial session
      await authRepository.login(
        email: 'admin@techxayan.com',
        password: 'Admin123!',
      );

      // Step B: Simulate cold app restart with new repository instance reading persisted vault
      final freshRepository = AuthRepositoryImpl(
        remoteDataSource: remoteDataSource,
        tokenStorage: tokenStorage,
      );

      final restoredUser = await freshRepository.restoreSession();
      expect(restoredUser, isNotNull);
      expect(restoredUser!.email, equals('admin@techxayan.com'));
      expect(await freshRepository.isAuthenticated(), isTrue);
    });

    // 3. Token Expiration -> Refresh Session
    test('3. Real backend token rotation generates fresh access token', () async {
      await authRepository.login(
        email: 'admin@techxayan.com',
        password: 'Admin123!',
      );

      final initialTokens = await tokenStorage.getTokens();
      expect(initialTokens, isNotNull);

      // Trigger session refresh
      final refreshedTokens = await authRepository.refreshSession();
      expect(refreshedTokens.accessToken, isNotEmpty);
      expect(refreshedTokens.refreshToken, isNotEmpty);

      // Ensure rotated tokens are updated in secure storage
      final activeStoredTokens = await tokenStorage.getTokens();
      expect(activeStoredTokens?.accessToken, equals(refreshedTokens.accessToken));
    });

    // 4. Invalid Token -> Graceful Handling & Session Invalidation
    test('4. Corrupted/invalid token results in null user and clean unauthenticated state', () async {
      // Save tampered token
      await tokenStorage.saveTokens(const AuthTokens(
        accessToken: 'tampered.invalid.jwt.token',
        refreshToken: 'invalid_refresh',
      ));

      final restored = await authRepository.restoreSession();
      expect(restored, isNull);
    });

    // 5. Backend Unavailable -> Graceful Failure with Typed NetworkFailure
    test('5. Backend offline/unreachable returns NetworkFailure gracefully without crashing', () async {
      final unreachableDataSource = AuthRemoteDataSourceImpl(
        dioClient: dioClient,
        baseUrl: 'http://127.0.0.1:49999/api/v1', // Non-existent port
      );
      final offlineRepo = AuthRepositoryImpl(
        remoteDataSource: unreachableDataSource,
        tokenStorage: tokenStorage,
      );

      expect(
        () => offlineRepo.login(
          email: 'admin@techxayan.com',
          password: 'Admin123!',
        ),
        throwsA(isA<NetworkFailure>()),
      );
    });

    // 6. Offline -> Local Editor Works Completely Uninterrupted
    test('6. Local editor project operations succeed 100% offline without backend dependency', () async {
      final projectDataSource = FileSystemProjectLocalDataSource(
        storageDirectory: testStorage,
        migrationManager: ProjectMigrationManager(),
      );
      final projectRepository = ProjectRepositoryImpl(localDataSource: projectDataSource);

      final project = EditorProject.create(
        id: 'offline_proj_1',
        name: 'Offline Masterpiece',
      );

      // Save project offline
      await projectRepository.saveProject(project);

      // Retrieve project offline
      final loaded = await projectRepository.getProject('offline_proj_1');
      expect(loaded, isNotNull);
      expect(loaded!.name, equals('Offline Masterpiece'));

      // List projects offline
      final all = await projectRepository.listProjects();
      expect(all.any((p) => p.id == 'offline_proj_1'), isTrue);
    });

    // 7. Logout -> Cloud Session Cleared from Device & Disk
    test('7. Logout revokes session remotely and securely clears local vault', () async {
      await authRepository.login(
        email: 'admin@techxayan.com',
        password: 'Admin123!',
      );
      expect(await authRepository.isAuthenticated(), isTrue);

      await authRepository.logout();

      expect(await authRepository.isAuthenticated(), isFalse);
      expect(await tokenStorage.getAccessToken(), isNull);
      expect(await tokenStorage.getRefreshToken(), isNull);
    });

    // 8. Login Again -> Session Re-established Cleanly
    test('8. Subsequent login succeeds and establishes fresh authenticated session', () async {
      final regEmail = 'tester_\${DateTime.now().millisecondsSinceEpoch}@techxayan.com';
      final regResult = await authRepository.register(
        email: regEmail,
        password: 'Password123!',
        displayName: 'Subsequent User',
      );

      expect(regResult.user.email, equals(regEmail));
      await authRepository.logout();
      expect(await authRepository.isAuthenticated(), isFalse);

      final loginResult = await authRepository.login(
        email: regEmail,
        password: 'Password123!',
      );
      expect(loginResult.user.email, equals(regEmail));
      expect(await authRepository.isAuthenticated(), isTrue);
    });

    // 9. Concurrency Lock: Simultaneous Requests During Refresh
    test('9. Simultaneous requests queue behind a single refresh lock', () async {
      int backendRefreshCounter = 0;

      final interceptor = AuthInterceptor(
        tokenStorage: tokenStorage,
        onRefreshToken: () async {
          backendRefreshCounter++;
          await Future<void>.delayed(const Duration(milliseconds: 30));
          return 'mock_synchronized_token';
        },
        onSessionExpired: () {},
      );

      final results = await Future.wait([
        interceptor.synchronizedRefreshTokenForTesting(),
        interceptor.synchronizedRefreshTokenForTesting(),
        interceptor.synchronizedRefreshTokenForTesting(),
      ]);

      expect(backendRefreshCounter, equals(1));
      expect(results.every((r) => r == 'mock_synchronized_token'), isTrue);
    });
  });
}
`;

fs.writeFileSync(path.join(myEditorTest, 'live_auth_e2e_test.dart'), liveAuthTest, 'utf8');
console.log('Created test/integration/live_auth_e2e_test.dart');
