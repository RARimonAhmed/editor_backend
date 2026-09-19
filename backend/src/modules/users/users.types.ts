export type UserRole = 'user' | 'pro' | 'admin' | 'system';
export type UserStatus = 'active' | 'suspended' | 'pending_verification' | 'deleted';

export interface User {
  id: string;
  email: string;
  password_hash?: string;
  display_name: string;
  avatar_url?: string | null;
  role: UserRole;
  status: UserStatus;
  deleted_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  role: UserRole;
  createdAt: string;
}
