import {
  AdminStatsOverview,
  AdminChartsReport,
  AdminSystemHealthReport,
  AdminUserView,
  AdminUserDetailView,
  PaginatedUsersResponse,
  AdminProjectView,
  AdminProjectDetailView,
  PaginatedProjectsResponse,
  AdminMediaView,
  AdminMediaDetailView,
  PaginatedMediaResponse,
  AdminCommentView,
  AdminAuditLogEntry,
  AdminJobView,
  AdminJobStatus,
  AdminJobQueryParams,
  AdminJobMetrics,
  AdminJobDetailView,
  AdminAIJobDetailView,
  AdminRenderJobDetailView,
  AdminSubscriptionView,
  AdminCreditTransactionView,
} from '../types/admin';

export interface PaginatedJobsResponse {
  jobs: AdminJobView[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

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
      Accept: 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (options.body) {
      headers['Content-Type'] = 'application/json';
    }

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
  async getProjects(params?: {
    search?: string;
    owner?: string;
    status?: string;
    createdFrom?: string;
    createdTo?: string;
    sizeCategory?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    page?: number;
    pageSize?: number;
  }): Promise<PaginatedProjectsResponse> {
    const searchParams = new URLSearchParams();
    if (params?.search) searchParams.set('search', params.search);
    if (params?.owner) searchParams.set('owner', params.owner);
    if (params?.status && params.status !== 'all') searchParams.set('status', params.status);
    if (params?.createdFrom) searchParams.set('createdFrom', params.createdFrom);
    if (params?.createdTo) searchParams.set('createdTo', params.createdTo);
    if (params?.sizeCategory && params.sizeCategory !== 'all') searchParams.set('sizeCategory', params.sizeCategory);
    if (params?.sortBy) searchParams.set('sortBy', params.sortBy);
    if (params?.sortOrder) searchParams.set('sortOrder', params.sortOrder);
    if (params?.page) searchParams.set('page', params.page.toString());
    if (params?.pageSize) searchParams.set('pageSize', params.pageSize.toString());

    const qs = searchParams.toString();
    const res = await this.request<any>(`/admin/projects${qs ? `?${qs}` : ''}`);
    if (res && res.projects) {
      return res as PaginatedProjectsResponse;
    }
    const projectArray: AdminProjectView[] = Array.isArray(res) ? res : [];
    return {
      projects: projectArray,
      total: projectArray.length,
      page: 1,
      pageSize: projectArray.length || 50,
      totalPages: 1,
    };
  }

  async getProjectDetails(projectId: string): Promise<AdminProjectDetailView> {
    return this.request<AdminProjectDetailView>(`/admin/projects/${projectId}`);
  }

  async archiveProject(projectId: string): Promise<AdminProjectView> {
    return this.request<AdminProjectView>(`/admin/projects/${projectId}/archive`, {
      method: 'POST',
    });
  }

  async restoreProject(projectId: string): Promise<AdminProjectView> {
    return this.request<AdminProjectView>(`/admin/projects/${projectId}/restore`, {
      method: 'POST',
    });
  }

  async createProjectSnapshot(projectId: string, data: { name: string; description?: string }): Promise<any> {
    return this.request<any>(`/admin/projects/${projectId}/snapshots`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Media
  async getMedia(params?: {
    search?: string;
    category?: string;
    status?: string;
    owner?: string;
    createdFrom?: string;
    createdTo?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    page?: number;
    pageSize?: number;
  }): Promise<PaginatedMediaResponse> {
    const searchParams = new URLSearchParams();
    if (params?.search) searchParams.set('search', params.search);
    if (params?.category && params.category !== 'all') searchParams.set('category', params.category);
    if (params?.status && params.status !== 'all') searchParams.set('status', params.status);
    if (params?.owner && params.owner !== 'all') searchParams.set('owner', params.owner);
    if (params?.createdFrom) searchParams.set('createdFrom', params.createdFrom);
    if (params?.createdTo) searchParams.set('createdTo', params.createdTo);
    if (params?.sortBy) searchParams.set('sortBy', params.sortBy);
    if (params?.sortOrder) searchParams.set('sortOrder', params.sortOrder);
    if (params?.page) searchParams.set('page', params.page.toString());
    if (params?.pageSize) searchParams.set('pageSize', params.pageSize.toString());

    const qs = searchParams.toString();
    const res = await this.request<any>(`/admin/media${qs ? `?${qs}` : ''}`);
    if (res && res.media) {
      return res as PaginatedMediaResponse;
    }
    const mediaArray: AdminMediaView[] = Array.isArray(res) ? res : [];
    return {
      media: mediaArray,
      total: mediaArray.length,
      page: 1,
      pageSize: mediaArray.length || 50,
      totalPages: 1,
    };
  }

  async getMediaDetails(mediaId: string): Promise<AdminMediaDetailView> {
    return this.request<AdminMediaDetailView>(`/admin/media/${mediaId}`);
  }

  async retryMediaProcessing(mediaId: string): Promise<AdminMediaView> {
    return this.request<AdminMediaView>(`/admin/media/${mediaId}/retry`, {
      method: 'POST',
    });
  }

  async archiveMedia(mediaId: string): Promise<AdminMediaView> {
    return this.request<AdminMediaView>(`/admin/media/${mediaId}/archive`, {
      method: 'POST',
    });
  }

  async deleteMedia(mediaId: string): Promise<{ deleted: boolean; id: string; message: string }> {
    return this.request<{ deleted: boolean; id: string; message: string }>(`/admin/media/${mediaId}`, {
      method: 'DELETE',
    });
  }

  async cleanupOrphanedMedia(mediaId: string): Promise<{ success: boolean; mediaId: string; message: string }> {
    return this.request<{ success: boolean; mediaId: string; message: string }>(`/admin/media/${mediaId}/cleanup-orphaned`, {
      method: 'POST',
    });
  }

  // Jobs Monitoring Center
  async getJobs(params?: AdminJobQueryParams): Promise<PaginatedJobsResponse> {
    const searchParams = new URLSearchParams();
    if (params?.search) searchParams.set('search', params.search);
    if (params?.status && params.status !== 'all') searchParams.set('status', params.status);
    if (params?.type && params.type !== 'all') searchParams.set('type', params.type);
    if (params?.owner && params.owner !== 'all') searchParams.set('owner', params.owner);
    if (params?.project && params.project !== 'all') searchParams.set('project', params.project);
    if (params?.createdFrom) searchParams.set('createdFrom', params.createdFrom);
    if (params?.createdTo) searchParams.set('createdTo', params.createdTo);
    if (params?.sortBy) searchParams.set('sortBy', params.sortBy);
    if (params?.sortOrder) searchParams.set('sortOrder', params.sortOrder);
    if (params?.page) searchParams.set('page', params.page.toString());
    if (params?.pageSize) searchParams.set('pageSize', params.pageSize.toString());

    const qs = searchParams.toString();
    const res = await this.request<any>(`/admin/jobs${qs ? `?${qs}` : ''}`);
    if (res && res.jobs) {
      return res as PaginatedJobsResponse;
    }
    const jobsArray: AdminJobView[] = Array.isArray(res) ? res : [];
    return {
      jobs: jobsArray,
      total: jobsArray.length,
      page: 1,
      pageSize: jobsArray.length || 50,
      totalPages: 1,
    };
  }

  async getJobDetails(jobId: string): Promise<AdminJobDetailView> {
    return this.request<AdminJobDetailView>(`/admin/jobs/${jobId}`);
  }

  async getJobMetrics(): Promise<AdminJobMetrics> {
    return this.request<AdminJobMetrics>('/admin/jobs/metrics');
  }

  async cancelJob(jobId: string): Promise<AdminJobView> {
    return this.request<AdminJobView>(`/admin/jobs/${jobId}/cancel`, {
      method: 'POST',
    });
  }

  async retryJob(jobId: string): Promise<AdminJobView> {
    return this.request<AdminJobView>(`/admin/jobs/${jobId}/retry`, {
      method: 'POST',
    });
  }

  // AI Job Intelligence Center
  async getAIJobs(params?: AdminJobQueryParams): Promise<PaginatedJobsResponse> {
    const searchParams = new URLSearchParams();
    if (params?.search) searchParams.set('search', params.search);
    if (params?.status && params.status !== 'all') searchParams.set('status', params.status);
    if (params?.type && params.type !== 'all') searchParams.set('type', params.type);
    if (params?.owner && params.owner !== 'all') searchParams.set('owner', params.owner);
    if (params?.project && params.project !== 'all') searchParams.set('project', params.project);
    if (params?.createdFrom) searchParams.set('createdFrom', params.createdFrom);
    if (params?.createdTo) searchParams.set('createdTo', params.createdTo);
    if (params?.sortBy) searchParams.set('sortBy', params.sortBy);
    if (params?.sortOrder) searchParams.set('sortOrder', params.sortOrder);
    if (params?.page) searchParams.set('page', params.page.toString());
    if (params?.pageSize) searchParams.set('pageSize', params.pageSize.toString());

    const qs = searchParams.toString();
    const res = await this.request<any>(`/admin/ai/jobs${qs ? `?${qs}` : ''}`);
    if (res && res.jobs) {
      return res as PaginatedJobsResponse;
    }
    const jobsArray: AdminJobView[] = Array.isArray(res) ? res : [];
    return {
      jobs: jobsArray,
      total: jobsArray.length,
      page: 1,
      pageSize: jobsArray.length || 50,
      totalPages: 1,
    };
  }

  async getAIJobDetails(jobId: string): Promise<AdminAIJobDetailView> {
    return this.request<AdminAIJobDetailView>(`/admin/ai/jobs/${jobId}`);
  }

  // Cloud Render & Export Monitoring Center
  async getRenderJobs(params?: AdminJobQueryParams): Promise<PaginatedJobsResponse> {
    const searchParams = new URLSearchParams();
    if (params?.search) searchParams.set('search', params.search);
    if (params?.status && params.status !== 'all') searchParams.set('status', params.status);
    if (params?.type && params.type !== 'all') searchParams.set('type', params.type);
    if (params?.owner && params.owner !== 'all') searchParams.set('owner', params.owner);
    if (params?.project && params.project !== 'all') searchParams.set('project', params.project);
    if (params?.createdFrom) searchParams.set('createdFrom', params.createdFrom);
    if (params?.createdTo) searchParams.set('createdTo', params.createdTo);
    if (params?.sortBy) searchParams.set('sortBy', params.sortBy);
    if (params?.sortOrder) searchParams.set('sortOrder', params.sortOrder);
    if (params?.page) searchParams.set('page', params.page.toString());
    if (params?.pageSize) searchParams.set('pageSize', params.pageSize.toString());

    const qs = searchParams.toString();
    const res = await this.request<any>(`/admin/render/jobs${qs ? `?${qs}` : ''}`);
    if (res && res.jobs) {
      return res as PaginatedJobsResponse;
    }
    const jobsArray: AdminJobView[] = Array.isArray(res) ? res : [];
    return {
      jobs: jobsArray,
      total: jobsArray.length,
      page: 1,
      pageSize: jobsArray.length || 50,
      totalPages: 1,
    };
  }

  async getRenderJobDetails(jobId: string): Promise<AdminRenderJobDetailView> {
    return this.request<AdminRenderJobDetailView>(`/admin/render/jobs/${jobId}`);
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
