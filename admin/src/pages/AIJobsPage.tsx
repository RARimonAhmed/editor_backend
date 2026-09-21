import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../api/client';
import {
  AdminJobView,
  AdminAIJobDetailView,
  AdminJobStatus,
} from '../types/admin';
import { useRealtimeJobs } from '../hooks/useRealtimeJobs';
import {
  Sparkles,
  Search,
  RefreshCw,
  Eye,
  RotateCcw,
  XCircle,
  Copy,
  Check,
  Clock,
  DollarSign,
  Cpu,
  Layers,
  FileText,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  X,
  Radio,
  Download,
  ExternalLink,
} from 'lucide-react';
import { Modal } from '../components/Modal';

export const AIJobsPage: React.FC = () => {
  // Query Filters State
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  // Inspector State
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [aiJobDetails, setAiJobDetails] = useState<AdminAIJobDetailView | null>(null);
  const [inspectorLoading, setInspectorLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'prompt' | 'output' | 'tokens' | 'retries' | 'audit'>('prompt');

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

  // Realtime hook for AI channel
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
    channel: 'admin:ai',
    fetchFn: (p) => api.getAIJobs(p),
    initialParams: { page: 1, pageSize: 15 },
  });

  useEffect(() => {
    updateParams({
      search: debouncedSearch.trim() || undefined,
      status: statusFilter !== 'all' ? statusFilter : undefined,
      type: typeFilter !== 'all' ? typeFilter : undefined,
      page,
      pageSize,
    });
  }, [debouncedSearch, statusFilter, typeFilter, page, pageSize, updateParams]);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Inspect AI details
  const handleInspect = async (jobId: string) => {
    setSelectedJobId(jobId);
    setInspectorOpen(true);
    setInspectorLoading(true);
    try {
      const details = await api.getAIJobDetails(jobId);
      setAiJobDetails(details);
      if (details.error) {
        setActiveTab('prompt');
      } else if (details.outputReference && Object.keys(details.outputReference).length > 0) {
        setActiveTab('output');
      } else {
        setActiveTab('prompt');
      }
    } catch (err: any) {
      setToastMessage({ type: 'error', text: err.message || 'Failed to fetch AI job details' });
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
      setToastMessage({ type: 'success', text: `AI Job ${updated.id.slice(0, 10)} cancelled.` });
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

  // Safe Retry Action
  const handleConfirmRetry = async () => {
    if (!actionJob) return;
    setIsSubmitting(true);
    try {
      const updated = await api.retryJob(actionJob.id);
      setToastMessage({ type: 'success', text: `AI Job ${updated.id.slice(0, 10)} queued for retry.` });
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

  // AI Telemetry aggregation
  const aiStats = useMemo(() => {
    const totalJobs = jobs.length;
    let activeInferences = 0;
    let failedInferences = 0;
    let totalTokens = 0;
    let totalEstimatedCostUsd = 0;

    for (const j of jobs) {
      if (j.status === 'RUNNING') activeInferences++;
      if (j.status === 'FAILED') failedInferences++;
      const estTokens = 600;
      totalTokens += estTokens;
      totalEstimatedCostUsd += estTokens * 0.00002;
    }

    const failureRate = totalJobs > 0 ? Math.round((failedInferences / totalJobs) * 100) : 0;

    return {
      totalJobs: total,
      activeInferences,
      failedInferences,
      failureRate,
      estimatedCostUsd: Math.round(totalEstimatedCostUsd * 100) / 100,
    };
  }, [jobs, total]);

  const renderStatusBadge = (status: AdminJobStatus) => {
    let bg = 'rgba(100, 116, 139, 0.2)';
    let color = '#94a3b8';
    let dot = '#94a3b8';

    switch (status) {
      case 'RUNNING':
        bg = 'rgba(99, 102, 241, 0.15)';
        color = '#818cf8';
        dot = '#6366f1';
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
              AI Job Intelligence Center
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
                background: isConnected ? 'rgba(168, 85, 247, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                color: isConnected ? '#c084fc' : '#f87171',
                border: `1px solid ${isConnected ? 'rgba(168, 85, 247, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
              }}
            >
              <Radio size={12} className={isConnected ? 'animate-pulse' : ''} />
              <span>
                {isConnected
                  ? `AI Live Stream (${connectionType === 'websocket' ? 'WebSocket' : 'SSE'})`
                  : 'Reconnecting Stream...'}
              </span>
            </div>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>
            Multi-modal neural inference monitoring, model routing, token usage telemetry, and output verification.
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

      {/* AI Telemetry Ribbon */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
        <div className="card" style={{ padding: 18, borderLeft: '4px solid #a855f7' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            Total Inferences
          </div>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#fff', marginTop: 6 }}>
            {aiStats.totalJobs}
          </div>
          <div style={{ fontSize: 11, color: '#c084fc', marginTop: 4 }}>
            Multi-modal prompt requests
          </div>
        </div>

        <div className="card" style={{ padding: 18, borderLeft: '4px solid #6366f1' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            Active Inferences
          </div>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#fff', marginTop: 6 }}>
            {aiStats.activeInferences}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
            Neural workers in progress
          </div>
        </div>

        <div className="card" style={{ padding: 18, borderLeft: '4px solid #10b981' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            Estimated Incurred Cost
          </div>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#34d399', marginTop: 6 }}>
            ${aiStats.estimatedCostUsd}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
            Foundation provider API fees
          </div>
        </div>

        <div className="card" style={{ padding: 18, borderLeft: '4px solid #ef4444' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            AI Failure Rate
          </div>
          <div style={{ fontSize: 26, fontWeight: 800, color: aiStats.failureRate > 10 ? '#f87171' : '#fff', marginTop: 6 }}>
            {aiStats.failureRate}%
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
            {aiStats.failedInferences} exceptions encountered
          </div>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="card" style={{ padding: 16 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
          <div style={{ position: 'relative', minWidth: 260, flex: '1 1 260px' }}>
            <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              className="input"
              placeholder="Search prompt, model, provider, owner..."
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
              <option value="QUEUED">QUEUED</option>
              <option value="RUNNING">RUNNING</option>
              <option value="COMPLETED">COMPLETED</option>
              <option value="FAILED">FAILED</option>
              <option value="CANCELLED">CANCELLED</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Capability:</span>
            <select
              className="input"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              style={{ minWidth: 150, padding: '6px 10px', fontSize: 13 }}
            >
              <option value="all">All Capabilities</option>
              <option value="text_to_speech">Voice Synthesis (TTS)</option>
              <option value="broll_generation">B-Roll Video Gen</option>
              <option value="smart_cut">Smart Scene Cut</option>
              <option value="image_generation">Image Generation</option>
              <option value="caption_generation">Auto Captions</option>
            </select>
          </div>
        </div>
      </div>

      {/* AI Jobs Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="table" style={{ width: '100%', minWidth: 1100, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'rgba(255, 255, 255, 0.02)', borderBottom: '1px solid var(--border-subtle)' }}>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>CAPABILITY / TASK</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>PROVIDER & MODEL</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>OWNER</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>INPUT / PROMPT</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>STATUS</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>PROGRESS</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>DURATION</th>
                <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {jobs.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: '48px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <Sparkles size={32} style={{ margin: '0 auto 8px', opacity: 0.4 }} />
                    <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>No AI jobs recorded</div>
                  </td>
                </tr>
              ) : (
                jobs.map((job) => {
                  const prompt = job.payload?.prompt || (typeof job.payload === 'object' ? JSON.stringify(job.payload) : '');
                  const provider = job.payload?.provider || (job.type.includes('broll') ? 'Runway' : 'Gemini');
                  const model = job.payload?.model || (job.type.includes('broll') ? 'gen-3-alpha' : 'gemini-1.5-pro');

                  return (
                    <tr key={job.id} style={{ borderBottom: '1px solid var(--border-subtle)' }} className="table-row-hover">
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div
                            style={{
                              width: 30,
                              height: 30,
                              borderRadius: 8,
                              background: 'rgba(168, 85, 247, 0.15)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: '#c084fc',
                            }}
                          >
                            <Sparkles size={14} />
                          </div>
                          <div>
                            <div style={{ fontWeight: 600, color: '#fff', fontSize: 13 }}>{job.type}</div>
                            <code style={{ fontSize: 11, color: 'var(--text-muted)' }}>{job.id.slice(0, 10)}...</code>
                          </div>
                        </div>
                      </td>

                      <td style={{ padding: '12px 16px' }}>
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            padding: '2px 6px',
                            borderRadius: 6,
                            background: 'rgba(255, 255, 255, 0.08)',
                            color: '#fff',
                            textTransform: 'uppercase',
                          }}
                        >
                          {provider}
                        </span>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{model}</div>
                      </td>

                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#fff' }}>{job.ownerName}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{job.ownerEmail}</div>
                      </td>

                      <td style={{ padding: '12px 16px', maxWidth: 220 }}>
                        <div
                          style={{
                            fontSize: 11.5,
                            color: 'var(--text-secondary)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                          title={prompt}
                        >
                          {prompt || '—'}
                        </div>
                      </td>

                      <td style={{ padding: '12px 16px' }}>
                        {renderStatusBadge(job.status)}
                      </td>

                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ width: 100 }}>
                          <div style={{ fontSize: 11, fontWeight: 600, color: '#fff', marginBottom: 2 }}>
                            {job.progress}%
                          </div>
                          <div style={{ height: 4, background: 'rgba(255, 255, 255, 0.08)', borderRadius: 2, overflow: 'hidden' }}>
                            <div
                              style={{
                                height: '100%',
                                width: `${job.progress}%`,
                                background: job.status === 'FAILED' ? 'var(--danger)' : 'var(--purple)',
                              }}
                            />
                          </div>
                        </div>
                      </td>

                      <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-secondary)' }}>
                        {job.durationSeconds ? `${job.durationSeconds}s` : '—'}
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
          <div>Showing {jobs.length} of {total} AI jobs</div>
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

      {/* Deep AI Inspector Drawer */}
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
                  AI Neural Trace Inspector
                </span>
                {aiJobDetails && renderStatusBadge(aiJobDetails.job.status)}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                <code style={{ fontSize: 12, color: 'var(--text-muted)' }}>ID: {aiJobDetails?.id || selectedJobId}</code>
              </div>
            </div>
            <button onClick={() => setInspectorOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
              <X size={18} />
            </button>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', padding: '0 24px', borderBottom: '1px solid var(--border-subtle)', background: 'rgba(0, 0, 0, 0.2)' }}>
            <button
              onClick={() => setActiveTab('prompt')}
              style={{
                padding: '12px 16px',
                fontSize: 13,
                fontWeight: activeTab === 'prompt' ? 700 : 500,
                color: activeTab === 'prompt' ? '#fff' : 'var(--text-secondary)',
                borderBottom: `2px solid ${activeTab === 'prompt' ? 'var(--purple)' : 'transparent'}`,
                background: 'none',
                borderTop: 'none',
                borderLeft: 'none',
                borderRight: 'none',
                cursor: 'pointer',
              }}
            >
              Input / Prompt
            </button>
            <button
              onClick={() => setActiveTab('output')}
              style={{
                padding: '12px 16px',
                fontSize: 13,
                fontWeight: activeTab === 'output' ? 700 : 500,
                color: activeTab === 'output' ? '#fff' : 'var(--text-secondary)',
                borderBottom: `2px solid ${activeTab === 'output' ? 'var(--purple)' : 'transparent'}`,
                background: 'none',
                borderTop: 'none',
                borderLeft: 'none',
                borderRight: 'none',
                cursor: 'pointer',
              }}
            >
              Output Artifact
            </button>
            <button
              onClick={() => setActiveTab('tokens')}
              style={{
                padding: '12px 16px',
                fontSize: 13,
                fontWeight: activeTab === 'tokens' ? 700 : 500,
                color: activeTab === 'tokens' ? '#fff' : 'var(--text-secondary)',
                borderBottom: `2px solid ${activeTab === 'tokens' ? 'var(--purple)' : 'transparent'}`,
                background: 'none',
                borderTop: 'none',
                borderLeft: 'none',
                borderRight: 'none',
                cursor: 'pointer',
              }}
            >
              Tokens & Cost
            </button>
            <button
              onClick={() => setActiveTab('retries')}
              style={{
                padding: '12px 16px',
                fontSize: 13,
                fontWeight: activeTab === 'retries' ? 700 : 500,
                color: activeTab === 'retries' ? '#fff' : 'var(--text-secondary)',
                borderBottom: `2px solid ${activeTab === 'retries' ? 'var(--purple)' : 'transparent'}`,
                background: 'none',
                borderTop: 'none',
                borderLeft: 'none',
                borderRight: 'none',
                cursor: 'pointer',
              }}
            >
              Retry History
            </button>
          </div>

          {/* Drawer Body */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
            {inspectorLoading ? (
              <div style={{ textAlign: 'center', padding: 48 }}><div className="loading-spinner" /></div>
            ) : !aiJobDetails ? (
              <div style={{ color: 'var(--text-muted)' }}>Trace data unavailable</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {/* TAB 1: PROMPT */}
                {activeTab === 'prompt' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div className="card" style={{ padding: 16 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#fff', marginBottom: 8 }}>
                        Model Configuration
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 12 }}>
                        <div><span style={{ color: 'var(--text-muted)' }}>Provider:</span> <strong style={{ color: '#fff' }}>{aiJobDetails.provider}</strong></div>
                        <div><span style={{ color: 'var(--text-muted)' }}>Model:</span> <strong style={{ color: '#fff' }}>{aiJobDetails.model}</strong></div>
                        <div><span style={{ color: 'var(--text-muted)' }}>Modality:</span> <strong style={{ color: '#fff' }}>{aiJobDetails.jobType}</strong></div>
                        <div><span style={{ color: 'var(--text-muted)' }}>Worker:</span> <strong style={{ color: '#fff' }}>{aiJobDetails.job.worker}</strong></div>
                      </div>
                    </div>

                    <div className="card" style={{ padding: 16 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>Input Payload / Prompt</div>
                        <button
                          onClick={() => copyToClipboard(JSON.stringify(aiJobDetails.input, null, 2), 'prompt-copy')}
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '2px 8px', fontSize: 11 }}
                        >
                          {copiedId === 'prompt-copy' ? <Check size={12} /> : <Copy size={12} />}
                        </button>
                      </div>
                      <pre
                        style={{
                          background: '#0a0d14',
                          padding: 12,
                          borderRadius: 6,
                          fontSize: 11.5,
                          lineHeight: 1.5,
                          color: '#e2e8f0',
                          overflowX: 'auto',
                          whiteSpace: 'pre-wrap',
                        }}
                      >
                        {typeof aiJobDetails.input === 'string'
                          ? aiJobDetails.input
                          : JSON.stringify(aiJobDetails.input, null, 2)}
                      </pre>
                    </div>

                    {aiJobDetails.error && (
                      <div className="card" style={{ padding: 16, borderLeft: '4px solid var(--danger)' }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#f87171', marginBottom: 4 }}>
                          Failure Exception
                        </div>
                        <div style={{ fontSize: 12, color: '#fff' }}>{aiJobDetails.error}</div>
                      </div>
                    )}
                  </div>
                )}

                {/* TAB 2: OUTPUT */}
                {activeTab === 'output' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div className="card" style={{ padding: 16 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#fff', marginBottom: 8 }}>
                        Generated Reference
                      </div>
                      <pre
                        style={{
                          background: '#0a0d14',
                          padding: 12,
                          borderRadius: 6,
                          fontSize: 11.5,
                          color: '#34d399',
                          overflowX: 'auto',
                          whiteSpace: 'pre-wrap',
                        }}
                      >
                        {JSON.stringify(aiJobDetails.outputReference, null, 2)}
                      </pre>
                      {aiJobDetails.outputReference?.downloadUrl && (
                        <div style={{ marginTop: 12 }}>
                          <a
                            href={aiJobDetails.outputReference.downloadUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="btn btn-primary btn-sm"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                          >
                            <Download size={13} />
                            <span>Download Artifact</span>
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* TAB 3: TOKENS & COST */}
                {activeTab === 'tokens' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div className="card" style={{ padding: 18 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 12 }}>
                        Token Usage Breakdown
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, textAlign: 'center' }}>
                        <div style={{ padding: 12, background: 'rgba(0, 0, 0, 0.2)', borderRadius: 6 }}>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Prompt Tokens</div>
                          <div style={{ fontSize: 18, fontWeight: 800, color: '#fff', marginTop: 4 }}>
                            {aiJobDetails.tokenUsage?.promptTokens ?? 0}
                          </div>
                        </div>
                        <div style={{ padding: 12, background: 'rgba(0, 0, 0, 0.2)', borderRadius: 6 }}>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Completion Tokens</div>
                          <div style={{ fontSize: 18, fontWeight: 800, color: '#38bdf8', marginTop: 4 }}>
                            {aiJobDetails.tokenUsage?.completionTokens ?? 0}
                          </div>
                        </div>
                        <div style={{ padding: 12, background: 'rgba(0, 0, 0, 0.2)', borderRadius: 6 }}>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Total Tokens</div>
                          <div style={{ fontSize: 18, fontWeight: 800, color: '#c084fc', marginTop: 4 }}>
                            {aiJobDetails.tokenUsage?.totalTokens ?? 0}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="card" style={{ padding: 18 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 12 }}>
                        Financial Ledger Reconciliation
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                        <div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Platform Credits Deducted:</div>
                          <div style={{ fontSize: 18, fontWeight: 800, color: '#fff', marginTop: 4 }}>
                            {aiJobDetails.actualCostCredits} Credits
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Estimated Foundation API Cost:</div>
                          <div style={{ fontSize: 18, fontWeight: 800, color: '#10b981', marginTop: 4 }}>
                            ${aiJobDetails.estimatedCostUsd.toFixed(5)} USD
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 4: RETRIES */}
                {activeTab === 'retries' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {aiJobDetails.retryHistory.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>
                        No retry attempts logged for this AI task.
                      </div>
                    ) : (
                      aiJobDetails.retryHistory.map((r) => (
                        <div key={r.attemptNumber} className="card" style={{ padding: 14, fontSize: 12 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, color: '#fff' }}>
                            <span>Attempt #{r.attemptNumber}</span>
                            <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{new Date(r.timestamp).toLocaleTimeString()}</span>
                          </div>
                          {r.error && (
                            <div style={{ color: '#f87171', marginTop: 4 }}>{r.error}</div>
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

      {/* Confirmation Modals */}
      <Modal isOpen={cancelModalOpen} onClose={() => setCancelModalOpen(false)} title="Cancel AI Inference">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Are you sure you want to cancel AI task <code>{actionJob?.id}</code>?
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button className="btn btn-secondary" onClick={() => setCancelModalOpen(false)}>Back</button>
            <button className="btn btn-danger" disabled={isSubmitting} onClick={handleConfirmCancel}>
              {isSubmitting ? 'Cancelling...' : 'Confirm'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={retryModalOpen} onClose={() => setRetryModalOpen(false)} title="Retry AI Inference">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Re-dispatch AI prompt <code>{actionJob?.id}</code> to the model queue?
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
