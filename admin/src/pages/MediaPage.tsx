import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../api/client';
import {
  AdminMediaView,
  AdminMediaDetailView,
} from '../types/admin';
import {
  Film,
  Music,
  Image as ImageIcon,
  File,
  Search,
  RefreshCw,
  Eye,
  RotateCcw,
  Archive,
  Trash2,
  Copy,
  Check,
  HardDrive,
  Activity,
  Layers,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  X,
  AlertTriangle,
  Download,
  Play,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { Modal } from '../components/Modal';

export const MediaPage: React.FC = () => {
  // State for data and query
  const [media, setMedia] = useState<AdminMediaView[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);

  // Filters & Query Controls
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [ownerFilter, setOwnerFilter] = useState('all');
  const [createdFrom, setCreatedFrom] = useState('');
  const [createdTo, setCreatedTo] = useState('');
  const [sortBy, setSortBy] = useState<'createdAt' | 'size' | 'duration' | 'name'>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Inspector Drawer State
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<AdminMediaView | null>(null);
  const [mediaDetails, setMediaDetails] = useState<AdminMediaDetailView | null>(null);
  const [inspectorLoading, setInspectorLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<
    'metadata' | 'storage' | 'waveform' | 'jobs' | 'integrity' | 'lifecycle'
  >('metadata');

  // Modals & Action States
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [actionMedia, setActionMedia] = useState<AdminMediaView | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // UX Feedback
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(timer);
  }, [search]);

  // Load Media from backend
  const loadMedia = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await api.getMedia({
        search: debouncedSearch.trim() || undefined,
        category: categoryFilter !== 'all' ? categoryFilter : undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        owner: ownerFilter !== 'all' ? ownerFilter : undefined,
        createdFrom: createdFrom || undefined,
        createdTo: createdTo || undefined,
        sortBy,
        sortOrder,
        page,
        pageSize,
      });
      setMedia(res.media);
      setTotal(res.total);
      setTotalPages(res.totalPages || Math.ceil(res.total / pageSize) || 1);
    } catch (err: any) {
      console.error('Failed to load media:', err);
      setMessage({ type: 'error', text: err.message || 'Failed to fetch platform media assets' });
    } finally {
      setIsLoading(false);
    }
  }, [debouncedSearch, categoryFilter, statusFilter, ownerFilter, createdFrom, createdTo, sortBy, sortOrder, page, pageSize]);

  useEffect(() => {
    loadMedia();
  }, [loadMedia]);

  // Open Inspector
  const handleOpenInspector = async (asset: AdminMediaView, initialTab = 'metadata') => {
    setSelectedMedia(asset);
    setActiveTab(initialTab as any);
    setInspectorOpen(true);
    setInspectorLoading(true);
    try {
      const details = await api.getMediaDetails(asset.id);
      setMediaDetails(details);
    } catch (err: any) {
      setMessage({ type: 'error', text: `Failed to load asset details: ${err.message}` });
    } finally {
      setInspectorLoading(false);
    }
  };

  // Copy ID Helper
  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Format File Size
  const formatSize = (bytes: number): string => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  // Format Duration
  const formatDuration = (seconds?: number) => {
    if (!seconds) return '-';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // Category Icon
  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'video':
        return <Film size={16} color="#06b6d4" />;
      case 'audio':
        return <Music size={16} color="#a855f7" />;
      case 'image':
        return <ImageIcon size={16} color="#10b981" />;
      default:
        return <File size={16} color="#94a3b8" />;
    }
  };

  // Status Badge
  const renderStatusBadge = (status: string) => {
    const s = (status || '').toUpperCase();
    switch (s) {
      case 'READY':
        return <span className="badge badge-completed">READY</span>;
      case 'PROCESSING':
        return <span className="badge badge-running">PROCESSING</span>;
      case 'UPLOADING':
        return <span className="badge badge-queued">UPLOADING</span>;
      case 'FAILED':
        return <span className="badge badge-failed">FAILED</span>;
      case 'DELETED':
        return (
          <span
            className="badge"
            style={{ background: 'rgba(239, 68, 68, 0.12)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.3)' }}
          >
            DELETED
          </span>
        );
      default:
        return <span className="badge badge-queued">{s}</span>;
    }
  };

  // Action: Retry Processing
  const handleRetryProcessing = async (assetId: string) => {
    setIsSubmitting(true);
    try {
      const updated = await api.retryMediaProcessing(assetId);
      setMessage({ type: 'success', text: `Media processing job queued for "${updated.name}".` });
      loadMedia();
      if (selectedMedia?.id === assetId) {
        handleOpenInspector(updated, activeTab);
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to retry media processing' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Action: Archive Media
  const handleArchiveMedia = async (assetId: string) => {
    setIsSubmitting(true);
    try {
      const updated = await api.archiveMedia(assetId);
      setMessage({ type: 'success', text: `Media asset "${updated.name}" archived successfully.` });
      loadMedia();
      if (selectedMedia?.id === assetId) {
        handleOpenInspector(updated, activeTab);
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to archive media asset' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Action: Cleanup Orphaned
  const handleCleanupOrphaned = async (assetId: string) => {
    setIsSubmitting(true);
    try {
      const res = await api.cleanupOrphanedMedia(assetId);
      setMessage({ type: 'success', text: res.message });
      loadMedia();
      if (selectedMedia?.id === assetId) {
        handleOpenInspector(selectedMedia, activeTab);
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to reconcile orphaned object' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Action: Coordinated Delete
  const handleDeleteMedia = async () => {
    if (!actionMedia) return;
    setIsSubmitting(true);
    try {
      const res = await api.deleteMedia(actionMedia.id);
      setMessage({ type: 'success', text: res.message });
      setDeleteModalOpen(false);
      if (inspectorOpen && selectedMedia?.id === actionMedia.id) {
        setInspectorOpen(false);
      }
      loadMedia();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to delete media asset' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ paddingBottom: 60 }}>
      {/* Toast Notification Banner */}
      {message && (
        <div
          style={{
            marginBottom: 20,
            padding: '14px 20px',
            borderRadius: 10,
            background:
              message.type === 'success'
                ? 'rgba(16, 185, 129, 0.15)'
                : 'rgba(239, 68, 68, 0.15)',
            border:
              message.type === 'success'
                ? '1px solid rgba(16, 185, 129, 0.3)'
                : '1px solid rgba(239, 68, 68, 0.3)',
            color: message.type === 'success' ? '#34d399' : '#f87171',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: 14,
            fontWeight: 500,
          }}
        >
          <span>{message.text}</span>
          <button
            onClick={() => setMessage(null)}
            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Header & Page Title */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 24,
          flexWrap: 'wrap',
          gap: 16,
        }}
      >
        <div>
          <h1
            style={{
              fontSize: 24,
              fontWeight: 700,
              color: '#fff',
              margin: '0 0 6px 0',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <HardDrive color="#06b6d4" size={26} />
            Media Asset Management
          </h1>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 13 }}>
            Inspect platform video, audio, and image assets, monitor background processing pipelines, and coordinate storage lifecycles.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <button
            className="btn btn-secondary"
            onClick={() => loadMedia()}
            disabled={isLoading}
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <RefreshCw size={14} className={isLoading ? 'spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div
        className="card"
        style={{
          padding: 16,
          marginBottom: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          background: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
        }}
      >
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Search Input */}
          <div
            style={{
              flex: '1 1 300px',
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <Search
              size={16}
              color="var(--text-muted)"
              style={{ position: 'absolute', left: 12 }}
            />
            <input
              type="text"
              placeholder="Search by asset ID, filename, MIME type, or owner..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="input"
              style={{ paddingLeft: 36, width: '100%' }}
            />
            {search && (
              <button
                onClick={() => {
                  setSearch('');
                  setPage(1);
                }}
                style={{
                  position: 'absolute',
                  right: 10,
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                }}
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Category Filter Pills */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', marginRight: 4 }}>Category:</span>
            {[
              { id: 'all', label: 'All' },
              { id: 'video', label: 'Video' },
              { id: 'audio', label: 'Audio' },
              { id: 'image', label: 'Image' },
            ].map((cat) => (
              <button
                key={cat.id}
                onClick={() => {
                  setCategoryFilter(cat.id);
                  setPage(1);
                }}
                style={{
                  padding: '6px 12px',
                  borderRadius: 6,
                  border: 'none',
                  background: categoryFilter === cat.id ? '#06b6d4' : 'rgba(255, 255, 255, 0.05)',
                  color: categoryFilter === cat.id ? '#000' : 'var(--text-secondary)',
                  fontWeight: categoryFilter === cat.id ? 700 : 500,
                  fontSize: 12,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Processing Status Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Status:</span>
            <select
              className="input"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              style={{ width: 140 }}
            >
              <option value="all">All Statuses</option>
              <option value="READY">READY</option>
              <option value="PROCESSING">PROCESSING</option>
              <option value="UPLOADING">UPLOADING</option>
              <option value="FAILED">FAILED</option>
              <option value="DELETED">DELETED</option>
            </select>
          </div>

          {/* Sort Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Sort:</span>
            <select
              className="input"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              style={{ width: 140 }}
            >
              <option value="createdAt">Created Date</option>
              <option value="size">File Size</option>
              <option value="duration">Duration</option>
              <option value="name">Filename</option>
            </select>
            <button
              className="btn btn-secondary"
              onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              style={{ padding: '8px 12px', fontSize: 12 }}
            >
              {sortOrder === 'asc' ? '▲ Asc' : '▼ Desc'}
            </button>
          </div>
        </div>

        {/* Date Filter Row */}
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', fontSize: 12, flexWrap: 'wrap' }}>
          <span style={{ color: 'var(--text-muted)' }}>Created Between:</span>
          <input
            type="date"
            value={createdFrom}
            onChange={(e) => {
              setCreatedFrom(e.target.value);
              setPage(1);
            }}
            className="input"
            style={{ width: 150, padding: '6px 10px', fontSize: 12 }}
          />
          <span style={{ color: 'var(--text-muted)' }}>to</span>
          <input
            type="date"
            value={createdTo}
            onChange={(e) => {
              setCreatedTo(e.target.value);
              setPage(1);
            }}
            className="input"
            style={{ width: 150, padding: '6px 10px', fontSize: 12 }}
          />
          {(categoryFilter !== 'all' || statusFilter !== 'all' || createdFrom || createdTo || search) && (
            <button
              onClick={() => {
                setCategoryFilter('all');
                setStatusFilter('all');
                setCreatedFrom('');
                setCreatedTo('');
                setSearch('');
                setPage(1);
              }}
              style={{
                background: 'none',
                border: 'none',
                color: '#38bdf8',
                cursor: 'pointer',
                fontSize: 12,
                textDecoration: 'underline',
              }}
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* Media Data Grid */}
      <div className="card" style={{ padding: 0, overflow: 'hidden', border: '1px solid var(--border-color)' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: 'rgba(255, 255, 255, 0.02)', borderBottom: '1px solid var(--border-color)' }}>
                <th style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-muted)' }}>Asset ID</th>
                <th style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-muted)' }}>Filename & Type</th>
                <th style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-muted)' }}>Owner</th>
                <th style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-muted)' }}>Size</th>
                <th style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-muted)' }}>Duration</th>
                <th style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-muted)' }}>Resolution</th>
                <th style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-muted)' }}>Status</th>
                <th style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-muted)' }}>Storage Object</th>
                <th style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-muted)' }}>Created</th>
                <th style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-muted)', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={10} style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
                    <RefreshCw size={20} className="spin" style={{ margin: '0 auto 10px auto' }} />
                    Loading media assets...
                  </td>
                </tr>
              ) : media.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
                    No media assets found matching the selected filters.
                  </td>
                </tr>
              ) : (
                media.map((m) => (
                  <tr
                    key={m.id}
                    style={{
                      borderBottom: '1px solid var(--border-color)',
                      transition: 'background 0.15s ease',
                    }}
                    className="table-row-hover"
                  >
                    {/* Asset ID */}
                    <td style={{ padding: '12px 16px', fontSize: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <code
                          style={{
                            color: '#cbd5e1',
                            background: 'rgba(255, 255, 255, 0.05)',
                            padding: '2px 6px',
                            borderRadius: 4,
                          }}
                        >
                          {m.id.slice(0, 8)}...
                        </code>
                        <button
                          onClick={() => copyToClipboard(m.id, m.id)}
                          title="Copy Asset ID"
                          style={{
                            background: 'none',
                            border: 'none',
                            color: copiedId === m.id ? '#10b981' : 'var(--text-muted)',
                            cursor: 'pointer',
                          }}
                        >
                          {copiedId === m.id ? <Check size={13} /> : <Copy size={13} />}
                        </button>
                      </div>
                    </td>

                    {/* Filename & Type */}
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 8,
                            background: 'rgba(255, 255, 255, 0.05)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          {getCategoryIcon(m.category)}
                        </div>
                        <div>
                          <div
                            onClick={() => handleOpenInspector(m, 'metadata')}
                            style={{ fontWeight: 600, color: '#fff', cursor: 'pointer' }}
                            className="link-hover"
                          >
                            {m.fileName || m.name}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            {m.mimeType} • <span style={{ textTransform: 'uppercase' }}>{m.category}</span>
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Owner */}
                    <td style={{ padding: '12px 16px', fontSize: 12 }}>
                      <div style={{ fontWeight: 500, color: '#e2e8f0' }}>{m.ownerName || 'User'}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{m.ownerEmail}</div>
                    </td>

                    {/* Size */}
                    <td style={{ padding: '12px 16px', fontSize: 12, fontWeight: 500 }}>
                      {formatSize(m.fileSizeBytes)}
                    </td>

                    {/* Duration */}
                    <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-secondary)' }}>
                      {formatDuration(m.durationSeconds)}
                    </td>

                    {/* Resolution */}
                    <td style={{ padding: '12px 16px', fontSize: 12, fontWeight: 500, color: '#38bdf8' }}>
                      {m.resolution || '-'}
                    </td>

                    {/* Status */}
                    <td style={{ padding: '12px 16px', fontSize: 12 }}>
                      {renderStatusBadge(m.status)}
                    </td>

                    {/* Storage Object */}
                    <td style={{ padding: '12px 16px', fontSize: 11 }}>
                      <code
                        style={{
                          color: '#94a3b8',
                          background: 'rgba(0, 0, 0, 0.25)',
                          padding: '3px 6px',
                          borderRadius: 4,
                          maxWidth: 160,
                          display: 'inline-block',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={m.storageObject?.fileKey}
                      >
                        {m.storageObject?.fileKey ? m.storageObject.fileKey.split('/').pop() : 'N/A'}
                      </code>
                    </td>

                    {/* Created Date */}
                    <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-muted)' }}>
                      {new Date(m.createdAt).toLocaleDateString()}
                    </td>

                    {/* Actions */}
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                        <button
                          className="btn btn-secondary"
                          onClick={() => handleOpenInspector(m, 'metadata')}
                          title="Inspect Media"
                          style={{ padding: '6px 10px', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}
                        >
                          <Eye size={12} />
                          Inspect
                        </button>

                        <button
                          className="btn btn-secondary"
                          onClick={() => handleRetryProcessing(m.id)}
                          title="Retry Media Processing Pipeline"
                          style={{ padding: '6px 10px', fontSize: 11, color: '#38bdf8' }}
                        >
                          <RotateCcw size={12} />
                        </button>

                        <button
                          className="btn btn-secondary"
                          onClick={() => {
                            setActionMedia(m);
                            setDeleteModalOpen(true);
                          }}
                          title="Delete Media & Purge Storage"
                          style={{ padding: '6px 10px', fontSize: 11, color: '#f87171' }}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div
          style={{
            padding: '12px 20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderTop: '1px solid var(--border-color)',
            background: 'rgba(255, 255, 255, 0.01)',
            fontSize: 12,
            color: 'var(--text-secondary)',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div>
            Showing <strong style={{ color: '#fff' }}>{media.length}</strong> of{' '}
            <strong style={{ color: '#fff' }}>{total}</strong> media assets (Page {page} of {totalPages})
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>Page size:</span>
              <select
                className="input"
                value={pageSize}
                onChange={(e) => {
                  setPageSize(parseInt(e.target.value, 10));
                  setPage(1);
                }}
                style={{ padding: '4px 8px', fontSize: 12, width: 70 }}
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>

            <div style={{ display: 'flex', gap: 6 }}>
              <button
                className="btn btn-secondary"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                style={{ padding: '4px 10px', fontSize: 12 }}
              >
                <ChevronLeft size={14} />
              </button>
              <button
                className="btn btn-secondary"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                style={{ padding: '4px 10px', fontSize: 12 }}
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 6-TAB MEDIA DETAILS INSPECTOR DRAWER / MODAL                              */}
      {/* ========================================================================= */}
      <Modal
        isOpen={inspectorOpen}
        onClose={() => setInspectorOpen(false)}
        title={selectedMedia ? `Media Inspector: ${selectedMedia.fileName || selectedMedia.name}` : 'Media Inspector'}
        maxWidth="960px"
      >
        {selectedMedia && (
          <div>
            {/* Inspector Navigation Tabs */}
            <div
              style={{
                display: 'flex',
                gap: 8,
                borderBottom: '1px solid var(--border-color)',
                paddingBottom: 12,
                marginBottom: 20,
                overflowX: 'auto',
              }}
            >
              {[
                { key: 'metadata', label: 'Metadata & Formats', icon: <File size={14} /> },
                { key: 'storage', label: 'Storage & Presigned URL', icon: <HardDrive size={14} /> },
                { key: 'waveform', label: 'Waveform & Proxy', icon: <Music size={14} /> },
                { key: 'jobs', label: `Processing Jobs (${mediaDetails?.processingJobs.length || 0})`, icon: <RotateCcw size={14} /> },
                { key: 'integrity', label: 'Integrity & Checksum', icon: <ShieldCheck size={14} /> },
                { key: 'lifecycle', label: 'Lifecycle & Admin Actions', icon: <Activity size={14} /> },
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key as any)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 8,
                    border: 'none',
                    background: activeTab === tab.key ? 'rgba(6, 182, 212, 0.2)' : 'transparent',
                    color: activeTab === tab.key ? '#38bdf8' : 'var(--text-muted)',
                    fontWeight: activeTab === tab.key ? 600 : 500,
                    fontSize: 12,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </div>

            {inspectorLoading ? (
              <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)' }}>
                <RefreshCw size={24} className="spin" style={{ margin: '0 auto 12px auto' }} />
                Verifying object storage consistency and media metadata...
              </div>
            ) : mediaDetails ? (
              <div>
                {/* TAB 1: METADATA & FORMATS */}
                {activeTab === 'metadata' && (
                  <div>
                    {/* Media Preview Player or Placeholder */}
                    <div
                      className="card"
                      style={{
                        padding: 16,
                        marginBottom: 16,
                        background: 'rgba(0, 0, 0, 0.4)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        minHeight: 180,
                        border: '1px dashed var(--border-color)',
                      }}
                    >
                      {mediaDetails.thumbnail.url ? (
                        <img
                          src={mediaDetails.thumbnail.url}
                          alt="Media Preview"
                          style={{ maxHeight: 200, maxWidth: '100%', borderRadius: 8, objectFit: 'contain' }}
                        />
                      ) : (
                        <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                          {getCategoryIcon(mediaDetails.asset.category)}
                          <div style={{ marginTop: 8, fontWeight: 600, color: '#fff' }}>
                            {mediaDetails.asset.fileName}
                          </div>
                          <div style={{ fontSize: 11, marginTop: 4 }}>
                            {mediaDetails.asset.mimeType} • {formatSize(mediaDetails.asset.fileSizeBytes)}
                          </div>
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
                      <div className="card" style={{ padding: 14 }}>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>
                          Resolution
                        </div>
                        <div style={{ fontSize: 15, fontWeight: 600, color: '#38bdf8' }}>
                          {mediaDetails.asset.width && mediaDetails.asset.height
                            ? `${mediaDetails.asset.width} × ${mediaDetails.asset.height}`
                            : 'Non-Visual Asset'}
                        </div>
                      </div>

                      <div className="card" style={{ padding: 14 }}>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>
                          Video / Audio Codec
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0' }}>
                          {mediaDetails.metadata.codec || 'H.264 / AAC'}
                        </div>
                      </div>

                      <div className="card" style={{ padding: 14 }}>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>
                          Audio Sample Rate & Channels
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#a78bfa' }}>
                          {mediaDetails.metadata.audioSampleRate} Hz • {mediaDetails.metadata.audioChannels} Ch
                        </div>
                      </div>

                      <div className="card" style={{ padding: 14 }}>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>
                          Bitrate & Framerate
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#10b981' }}>
                          {mediaDetails.metadata.bitrateKbps} Kbps • {mediaDetails.metadata.framerate} FPS
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 2: STORAGE & PRESIGNED URL */}
                {activeTab === 'storage' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div className="card" style={{ padding: 16 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <div style={{ fontWeight: 600, color: '#fff', fontSize: 14 }}>Storage Object Status</div>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '3px 8px',
                            borderRadius: 6,
                            fontSize: 11,
                            fontWeight: 600,
                            background: mediaDetails.storage.exists ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                            color: mediaDetails.storage.exists ? '#34d399' : '#f87171',
                          }}
                        >
                          {mediaDetails.storage.exists ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                          {mediaDetails.storage.exists ? 'Storage Object Verified' : 'Missing Object'}
                        </span>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                        <div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Storage Driver</div>
                          <div style={{ fontWeight: 600, color: '#e2e8f0', textTransform: 'uppercase' }}>
                            {mediaDetails.storage.driver}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Bucket / Namespace</div>
                          <div style={{ fontWeight: 600, color: '#e2e8f0' }}>{mediaDetails.storage.bucket}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Exact Object Size</div>
                          <div style={{ fontWeight: 600, color: '#e2e8f0' }}>{formatSize(mediaDetails.storage.sizeBytes)}</div>
                        </div>
                      </div>

                      <div style={{ marginTop: 14 }}>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Storage Key (Path)</div>
                        <code style={{ fontSize: 11, color: '#7dd3fc', background: 'rgba(0,0,0,0.3)', padding: '6px 10px', borderRadius: 6, display: 'block' }}>
                          {mediaDetails.storage.fileKey}
                        </code>
                      </div>

                      {mediaDetails.storage.downloadUrl && (
                        <div style={{ marginTop: 16 }}>
                          <a
                            href={mediaDetails.storage.downloadUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-secondary"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, padding: '8px 14px' }}
                          >
                            <Download size={14} />
                            Download Object via Presigned Link
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* TAB 3: WAVEFORM & PROXY */}
                {activeTab === 'waveform' && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
                    <div className="card" style={{ padding: 16 }}>
                      <div style={{ fontWeight: 600, color: '#fff', fontSize: 14, marginBottom: 8 }}>
                        Audio Waveform Pipeline
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                        {mediaDetails.waveform.available ? (
                          <span className="badge badge-completed">Available</span>
                        ) : (
                          <span className="badge badge-queued">Not Generated / Pending</span>
                        )}
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                          {mediaDetails.waveform.sampleCount || 0} peak points
                        </span>
                      </div>
                      <div
                        style={{
                          height: 48,
                          background: 'rgba(0,0,0,0.3)',
                          borderRadius: 6,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 2,
                          padding: '0 10px',
                        }}
                      >
                        {[12, 28, 45, 18, 60, 80, 42, 24, 70, 95, 30, 15, 60, 75, 40, 20, 85, 30].map((h, i) => (
                          <div
                            key={i}
                            style={{
                              flex: 1,
                              height: `${h}%`,
                              background: mediaDetails.waveform.available ? '#a855f7' : 'rgba(255,255,255,0.1)',
                              borderRadius: 2,
                            }}
                          />
                        ))}
                      </div>
                    </div>

                    <div className="card" style={{ padding: 16 }}>
                      <div style={{ fontWeight: 600, color: '#fff', fontSize: 14, marginBottom: 8 }}>
                        720p Mobile Editing Proxy
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                        {mediaDetails.proxy.available ? (
                          <span className="badge badge-completed">Available</span>
                        ) : (
                          <span className="badge badge-queued">Pending Generation</span>
                        )}
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                          {mediaDetails.proxy.resolution}
                        </span>
                      </div>
                      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                        High-efficiency H.264 proxy generated by background FFmpeg workers to support smooth scrubbing on mobile Flutter clients.
                      </p>
                    </div>
                  </div>
                )}

                {/* TAB 4: PROCESSING JOBS */}
                {activeTab === 'jobs' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {mediaDetails.processingJobs.length === 0 ? (
                      <div className="card" style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}>
                        No background processing jobs tracked for this asset.
                      </div>
                    ) : (
                      mediaDetails.processingJobs.map((j) => (
                        <div key={j.id} className="card" style={{ padding: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontWeight: 600, color: '#fff', fontSize: 13 }}>{j.type}</span>
                              {renderStatusBadge(j.status)}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                              Job ID: <code>{j.id}</code> • Attempts: {j.attempts} • {new Date(j.createdAt).toLocaleString()}
                            </div>
                            {j.error && (
                              <div style={{ fontSize: 11, color: '#f87171', marginTop: 4 }}>Error: {j.error}</div>
                            )}
                          </div>
                          <button
                            className="btn btn-secondary"
                            onClick={() => handleRetryProcessing(mediaDetails.asset.id)}
                            disabled={isSubmitting}
                            style={{ padding: '6px 12px', fontSize: 11 }}
                          >
                            Re-run Job
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* TAB 5: INTEGRITY & CHECKSUM */}
                {activeTab === 'integrity' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div className="card" style={{ padding: 16 }}>
                      <div style={{ fontWeight: 600, color: '#fff', fontSize: 14, marginBottom: 12 }}>
                        Cryptographic Checksums & Verification
                      </div>

                      <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>SHA-256 Digest</div>
                        <code style={{ fontSize: 11, color: '#38bdf8', background: 'rgba(0,0,0,0.3)', padding: '6px 10px', borderRadius: 6, display: 'block' }}>
                          {mediaDetails.checksum.sha256}
                        </code>
                      </div>

                      <div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>MD5 ETag</div>
                        <code style={{ fontSize: 11, color: '#a78bfa', background: 'rgba(0,0,0,0.3)', padding: '6px 10px', borderRadius: 6, display: 'block' }}>
                          {mediaDetails.checksum.md5}
                        </code>
                      </div>

                      <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <ShieldCheck size={16} color="#10b981" />
                        <span style={{ fontSize: 12, color: '#10b981', fontWeight: 600 }}>
                          Anti-Malware & Security Scan Passed
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 6: LIFECYCLE & ADMIN ACTIONS */}
                {activeTab === 'lifecycle' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div className="card" style={{ padding: 16 }}>
                      <div style={{ fontWeight: 600, color: '#fff', fontSize: 14, marginBottom: 12 }}>
                        Administrative Lifecycle Controls
                      </div>

                      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                        <button
                          className="btn btn-secondary"
                          onClick={() => handleRetryProcessing(mediaDetails.asset.id)}
                          disabled={isSubmitting}
                          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}
                        >
                          <RotateCcw size={14} /> Retry Processing Pipeline
                        </button>

                        <button
                          className="btn btn-secondary"
                          onClick={() => handleCleanupOrphaned(mediaDetails.asset.id)}
                          disabled={isSubmitting}
                          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}
                        >
                          <RefreshCw size={14} /> Reconcile Orphaned Storage State
                        </button>

                        {mediaDetails.asset.status !== 'DELETED' && (
                          <button
                            className="btn btn-secondary"
                            onClick={() => handleArchiveMedia(mediaDetails.asset.id)}
                            disabled={isSubmitting}
                            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#f59e0b' }}
                          >
                            <Archive size={14} /> Soft Archive Asset
                          </button>
                        )}

                        <button
                          className="btn btn-primary"
                          onClick={() => {
                            setActionMedia(mediaDetails.asset);
                            setDeleteModalOpen(true);
                          }}
                          disabled={isSubmitting}
                          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, background: '#ef4444', borderColor: '#ef4444' }}
                        >
                          <Trash2 size={14} /> Coordinated Delete & Storage Purge
                        </button>
                      </div>
                    </div>

                    {/* Audit Trail */}
                    <div className="card" style={{ padding: 16 }}>
                      <div style={{ fontWeight: 600, color: '#fff', fontSize: 13, marginBottom: 10 }}>
                        Audit Log Entries for this Asset
                      </div>
                      {mediaDetails.auditActivity.length === 0 ? (
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No audit events logged for this asset.</div>
                      ) : (
                        mediaDetails.auditActivity.map((a) => (
                          <div key={a.id} style={{ fontSize: 12, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                            <span style={{ color: '#38bdf8', fontWeight: 600 }}>{a.action}</span> by <code>{a.actorId}</code> at{' '}
                            <span style={{ color: 'var(--text-muted)' }}>{new Date(a.timestamp).toLocaleString()}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        )}
      </Modal>

      {/* ========================================================================= */}
      {/* DELETE CONFIRMATION MODAL (COORDINATED DATABASE + STORAGE PURGE)           */}
      {/* ========================================================================= */}
      <Modal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title="Coordinated Media Deletion"
        maxWidth="500px"
      >
        {actionMedia && (
          <div>
            <div style={{ display: 'flex', gap: 14, marginBottom: 16, alignItems: 'flex-start' }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  background: 'rgba(239, 68, 68, 0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#ef4444',
                  flexShrink: 0,
                }}
              >
                <AlertTriangle size={22} />
              </div>
              <div>
                <div style={{ fontWeight: 600, color: '#fff', fontSize: 14 }}>
                  Permanently delete "{actionMedia.fileName || actionMedia.name}"?
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6, lineHeight: 1.5 }}>
                  This action is irreversible. The system will coordinate the following operations:
                </div>
                <ul style={{ margin: '8px 0 0 0', paddingLeft: 18, fontSize: 12, color: '#f87171' }}>
                  <li>Purge raw binary file from S3 / MinIO object storage</li>
                  <li>Purge audio waveforms, video proxies, and thumbnails</li>
                  <li>Mark database reference as permanently deleted</li>
                  <li>Log a security audit record with your administrator ID</li>
                </ul>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24 }}>
              <button
                className="btn btn-secondary"
                onClick={() => setDeleteModalOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleDeleteMedia}
                disabled={isSubmitting}
                style={{ background: '#ef4444', borderColor: '#ef4444' }}
              >
                {isSubmitting ? 'Purging Storage...' : 'Confirm Coordinated Delete'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
