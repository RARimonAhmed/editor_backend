import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../api/client';
import {
  AdminProjectView,
  AdminProjectDetailView,
} from '../types/admin';
import {
  FolderGit2,
  Search,
  RefreshCw,
  Eye,
  Archive,
  RotateCcw,
  Camera,
  Copy,
  Check,
  Clock,
  Users,
  Shield,
  MessageSquare,
  HardDrive,
  Activity,
  FileText,
  ChevronLeft,
  ChevronRight,
  X,
  Plus,
  AlertTriangle,
} from 'lucide-react';
import { Modal } from '../components/Modal';

export const ProjectsPage: React.FC = () => {
  // State for data and query
  const [projects, setProjects] = useState<AdminProjectView[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);

  // Filters & Query Controls
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sizeFilter, setSizeFilter] = useState('all');
  const [createdFrom, setCreatedFrom] = useState('');
  const [createdTo, setCreatedTo] = useState('');
  const [sortBy, setSortBy] = useState<'updatedAt' | 'createdAt' | 'title' | 'size' | 'version'>('updatedAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Inspector Drawer State
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<AdminProjectView | null>(null);
  const [projectDetails, setProjectDetails] = useState<AdminProjectDetailView | null>(null);
  const [inspectorLoading, setInspectorLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<
    'metadata' | 'versions' | 'members' | 'permissions' | 'comments' | 'assets' | 'activity' | 'snapshots'
  >('metadata');

  // Modals & Action States
  const [snapshotModalOpen, setSnapshotModalOpen] = useState(false);
  const [snapshotName, setSnapshotName] = useState('');
  const [snapshotDesc, setSnapshotDesc] = useState('');
  const [archiveModalOpen, setArchiveModalOpen] = useState(false);
  const [restoreModalOpen, setRestoreModalOpen] = useState(false);
  const [actionProject, setActionProject] = useState<AdminProjectView | null>(null);
  const [versionInspectModalOpen, setVersionInspectModalOpen] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<any | null>(null);

  // UX Feedback
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(timer);
  }, [search]);

  // Load Projects from backend
  const loadProjects = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await api.getProjects({
        search: debouncedSearch.trim() || undefined,
        owner: ownerFilter !== 'all' ? ownerFilter : undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        sizeCategory: sizeFilter !== 'all' ? sizeFilter : undefined,
        createdFrom: createdFrom || undefined,
        createdTo: createdTo || undefined,
        sortBy,
        sortOrder,
        page,
        pageSize,
      });
      setProjects(res.projects);
      setTotal(res.total);
      setTotalPages(res.totalPages || Math.ceil(res.total / pageSize) || 1);
    } catch (err: any) {
      console.error('Failed to load projects:', err);
      setMessage({ type: 'error', text: err.message || 'Failed to fetch platform projects' });
    } finally {
      setIsLoading(false);
    }
  }, [debouncedSearch, ownerFilter, statusFilter, sizeFilter, createdFrom, createdTo, sortBy, sortOrder, page, pageSize]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  // Open Inspector
  const handleOpenInspector = async (project: AdminProjectView, initialTab = 'metadata') => {
    setSelectedProject(project);
    setActiveTab(initialTab as any);
    setInspectorOpen(true);
    setInspectorLoading(true);
    try {
      const details = await api.getProjectDetails(project.id);
      setProjectDetails(details);
    } catch (err: any) {
      setMessage({ type: 'error', text: `Failed to load project details: ${err.message}` });
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
  const formatDuration = (seconds: number) => {
    if (!seconds) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // Archive Project
  const handleArchiveProject = async () => {
    if (!actionProject) return;
    setIsSubmitting(true);
    try {
      const updated = await api.archiveProject(actionProject.id);
      setMessage({ type: 'success', text: `Project "${updated.title}" archived successfully.` });
      setArchiveModalOpen(false);
      loadProjects();
      if (selectedProject?.id === actionProject.id) {
        handleOpenInspector(updated, activeTab);
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to archive project' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Restore Project
  const handleRestoreProject = async () => {
    if (!actionProject) return;
    setIsSubmitting(true);
    try {
      const updated = await api.restoreProject(actionProject.id);
      setMessage({ type: 'success', text: `Project "${updated.title}" restored to active status.` });
      setRestoreModalOpen(false);
      loadProjects();
      if (selectedProject?.id === actionProject.id) {
        handleOpenInspector(updated, activeTab);
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to restore project' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Create Snapshot
  const handleCreateSnapshot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProject || !snapshotName.trim()) return;
    setIsSubmitting(true);
    try {
      await api.createProjectSnapshot(selectedProject.id, {
        name: snapshotName.trim(),
        description: snapshotDesc.trim() || undefined,
      });
      setMessage({ type: 'success', text: `Snapshot "${snapshotName}" created successfully.` });
      setSnapshotModalOpen(false);
      setSnapshotName('');
      setSnapshotDesc('');
      handleOpenInspector(selectedProject, 'snapshots');
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to create snapshot' });
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
            <FolderGit2 color="#6366f1" size={26} />
            Project Management
          </h1>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 13 }}>
            Manage platform video timelines, resolution profiles, version histories, and collaboration permissions.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <button
            className="btn btn-secondary"
            onClick={() => loadProjects()}
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
              placeholder="Search by project ID, project name, or owner..."
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

          {/* Status Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Status:</span>
            <select
              className="input"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              style={{ width: 130 }}
            >
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
              <option value="deleted">Deleted</option>
            </select>
          </div>

          {/* Size Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Size:</span>
            <select
              className="input"
              value={sizeFilter}
              onChange={(e) => {
                setSizeFilter(e.target.value);
                setPage(1);
              }}
              style={{ width: 140 }}
            >
              <option value="all">All Sizes</option>
              <option value="small">&lt; 10 MB (Small)</option>
              <option value="medium">10 - 100 MB</option>
              <option value="large">&gt; 100 MB (Heavy)</option>
            </select>
          </div>

          {/* Sort By */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Sort:</span>
            <select
              className="input"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              style={{ width: 140 }}
            >
              <option value="updatedAt">Last Modified</option>
              <option value="createdAt">Created Date</option>
              <option value="title">Project Title</option>
              <option value="size">Size</option>
              <option value="version">Version</option>
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
          {(statusFilter !== 'all' || sizeFilter !== 'all' || createdFrom || createdTo || search) && (
            <button
              onClick={() => {
                setStatusFilter('all');
                setSizeFilter('all');
                setCreatedFrom('');
                setCreatedTo('');
                setSearch('');
                setPage(1);
              }}
              style={{
                background: 'none',
                border: 'none',
                color: '#818cf8',
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

      {/* Projects Data Grid */}
      <div className="card" style={{ padding: 0, overflow: 'hidden', border: '1px solid var(--border-color)' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: 'rgba(255, 255, 255, 0.02)', borderBottom: '1px solid var(--border-color)' }}>
                <th style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-muted)' }}>Project ID</th>
                <th style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-muted)' }}>Project Name</th>
                <th style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-muted)' }}>Owner</th>
                <th style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-muted)' }}>Version</th>
                <th style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-muted)' }}>Size</th>
                <th style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-muted)' }}>Assets</th>
                <th style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-muted)' }}>Status</th>
                <th style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-muted)' }}>Last Modified</th>
                <th style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-muted)', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={9} style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
                    <RefreshCw size={20} className="spin" style={{ margin: '0 auto 10px auto' }} />
                    Loading projects...
                  </td>
                </tr>
              ) : projects.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
                    No projects found matching the selected criteria.
                  </td>
                </tr>
              ) : (
                projects.map((p) => (
                  <tr
                    key={p.id}
                    style={{
                      borderBottom: '1px solid var(--border-color)',
                      transition: 'background 0.15s ease',
                    }}
                    className="table-row-hover"
                  >
                    {/* Project ID */}
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
                          {p.id.slice(0, 10)}...
                        </code>
                        <button
                          onClick={() => copyToClipboard(p.id, p.id)}
                          title="Copy Full Project ID"
                          style={{
                            background: 'none',
                            border: 'none',
                            color: copiedId === p.id ? '#10b981' : 'var(--text-muted)',
                            cursor: 'pointer',
                          }}
                        >
                          {copiedId === p.id ? <Check size={13} /> : <Copy size={13} />}
                        </button>
                      </div>
                    </td>

                    {/* Project Title */}
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 8,
                            background: 'rgba(99, 102, 241, 0.12)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#818cf8',
                            flexShrink: 0,
                          }}
                        >
                          <FolderGit2 size={16} />
                        </div>
                        <div>
                          <div
                            onClick={() => handleOpenInspector(p, 'metadata')}
                            style={{
                              fontWeight: 600,
                              color: '#fff',
                              cursor: 'pointer',
                            }}
                            className="link-hover"
                          >
                            {p.title}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            {p.resolution || '1080p'} • {formatDuration(p.durationSeconds)}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Owner */}
                    <td style={{ padding: '12px 16px', fontSize: 12 }}>
                      <div style={{ fontWeight: 500, color: '#e2e8f0' }}>{p.ownerName || 'Owner'}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.ownerEmail}</div>
                    </td>

                    {/* Version */}
                    <td style={{ padding: '12px 16px', fontSize: 12 }}>
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: 6,
                          background: 'rgba(139, 92, 246, 0.15)',
                          color: '#a78bfa',
                          fontWeight: 600,
                          fontSize: 11,
                        }}
                      >
                        v{p.version}
                      </span>
                    </td>

                    {/* Size */}
                    <td style={{ padding: '12px 16px', fontSize: 12, fontWeight: 500 }}>
                      {formatSize(p.estimatedSizeBytes)}
                    </td>

                    {/* Asset Count */}
                    <td style={{ padding: '12px 16px', fontSize: 12 }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          color: 'var(--text-secondary)',
                        }}
                      >
                        <HardDrive size={13} color="var(--text-muted)" />
                        {p.assetCount} assets
                      </span>
                    </td>

                    {/* Status */}
                    <td style={{ padding: '12px 16px', fontSize: 12 }}>
                      {p.status === 'active' ? (
                        <span className="badge badge-completed">Active</span>
                      ) : p.status === 'archived' ? (
                        <span className="badge badge-running">Archived</span>
                      ) : (
                        <span className="badge badge-failed">Deleted</span>
                      )}
                    </td>

                    {/* Last Modified */}
                    <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-muted)' }}>
                      {new Date(p.updatedAt).toLocaleDateString()} {new Date(p.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>

                    {/* Actions */}
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                        <button
                          className="btn btn-secondary"
                          onClick={() => handleOpenInspector(p, 'metadata')}
                          title="Inspect Project Details"
                          style={{ padding: '6px 10px', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}
                        >
                          <Eye size={12} />
                          Inspect
                        </button>

                        {p.status === 'active' ? (
                          <button
                            className="btn btn-secondary"
                            onClick={() => {
                              setActionProject(p);
                              setArchiveModalOpen(true);
                            }}
                            title="Archive Project"
                            style={{ padding: '6px 10px', fontSize: 11, color: '#f59e0b' }}
                          >
                            <Archive size={12} />
                          </button>
                        ) : p.status === 'archived' ? (
                          <button
                            className="btn btn-secondary"
                            onClick={() => {
                              setActionProject(p);
                              setRestoreModalOpen(true);
                            }}
                            title="Restore Project"
                            style={{ padding: '6px 10px', fontSize: 11, color: '#10b981' }}
                          >
                            <RotateCcw size={12} />
                          </button>
                        ) : null}

                        <button
                          className="btn btn-secondary"
                          onClick={() => {
                            setSelectedProject(p);
                            setSnapshotName(`Snapshot v${p.version} - ${new Date().toLocaleDateString()}`);
                            setSnapshotDesc('');
                            setSnapshotModalOpen(true);
                          }}
                          title="Create Version Snapshot"
                          style={{ padding: '6px 10px', fontSize: 11, color: '#818cf8' }}
                        >
                          <Camera size={12} />
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
            Showing <strong style={{ color: '#fff' }}>{projects.length}</strong> of{' '}
            <strong style={{ color: '#fff' }}>{total}</strong> projects (Page {page} of {totalPages})
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
      {/* 8-TAB PROJECT DETAILS INSPECTOR DRAWER / MODAL                            */}
      {/* ========================================================================= */}
      <Modal
        isOpen={inspectorOpen}
        onClose={() => setInspectorOpen(false)}
        title={selectedProject ? `Project Inspector: ${selectedProject.title}` : 'Project Inspector'}
        maxWidth="960px"
      >
        {selectedProject && (
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
                { key: 'metadata', label: 'Metadata & Canvas', icon: <FileText size={14} /> },
                { key: 'versions', label: `Versions (${projectDetails?.versions.length || 0})`, icon: <Clock size={14} /> },
                { key: 'members', label: `Members (${projectDetails?.members.length || 0})`, icon: <Users size={14} /> },
                { key: 'permissions', label: 'RBAC Permissions', icon: <Shield size={14} /> },
                { key: 'comments', label: `Comments (${projectDetails?.comments.length || 0})`, icon: <MessageSquare size={14} /> },
                { key: 'assets', label: `Assets (${projectDetails?.assets.length || 0})`, icon: <HardDrive size={14} /> },
                { key: 'snapshots', label: `Snapshots (${projectDetails?.snapshots.length || 0})`, icon: <Camera size={14} /> },
                { key: 'activity', label: 'Audit Activity', icon: <Activity size={14} /> },
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key as any)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 8,
                    border: 'none',
                    background: activeTab === tab.key ? 'rgba(99, 102, 241, 0.2)' : 'transparent',
                    color: activeTab === tab.key ? '#818cf8' : 'var(--text-muted)',
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
                Fetching project telemetry and version history...
              </div>
            ) : projectDetails ? (
              <div>
                {/* TAB 1: METADATA & CANVAS */}
                {activeTab === 'metadata' && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
                    <div className="card" style={{ padding: 16 }}>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>
                        Project Title
                      </div>
                      <div style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>{projectDetails.project.title}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>ID: {projectDetails.project.id}</div>
                    </div>

                    <div className="card" style={{ padding: 16 }}>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>
                        Canvas Profile
                      </div>
                      <div style={{ fontSize: 15, fontWeight: 600, color: '#38bdf8' }}>
                        {projectDetails.metadata.canvas?.resolutionWidth || 1920} × {projectDetails.metadata.canvas?.resolutionHeight || 1080}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
                        {projectDetails.metadata.canvas?.framerate || 30} FPS • Aspect: {projectDetails.metadata.aspectRatio}
                      </div>
                    </div>

                    <div className="card" style={{ padding: 16 }}>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>
                        Timeline Duration
                      </div>
                      <div style={{ fontSize: 15, fontWeight: 600, color: '#a78bfa' }}>
                        {formatDuration(projectDetails.metadata.timeline?.duration || 0)}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
                        {projectDetails.metadata.timeline?.tracksCount || 0} active tracks
                      </div>
                    </div>

                    <div className="card" style={{ padding: 16 }}>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>
                        Estimated Size
                      </div>
                      <div style={{ fontSize: 15, fontWeight: 600, color: '#10b981' }}>
                        {formatSize(projectDetails.project.estimatedSizeBytes)}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
                        {projectDetails.project.assetCount} media assets
                      </div>
                    </div>

                    <div className="card" style={{ padding: 16, gridColumn: '1 / -1' }}>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>
                        ETag & System Concurrency Token
                      </div>
                      <code style={{ fontSize: 12, color: '#cbd5e1', background: 'rgba(0,0,0,0.3)', padding: '6px 10px', borderRadius: 6, display: 'block' }}>
                        {projectDetails.metadata.etag || 'N/A'} (Schema v{projectDetails.metadata.schemaVersion})
                      </code>
                    </div>
                  </div>
                )}

                {/* TAB 2: VERSIONS */}
                {activeTab === 'versions' && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                        Historical timeline checkpoints and auto-save tree:
                      </div>
                    </div>
                    {projectDetails.versions.length === 0 ? (
                      <div className="card" style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}>
                        No version checkpoints recorded yet. Project is currently at base version v{projectDetails.project.version}.
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {projectDetails.versions.map((v: any, idx: number) => (
                          <div
                            key={v.id || idx}
                            className="card"
                            style={{
                              padding: 14,
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                            }}
                          >
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span className="badge badge-queued" style={{ fontWeight: 600 }}>
                                  v{v.versionNumber}
                                </span>
                                <span style={{ fontWeight: 600, color: '#fff', fontSize: 13 }}>
                                  {v.changeSummary || 'Autosave checkpoint'}
                                </span>
                                {v.isAutoSave && (
                                  <span style={{ fontSize: 10, color: 'var(--text-muted)', background: 'rgba(255,255,255,0.05)', padding: '1px 5px', borderRadius: 4 }}>
                                    Autosave
                                  </span>
                                )}
                              </div>
                              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                                Device: {v.deviceName || 'Editor Web'} • {new Date(v.createdAt).toLocaleString()}
                              </div>
                            </div>
                            <button
                              className="btn btn-secondary"
                              onClick={() => {
                                setSelectedVersion(v);
                                setVersionInspectModalOpen(true);
                              }}
                              style={{ padding: '6px 12px', fontSize: 11 }}
                            >
                              Inspect Payload
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* TAB 3: MEMBERS & COLLABORATORS */}
                {activeTab === 'members' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {projectDetails.members.map((m, idx) => (
                      <div
                        key={m.userId || idx}
                        className="card"
                        style={{
                          padding: 14,
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div
                            style={{
                              width: 36,
                              height: 36,
                              borderRadius: '50%',
                              background: m.role === 'OWNER' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(99, 102, 241, 0.2)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: m.role === 'OWNER' ? '#fbbf24' : '#818cf8',
                              fontWeight: 700,
                              fontSize: 14,
                            }}
                          >
                            {m.name ? m.name[0].toUpperCase() : 'U'}
                          </div>
                          <div>
                            <div style={{ fontWeight: 600, color: '#fff', fontSize: 13 }}>{m.name}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{m.email || `ID: ${m.userId}`}</div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <span
                            style={{
                              padding: '3px 8px',
                              borderRadius: 6,
                              fontSize: 11,
                              fontWeight: 600,
                              background: m.role === 'OWNER' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(99, 102, 241, 0.15)',
                              color: m.role === 'OWNER' ? '#fbbf24' : '#818cf8',
                            }}
                          >
                            {m.role}
                          </span>
                          <span className="badge badge-completed" style={{ fontSize: 10 }}>
                            {m.status || 'ACTIVE'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* TAB 4: PERMISSIONS */}
                {activeTab === 'permissions' && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                    {Object.entries(projectDetails.permissions).map(([role, caps]) => (
                      <div key={role} className="card" style={{ padding: 14 }}>
                        <div style={{ fontWeight: 700, color: '#818cf8', fontSize: 13, marginBottom: 8, textTransform: 'uppercase' }}>
                          {role}
                        </div>
                        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 11, color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {Array.isArray(caps) && caps.map((c, i) => <li key={i}>{c}</li>)}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}

                {/* TAB 5: COMMENTS */}
                {activeTab === 'comments' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {projectDetails.comments.length === 0 ? (
                      <div className="card" style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}>
                        No review comments recorded for this timeline.
                      </div>
                    ) : (
                      projectDetails.comments.map((c) => (
                        <div key={c.id} className="card" style={{ padding: 14 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontWeight: 600, color: '#fff', fontSize: 13 }}>{c.authorName || 'Collaborator'}</span>
                              {c.timecodeSeconds !== undefined && (
                                <span style={{ fontSize: 11, color: '#38bdf8', background: 'rgba(56, 189, 248, 0.12)', padding: '1px 6px', borderRadius: 4 }}>
                                  @{formatDuration(c.timecodeSeconds)}
                                </span>
                              )}
                            </div>
                            <span className={c.resolved ? 'badge badge-completed' : 'badge badge-queued'} style={{ fontSize: 10 }}>
                              {c.resolved ? 'Resolved' : 'Open'}
                            </span>
                          </div>
                          <div style={{ fontSize: 13, color: '#e2e8f0', lineHeight: 1.4 }}>{c.text}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                            {new Date(c.createdAt).toLocaleString()}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* TAB 6: ASSETS */}
                {activeTab === 'assets' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {projectDetails.assets.length === 0 ? (
                      <div className="card" style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}>
                        No assets associated with this project timeline yet.
                      </div>
                    ) : (
                      projectDetails.assets.map((a, i) => (
                        <div key={a.id || i} className="card" style={{ padding: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <HardDrive size={18} color="#818cf8" />
                            <div>
                              <div style={{ fontWeight: 600, color: '#fff', fontSize: 13 }}>{a.name}</div>
                              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                {a.category?.toUpperCase() || 'MEDIA'} • {formatSize(a.fileSizeBytes)}
                              </div>
                            </div>
                          </div>
                          <code style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{a.id.slice(0, 12)}...</code>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* TAB 7: SNAPSHOTS */}
                {activeTab === 'snapshots' && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                      <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                        Immutable version snapshots created by collaborators:
                      </div>
                      <button
                        className="btn btn-primary"
                        onClick={() => {
                          setSnapshotName(`Snapshot v${projectDetails.project.version} - ${new Date().toLocaleDateString()}`);
                          setSnapshotDesc('');
                          setSnapshotModalOpen(true);
                        }}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '6px 12px' }}
                      >
                        <Plus size={14} /> Create Snapshot
                      </button>
                    </div>

                    {projectDetails.snapshots.length === 0 ? (
                      <div className="card" style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}>
                        No immutable snapshots recorded for this project yet.
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {projectDetails.snapshots.map((s) => (
                          <div key={s.id} className="card" style={{ padding: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Camera size={16} color="#38bdf8" />
                                <span style={{ fontWeight: 600, color: '#fff', fontSize: 13 }}>{s.name}</span>
                                <span className="badge badge-queued" style={{ fontSize: 10 }}>v{s.versionNumber}</span>
                              </div>
                              {s.description && (
                                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{s.description}</div>
                              )}
                              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                                Created by {s.createdByName || s.createdBy} • {new Date(s.createdAt).toLocaleString()}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* TAB 8: ACTIVITY */}
                {activeTab === 'activity' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {projectDetails.activity.length === 0 ? (
                      <div className="card" style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}>
                        No audit log actions recorded for this project yet.
                      </div>
                    ) : (
                      projectDetails.activity.map((a) => (
                        <div key={a.id} className="card" style={{ padding: 12 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontWeight: 600, color: '#818cf8', fontSize: 12 }}>{a.action}</span>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{new Date(a.timestamp).toLocaleString()}</span>
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
                            Actor: <code>{a.actorId}</code>
                          </div>
                          {a.details && (
                            <pre style={{ fontSize: 10, color: '#94a3b8', background: 'rgba(0,0,0,0.3)', padding: 6, borderRadius: 4, marginTop: 6, overflowX: 'auto' }}>
                              {JSON.stringify(a.details, null, 2)}
                            </pre>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        )}
      </Modal>

      {/* ========================================================================= */}
      {/* ACTION MODALS (SNAPSHOT, ARCHIVE, RESTORE, VERSION PAYLOAD)              */}
      {/* ========================================================================= */}

      {/* 1. Create Snapshot Modal */}
      <Modal
        isOpen={snapshotModalOpen}
        onClose={() => setSnapshotModalOpen(false)}
        title="Create Immutable Project Snapshot"
        maxWidth="500px"
      >
        <form onSubmit={handleCreateSnapshot}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
                Snapshot Name
              </label>
              <input
                type="text"
                className="input"
                value={snapshotName}
                onChange={(e) => setSnapshotName(e.target.value)}
                placeholder="e.g. Cut 3 - Client Review"
                required
                style={{ width: '100%' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
                Description (Optional)
              </label>
              <textarea
                className="input"
                value={snapshotDesc}
                onChange={(e) => setSnapshotDesc(e.target.value)}
                placeholder="Summary of changes included in this snapshot..."
                rows={3}
                style={{ width: '100%' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setSnapshotModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={isSubmitting || !snapshotName.trim()}
              >
                {isSubmitting ? 'Creating...' : 'Create Snapshot'}
              </button>
            </div>
          </div>
        </form>
      </Modal>

      {/* 2. Archive Project Confirmation Modal */}
      <Modal
        isOpen={archiveModalOpen}
        onClose={() => setArchiveModalOpen(false)}
        title="Archive Project"
        maxWidth="460px"
      >
        {actionProject && (
          <div>
            <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center' }}>
              <AlertTriangle size={28} color="#f59e0b" />
              <div>
                <div style={{ fontWeight: 600, color: '#fff' }}>Archive "{actionProject.title}"?</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                  Archiving moves the project into cold storage. Editors will not be able to make edits until restored.
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button
                className="btn btn-secondary"
                onClick={() => setArchiveModalOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleArchiveProject}
                disabled={isSubmitting}
                style={{ background: '#f59e0b', borderColor: '#f59e0b' }}
              >
                {isSubmitting ? 'Archiving...' : 'Confirm Archive'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* 3. Restore Project Confirmation Modal */}
      <Modal
        isOpen={restoreModalOpen}
        onClose={() => setRestoreModalOpen(false)}
        title="Restore Project"
        maxWidth="460px"
      >
        {actionProject && (
          <div>
            <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center' }}>
              <RotateCcw size={28} color="#10b981" />
              <div>
                <div style={{ fontWeight: 600, color: '#fff' }}>Restore "{actionProject.title}"?</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                  This will restore the project to ACTIVE status, enabling editor timeline sync and export operations.
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button
                className="btn btn-secondary"
                onClick={() => setRestoreModalOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleRestoreProject}
                disabled={isSubmitting}
                style={{ background: '#10b981', borderColor: '#10b981' }}
              >
                {isSubmitting ? 'Restoring...' : 'Confirm Restore'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* 4. Inspect Version Payload Modal */}
      <Modal
        isOpen={versionInspectModalOpen}
        onClose={() => setVersionInspectModalOpen(false)}
        title={selectedVersion ? `Version Payload: v${selectedVersion.versionNumber}` : 'Version Payload'}
        maxWidth="700px"
      >
        {selectedVersion && (
          <div>
            <div style={{ marginBottom: 12, fontSize: 12, color: 'var(--text-secondary)' }}>
              Summary: <strong style={{ color: '#fff' }}>{selectedVersion.changeSummary}</strong> • Device: {selectedVersion.deviceName}
            </div>
            <pre
              style={{
                background: '#0d1117',
                border: '1px solid var(--border-color)',
                padding: 14,
                borderRadius: 8,
                fontSize: 11,
                color: '#7dd3fc',
                maxHeight: 400,
                overflow: 'auto',
              }}
            >
              {JSON.stringify(selectedVersion.snapshotData || selectedVersion, null, 2)}
            </pre>
          </div>
        )}
      </Modal>
    </div>
  );
};
