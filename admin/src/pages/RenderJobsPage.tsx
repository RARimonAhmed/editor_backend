import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../api/client';
import {
  AdminJobView,
  AdminRenderJobDetailView,
  AdminJobStatus,
} from '../types/admin';
import { useRealtimeJobs } from '../hooks/useRealtimeJobs';
import {
  Video,
  Search,
  RefreshCw,
  Eye,
  RotateCcw,
  XCircle,
  Download,
  Copy,
  Check,
  Clock,
  Cpu,
  Layers,
  Film,
  HardDrive,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  X,
  Radio,
  Sliders,
  ExternalLink,
} from 'lucide-react';
import { Modal } from '../components/Modal';

export const RenderJobsPage: React.FC = () => {
  // Query Filters State
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  // Inspector State
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [renderJobDetails, setRenderJobDetails] = useState<AdminRenderJobDetailView | null>(null);
  const [inspectorLoading, setInspectorLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'canvas' | 'encoder' | 'output' | 'audit'>('canvas');

  // Confirmation Modals State
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [retryModalOpen, setRetryModalOpen] = useState(false);
  const [actionJob, setActionJob] = useState<AdminJobView | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(timer);
  }, [search]);

  // Realtime hook for Render channel
  const {
    jobs,
    total,
    totalPages,
    isLoading,
    isConnected,
    connectionType,
    lastEventTimestamp,
    refresh,
    updateParams,
  } = useRealtimeJobs({
    channel: 'admin:render',
    fetchFn: (p) => api.getRenderJobs(p),
    initialParams: { page: 1, pageSize: 15 },
  });

  useEffect(() => {
    updateParams({
      search: debouncedSearch.trim() || undefined,
      status: statusFilter !== 'all' ? statusFilter : undefined,
      page,
      pageSize,
    });
  }, [debouncedSearch, statusFilter, page, pageSize, updateParams]);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleInspect = async (jobId: string) => {
    setSelectedJobId(jobId);
    setInspectorOpen(true);
    setInspectorLoading(true);
    try {
      const details = await api.getRenderJobDetails(jobId);
      setRenderJobDetails(details);
      setActiveTab('canvas');
    } catch (err: any) {
      setToastMessage({ type: 'error', text: err.message || 'Failed to fetch render details' });
    } finally {
      setInspectorLoading(false);
    }
  };

  const handleConfirmCancel = async () => {
    if (!actionJob) return;
    setIsSubmitting(true);
    try {
      const updated = await api.cancelJob(actionJob.id);
      setToastMessage({ type: 'success', text: `Render job ${updated.id.slice(0, 10)} cancelled.` });
      setCancelModalOpen(false);
      setActionJob(null);
      if (selectedJobId === updated.id) handleInspect(updated.id);
      refresh();
    } catch (err: any) {
      setToastMessage({ type: 'error', text: err.message || 'Cancellation failed' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmRetry = async () => {
    if (!actionJob) return;
    setIsSubmitting(true);
    try {
      const updated = await api.retryJob(actionJob.id);
      setToastMessage({ type: 'success', text: `Render job ${updated.id.slice(0, 10)} queued for retry.` });
      setRetryModalOpen(false);
      setActionJob(null);
      if (selectedJobId === updated.id) handleInspect(updated.id);
      refresh();
    } catch (err: any) {
      setToastMessage({ type: 'error', text: err.message || 'Retry failed' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderStats = useMemo(() => {
    let active = 0;
    let completed = 0;
    let failed = 0;
    let totalSec = 0;
    let completedCount = 0;

    for (const j of jobs) {
      if (j.status === 'RUNNING') active++;
      if (j.status === 'COMPLETED') {
        completed++;
        if (j.durationSeconds) {
          totalSec += j.durationSeconds;
          completedCount++;
        }
      }
      if (j.status === 'FAILED') failed++;
    }

    const avgDuration = completedCount > 0 ? Math.round((totalSec / completedCount) * 10) / 10 : 0;

    return {
      total: total,
      active,
      completed,
      failed,
      avgDuration,
    };
  }, [jobs, total]);

  const renderStatusBadge = (status: AdminJobStatus) => {
    let bg = 'rgba(100, 116, 139, 0.2)';
    let color = '#94a3b8';
    let dot = '#94a3b8';

    switch (status) {
      case 'RUNNING':
        bg = 'rgba(56, 189, 248, 0.15)';
        color = '#38bdf8';
        dot = '#38bdf8';
        break;
      case 'COMPLETED':
        bg = 'rgba(16, 185, 129, 0.15)';
        color = '#34d399';
        dot = '#10b981';
        break;
      case 'FAILED':
        bg = 'rgba(239, 68, 68, 0.15)';
        color = '#f87171';
        dot = '#ef4444';
        break;
      case 'CANCELLED':
        bg = 'rgba(245, 158, 11, 0.15)';
        color = '#fbbf24';
        dot = '#f59e0b';
        break;
      default:
        bg = 'rgba(148, 163, 184, 0.15)';
        color = '#cbd5e1';
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
          backgroundColor: bg,
          color,
          border: '1px solid rgba(255, 255, 255, 0.08)',
        }}
      >
        <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: dot }} />
        {status}
      </span>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, paddingBottom: 60 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em', color: '#fff' }}>
              Cloud Render & Export Monitoring
            </h1>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '3px 10px',
                borderRadius: 20,
                fontSize: 11,
                fontWeight: 600,
                background: isConnected ? 'rgba(56, 189, 248, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                color: isConnected ? '#38bdf8' : '#f87171',
                border: `1px solid ${isConnected ? 'rgba(56, 189, 248, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
              }}
            >
              <Radio size={12} className={isConnected ? 'animate-pulse' : ''} />
              <span>
                {isConnected
                  ? `Render Live Stream (${connectionType === 'websocket' ? 'WebSocket' : 'SSE'})`
                  : 'Reconnecting Stream...'}
              </span>
            </div>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>
            Real-time multi-track GPU composition, timeline frame rasterization, hardware encoding, and cloud storage deliveries.
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
          <button onClick={() => setToastMessage(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* Render Metrics Ribbon */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
        <div className="card" style={{ padding: 18, borderLeft: '4px solid #38bdf8' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            Active Renders
          </div>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#38bdf8', marginTop: 6 }}>
            {renderStats.active}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
            GPU nodes currently rasterizing
          </div>
        </div>

        <div className="card" style={{ padding: 18, borderLeft: '4px solid #10b981' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            Completed Exports
          </div>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#34d399', marginTop: 6 }}>
            {renderStats.completed}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
            Delivered to cloud storage
          </div>
        </div>

        <div className="card" style={{ padding: 18, borderLeft: '4px solid #ef4444' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            Failed Renders
          </div>
          <div style={{ fontSize: 26, fontWeight: 800, color: renderStats.failed > 0 ? '#f87171' : '#fff', marginTop: 6 }}>
            {renderStats.failed}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
            Codec or GPU memory errors
          </div>
        </div>

        <div className="card" style={{ padding: 18, borderLeft: '4px solid #6366f1' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            Avg Export Latency
          </div>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#fff', marginTop: 6 }}>
            {renderStats.avgDuration}s
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
            Hardware encoder turnaround
          </div>
        </div>
      </div>

      {/* Filter toolbar */}
      <div className="card" style={{ padding: 16 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
          <div style={{ position: 'relative', minWidth: 260, flex: '1 1 260px' }}>
            <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              className="input"
              placeholder="Search project title, resolution, codec, GPU node..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ paddingLeft: 36, width: '100%' }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Status:</span>
            <select
              className="input"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ minWidth: 130, padding: '6px 10px', fontSize: 13 }}
            >
              <option value="all">All Statuses</option>
              <option value="RUNNING">RUNNING</option>
              <option value="COMPLETED">COMPLETED</option>
              <option value="FAILED">FAILED</option>
              <option value="QUEUED">QUEUED</option>
              <option value="CANCELLED">CANCELLED</option>
            </select>
          </div>
        </div>
      </div>

      {/* Render Jobs Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="table" style={{ width: '100%', minWidth: 1150, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'rgba(255, 255, 255, 0.02)', borderBottom: '1px solid var(--border-subtle)' }}>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>PROJECT</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>CANVAS & CODEC</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>GPU NODE</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>STATUS</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>PROGRESS</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>DURATION</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>OUTPUT</th>
                <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {jobs.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: '48px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <Video size={32} style={{ margin: '0 auto 8px', opacity: 0.4 }} />
                    <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>No render jobs recorded</div>
                  </td>
                </tr>
              ) : (
                jobs.map((job) => {
                  const resolution = job.payload?.resolution || '1920x1080';
                  const codec = job.payload?.codec || 'H.264';
                  const fps = job.payload?.fps || 30;

                  return (
                    <tr key={job.id} style={{ borderBottom: '1px solid var(--border-subtle)' }} className="table-row-hover">
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div
                            style={{
                              width: 32,
                              height: 32,
                              borderRadius: 8,
                              background: 'rgba(56, 189, 248, 0.15)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: '#38bdf8',
                            }}
                          >
                            <Video size={16} />
                          </div>
                          <div>
                            <div style={{ fontWeight: 600, color: '#fff', fontSize: 13 }}>
                              {job.projectTitle || 'Untitled Project'}
                            </div>
                            <code style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                              ID: {job.id.slice(0, 10)}...
                            </code>
                          </div>
                        </div>
                      </td>

                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              padding: '2px 6px',
                              borderRadius: 4,
                              background: 'rgba(255, 255, 255, 0.08)',
                              color: '#38bdf8',
                            }}
                          >
                            {resolution}
                          </span>
                          <span style={{ fontSize: 11, color: '#fff', fontWeight: 600 }}>{fps} fps</span>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                          {codec.toUpperCase()}
                        </div>
                      </td>

                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Cpu size={12} color="var(--text-muted)" />
                          <code style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{job.worker}</code>
                        </div>
                      </td>

                      <td style={{ padding: '12px 16px' }}>
                        {renderStatusBadge(job.status)}
                      </td>

                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ width: 110 }}>
                          <div style={{ fontSize: 11, fontWeight: 600, color: '#fff', marginBottom: 2 }}>
                            {job.progress}%
                          </div>
                          <div style={{ height: 4, background: 'rgba(255, 255, 255, 0.08)', borderRadius: 2, overflow: 'hidden' }}>
                            <div
                              style={{
                                height: '100%',
                                width: `${job.progress}%`,
                                background: job.status === 'FAILED' ? 'var(--danger)' : 'linear-gradient(90deg, #38bdf8, #6366f1)',
                              }}
                            />
                          </div>
                        </div>
                      </td>

                      <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-secondary)' }}>
                        {job.durationSeconds ? `${job.durationSeconds}s` : '—'}
                      </td>

                      <td style={{ padding: '12px 16px' }}>
                        {job.result?.downloadUrl ? (
                          <a
                            href={job.result.downloadUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="btn btn-secondary btn-sm"
                            style={{ padding: '3px 8px', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                          >
                            <Download size={11} />
                            <span>Export</span>
                          </a>
                        ) : (
                          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>—</span>
                        )}
                      </td>

                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                          <button
                            onClick={() => handleInspect(job.id)}
                            className="btn btn-secondary btn-sm"
                            style={{ padding: '4px 8px', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}
                          >
                            <Eye size={12} />
                            <span>Inspect</span>
                          </button>

                          <button
                            disabled={job.status === 'COMPLETED' || job.status === 'CANCELLED'}
                            onClick={() => {
                              setActionJob(job);
                              setCancelModalOpen(true);
                            }}
                            className="btn btn-danger btn-sm"
                            style={{
                              padding: '4px 8px',
                              fontSize: 11,
                              opacity: (job.status === 'COMPLETED' || job.status === 'CANCELLED') ? 0.35 : 1,
                            }}
                          >
                            <XCircle size={12} />
                          </button>

                          <button
                            disabled={job.status === 'COMPLETED' || job.status === 'RUNNING'}
                            onClick={() => {
                              setActionJob(job);
                              setRetryModalOpen(true);
                            }}
                            className="btn btn-secondary btn-sm"
                            style={{
                              padding: '4px 8px',
                              fontSize: 11,
                              color: (job.status !== 'COMPLETED' && job.status !== 'RUNNING') ? '#34d399' : undefined,
                              opacity: (job.status === 'COMPLETED' || job.status === 'RUNNING') ? 0.35 : 1,
                            }}
                          >
                            <RotateCcw size={12} />
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

        {/* Pagination */}
        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: 'var(--text-secondary)' }}>
          <div>Showing {jobs.length} of {total} render jobs</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="btn btn-secondary btn-sm">
              <ChevronLeft size={14} />
            </button>
            <span style={{ alignSelf: 'center' }}>Page {page} of {totalPages || 1}</span>
            <button disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className="btn btn-secondary btn-sm">
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Deep Render Inspector Drawer */}
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
          }}
        >
          {/* Header */}
          <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>
                  Cloud Render Pipeline Inspector
                </span>
                {renderJobDetails && renderStatusBadge(renderJobDetails.job.status)}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                <code style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  ID: {renderJobDetails?.id || selectedJobId}
                </code>
              </div>
            </div>
            <button onClick={() => setInspectorOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
              <X size={18} />
            </button>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', padding: '0 24px', borderBottom: '1px solid var(--border-subtle)', background: 'rgba(0, 0, 0, 0.2)' }}>
            <button
              onClick={() => setActiveTab('canvas')}
              style={{
                padding: '12px 16px',
                fontSize: 13,
                fontWeight: activeTab === 'canvas' ? 700 : 500,
                color: activeTab === 'canvas' ? '#fff' : 'var(--text-secondary)',
                borderBottom: `2px solid ${activeTab === 'canvas' ? '#38bdf8' : 'transparent'}`,
                background: 'none',
                borderTop: 'none',
                borderLeft: 'none',
                borderRight: 'none',
                cursor: 'pointer',
              }}
            >
              Canvas & Frame Trace
            </button>
            <button
              onClick={() => setActiveTab('encoder')}
              style={{
                padding: '12px 16px',
                fontSize: 13,
                fontWeight: activeTab === 'encoder' ? 700 : 500,
                color: activeTab === 'encoder' ? '#fff' : 'var(--text-secondary)',
                borderBottom: `2px solid ${activeTab === 'encoder' ? '#38bdf8' : 'transparent'}`,
                background: 'none',
                borderTop: 'none',
                borderLeft: 'none',
                borderRight: 'none',
                cursor: 'pointer',
              }}
            >
              Hardware Encoder
            </button>
            <button
              onClick={() => setActiveTab('output')}
              style={{
                padding: '12px 16px',
                fontSize: 13,
                fontWeight: activeTab === 'output' ? 700 : 500,
                color: activeTab === 'output' ? '#fff' : 'var(--text-secondary)',
                borderBottom: `2px solid ${activeTab === 'output' ? '#38bdf8' : 'transparent'}`,
                background: 'none',
                borderTop: 'none',
                borderLeft: 'none',
                borderRight: 'none',
                cursor: 'pointer',
              }}
            >
              Cloud Storage Object
            </button>
          </div>

          {/* Body */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
            {inspectorLoading ? (
              <div style={{ textAlign: 'center', padding: 48 }}><div className="loading-spinner" /></div>
            ) : !renderJobDetails ? (
              <div style={{ color: 'var(--text-muted)' }}>Render trace unavailable</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {/* TAB 1: CANVAS */}
                {activeTab === 'canvas' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {/* Frame Progress Banner */}
                    <div className="card" style={{ padding: 18 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>Rasterization Progress</span>
                        <span style={{ fontSize: 14, fontWeight: 800, color: '#38bdf8' }}>{renderJobDetails.progress}%</span>
                      </div>
                      <div style={{ height: 8, background: 'rgba(255, 255, 255, 0.08)', borderRadius: 4, overflow: 'hidden' }}>
                        <div
                          style={{
                            height: '100%',
                            width: `${renderJobDetails.progress}%`,
                            background: 'linear-gradient(90deg, #38bdf8, #6366f1)',
                          }}
                        />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
                        <span>Frames Rendered: {renderJobDetails.framesRendered ?? 0} / {renderJobDetails.totalFrames ?? 0}</span>
                        <span>Duration: {renderJobDetails.durationSeconds}s</span>
                      </div>
                    </div>

                    {/* Canvas Specs */}
                    <div className="card" style={{ padding: 18 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Layers size={16} color="#38bdf8" />
                        <span>Canvas Dimension Specifications</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 12 }}>
                        <div><span style={{ color: 'var(--text-muted)' }}>Resolution:</span> <strong style={{ color: '#fff', display: 'block', marginTop: 2 }}>{renderJobDetails.canvas.resolutionWidth} x {renderJobDetails.canvas.resolutionHeight}</strong></div>
                        <div><span style={{ color: 'var(--text-muted)' }}>Aspect Ratio:</span> <strong style={{ color: '#fff', display: 'block', marginTop: 2 }}>{renderJobDetails.canvas.aspectRatio}</strong></div>
                        <div><span style={{ color: 'var(--text-muted)' }}>Framerate:</span> <strong style={{ color: '#fff', display: 'block', marginTop: 2 }}>{renderJobDetails.fps} FPS</strong></div>
                        <div><span style={{ color: 'var(--text-muted)' }}>Target Project:</span> <strong style={{ color: '#fff', display: 'block', marginTop: 2 }}>{renderJobDetails.projectTitle}</strong></div>
                      </div>
                    </div>

                    {/* GPU Node */}
                    <div className="card" style={{ padding: 18 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Cpu size={16} color="var(--primary)" />
                        <span>Worker Hardware Allocation</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 12 }}>
                        <div><span style={{ color: 'var(--text-muted)' }}>Node:</span> <strong style={{ color: '#fff', display: 'block', marginTop: 2 }}>{renderJobDetails.worker.node}</strong></div>
                        <div><span style={{ color: 'var(--text-muted)' }}>Subprocess PID:</span> <strong style={{ color: '#fff', display: 'block', marginTop: 2 }}>{renderJobDetails.worker.processId}</strong></div>
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 2: ENCODER */}
                {activeTab === 'encoder' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div className="card" style={{ padding: 18 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 12 }}>
                        Hardware Encoder Configuration
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 12 }}>
                        <div><span style={{ color: 'var(--text-muted)' }}>Video Codec:</span> <strong style={{ color: '#fff', display: 'block', marginTop: 2 }}>{renderJobDetails.codec}</strong></div>
                        <div><span style={{ color: 'var(--text-muted)' }}>Container Format:</span> <strong style={{ color: '#fff', display: 'block', marginTop: 2 }}>{renderJobDetails.exportSettings.format.toUpperCase()}</strong></div>
                        <div><span style={{ color: 'var(--text-muted)' }}>Video Target Bitrate:</span> <strong style={{ color: '#fff', display: 'block', marginTop: 2 }}>{renderJobDetails.exportSettings.videoBitrateKbps ?? 8000} kbps</strong></div>
                        <div><span style={{ color: 'var(--text-muted)' }}>Audio Codec & Bitrate:</span> <strong style={{ color: '#fff', display: 'block', marginTop: 2 }}>{renderJobDetails.exportSettings.audioCodec || 'AAC'} ({renderJobDetails.exportSettings.audioBitrateKbps || 256} kbps)</strong></div>
                        <div><span style={{ color: 'var(--text-muted)' }}>Encoding Preset:</span> <strong style={{ color: '#fff', display: 'block', marginTop: 2 }}>{renderJobDetails.exportSettings.preset || 'fast'}</strong></div>
                        <div><span style={{ color: 'var(--text-muted)' }}>Quality Mode:</span> <strong style={{ color: '#fff', display: 'block', marginTop: 2 }}>{renderJobDetails.exportSettings.quality}</strong></div>
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 3: OUTPUT */}
                {activeTab === 'output' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div className="card" style={{ padding: 18 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <HardDrive size={16} color="var(--success)" />
                        <span>Cloud Storage Distribution</span>
                      </div>
                      {renderJobDetails.outputObject ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 12 }}>
                          <div><span style={{ color: 'var(--text-muted)' }}>Target Bucket:</span> <code style={{ color: '#fff', display: 'block', marginTop: 2 }}>{renderJobDetails.outputObject.bucket}</code></div>
                          <div><span style={{ color: 'var(--text-muted)' }}>Object File Key:</span> <code style={{ color: '#fff', display: 'block', marginTop: 2 }}>{renderJobDetails.outputObject.fileKey}</code></div>
                          {renderJobDetails.outputObject.fileSizeBytes && (
                            <div><span style={{ color: 'var(--text-muted)' }}>Payload Size:</span> <strong style={{ color: '#fff', display: 'block', marginTop: 2 }}>{(renderJobDetails.outputObject.fileSizeBytes / (1024 * 1024)).toFixed(2)} MB</strong></div>
                          )}
                          {renderJobDetails.outputObject.downloadUrl && (
                            <div style={{ marginTop: 8 }}>
                              <a
                                href={renderJobDetails.outputObject.downloadUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="btn btn-primary btn-sm"
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                              >
                                <Download size={14} />
                                <span>Download Render Master File</span>
                              </a>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                          Output media will be registered upon hardware encoder finalization.
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Confirmation Modals */}
      <Modal isOpen={cancelModalOpen} onClose={() => setCancelModalOpen(false)} title="Cancel Render Export">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Are you sure you want to cancel render export <code>{actionJob?.id}</code>?
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button className="btn btn-secondary" onClick={() => setCancelModalOpen(false)}>Back</button>
            <button className="btn btn-danger" disabled={isSubmitting} onClick={handleConfirmCancel}>
              {isSubmitting ? 'Cancelling...' : 'Confirm'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={retryModalOpen} onClose={() => setRetryModalOpen(false)} title="Retry Render Export">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Restart GPU timeline rendering for <code>{actionJob?.id}</code> from frame 0?
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button className="btn btn-secondary" onClick={() => setRetryModalOpen(false)}>Cancel</button>
            <button className="btn btn-primary" disabled={isSubmitting} onClick={handleConfirmRetry}>
              {isSubmitting ? 'Scheduling...' : 'Retry'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
