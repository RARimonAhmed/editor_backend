import fs from 'fs';
import path from 'path';

const myEditorLib = 'd:/Tech/my_editor/lib';

// 1. Auth Dialog and User Profile Dialog
const authDialogDart = `import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../application/auth/auth_bloc.dart';
import '../../../domain/auth/user.dart';
import '../../common/editor_feedback.dart';
import '../../design_system/app_colors.dart';
import '../../design_system/app_radius.dart';
import '../../design_system/app_spacing.dart';
import '../../design_system/app_typography.dart';

enum AuthDialogMode { signIn, register }

class AuthDialog extends StatefulWidget {
  final AuthDialogMode initialMode;

  const AuthDialog({super.key, this.initialMode = AuthDialogMode.signIn});

  static Future<void> show(BuildContext context, {AuthDialogMode mode = AuthDialogMode.signIn}) {
    return showDialog<void>(
      context: context,
      barrierDismissible: true,
      builder: (ctx) => AuthDialog(initialMode: mode),
    );
  }

  @override
  State<AuthDialog> createState() => _AuthDialogState();
}

class _AuthDialogState extends State<AuthDialog> {
  late AuthDialogMode _mode;
  final _formKey = GlobalKey<FormState>();

  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _confirmPasswordController = TextEditingController();
  final _displayNameController = TextEditingController();

  bool _obscurePassword = true;
  bool _obscureConfirm = true;

  @override
  void initState() {
    super.initState();
    _mode = widget.initialMode;
  }

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    _confirmPasswordController.dispose();
    _displayNameController.dispose();
    super.dispose();
  }

  void _submit() {
    if (!_formKey.currentState!.validate()) return;

    final email = _emailController.text.trim();
    final password = _passwordController.text;

    if (_mode == AuthDialogMode.signIn) {
      context.read<AuthBloc>().add(
            LoginRequestedEvent(email: email, password: password),
          );
    } else {
      final displayName = _displayNameController.text.trim();
      context.read<AuthBloc>().add(
            RegisterRequestedEvent(
              email: email,
              password: password,
              displayName: displayName,
            ),
          );
    }
  }

  @override
  Widget build(BuildContext context) {
    return BlocConsumer<AuthBloc, AuthState>(
      listener: (context, state) {
        if (state is Authenticated) {
          Navigator.of(context).pop();
          EditorFeedback.show(
            context,
            'Welcome, \${state.user.displayName.isNotEmpty ? state.user.displayName : state.user.email}!',
            kind: EditorFeedbackKind.info,
          );
        }
      },
      builder: (context, state) {
        final isLoading = state is AuthLoading;
        String? errorMessage;
        if (state is AuthFailureState) {
          errorMessage = state.failure.message;
        }

        return Dialog(
          backgroundColor: AppColors.darkSurfaceElevated,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
            side: const BorderSide(color: AppColors.darkBorder),
          ),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 440),
            child: Padding(
              padding: const EdgeInsets.all(AppSpacing.lg),
              child: Form(
                key: _formKey,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    // Header
                    Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.all(AppSpacing.xs),
                          decoration: BoxDecoration(
                            color: AppColors.primary.withOpacity(0.15),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: const Icon(Icons.cloud_sync_rounded, color: AppColors.primary, size: 24),
                        ),
                        AppSpacing.gapWSm,
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                _mode == AuthDialogMode.signIn ? 'Cloud Sign In' : 'Create Cloud Account',
                                style: AppTypography.titleLarge,
                              ),
                              Text(
                                'Sync projects, AI rendering & cloud assets',
                                style: AppTypography.caption.copyWith(color: AppColors.darkTextSecondary),
                              ),
                            ],
                          ),
                        ),
                        IconButton(
                          icon: const Icon(Icons.close, size: 18, color: AppColors.darkTextSecondary),
                          onPressed: () => Navigator.of(context).pop(),
                        ),
                      ],
                    ),
                    AppSpacing.gapHMd,

                    // Mode Switcher Tabs
                    Container(
                      decoration: BoxDecoration(
                        color: AppColors.darkSurface,
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: AppColors.darkBorder),
                      ),
                      child: Row(
                        children: [
                          Expanded(
                            child: InkWell(
                              onTap: isLoading ? null : () => setState(() => _mode = AuthDialogMode.signIn),
                              borderRadius: BorderRadius.circular(7),
                              child: Container(
                                padding: const EdgeInsets.symmetric(vertical: 8),
                                decoration: BoxDecoration(
                                  color: _mode == AuthDialogMode.signIn ? AppColors.darkSurfaceElevated : Colors.transparent,
                                  borderRadius: BorderRadius.circular(7),
                                ),
                                alignment: Alignment.center,
                                child: Text(
                                  'Sign In',
                                  style: AppTypography.bodySmall.copyWith(
                                    fontWeight: _mode == AuthDialogMode.signIn ? FontWeight.w600 : FontWeight.w400,
                                    color: _mode == AuthDialogMode.signIn ? AppColors.primary : AppColors.darkTextSecondary,
                                  ),
                                ),
                              ),
                            ),
                          ),
                          Expanded(
                            child: InkWell(
                              onTap: isLoading ? null : () => setState(() => _mode = AuthDialogMode.register),
                              borderRadius: BorderRadius.circular(7),
                              child: Container(
                                padding: const EdgeInsets.symmetric(vertical: 8),
                                decoration: BoxDecoration(
                                  color: _mode == AuthDialogMode.register ? AppColors.darkSurfaceElevated : Colors.transparent,
                                  borderRadius: BorderRadius.circular(7),
                                ),
                                alignment: Alignment.center,
                                child: Text(
                                  'Create Account',
                                  style: AppTypography.bodySmall.copyWith(
                                    fontWeight: _mode == AuthDialogMode.register ? FontWeight.w600 : FontWeight.w400,
                                    color: _mode == AuthDialogMode.register ? AppColors.primary : AppColors.darkTextSecondary,
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    AppSpacing.gapHMd,

                    // Error Message Banner
                    if (errorMessage != null) ...[
                      Container(
                        padding: const EdgeInsets.all(AppSpacing.sm),
                        decoration: BoxDecoration(
                          color: AppColors.error.withOpacity(0.12),
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: AppColors.error.withOpacity(0.4)),
                        ),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Icon(Icons.error_outline_rounded, color: AppColors.error, size: 18),
                            AppSpacing.gapWSm,
                            Expanded(
                              child: Text(
                                errorMessage,
                                style: AppTypography.bodySmall.copyWith(color: AppColors.error),
                              ),
                            ),
                          ],
                        ),
                      ),
                      AppSpacing.gapHSm,
                    ],

                    // Form Fields
                    if (_mode == AuthDialogMode.register) ...[
                      TextFormField(
                        controller: _displayNameController,
                        enabled: !isLoading,
                        style: AppTypography.bodyMedium,
                        decoration: _inputDecoration('Full Name / Display Name', Icons.person_outline),
                        validator: (val) {
                          if (val == null || val.trim().length < 2) {
                            return 'Name must be at least 2 characters.';
                          }
                          return null;
                        },
                      ),
                      AppSpacing.gapHSm,
                    ],

                    TextFormField(
                      controller: _emailController,
                      enabled: !isLoading,
                      keyboardType: TextInputType.emailAddress,
                      style: AppTypography.bodyMedium,
                      decoration: _inputDecoration('Email Address', Icons.email_outlined),
                      validator: (val) {
                        if (val == null || !val.contains('@') || !val.contains('.')) {
                          return 'Enter a valid email address.';
                        }
                        return null;
                      },
                    ),
                    AppSpacing.gapHSm,

                    TextFormField(
                      controller: _passwordController,
                      enabled: !isLoading,
                      obscureText: _obscurePassword,
                      style: AppTypography.bodyMedium,
                      decoration: _inputDecoration(
                        'Password',
                        Icons.lock_outline,
                        suffixIcon: IconButton(
                          icon: Icon(
                            _obscurePassword ? Icons.visibility_off_outlined : Icons.visibility_outlined,
                            size: 18,
                            color: AppColors.darkTextSecondary,
                          ),
                          onPressed: () => setState(() => _obscurePassword = !_obscurePassword),
                        ),
                      ),
                      validator: (val) {
                        if (val == null || val.length < 8) {
                          return 'Password must be at least 8 characters.';
                        }
                        return null;
                      },
                    ),

                    if (_mode == AuthDialogMode.register) ...[
                      AppSpacing.gapHSm,
                      TextFormField(
                        controller: _confirmPasswordController,
                        enabled: !isLoading,
                        obscureText: _obscureConfirm,
                        style: AppTypography.bodyMedium,
                        decoration: _inputDecoration(
                          'Confirm Password',
                          Icons.lock_reset_outlined,
                          suffixIcon: IconButton(
                            icon: Icon(
                              _obscureConfirm ? Icons.visibility_off_outlined : Icons.visibility_outlined,
                              size: 18,
                              color: AppColors.darkTextSecondary,
                            ),
                            onPressed: () => setState(() => _obscureConfirm = !_obscureConfirm),
                          ),
                        ),
                        validator: (val) {
                          if (val != _passwordController.text) {
                            return 'Passwords do not match.';
                          }
                          return null;
                        },
                      ),
                    ],

                    AppSpacing.gapHLg,

                    // Submit Button
                    ElevatedButton(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.primary,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                      ),
                      onPressed: isLoading ? null : _submit,
                      child: isLoading
                          ? const SizedBox(
                              height: 18,
                              width: 18,
                              child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                            )
                          : Text(
                              _mode == AuthDialogMode.signIn ? 'Sign In to Cloud' : 'Create Account',
                              style: AppTypography.labelLarge.copyWith(fontWeight: FontWeight.w600),
                            ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        );
      },
    );
  }

  InputDecoration _inputDecoration(String label, IconData icon, {Widget? suffixIcon}) {
    return InputDecoration(
      labelText: label,
      labelStyle: AppTypography.bodySmall.copyWith(color: AppColors.darkTextSecondary),
      prefixIcon: Icon(icon, size: 18, color: AppColors.darkTextSecondary),
      suffixIcon: suffixIcon,
      filled: true,
      fillColor: AppColors.darkSurface,
      contentPadding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm, vertical: AppSpacing.xs),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: const BorderSide(color: AppColors.darkBorder),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: const BorderSide(color: AppColors.primary),
      ),
    );
  }
}

/// Profile and Session Management Dialog for an Authenticated User
class UserProfileDialog extends StatelessWidget {
  final User user;

  const UserProfileDialog({super.key, required this.user});

  static Future<void> show(BuildContext context, User user) {
    return showDialog<void>(
      context: context,
      builder: (ctx) => UserProfileDialog(user: user),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      backgroundColor: AppColors.darkSurfaceElevated,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: const BorderSide(color: AppColors.darkBorder),
      ),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 400),
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.lg),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  CircleAvatar(
                    radius: 24,
                    backgroundColor: AppColors.primary,
                    child: Text(
                      user.displayName.isNotEmpty ? user.displayName[0].toUpperCase() : 'U',
                      style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold),
                    ),
                  ),
                  AppSpacing.gapWMd,
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(user.displayName, style: AppTypography.titleMedium),
                        Text(user.email, style: AppTypography.caption.copyWith(color: AppColors.darkTextSecondary)),
                        const SizedBox(height: 4),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(
                            color: AppColors.primary.withOpacity(0.2),
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: Text(
                            user.role.toUpperCase(),
                            style: const TextStyle(color: AppColors.primary, fontSize: 10, fontWeight: FontWeight.bold),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              AppSpacing.gapHLg,
              const Divider(color: AppColors.darkBorder, height: 1),
              AppSpacing.gapHMd,
              ListTile(
                dense: true,
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.verified_user_outlined, size: 18, color: AppColors.darkTextSecondary),
                title: const Text('Account Status'),
                trailing: Text(
                  user.emailVerified ? 'Verified' : 'Active',
                  style: TextStyle(
                    color: user.emailVerified ? AppColors.success : AppColors.darkTextPrimary,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              ListTile(
                dense: true,
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.cloud_done_outlined, size: 18, color: AppColors.darkTextSecondary),
                title: const Text('Cloud Session'),
                trailing: const Text(
                  'Connected',
                  style: TextStyle(color: AppColors.primary, fontWeight: FontWeight.w600),
                ),
              ),
              AppSpacing.gapHLg,
              Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  TextButton(
                    onPressed: () => Navigator.of(context).pop(),
                    child: const Text('Close'),
                  ),
                  AppSpacing.gapWSm,
                  ElevatedButton.icon(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.error.withOpacity(0.2),
                      foregroundColor: AppColors.error,
                      side: BorderSide(color: AppColors.error.withOpacity(0.5)),
                    ),
                    icon: const Icon(Icons.logout_rounded, size: 16),
                    label: const Text('Sign Out'),
                    onPressed: () {
                      Navigator.of(context).pop();
                      context.read<AuthBloc>().add(const LogoutRequestedEvent());
                      EditorFeedback.show(context, 'Signed out from cloud session.');
                    },
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
`;

fs.writeFileSync(path.join(myEditorLib, 'presentation/common/auth/auth_dialog.dart'), authDialogDart, 'utf8');
console.log('Wrote presentation/common/auth/auth_dialog.dart');
