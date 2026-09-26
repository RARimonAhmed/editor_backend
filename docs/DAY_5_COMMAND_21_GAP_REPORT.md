# Architecture & Gap Report: Real Cloud Authentication Integration

**Document Reference:** DAY 5 — APP COMMAND 21  
**Author:** Principal Mobile/Cloud Architect  
**Target Applications:** `my_editor` (Flutter Windows & Android) & `editor_backend` (Fastify Node.js API)  
**Date:** 2026-09-26  

---

## 1. Existing System Audit

### 1.1 Backend Authentication System (`editor_backend`)
The backend provides a fully implemented, production-grade JWT-based authentication system located at `src/modules/auth`:

* **Routes:**
  * `POST /api/v1/auth/register`: Creates user with bcrypt-hashed password (cost factor 10), initializes profile and 50 credits, issues session tokens.
  * `POST /api/v1/auth/login`: Authenticates with email and password, includes brute-force lockout (5 attempts -> 15 min lock).
  * `POST /api/v1/auth/refresh`: Rotates refresh tokens with SHA-256 hash lookup and active reuse detection (revokes all user sessions if a compromised/rotated token is replayed).
  * `POST /api/v1/auth/logout`: Revokes the specific refresh token session.
  * `POST /api/v1/auth/logout-all`: Invalidator for all active user sessions across all devices.
  * `GET /api/v1/auth/me`: Returns verified `UserProfile` with bio, preferences, and permissions. Requires `Authorization: Bearer <accessToken>`.
* **Token Structure & Lifecycles:**
  * `accessToken`: Signed JWT (HMAC-SHA256) containing `userId`, `sessionId`, `email`, and `role`. Expiration: 15 minutes (`JWT_EXPIRES_IN`).
  * `refreshToken`: High-entropy 32-byte cryptographically secure token (`uuidv4 + '-' + crypto.randomBytes(32).toString('hex')`). Expiration: 30 days.
* **Standard Response Envelope:**
  * Success: `{ "success": true, "data": { ... }, "meta": { "timestamp": "..." } }`
  * Error: `{ "success": false, "error": { "code": string, "message": string, "details": any } }`

### 1.2 Existing Flutter Architecture (`my_editor`)
The Flutter client uses Clean Architecture with `flutter_bloc`:
* **State Management:** `ProjectBloc` manages local editor state, timeline tracks, playback, and offline JSON persistence via `ProjectRepositoryImpl`.
* **Network Foundation:** `DioClient` exists in `lib/core/network/dio_client.dart` with standard timeouts (15s) and JSON headers, but lacks authentication interceptors, token storage, and refresh handling.
* **Dependency Injection:** Lightweight `ServiceLocator` (`sl`) in `lib/core/di/service_locator.dart`.
* **App Root & Bootstrap:** `TechXayanAppGateway` boots `WindowsApp` or `MobileApp` injecting `ProjectBloc` at the root.

---

## 2. Identified Architectural Gaps

| Area | Current State | Required State | Severity |
|---|---|---|:---:|
| **Auth Domain Models** | None exists in Flutter | Domain models `User`, `AuthTokens`, `AuthSession`, `AuthFailure` | **CRITICAL** |
| **Secure Token Storage** | Only unencrypted file storage in `PathProviderStorageDirectory` | Secure, encrypted file vault / key storage for access and refresh tokens | **CRITICAL** |
| **Auth Repository & Remote Source** | No remote auth source; only AI remote provider | `AuthRemoteDataSource` + `AuthRepository` implementing real REST contracts | **CRITICAL** |
| **Token Injection & 401 Interceptor** | `DioClient` has no auth interceptor | `AuthInterceptor` with automatic Bearer token injection, synchronized 401 refresh lock, and token replay | **CRITICAL** |
| **Session Lifecycle & State** | No session state machine | `AuthBloc` managing `AuthInitial`, `AuthLoading`, `Authenticated`, `Unauthenticated`, `AuthFailureState` | **CRITICAL** |
| **App Startup Restoration** | App boots without checking session | `AppInitialization` / `AuthBloc` restores persisted tokens, boots profile via `/me` | **HIGH** |
| **UI Integration** | No sign in / profile dialogs | Responsive `AuthDialog` for Windows & Android with login, registration, validation, error banner | **HIGH** |
| **Offline & Local Project Safety** | Local projects rely solely on filesystem | Decouple local editor from cloud auth so offline editing and local projects remain 100% operational | **CRITICAL** |

---

## 3. Implementation Plan & Production Architecture

### Phase 1: Domain Layer
1. `lib/domain/auth/user.dart`: Immutable user entity (`id`, `email`, `displayName`, `avatarUrl`, `role`, `createdAt`).
2. `lib/domain/auth/auth_tokens.dart`: Immutable token entity (`accessToken`, `refreshToken`, `expiresIn`).
3. `lib/domain/auth/auth_failure.dart`: Typed failure union (`invalidCredentials`, `emailAlreadyInUse`, `networkUnavailable`, `sessionExpired`, `serverError`).
4. `lib/domain/repositories/auth_repository.dart`: Pure domain contract for `login`, `register`, `refreshToken`, `logout`, `getCurrentUser`, `restoreSession`.

### Phase 2: Infrastructure Layer
1. `lib/infrastructure/auth/secure_token_storage.dart`: Cross-platform secure token vault. Uses encrypted persistence file in application support directory with PBKDF2/AES-derived key.
2. `lib/infrastructure/auth/auth_remote_data_source.dart`: Interacts with `/api/v1/auth/*` endpoints via `DioClient`.
3. `lib/infrastructure/auth/auth_interceptor.dart`:
   - Automatically attaches `Authorization: Bearer <accessToken>`.
   - Intercepts 401 responses.
   - Synchronizes token refresh using an async queue lock so multiple parallel requests wait for a single `/refresh` call, then retry with the new token.
4. `lib/infrastructure/repositories/auth_repository_impl.dart`: Implements `AuthRepository`.

### Phase 3: Application Layer
1. `lib/application/auth/auth_bloc.dart`, `auth_event.dart`, `auth_state.dart`:
   - Handles `CheckAuthStatusEvent`, `LoginRequestedEvent`, `RegisterRequestedEvent`, `LogoutRequestedEvent`, `SessionExpiredEvent`.
   - Prevents duplicate requests with state gating.
2. Register in `AppInitialization` and inject into `TechXayanAppGateway` using `MultiBlocProvider`.

### Phase 4: UI & Presentation Layer
1. `lib/presentation/common/auth/auth_dialog.dart`: Clean, dark-mode, responsive dialog supporting:
   - Sign In tab: Email, Password, real-time validation, loading indicator, error messages.
   - Register tab: Display Name, Email, Password, Password confirmation, validation.
2. Integrate into Windows top bar (`windows_project_manager_home.dart` & `desktop_editor_top_bar.dart`).
3. Integrate into Android app bar (`mobile_project_manager_home.dart`).
4. Display user status pill / avatar with sign out action.

### Phase 5: Verification & Safety
1. Execute unit and integration test suite covering all 10 required test criteria.
2. Verify local projects and timeline editing function without interruption in offline or unauthenticated mode.
3. Generate `docs/DAY_5_COMMAND_21_AUTH_ACCEPTANCE.md`.
