import fs from 'fs';
import path from 'path';

const myEditorLib = 'd:/Tech/my_editor/lib';

// 1. Update Windows Project Manager Home
const winPath = path.join(myEditorLib, 'presentation/windows/features/projects/windows_project_manager_home.dart');
let winContent = fs.readFileSync(winPath, 'utf8');

// Ensure import
if (!winContent.includes("import '../../../../application/auth/auth_bloc.dart';")) {
  winContent = "import '../../../../application/auth/auth_bloc.dart';\nimport '../../../common/auth/auth_dialog.dart';\n" + winContent;
}

// Add Auth button in toolbar
const targetWin = `                      DesktopButton.primary(
                        label: 'New Project',
                        icon: const Icon(Icons.add, size: 14),
                        onPressed: () => _showNewProjectDialog(context),
                      ),`;

const replaceWin = `                      DesktopButton.primary(
                        label: 'New Project',
                        icon: const Icon(Icons.add, size: 14),
                        onPressed: () => _showNewProjectDialog(context),
                      ),
                      AppSpacing.gapWSm,
                      BlocBuilder<AuthBloc, AuthState>(
                        builder: (context, authState) {
                          if (authState is Authenticated) {
                            return InkWell(
                              onTap: () => UserProfileDialog.show(context, authState.user),
                              borderRadius: BorderRadius.circular(4),
                              child: Container(
                                height: 32,
                                padding: const EdgeInsets.symmetric(horizontal: 10),
                                decoration: BoxDecoration(
                                  color: AppColors.primary.withOpacity(0.15),
                                  borderRadius: BorderRadius.circular(4),
                                  border: Border.all(color: AppColors.primary.withOpacity(0.4)),
                                ),
                                child: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    const Icon(Icons.cloud_done_rounded, size: 14, color: AppColors.primary),
                                    const SizedBox(width: 6),
                                    Text(
                                      authState.user.displayName.isNotEmpty
                                          ? authState.user.displayName
                                          : authState.user.email,
                                      style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.primary),
                                    ),
                                  ],
                                ),
                              ),
                            );
                          }
                          return DesktopButton(
                            label: authState is AuthLoading ? 'Connecting...' : 'Cloud Sign In',
                            icon: const Icon(Icons.cloud_queue_rounded, size: 14),
                            onPressed: () => AuthDialog.show(context),
                          );
                        },
                      ),`;

if (winContent.includes(targetWin) && !winContent.includes('UserProfileDialog.show(context, authState.user)')) {
  winContent = winContent.replace(targetWin, replaceWin);
  fs.writeFileSync(winPath, winContent, 'utf8');
  console.log('Updated windows_project_manager_home.dart with Auth UI');
} else {
  console.log('Windows project manager already has Auth UI or target string not found');
}

// 2. Update Mobile Project Manager Home
const mobPath = path.join(myEditorLib, 'presentation/mobile/features/projects/mobile_project_manager_home.dart');
let mobContent = fs.readFileSync(mobPath, 'utf8');

if (!mobContent.includes("import '../../../../application/auth/auth_bloc.dart';")) {
  mobContent = "import '../../../../application/auth/auth_bloc.dart';\nimport '../../../common/auth/auth_dialog.dart';\n" + mobContent;
}

const targetMob = `              IconButton(
                icon: const Icon(Icons.refresh_rounded),
                tooltip: 'Refresh',
                onPressed: () => context.read<ProjectBloc>().add(const LoadProjectsListEvent()),
              ),`;

const replaceMob = `              IconButton(
                icon: const Icon(Icons.refresh_rounded),
                tooltip: 'Refresh',
                onPressed: () => context.read<ProjectBloc>().add(const LoadProjectsListEvent()),
              ),
              BlocBuilder<AuthBloc, AuthState>(
                builder: (context, authState) {
                  if (authState is Authenticated) {
                    return IconButton(
                      icon: const Icon(Icons.account_circle, color: AppColors.primary),
                      tooltip: 'Cloud Account: \${authState.user.displayName}',
                      onPressed: () => UserProfileDialog.show(context, authState.user),
                    );
                  }
                  return IconButton(
                    icon: const Icon(Icons.account_circle_outlined),
                    tooltip: 'Cloud Sign In',
                    onPressed: () => AuthDialog.show(context),
                  );
                },
              ),`;

if (mobContent.includes(targetMob) && !mobContent.includes('Cloud Account:')) {
  mobContent = mobContent.replace(targetMob, replaceMob);
  fs.writeFileSync(mobPath, mobContent, 'utf8');
  console.log('Updated mobile_project_manager_home.dart with Auth UI');
} else {
  console.log('Mobile project manager already has Auth UI or target string not found');
}
