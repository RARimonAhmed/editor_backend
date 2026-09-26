import fs from 'fs';
import path from 'path';

const myEditorLib = 'd:/Tech/my_editor/lib';

// 1. app_root.dart
const appRootDart = `import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../application/auth/auth_bloc.dart';
import '../application/project/project_bloc.dart';
import '../core/di/service_locator.dart';
import '../core/network/dio_client.dart';
import '../core/platform/platform_info.dart';
import '../data/datasources/project_local_data_source.dart';
import '../data/repositories/project_repository_impl.dart';
import '../domain/repositories/auth_repository.dart';
import '../infrastructure/auth/auth_remote_data_source.dart';
import '../infrastructure/auth/auth_repository_impl.dart';
import '../infrastructure/auth/secure_token_storage.dart';
import 'mobile/app/mobile_app.dart';
import 'windows/app/windows_app.dart';

/// Top-level platform presentation gateway.
/// Directs the application to either the Mobile or Windows presentation tree
/// based on the runtime environment (or an injected test/preview override).
///
/// Injects both [ProjectBloc] and [AuthBloc] at the root level via [MultiBlocProvider]
/// so all mobile and desktop views can access project and cloud session state.
class TechXayanAppGateway extends StatelessWidget {
  final PlatformInfo? platformOverride;
  final ProjectBloc? projectBloc;
  final AuthBloc? authBloc;

  const TechXayanAppGateway({
    super.key,
    this.platformOverride,
    this.projectBloc,
    this.authBloc,
  });

  @override
  Widget build(BuildContext context) {
    final platformInfo = platformOverride ??
        (sl.isRegistered<PlatformInfo>()
            ? sl.get<PlatformInfo>()
            : PlatformInfo.current());

    final resolvedProjectBloc = projectBloc ??
        (sl.isRegistered<ProjectBloc>()
            ? sl.get<ProjectBloc>()
            : ProjectBloc(
                repository: ProjectRepositoryImpl(
                  localDataSource: InMemoryProjectLocalDataSource(),
                ),
              ));

    final resolvedAuthBloc = authBloc ??
        (sl.isRegistered<AuthBloc>()
            ? sl.get<AuthBloc>()
            : AuthBloc(
                repository: sl.isRegistered<AuthRepository>()
                    ? sl.get<AuthRepository>()
                    : AuthRepositoryImpl(
                        remoteDataSource: AuthRemoteDataSourceImpl(dioClient: DioClient()),
                        tokenStorage: InMemoryTokenStorage(),
                      ),
              ));

    final childApp = switch (platformInfo.platform.family) {
      AppPlatformFamily.desktop => const WindowsApp(),
      AppPlatformFamily.mobile || AppPlatformFamily.web => const MobileApp(),
    };

    return MultiBlocProvider(
      providers: [
        BlocProvider<ProjectBloc>.value(value: resolvedProjectBloc),
        BlocProvider<AuthBloc>.value(value: resolvedAuthBloc),
      ],
      child: childApp,
    );
  }
}
`;

fs.writeFileSync(path.join(myEditorLib, 'presentation/app_root.dart'), appRootDart, 'utf8');
console.log('Updated presentation/app_root.dart');

// 2. app_initialization.dart
const appInitDart = `import 'dart:io' show Platform;
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:video_player_win/video_player_win_plugin.dart';

import '../core/di/service_locator.dart';
import '../core/network/dio_client.dart';
import '../core/platform/platform_info.dart';
import '../core/storage/app_storage_directory.dart';
import '../data/datasources/project_local_data_source.dart';
import '../data/migration/project_migration_manager.dart';
import '../data/playback/default_media_player_factory.dart';
import '../data/repositories/project_repository_impl.dart';
import '../data/services/cached_thumbnail_service.dart';
import '../data/services/local_media_validation_service.dart';
import '../data/services/media_engine_service_impl.dart';
import '../data/services/native_audio_waveform_service.dart';
import '../data/services/platform_media_import_service.dart';
import '../domain/ai/ai_config.dart';
import '../domain/ai/ai_provider.dart';
import '../domain/ai/ai_service.dart';
import '../domain/media_playback/media_player_factory.dart';
import '../domain/repositories/auth_repository.dart';
import '../domain/repositories/project_repository.dart';
import '../domain/services/audio_waveform_service.dart';
import '../domain/services/media_engine_service.dart';
import '../domain/services/media_import_service.dart';
import '../domain/services/media_validation_service.dart';
import '../domain/services/native_media_engine.dart';
import '../domain/services/native_media_engine_factory.dart';
import '../domain/services/thumbnail_service.dart';
import '../infrastructure/ai/ai_repository_impl.dart';
import '../infrastructure/ai/backend_ai_provider.dart';
import '../infrastructure/ai/local_test_ai_provider.dart';
import '../infrastructure/auth/auth_interceptor.dart';
import '../infrastructure/auth/auth_remote_data_source.dart';
import '../infrastructure/auth/auth_repository_impl.dart';
import '../infrastructure/auth/secure_token_storage.dart';
import '../infrastructure/cache/thumbnail_cache_manager.dart';
import '../infrastructure/cache/waveform_cache_manager.dart';
import 'auth/auth_bloc.dart';
import 'playback/playback_bloc.dart';
import 'project/autosave_manager.dart';
import 'project/project_bloc.dart';
import 'project/project_controller.dart';

/// Bootstraps core application services and registers dependencies in [ServiceLocator].
class AppInitialization {
  AppInitialization._();

  static Future<void> initialize({
    PlatformInfo? platformOverride,
    AppStorageDirectory? storageDirectoryOverride,
    ProjectLocalDataSource? localDataSourceOverride,
    MediaImportService? mediaImportServiceOverride,
    MediaPlayerFactory? mediaPlayerFactoryOverride,
    NativeMediaEngine? nativeMediaEngineOverride,
    SecureTokenStorage? tokenStorageOverride,
    AuthRemoteDataSource? authRemoteDataSourceOverride,
    AuthRepository? authRepositoryOverride,
    AuthBloc? authBlocOverride,
  }) async {
    // 0. Register Windows Media Player backend if on Windows desktop
    if (!kIsWeb && Platform.isWindows) {
      try {
        WindowsVideoPlayer.registerWith();
      } catch (_) {
        // Safe fallback in testing or headless environments
      }
    }

    // 1. Platform Information
    sl.registerSingleton<PlatformInfo>(platformOverride ?? PlatformInfo.current());

    // 2. Network Client (Dio Foundation)
    sl.registerLazySingleton<DioClient>(() => DioClient());

    // 3. Storage Directory & Migration
    sl.registerLazySingleton<AppStorageDirectory>(
      () => storageDirectoryOverride ?? PathProviderStorageDirectory(),
    );
    sl.registerLazySingleton<ProjectMigrationManager>(
      () => ProjectMigrationManager(),
    );

    // 4. Data Sources
    sl.registerLazySingleton<ProjectLocalDataSource>(
      () =>
          localDataSourceOverride ??
          FileSystemProjectLocalDataSource(
            storageDirectory: sl.get<AppStorageDirectory>(),
            migrationManager: sl.get<ProjectMigrationManager>(),
          ),
    );

    // 5. Repositories
    sl.registerLazySingleton<ProjectRepository>(
      () => ProjectRepositoryImpl(localDataSource: sl.get<ProjectLocalDataSource>()),
    );

    // 5b. Cloud Authentication & Session Architecture
    sl.registerLazySingleton<SecureTokenStorage>(
      () =>
          tokenStorageOverride ??
          EncryptedTokenStorage(
            storageDirectory: sl.get<AppStorageDirectory>(),
          ),
    );

    sl.registerLazySingleton<AuthRemoteDataSource>(
      () =>
          authRemoteDataSourceOverride ??
          AuthRemoteDataSourceImpl(
            dioClient: sl.get<DioClient>(),
          ),
    );

    sl.registerLazySingleton<AuthRepository>(
      () =>
          authRepositoryOverride ??
          AuthRepositoryImpl(
            remoteDataSource: sl.get<AuthRemoteDataSource>(),
            tokenStorage: sl.get<SecureTokenStorage>(),
          ),
    );

    // Attach single authoritative AuthInterceptor to DioClient
    final authInterceptor = AuthInterceptor(
      tokenStorage: sl.get<SecureTokenStorage>(),
      onRefreshToken: () async {
        final newTokens = await sl.get<AuthRepository>().refreshSession();
        return newTokens.accessToken;
      },
      onSessionExpired: () {
        if (sl.isRegistered<AuthBloc>()) {
          sl.get<AuthBloc>().add(const SessionExpiredEvent());
        }
      },
    );
    sl.get<DioClient>().addInterceptor(authInterceptor);

    sl.registerLazySingleton<AuthBloc>(
      () => authBlocOverride ?? AuthBloc(repository: sl.get<AuthRepository>()),
    );

    // 6. Media Validation, Import, and Native Media Engine
    sl.registerLazySingleton<MediaValidationService>(
      () => const LocalMediaValidationService(),
    );
    sl.registerLazySingleton<MediaImportService>(
      () => mediaImportServiceOverride ?? PlatformMediaImportService(),
    );
    sl.registerLazySingleton<NativeMediaEngine>(
      () => nativeMediaEngineOverride ?? NativeMediaEngineFactory.create(),
    );

    // 6b. Cache Managers
    sl.registerLazySingleton<ThumbnailCacheManager>(
      () => ThumbnailCacheManager(storageDirectory: sl.get<AppStorageDirectory>()),
    );
    sl.registerLazySingleton<WaveformCacheManager>(
      () => WaveformCacheManager(storageDirectory: sl.get<AppStorageDirectory>()),
    );

    // 6c. Thumbnail and Waveform Services
    sl.registerLazySingleton<ThumbnailService>(
      () => CachedThumbnailService(
        storageDirectory: sl.get<AppStorageDirectory>(),
        nativeMediaEngine: sl.get<NativeMediaEngine>(),
        cacheManager: sl.get<ThumbnailCacheManager>(),
      ),
    );
    sl.registerLazySingleton<AudioWaveformService>(
      () => NativeAudioWaveformService(
        nativeMediaEngine: sl.get<NativeMediaEngine>(),
        cacheManager: sl.get<WaveformCacheManager>(),
      ),
    );

    // 7. Legacy Media Engine Service
    sl.registerLazySingleton<MediaEngineService>(
      () => const DefaultMediaEngineService(),
    );

    // 8. Autosave Coordinator
    sl.registerLazySingleton<AutosaveManager>(
      () => AutosaveManager(
        onSave: (project) async {
          await sl.get<ProjectRepository>().saveProject(project);
        },
      ),
    );

    // 9. Playback Engine Factory
    sl.registerLazySingleton<MediaPlayerFactory>(
      () => mediaPlayerFactoryOverride ?? const DefaultMediaPlayerFactory(),
    );

    sl.registerLazySingleton<AIConfig>(AIConfig.fromEnvironment);
    sl.registerLazySingleton<LocalTestAIProvider>(
      () => LocalTestAIProvider(stepDelay: const Duration(milliseconds: 80)),
    );
    sl.registerLazySingleton<BackendAIProvider>(
      () => BackendAIProvider(
        config: sl.get<AIConfig>(),
        client: sl.get<DioClient>(),
      ),
    );
    sl.registerLazySingleton<AIProvider>(() {
      final config = sl.get<AIConfig>();
      if (config.useBackend) return sl.get<BackendAIProvider>();
      return sl.get<LocalTestAIProvider>();
    });
    sl.registerLazySingleton<AIRepository>(
      () => AIRepositoryImpl(provider: sl.get<AIProvider>()),
    );
    sl.registerLazySingleton<AIService>(
      () => AIService(repository: sl.get<AIRepository>()),
    );

    // 10. Application State BLoCs and Controllers
    sl.registerFactory<ProjectBloc>(
      () => ProjectBloc(
        repository: sl.get<ProjectRepository>(),
        mediaImportService: sl.get<MediaImportService>(),
        mediaValidationService: sl.get<MediaValidationService>(),
        autosaveManager: sl.get<AutosaveManager>(),
        nativeMediaEngine: sl.get<NativeMediaEngine>(),
        thumbnailService: sl.get<ThumbnailService>(),
        audioWaveformService: sl.get<AudioWaveformService>(),
        aiService: sl.get<AIService>(),
      ),
    );
    sl.registerFactory<PlaybackBloc>(
      () => PlaybackBloc(playerFactory: sl.get<MediaPlayerFactory>()),
    );
    sl.registerFactory<ProjectController>(
      () => ProjectController(repository: sl.get<ProjectRepository>()),
    );

    // 11. Initial Authentication Session Restoration
    sl.get<AuthBloc>().add(const CheckAuthStatusEvent());
  }
}
`;

fs.writeFileSync(path.join(myEditorLib, 'application/app_initialization.dart'), appInitDart, 'utf8');
console.log('Updated application/app_initialization.dart');
