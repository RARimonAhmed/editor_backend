import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';
import {
  AdminJobView,
  AdminJobDetailView,
  AdminJobStatus,
} from '../types/admin';
import { useRealtimeJobs } from '../hooks/useRealtimeJobs';
import {
  Server,
  Search,
  RefreshCw,
  Eye,
  XCircle,
  RotateCcw,
  Copy,
  Check,
  Clock,
  Cpu,
  Activity,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  X,
  FileText,
  ShieldCheck,
  Terminal,
  Radio,
  Zap,
} from 'lucide-react';
import { Modal } from '../components/Modal';

export const JobsPage: React.FC = () => {
  // Query Filters State
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [createdFrom, setCreatedFrom] = useState('');
  const [createdTo, setCreatedTo] = useState('');
  const [sortBy, setSortBy] = useState<'createdAt' | 'startedAt' | 'duration' | 'progress' | 'type'>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  // Inspector Drawer State
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [jobDetails, setJobDetails] = useState<AdminJobDetailView | null>(null);
  const [inspectorLoading, setInspectorLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'steps' | 'logs' | 'error' | 'audit'>('overview');
  const [logLevelFilter, setLogLevelFilter] = useState<'all' | 'info' | 'warn' | 'error'>('all');

  // Confirmation Modals State
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [retryModalOpen, setRetryModalOpen] = useState(false);
  const [actionJob, setActionJob] = useState<AdminJobView | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(timer);
  }, [search]);

  // Real-time hook for live updates
  const {
    jobs,
    total,
    totalPages,
    metrics,
    isLoading,
    isConnected,
    connectionType,
    lastEventTimestamp,
    refresh,
    updateParams,
  } = useRealtimeJobs({
    channel: 'admin:jobs',
    initialParams: {
      page: 1,
      pageSize: 15,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    },
  });

  // Sync state changes to hook query params
  useEffect(() => {
    updateParams({
      search: debouncedSearch.trim() || undefined,
      status: statusFilter !== 'all' ? statusFilter : undefined,
      type: typeFilter !== 'all' ? typeFilter : undefined,
      createdFrom: createdFrom || undefined,
      createdTo: createdTo || undefined,
      sortBy,
      sortOrder,
      page,
      pageSize,
    });
  }, [debouncedSearch, statusFilter, typeFilter, createdFrom, createdTo, sortBy, sortOrder, page, pageSize, updateParams]);

  // Copy helper
  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Inspect Job Details
  const handleInspect = async (jobId: string) => {
    setSelectedJobId(jobId);
    setInspectorOpen(true);
    setInspectorLoading(true);
    try {
      const details = await api.getJobDetails(jobId);
      setJobDetails(details);
      if (details.errorDetails) {
        setActiveTab('error');
      } else {
        setActiveTab('overview');
      }
    } catch (err: any) {
      setToastMessage({ type: 'error', text: err.message || 'Failed to load job details' });
    } finally {
      setInspectorLoading(false);
    }
  };

  // Safe Cancel Action
  const handleConfirmCancel = async () => {
    if (!actionJob) return;
    setIsSubmitting(true);
    try {
      const updated = await api.cancelJob(actionJob.id);
      setToastMessage({ type: 'success', text: `Job ${updated.id.slice(0, 12)} successfully cancelled.` });
      setCancelModalOpen(false);
      setActionJob(null);
      if (selectedJobId === updated.id) {
        handleInspect(updated.id);
      }
      refresh();
    } catch (err: any) {
      setToastMessage({ type: 'error', text: err.message || 'Cancellation failed' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Safe Retry Action
  const handleConfirmRetry = async () => {
    if (!actionJob) return;
    setIsSubmitting(true);
    try {
      const updated = await api.retryJob(actionJob.id);
      setToastMessage({ type: 'success', text: `Job ${updated.id.slice(0, 12)} queued for immediate retry.` });
      setRetryModalOpen(false);
      setActionJob(null);
      if (selectedJobId === updated.id) {
        handleInspect(updated.id);
      }
      refresh();
    } catch (err: any) {
      setToastMessage({ type: 'error', text: err.message || 'Retry failed' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Render Status Badge
  const renderStatusBadge = (status: AdminJobStatus) => {
    let bg = 'rgba(100, 116, 139, 0.2)';
    let color = '#94a3b8';
    let border = 'rgba(100, 116, 139, 0.4)';
    let dot = '#94a3b8';

    switch (status) {
      case 'RUNNING':
        bg = 'rgba(99, 102, 241, 0.15)';
        color = '#818cf8';
        border = 'rgba(99, 102, 241, 0.4)';
        dot = '#6366f1';
        break;
      case 'COMPLETED':
        bg = 'rgba(16, 185, 129, 0.15)';
        color = '#34d399';
        border = 'rgba(16, 185, 129, 0.4)';
        dot = '#10b981';
        break;
      case 'FAILED':
        bg = 'rgba(239, 68, 68, 0.15)';
        color = '#f87171';
        border = 'rgba(239, 68, 68, 0.4)';
        dot = '#ef4444';
        break;
      case 'CANCELLED':
        bg = 'rgba(245, 158, 11, 0.15)';
        color = '#fbbf24';
        border = 'rgba(245, 158, 11, 0.4)';
        dot = '#f59e0b';
        break;
      case 'RETRYING':
        bg = 'rgba(168, 85, 247, 0.15)';
        color = '#c084fc';
        border = 'rgba(168, 85, 247, 0.4)';
        dot = '#a855f7';
        break;
      case 'QUEUED':
      default:
        bg = 'rgba(148, 163, 184, 0.15)';
        color = '#cbd5e1';
        border = 'rgba(148, 163, 184, 0.3)';
        dot = '#94a3b8';
        break;
    }

    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '3px 9px',
          borderRadius: 12,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.04em',
          backgroundColor: bg,
          color,
          border: `1px solid ${border}`,
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            backgroundColor: dot,
            boxShadow: status === 'RUNNING' ? '0 0 6px #6366f1' : 'none',
          }}
        />
        {status}
      </span>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, paddingBottom: 60 }}>
      {/* Page Header & Live Status */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em', color: '#fff' }}>
              Job Monitoring Center
            </h1>
            {/* Live stream badge */}
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '3px 10px',
                borderRadius: 20,
                fontSize: 11,
                fontWeight: 600,
                background: isConnected ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                color: isConnected ? '#34d399' : '#f87171',
                border: `1px solid ${isConnected ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
              }}
            >
              <Radio size={12} className={isConnected ? 'animate-pulse' : ''} />
              <span>
                {isConnected
                  ? `Live Streaming (${connectionType === 'websocket' ? 'WebSocket' : 'SSE'})`
                  : 'Reconnecting Live Stream...'}
              </span>
            </div>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>
            Real-time unified background job execution engine, queue depths, worker clusters, and state safety telemetry.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {lastEventTimestamp && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Clock size={12} />
              <span>Last Event: {new Date(lastEventTimestamp).toLocaleTimeString()}</span>
            </div>
          )}
          <button
            onClick={() => refresh()}
            className="btn btn-secondary btn-sm"
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <RefreshCw size={14} className={isLoading ? 'spin' : ''} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Toast Feedback */}
      {toastMessage && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: 'var(--radius-md)',
            background: toastMessage.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
            border: `1px solid ${toastMessage.type === 'success' ? 'var(--success)' : 'var(--danger)'}`,
            color: toastMessage.type === 'success' ? '#34d399' : '#f87171',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          <span>{toastMessage.text}</span>
          <button
            onClick={() => setToastMessage(null)}
            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Real Queue Telemetry Ribbon */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 16,
        }}
      >
        <div className="card" style={{ padding: 18, borderLeft: '4px solid #6366f1' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Queue Depth
          </div>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#fff', marginTop: 6, display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span>{metrics?.queueDepth ?? 0}</span>
            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)' }}>
              ({metrics?.queuedJobs ?? 0} queued)
            </span>
          </div>
          <div style={{ fontSize: 11, color: '#818cf8', marginTop: 4 }}>
            Pending in ingestion queues
          </div>
        </div>

        <div className="card" style={{ padding: 18, borderLeft: '4px solid #38bdf8' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Active / Running
          </div>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#fff', marginTop: 6, display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span>{metrics?.runningJobs ?? 0}</span>
            <span style={{ fontSize: 12, fontWeight: 500, color: '#38bdf8' }}>
              workers active
            </span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
            Across distributed GPU/CPU nodes
          </div>
        </div>

        <div className="card" style={{ padding: 18, borderLeft: '4px solid #10b981' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Completed Jobs
          </div>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#34d399', marginTop: 6 }}>
            {metrics?.completedJobs ?? 0}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
            Successfully processed tasks
          </div>
        </div>

        <div className="card" style={{ padding: 18, borderLeft: '4px solid #ef4444' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Failure Rate
          </div>
          <div style={{ fontSize: 26, fontWeight: 800, color: (metrics?.failureRatePercentage || 0) > 10 ? '#f87171' : '#fff', marginTop: 6 }}>
            {metrics?.failureRatePercentage ?? 0}%
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
            {metrics?.failedJobs ?? 0} failed / DLQ
          </div>
        </div>

        <div className="card" style={{ padding: 18, borderLeft: '4px solid #a855f7' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Avg Processing Time
          </div>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#fff', marginTop: 6 }}>
            {metrics?.averageDurationSeconds ?? 0}s
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
            Task turnaround latency
          </div>
        </div>
      </div>

      {/* Filter & Search Toolbar */}
      <div className="card" style={{ padding: 16 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', flex: 1 }}>
            {/* Search Input */}
            <div style={{ position: 'relative', minWidth: 260, flex: '1 1 260px' }}>
              <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="text"
                className="input"
                placeholder="Search job ID, type, owner, project, node..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ paddingLeft: 36, width: '100%' }}
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Status Filter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Status:</span>
              <select
                className="input"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                style={{ minWidth: 130, padding: '6px 10px', fontSize: 13 }}
              >
                <option value="all">All Statuses</option>
                <option value="QUEUED">QUEUED</option>
                <option value="RUNNING">RUNNING</option>
                <option value="COMPLETED">COMPLETED</option>
                <option value="FAILED">FAILED</option>
                <option value="CANCELLED">CANCELLED</option>
                <option value="RETRYING">RETRYING</option>
              </select>
            </div>

            {/* Type Filter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Type:</span>
              <select
                className="input"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                style={{ minWidth: 150, padding: '6px 10px', fontSize: 13 }}
              >
                <option value="all">All Types</option>
                <option value="render_export">Render Export</option>
                <option value="text_to_speech">AI Text-to-Speech</option>
                <option value="broll_generation">AI B-Roll Gen</option>
                <option value="smart_cut">AI Smart Cut</option>
                <option value="image_generation">AI Image Gen</option>
                <option value="transcode">Media Transcode</option>
              </select>
            </div>

            {/* Date Range */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>From:</span>
              <input
                type="date"
                className="input"
                value={createdFrom}
                onChange={(e) => setCreatedFrom(e.target.value)}
                style={{ padding: '6px 10px', fontSize: 12 }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>To:</span>
              <input
                type="date"
                className="input"
                value={createdTo}
                onChange={(e) => setCreatedTo(e.target.value)}
                style={{ padding: '6px 10px', fontSize: 12 }}
              />
            </div>
          </div>

          {/* Sort Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Sort:</span>
            <select
              className="input"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              style={{ padding: '6px 10px', fontSize: 13 }}
            >
              <option value="createdAt">Created Date</option>
              <option value="startedAt">Start Time</option>
              <option value="duration">Duration</option>
              <option value="progress">Progress %</option>
              <option value="type">Job Type</option>
            </select>
            <button
              onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              className="btn btn-secondary btn-sm"
              title="Toggle Sort Direction"
              style={{ padding: '6px 10px' }}
            >
              {sortOrder === 'asc' ? '↑' : '↓'}
            </button>
          </div>
        </div>
      </div>

      {/* 12-Column Professional Jobs Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="table" style={{ width: '100%', minWidth: 1280, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'rgba(255, 255, 255, 0.02)', borderBottom: '1px solid var(--border-subtle)' }}>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>1. Job ID</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>2. Type</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>3. Owner</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>4. Project</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>5. Status</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', minWidth: 130 }}>6. Progress</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>7. Worker</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>8. Created</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>9. Started</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>10. Completed</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>11. Duration</th>
                <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>12. Retries</th>
                <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {jobs.length === 0 ? (
                <tr>
                  <td colSpan={13} style={{ padding: '48px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    {isLoading ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                        <div className="loading-spinner" />
                        <span>Synchronizing distributed jobs cluster...</span>
                      </div>
                    ) : (
                      <div>
                        <Server size={32} style={{ margin: '0 auto 8px', opacity: 0.4 }} />
                        <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>No jobs found matching your criteria</div>
                        <div style={{ fontSize: 12, marginTop: 4 }}>Try clearing search or filters</div>
                      </div>
                    )}
                  </td>
                </tr>
              ) : (
                jobs.map((job) => {
                  const isCompleted = job.status === 'COMPLETED';
                  const isRunning = job.status === 'RUNNING';
                  const isQueued = job.status === 'QUEUED';
                  const isFailed = job.status === 'FAILED';
                  const isCancelled = job.status === 'CANCELLED';

                  return (
                    <tr
                      key={job.id}
                      style={{
                        borderBottom: '1px solid var(--border-subtle)',
                        transition: 'background 0.15s ease',
                      }}
                      className="table-row-hover"
                    >
                      {/* 1. Job ID */}
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <code style={{ fontSize: 12, fontWeight: 600, color: '#fff' }}>
                            {job.id.slice(0, 10)}...
                          </code>
                          <button
                            onClick={() => copyToClipboard(job.id, job.id)}
                            style={{ background: 'none', border: 'none', color: copiedId === job.id ? 'var(--success)' : 'var(--text-muted)', cursor: 'pointer', padding: 2 }}
                            title="Copy full Job ID"
                          >
                            {copiedId === job.id ? <Check size={12} /> : <Copy size={12} />}
                          </button>
                        </div>
                      </td>

                      {/* 2. Type */}
                      <td style={{ padding: '12px 16px' }}>
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            padding: '2px 8px',
                            borderRadius: 6,
                            background: job.type.includes('render') ? 'rgba(56, 189, 248, 0.12)' : (job.type.includes('ai') ? 'rgba(168, 85, 247, 0.12)' : 'rgba(255, 255, 255, 0.05)'),
                            color: job.type.includes('render') ? '#38bdf8' : (job.type.includes('ai') ? '#c084fc' : '#cbd5e1'),
                          }}
                        >
                          {job.type}
                        </span>
                      </td>

                      {/* 3. Owner */}
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#fff' }}>
                          {job.ownerName || 'User'}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          {job.ownerEmail || job.ownerId.slice(0, 10)}
                        </div>
                      </td>

                      {/* 4. Project */}
                      <td style={{ padding: '12px 16px' }}>
                        {job.projectTitle ? (
                          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                            {job.projectTitle}
                          </div>
                        ) : job.projectId ? (
                          <code style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            {job.projectId.slice(0, 10)}...
                          </code>
                        ) : (
                          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>—</span>
                        )}
                      </td>

                      {/* 5. Status */}
                      <td style={{ padding: '12px 16px' }}>
                        {renderStatusBadge(job.status)}
                      </td>

                      {/* 6. Progress */}
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ width: 110 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
                            <span style={{ fontWeight: 600, color: '#fff' }}>{job.progress}%</span>
                          </div>
                          <div style={{ height: 5, background: 'rgba(255, 255, 255, 0.08)', borderRadius: 3, overflow: 'hidden' }}>
                            <div
                              style={{
                                height: '100%',
                                width: `${Math.min(100, Math.max(0, job.progress))}%`,
                                background:
                                  job.status === 'FAILED'
                                    ? 'var(--danger)'
                                    : job.status === 'COMPLETED'
                                    ? 'var(--success)'
                                    : job.status === 'CANCELLED'
                                    ? 'var(--warning)'
                                    : 'linear-gradient(90deg, #6366f1, #38bdf8)',
                                transition: 'width 0.3s ease',
                              }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* 7. Worker */}
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Cpu size={12} style={{ color: 'var(--text-muted)' }} />
                          <code style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                            {job.worker}
                          </code>
                        </div>
                      </td>

                      {/* 8. Created */}
                      <td style={{ padding: '12px 16px', fontSize: 11, color: 'var(--text-muted)' }}>
                        {new Date(job.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </td>

                      {/* 9. Started */}
                      <td style={{ padding: '12px 16px', fontSize: 11, color: 'var(--text-muted)' }}>
                        {job.startedAt ? new Date(job.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'}
                      </td>

                      {/* 10. Completed */}
                      <td style={{ padding: '12px 16px', fontSize: 11, color: 'var(--text-muted)' }}>
                        {job.completedAt ? new Date(job.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'}
                      </td>

                      {/* 11. Duration */}
                      <td style={{ padding: '12px 16px', fontSize: 12, fontWeight: 600, color: job.durationSeconds ? '#fff' : 'var(--text-muted)' }}>
                        {job.durationSeconds !== undefined ? `${job.durationSeconds}s` : '—'}
                      </td>

                      {/* 12. Retries */}
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            padding: '1px 6px',
                            borderRadius: 10,
                            background: job.retryCount > 0 ? 'rgba(245, 158, 11, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                            color: job.retryCount > 0 ? '#fbbf24' : 'var(--text-muted)',
                          }}
                        >
                          {job.retryCount}
                        </span>
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                          {/* Inspect */}
                          <button
                            onClick={() => handleInspect(job.id)}
                            className="btn btn-secondary btn-sm"
                            style={{ padding: '4px 8px', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}
                            title="Deep Job Inspection"
                          >
                            <Eye size={12} />
                            <span>Inspect</span>
                          </button>

                          {/* Cancel (Only for QUEUED or RUNNING) */}
                          <button
                            disabled={isCompleted || isCancelled}
                            onClick={() => {
                              setActionJob(job);
                              setCancelModalOpen(true);
                            }}
                            className="btn btn-danger btn-sm"
                            style={{
                              padding: '4px 8px',
                              fontSize: 11,
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4,
                              opacity: (isCompleted || isCancelled) ? 0.35 : 1,
                              cursor: (isCompleted || isCancelled) ? 'not-allowed' : 'pointer',
                            }}
                            title={isCompleted ? 'Cannot cancel a completed job' : 'Cancel active job'}
                          >
                            <XCircle size={12} />
                            <span>Cancel</span>
                          </button>

                          {/* Retry (Only for FAILED or CANCELLED) */}
                          <button
                            disabled={isCompleted || isRunning}
                            onClick={() => {
                              setActionJob(job);
                              setRetryModalOpen(true);
                            }}
                            className="btn btn-secondary btn-sm"
                            style={{
                              padding: '4px 8px',
                              fontSize: 11,
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4,
                              color: (!isCompleted && !isRunning) ? '#34d399' : undefined,
                              borderColor: (!isCompleted && !isRunning) ? 'rgba(16, 185, 129, 0.4)' : undefined,
                              opacity: (isCompleted || isRunning) ? 0.35 : 1,
                              cursor: (isCompleted || isRunning) ? 'not-allowed' : 'pointer',
                            }}
                            title={isCompleted ? 'Cannot retry a completed job' : (isRunning ? 'Job is currently running' : 'Retry failed/cancelled job')}
                          >
                            <RotateCcw size={12} />
                            <span>Retry</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Server-Side Pagination Bar */}
        <div
          style={{
            padding: '14px 20px',
            borderTop: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
            background: 'rgba(0, 0, 0, 0.1)',
          }}
        >
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            Showing {jobs.length > 0 ? (page - 1) * pageSize + 1 : 0} to{' '}
            {Math.min(page * pageSize, total)} of <strong>{total}</strong> background jobs
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Page Size:</span>
              <select
                className="input"
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                style={{ padding: '4px 8px', fontSize: 12 }}
              >
                <option value={10}>10</option>
                <option value={15}>15</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="btn btn-secondary btn-sm"
                style={{ padding: '4px 8px' }}
              >
                <ChevronLeft size={14} />
              </button>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                Page <strong>{page}</strong> of <strong>{totalPages || 1}</strong>
              </span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="btn btn-secondary btn-sm"
                style={{ padding: '4px 8px' }}
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Deep Inspection Drawer */}
      {inspectorOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            right: 0,
            bottom: 0,
            width: '100%',
            maxWidth: 680,
            backgroundColor: '#0f1422',
            borderLeft: '1px solid var(--border-subtle)',
            boxShadow: '-10px 0 30px rgba(0, 0, 0, 0.6)',
            zIndex: 100,
            display: 'flex',
            flexDirection: 'column',
            animation: 'slideLeft 0.25s ease',
          }}
        >
          {/* Drawer Header */}
          <div
            style={{
              padding: '20px 24px',
              borderBottom: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'rgba(255, 255, 255, 0.01)',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>
                  Job Telemetry Inspector
                </span>
                {jobDetails && renderStatusBadge(jobDetails.job.status)}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                <code style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  ID: {jobDetails?.job.id || selectedJobId}
                </code>
                {selectedJobId && (
                  <button
                    onClick={() => copyToClipboard(selectedJobId, 'drawer-id')}
                    style={{ background: 'none', border: 'none', color: copiedId === 'drawer-id' ? 'var(--success)' : 'var(--text-muted)', cursor: 'pointer' }}
                  >
                    {copiedId === 'drawer-id' ? <Check size={12} /> : <Copy size={12} />}
                  </button>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {/* Quick Actions in Drawer */}
              {jobDetails && (
                <>
                  <button
                    disabled={jobDetails.job.status === 'COMPLETED' || jobDetails.job.status === 'CANCELLED'}
                    onClick={() => {
                      setActionJob(jobDetails.job);
                      setCancelModalOpen(true);
                    }}
                    className="btn btn-danger btn-sm"
                    style={{
                      padding: '4px 8px',
                      fontSize: 11,
                      opacity: (jobDetails.job.status === 'COMPLETED' || jobDetails.job.status === 'CANCELLED') ? 0.35 : 1,
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    disabled={jobDetails.job.status === 'COMPLETED' || jobDetails.job.status === 'RUNNING'}
                    onClick={() => {
                      setActionJob(jobDetails.job);
                      setRetryModalOpen(true);
                    }}
                    className="btn btn-secondary btn-sm"
                    style={{
                      padding: '4px 8px',
                      fontSize: 11,
                      opacity: (jobDetails.job.status === 'COMPLETED' || jobDetails.job.status === 'RUNNING') ? 0.35 : 1,
                    }}
                  >
                    Retry
                  </button>
                </>
              )}
              <button
                onClick={() => setInspectorOpen(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Drawer Navigation Tabs */}
          <div
            style={{
              display: 'flex',
              padding: '0 24px',
              borderBottom: '1px solid var(--border-subtle)',
              background: 'rgba(0, 0, 0, 0.2)',
            }}
          >
            <button
              onClick={() => setActiveTab('overview')}
              style={{
                padding: '12px 16px',
                fontSize: 13,
                fontWeight: activeTab === 'overview' ? 700 : 500,
                color: activeTab === 'overview' ? '#fff' : 'var(--text-secondary)',
                borderBottom: `2px solid ${activeTab === 'overview' ? 'var(--primary)' : 'transparent'}`,
                background: 'none',
                borderTop: 'none',
                borderLeft: 'none',
                borderRight: 'none',
                cursor: 'pointer',
              }}
            >
              Overview & Node
            </button>
            <button
              onClick={() => setActiveTab('steps')}
              style={{
                padding: '12px 16px',
                fontSize: 13,
                fontWeight: activeTab === 'steps' ? 700 : 500,
                color: activeTab === 'steps' ? '#fff' : 'var(--text-secondary)',
                borderBottom: `2px solid ${activeTab === 'steps' ? 'var(--primary)' : 'transparent'}`,
                background: 'none',
                borderTop: 'none',
                borderLeft: 'none',
                borderRight: 'none',
                cursor: 'pointer',
              }}
            >
              Pipeline Steps
            </button>
            <button
              onClick={() => setActiveTab('logs')}
              style={{
                padding: '12px 16px',
                fontSize: 13,
                fontWeight: activeTab === 'logs' ? 700 : 500,
                color: activeTab === 'logs' ? '#fff' : 'var(--text-secondary)',
                borderBottom: `2px solid ${activeTab === 'logs' ? 'var(--primary)' : 'transparent'}`,
                background: 'none',
                borderTop: 'none',
                borderLeft: 'none',
                borderRight: 'none',
                cursor: 'pointer',
              }}
            >
              Execution Logs ({jobDetails?.logs.length ?? 0})
            </button>
            {jobDetails?.errorDetails && (
              <button
                onClick={() => setActiveTab('error')}
                style={{
                  padding: '12px 16px',
                  fontSize: 13,
                  fontWeight: activeTab === 'error' ? 700 : 500,
                  color: activeTab === 'error' ? '#f87171' : 'var(--danger)',
                  borderBottom: `2px solid ${activeTab === 'error' ? 'var(--danger)' : 'transparent'}`,
                  background: 'none',
                  borderTop: 'none',
                  borderLeft: 'none',
                  borderRight: 'none',
                  cursor: 'pointer',
                }}
              >
                Error Details
              </button>
            )}
            <button
              onClick={() => setActiveTab('audit')}
              style={{
                padding: '12px 16px',
                fontSize: 13,
                fontWeight: activeTab === 'audit' ? 700 : 500,
                color: activeTab === 'audit' ? '#fff' : 'var(--text-secondary)',
                borderBottom: `2px solid ${activeTab === 'audit' ? 'var(--primary)' : 'transparent'}`,
                background: 'none',
                borderTop: 'none',
                borderLeft: 'none',
                borderRight: 'none',
                cursor: 'pointer',
              }}
            >
              Audit Activity
            </button>
          </div>

          {/* Drawer Body Content */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
            {inspectorLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12 }}>
                <div className="loading-spinner" />
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Loading telemetry trace...</span>
              </div>
            ) : !jobDetails ? (
              <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>
                Job information unavailable.
              </div>
            ) : (
              <div>
                {/* TAB 1: OVERVIEW */}
                {activeTab === 'overview' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    {/* Progress Banner */}
                    <div className="card" style={{ padding: 18, background: 'rgba(255, 255, 255, 0.02)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>Overall Progress</span>
                        <span style={{ fontSize: 14, fontWeight: 800, color: '#38bdf8' }}>{jobDetails.job.progress}%</span>
                      </div>
                      <div style={{ height: 8, background: 'rgba(255, 255, 255, 0.08)', borderRadius: 4, overflow: 'hidden' }}>
                        <div
                          style={{
                            height: '100%',
                            width: `${Math.min(100, Math.max(0, jobDetails.job.progress))}%`,
                            background: 'linear-gradient(90deg, #6366f1, #38bdf8)',
                          }}
                        />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
                        <span>Duration: {jobDetails.job.durationSeconds ?? 0}s</span>
                        <span>Retries Attempted: {jobDetails.job.retryCount}</span>
                      </div>
                    </div>

                    {/* Worker Node Specs */}
                    {jobDetails.workerNode && (
                      <div className="card" style={{ padding: 18 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Cpu size={16} color="var(--primary)" />
                          <span>Worker Node Architecture</span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 12 }}>
                          <div>
                            <span style={{ color: 'var(--text-muted)' }}>Node Identifier:</span>
                            <div style={{ fontWeight: 600, color: '#fff', marginTop: 2 }}>{jobDetails.workerNode.id}</div>
                          </div>
                          <div>
                            <span style={{ color: 'var(--text-muted)' }}>Internal IP:</span>
                            <div style={{ fontWeight: 600, color: '#fff', marginTop: 2 }}>{jobDetails.workerNode.ip || '10.244.12.18'}</div>
                          </div>
                          <div>
                            <span style={{ color: 'var(--text-muted)' }}>Thread Concurrency:</span>
                            <div style={{ fontWeight: 600, color: '#fff', marginTop: 2 }}>{jobDetails.workerNode.concurrency} threads</div>
                          </div>
                          <div>
                            <span style={{ color: 'var(--text-muted)' }}>Memory Allocated:</span>
                            <div style={{ fontWeight: 600, color: '#fff', marginTop: 2 }}>{jobDetails.workerNode.memoryUsageMb} MB</div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Metadata Specs */}
                    <div className="card" style={{ padding: 18 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <FileText size={16} color="var(--info)" />
                        <span>Execution Parameters & Ownership</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 12 }}>
                        <div>
                          <span style={{ color: 'var(--text-muted)' }}>Task Type:</span>
                          <div style={{ fontWeight: 600, color: '#fff', marginTop: 2 }}>{jobDetails.job.type}</div>
                        </div>
                        <div>
                          <span style={{ color: 'var(--text-muted)' }}>Owner:</span>
                          <div style={{ fontWeight: 600, color: '#fff', marginTop: 2 }}>{jobDetails.job.ownerName} ({jobDetails.job.ownerEmail})</div>
                        </div>
                        <div>
                          <span style={{ color: 'var(--text-muted)' }}>Project:</span>
                          <div style={{ fontWeight: 600, color: '#fff', marginTop: 2 }}>{jobDetails.job.projectTitle || jobDetails.job.projectId || 'Global Pipeline'}</div>
                        </div>
                        <div>
                          <span style={{ color: 'var(--text-muted)' }}>Created Timestamp:</span>
                          <div style={{ fontWeight: 600, color: '#fff', marginTop: 2 }}>{new Date(jobDetails.job.createdAt).toLocaleString()}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 2: PIPELINE STEPS */}
                {activeTab === 'steps' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {jobDetails.steps?.map((step, idx) => (
                      <div
                        key={idx}
                        className="card"
                        style={{
                          padding: 14,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          borderLeft: `4px solid ${
                            step.status === 'completed'
                              ? 'var(--success)'
                              : step.status === 'running'
                              ? 'var(--primary)'
                              : step.status === 'failed'
                              ? 'var(--danger)'
                              : 'var(--border-light)'
                          }`,
                        }}
                      >
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>
                            Step {idx + 1}: {step.name}
                          </div>
                          {step.durationMs && (
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                              Took {step.durationMs}ms
                            </div>
                          )}
                        </div>
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            padding: '2px 8px',
                            borderRadius: 6,
                            background:
                              step.status === 'completed'
                                ? 'rgba(16, 185, 129, 0.15)'
                                : step.status === 'running'
                                ? 'rgba(99, 102, 241, 0.15)'
                                : step.status === 'failed'
                                ? 'rgba(239, 68, 68, 0.15)'
                                : 'rgba(255, 255, 255, 0.05)',
                            color:
                              step.status === 'completed'
                                ? '#34d399'
                                : step.status === 'running'
                                ? '#818cf8'
                                : step.status === 'failed'
                                ? '#f87171'
                                : 'var(--text-muted)',
                          }}
                        >
                          {step.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* TAB 3: LOGS */}
                {activeTab === 'logs' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {(['all', 'info', 'warn', 'error'] as const).map((lvl) => (
                          <button
                            key={lvl}
                            onClick={() => setLogLevelFilter(lvl)}
                            className="btn btn-secondary btn-sm"
                            style={{
                              padding: '2px 8px',
                              fontSize: 10,
                              textTransform: 'uppercase',
                              fontWeight: 700,
                              background: logLevelFilter === lvl ? 'var(--primary)' : undefined,
                              color: logLevelFilter === lvl ? '#fff' : undefined,
                            }}
                          >
                            {lvl}
                          </button>
                        ))}
                      </div>
                      <button
                        onClick={() => copyToClipboard(JSON.stringify(jobDetails.logs, null, 2), 'logs-copy')}
                        className="btn btn-secondary btn-sm"
                        style={{ fontSize: 11, padding: '3px 8px', display: 'flex', alignItems: 'center', gap: 4 }}
                      >
                        {copiedId === 'logs-copy' ? <Check size={12} /> : <Copy size={12} />}
                        <span>Copy Raw Logs</span>
                      </button>
                    </div>

                    <div
                      style={{
                        backgroundColor: '#0a0d14',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-md)',
                        padding: 14,
                        fontFamily: 'JetBrains Mono, monospace',
                        fontSize: 11.5,
                        lineHeight: 1.6,
                        maxHeight: 480,
                        overflowY: 'auto',
                      }}
                    >
                      {jobDetails.logs
                        .filter((l) => logLevelFilter === 'all' || l.level === logLevelFilter)
                        .map((log, i) => (
                          <div
                            key={i}
                            style={{
                              padding: '3px 0',
                              borderBottom: '1px solid rgba(255, 255, 255, 0.03)',
                              display: 'flex',
                              gap: 8,
                            }}
                          >
                            <span style={{ color: 'var(--text-muted)' }}>
                              {new Date(log.timestamp).toLocaleTimeString()}
                            </span>
                            <span
                              style={{
                                color:
                                  log.level === 'error'
                                    ? '#f87171'
                                    : log.level === 'warn'
                                    ? '#fbbf24'
                                    : '#38bdf8',
                                fontWeight: 700,
                              }}
                            >
                              [{log.level.toUpperCase()}]
                            </span>
                            {log.step && (
                              <span style={{ color: '#a855f7', fontWeight: 600 }}>
                                [{log.step}]
                              </span>
                            )}
                            <span style={{ color: '#e2e8f0' }}>{log.message}</span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {/* TAB 4: ERROR */}
                {activeTab === 'error' && jobDetails.errorDetails && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div
                      style={{
                        padding: 16,
                        borderRadius: 'var(--radius-md)',
                        background: 'rgba(239, 68, 68, 0.12)',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#f87171', fontWeight: 700, fontSize: 13 }}>
                        <AlertTriangle size={16} />
                        <span>Execution Exception</span>
                      </div>
                      <div style={{ marginTop: 8, fontSize: 13, color: '#fff', fontWeight: 600 }}>
                        {jobDetails.errorDetails.message}
                      </div>
                      {jobDetails.errorDetails.occurredAt && (
                        <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-muted)' }}>
                          Occurred At: {new Date(jobDetails.errorDetails.occurredAt).toLocaleString()}
                        </div>
                      )}
                    </div>

                    {jobDetails.errorDetails.stackTrace && (
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>
                          STACK TRACE
                        </div>
                        <pre
                          style={{
                            padding: 14,
                            borderRadius: 'var(--radius-md)',
                            background: '#0a0d14',
                            border: '1px solid var(--border-subtle)',
                            color: '#f87171',
                            fontSize: 11,
                            lineHeight: 1.5,
                            overflowX: 'auto',
                          }}
                        >
                          {jobDetails.errorDetails.stackTrace}
                        </pre>
                      </div>
                    )}
                  </div>
                )}

                {/* TAB 5: AUDIT ACTIVITY */}
                {activeTab === 'audit' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {jobDetails.auditActivity.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)', fontSize: 12 }}>
                        No administrative intervention audit records recorded for this job.
                      </div>
                    ) : (
                      jobDetails.auditActivity.map((log) => (
                        <div
                          key={log.id}
                          className="card"
                          style={{ padding: 14, fontSize: 12, borderLeft: '3px solid var(--primary)' }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                            <span style={{ fontWeight: 700, color: '#fff' }}>{log.action}</span>
                            <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                              {new Date(log.timestamp).toLocaleString()}
                            </span>
                          </div>
                          <div style={{ color: 'var(--text-secondary)' }}>
                            Actor: <code>{log.actorId}</code>
                          </div>
                          {log.details && (
                            <pre
                              style={{
                                marginTop: 8,
                                padding: 8,
                                borderRadius: 4,
                                background: '#0a0d14',
                                fontSize: 11,
                                color: 'var(--text-muted)',
                              }}
                            >
                              {JSON.stringify(log.details, null, 2)}
                            </pre>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Confirmation Modal: Cancel Job */}
      <Modal
        isOpen={cancelModalOpen}
        onClose={() => setCancelModalOpen(false)}
        title="Confirm Job Cancellation"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--warning)' }}>
            <AlertTriangle size={24} />
            <span style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>
              Are you sure you want to cancel this job?
            </span>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            This will immediately terminate active processing on worker node{' '}
            <code>{actionJob?.worker}</code> and record an immutable administrative audit log.
          </p>
          <div style={{ padding: 12, background: 'rgba(0, 0, 0, 0.2)', borderRadius: 6, fontSize: 12 }}>
            <div>Job ID: <code>{actionJob?.id}</code></div>
            <div>Type: <strong>{actionJob?.type}</strong></div>
            <div>Current Status: <strong>{actionJob?.status}</strong></div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
            <button className="btn btn-secondary" onClick={() => setCancelModalOpen(false)}>
              Back
            </button>
            <button
              className="btn btn-danger"
              disabled={isSubmitting}
              onClick={handleConfirmCancel}
            >
              {isSubmitting ? 'Cancelling...' : 'Confirm Cancellation'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Confirmation Modal: Retry Job */}
      <Modal
        isOpen={retryModalOpen}
        onClose={() => setRetryModalOpen(false)}
        title="Confirm Job Retry"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--success)' }}>
            <RotateCcw size={24} />
            <span style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>
              Queue failed job for immediate retry?
            </span>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            The job will reset its progress to 0%, increment the retry counter, and be re-scheduled on the distributed queue worker pool.
          </p>
          <div style={{ padding: 12, background: 'rgba(0, 0, 0, 0.2)', borderRadius: 6, fontSize: 12 }}>
            <div>Job ID: <code>{actionJob?.id}</code></div>
            <div>Type: <strong>{actionJob?.type}</strong></div>
            <div>Previous Status: <strong>{actionJob?.status}</strong></div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
            <button className="btn btn-secondary" onClick={() => setRetryModalOpen(false)}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              disabled={isSubmitting}
              onClick={handleConfirmRetry}
            >
              {isSubmitting ? 'Scheduling Retry...' : 'Confirm Retry'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
