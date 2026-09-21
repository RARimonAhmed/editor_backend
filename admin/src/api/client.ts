import {
  AdminStatsOverview,
  AdminChartsReport,
  AdminSystemHealthReport,
  AdminUserView,
  AdminUserDetailView,
  PaginatedUsersResponse,
  AdminProjectView,
  AdminMediaView,
  AdminCommentView,
  AdminAuditLogEntry,
  AdminJobView,
  AdminAIJobView,
  AdminSubscriptionView,
  AdminCreditTransactionView,
} from '../types/admin';

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

class AdminApiClient {
  private baseUrl = '/v1';
  private tokenKey = 'my_editor_admin_token';
  private userKey = 'my_editor_admin_user';

  getToken(): string | null {
    return localStorage.getItem(this.tokenKey);
  }

  setSession(token: string, user: any): void {
    localStorage.setItem(this.tokenKey, token);
    localStorage.setItem(this.userKey, JSON.stringify(user));
  }

  clearSession(): void {
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.userKey);
  }

  getCurrentUser(): any | null {
    const raw = localStorage.getItem(this.userKey);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const token = this.getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (token) {
      if (token.startsWith('adm_')) {
        headers['x-admin-key'] = token;
      } else {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }

    const url = `${this.baseUrl}${path}`;
    let response: Response;
    try {
      response = await fetch(url, { ...options, headers });
    } catch (err: any) {
      throw new Error(`Network error connecting to API: ${err.message}`);
    }

    if (response.status === 401 && !path.includes('/login')) {
      this.clearSession();
      window.location.hash = '#/login';
      throw new Error('Session expired or unauthorized');
    }

    let json: any;
    try {
      json = await response.json();
    } catch {
      throw new Error(`Invalid server response (status ${response.status})`);
    }

    if (!response.ok || (json.success === false && json.error)) {
      const errorMsg = json.error?.message || json.message || `Request failed with status ${response.status}`;
      throw new Error(errorMsg);
    }

    return (json.data !== undefined ? json.data : json) as T;
  }

  // Authentication
  async login(credentials: { email?: string; password?: string; adminKey?: string }): Promise<{ user: any; tokens: any }> {
    const res = await this.request<{ user: any; tokens: { accessToken: string; refreshToken: string } }>(
      '/admin/login',
      {
        method: 'POST',
        body: JSON.stringify(credentials),
      }
    );
    const token = res.tokens.accessToken;
    this.setSession(token, res.user);
    return res;
  }

  // Telemetry & Metrics
  async getStatsOverview(): Promise<AdminStatsOverview> {
    return this.request<AdminStatsOverview>('/admin/stats');
  }

  async getCharts(): Promise<AdminChartsReport> {
    return this.request<AdminChartsReport>('/admin/charts');
  }

  async getHealth(): Promise<AdminSystemHealthReport> {
    return this.request<AdminSystemHealthReport>('/admin/health');
  }

  // Users
  async getUsers(options?: string | {
    search?: string;
    role?: string;
    status?: string;
    subscription?: string;
    createdFrom?: string;
    createdTo?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    page?: number;
    pageSize?: number;
  }): Promise<PaginatedUsersResponse> {
    let qs = '';
    if (typeof options === 'string') {
      qs = options ? `?search=${encodeURIComponent(options)}` : '';
    } else if (options) {
      const params = new URLSearchParams();
      if (options.search) params.set('search', options.search);
      if (options.role && options.role !== 'all') params.set('role', options.role);
      if (options.status && options.status !== 'all') params.set('status', options.status);
      if (options.subscription && options.subscription !== 'all') params.set('subscription', options.subscription);
      if (options.createdFrom) params.set('createdFrom', options.createdFrom);
      if (options.createdTo) params.set('createdTo', options.createdTo);
      if (options.sortBy) params.set('sortBy', options.sortBy);
      if (options.sortOrder) params.set('sortOrder', options.sortOrder);
      if (options.page) params.set('page', String(options.page));
      if (options.pageSize) params.set('pageSize', String(options.pageSize));
      const str = params.toString();
      if (str) qs = `?${str}`;
    }

    const res = await this.request<any>(`/admin/users${qs}`);
    if (res && Array.isArray(res.users)) {
      return res;
    }
    const userArray = Array.isArray(res) ? res : [];
    return {
      users: userArray,
      total: userArray.length,
      page: 1,
      pageSize: userArray.length,
      totalPages: 1,
    };
  }

  async getUserDetails(userId: string): Promise<AdminUserDetailView> {
    return this.request<AdminUserDetailView>(`/admin/users/${userId}`);
  }

  async updateUserRole(userId: string, role: string, status?: string): Promise<AdminUserView> {
    return this.request<AdminUserView>(`/admin/users/${userId}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role, status }),
    });
  }

  async updateUserStatus(userId: string, status: string, reason?: string): Promise<AdminUserView> {
    return this.request<AdminUserView>(`/admin/users/${userId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, reason }),
    });
  }

  async revokeUserSessions(userId: string, sessionId?: string): Promise<{ revokedCount: number; message: string }> {
    return this.request<{ revokedCount: number; message: string }>(`/admin/users/${userId}/revoke-sessions`, {
      method: 'POST',
      body: JSON.stringify({ sessionId }),
    });
  }

  // Projects
  async getProjects(): Promise<AdminProjectView[]> {
    const res = await this.request<any>('/admin/projects');
    return Array.isArray(res) ? res : (res.projects || []);
  }

  // Media
  async getMedia(): Promise<AdminMediaView[]> {
    const res = await this.request<any>('/admin/media');
    return Array.isArray(res) ? res : (res.media || []);
  }

  // Jobs
  async getJobs(): Promise<AdminJobView[]> {
    const res = await this.request<any>('/admin/jobs');
    return Array.isArray(res) ? res : (res.jobs || []);
  }

  async getAIJobs(): Promise<AdminAIJobView[]> {
    return this.request<AdminAIJobView[]>('/admin/ai/jobs');
  }

  async getRenderJobs(): Promise<AdminJobView[]> {
    const res = await this.request<any>('/admin/jobs?type=render');
    return Array.isArray(res) ? res : (res.jobs || []);
  }

  // Credits & Billing
  async getCredits(): Promise<{ balances: Array<{ userId: string; email: string; balance: number }>; ledger: AdminCreditTransactionView[] }> {
    return this.request<{ balances: Array<{ userId: string; email: string; balance: number }>; ledger: AdminCreditTransactionView[] }>('/admin/credits');
  }

  async grantCredits(userId: string, amount: number, reason: string): Promise<{ newBalance: number }> {
    return this.request<{ newBalance: number }>(`/admin/users/${userId}/credits/grant`, {
      method: 'POST',
      body: JSON.stringify({ amount, reason }),
    });
  }

  // Subscriptions
  async getSubscriptions(): Promise<AdminSubscriptionView[]> {
    const res = await this.request<any>('/admin/subscriptions');
    return Array.isArray(res) ? res : (res.subscriptions || []);
  }

  // Collaboration Comments
  async getComments(): Promise<AdminCommentView[]> {
    const res = await this.request<any>('/admin/comments');
    return Array.isArray(res) ? res : (res.comments || []);
  }

  // Audit Logs
  async getAuditLogs(): Promise<AdminAuditLogEntry[]> {
    const res = await this.request<any>('/admin/audit-logs');
    return Array.isArray(res) ? res : (res.logs || []);
  }
}

export const api = new AdminApiClient();
