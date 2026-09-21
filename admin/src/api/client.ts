import {
  AdminStatsOverview,
  AdminChartsReport,
  AdminSystemHealthReport,
  AdminUserView,
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
  async getUsers(query?: string): Promise<AdminUserView[]> {
    const qs = query ? `?search=${encodeURIComponent(query)}` : '';
    const res = await this.request<any>(`/admin/users${qs}`);
    return Array.isArray(res) ? res : (res.users || []);
  }

  async updateUserRole(userId: string, role: string, status?: string): Promise<AdminUserView> {
    return this.request<AdminUserView>(`/admin/users/${userId}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role, status }),
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
