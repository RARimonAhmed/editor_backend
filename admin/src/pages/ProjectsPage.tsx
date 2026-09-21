import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { AdminProjectView } from '../types/admin';
import { DataTable, Column } from '../components/DataTable';
import { FolderGit2, RefreshCw, Eye, Film, Clock } from 'lucide-react';
import { Modal } from '../components/Modal';

export const ProjectsPage: React.FC = () => {
  const [projects, setProjects] = useState<AdminProjectView[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedProject, setSelectedProject] = useState<AdminProjectView | null>(null);

  const loadProjects = async () => {
    setIsLoading(true);
    try {
      const data = await api.getProjects();
      setProjects(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadProjects();
  }, []);

  const formatDuration = (seconds: number) => {
    if (!seconds) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const columns: Column<AdminProjectView>[] = [
    {
      key: 'title',
      header: 'Project Title',
      render: (p) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: 'rgba(99, 102, 241, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#818cf8',
            }}
          >
            <FolderGit2 size={16} />
          </div>
          <div>
            <div style={{ fontWeight: 600, color: '#fff' }}>{p.title}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>ID: {p.id.slice(0, 12)}...</div>
          </div>
        </div>
      ),
    },
    {
      key: 'userId',
      header: 'Project Owner',
      render: (p) => <code style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{p.userId}</code>,
    },
    {
      key: 'resolution',
      header: 'Canvas Resolution',
      render: (p) => (
        <span style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0' }}>
          {p.width} × {p.height} ({p.fps} fps)
        </span>
      ),
    },
    {
      key: 'durationSeconds',
      header: 'Timeline Duration',
      render: (p) => (
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
          <Clock size={12} color="var(--text-muted)" />
          {formatDuration(p.durationSeconds)}
        </span>
      ),
    },
    {
      key: 'tracksCount',
      header: 'Tracks',
      render: (p) => (
        <span className="badge badge-queued" style={{ fontSize: 11 }}>
          {p.tracksCount} tracks
        </span>
      ),
    },
    {
      key: 'updatedAt',
      header: 'Last Modified',
      render: (p) => (
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {new Date(p.updatedAt).toLocaleString()}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (p) => (
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => setSelectedProject(p)}
          title="Inspect Project Details"
        >
          <Eye size={13} />
          <span>Inspect</span>
        </button>
      ),
    },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <FolderGit2 size={26} />
            Editor Projects & Timelines
          </h1>
          <p className="page-subtitle">
            Inspect customer project tracks, canvas aspect ratios, durations, and multi-track metadata.
          </p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={loadProjects} disabled={isLoading}>
          <RefreshCw size={14} className={isLoading ? 'pulse' : ''} />
          <span>Refresh Projects</span>
        </button>
      </div>

      <div className="card">
        <DataTable
          columns={columns}
          data={projects}
          isLoading={isLoading}
          searchPlaceholder="Search projects by title or owner..."
          searchFilter={(p, q) =>
            p.title.toLowerCase().includes(q.toLowerCase()) ||
            p.userId.toLowerCase().includes(q.toLowerCase()) ||
            p.id.toLowerCase().includes(q.toLowerCase())
          }
        />
      </div>

      {/* Project Inspector Modal */}
      <Modal
        isOpen={Boolean(selectedProject)}
        onClose={() => setSelectedProject(null)}
        title={`Project Details: ${selectedProject?.title}`}
        footer={
          <button className="btn btn-secondary" onClick={() => setSelectedProject(null)}>
            Close
          </button>
        }
      >
        {selectedProject && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>PROJECT ID</div>
              <code style={{ fontSize: 13, color: '#fff' }}>{selectedProject.id}</code>
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>OWNER ID</div>
              <code style={{ fontSize: 13, color: '#fff' }}>{selectedProject.userId}</code>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>RESOLUTION</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>
                  {selectedProject.width} × {selectedProject.height}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>FRAME RATE</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>
                  {selectedProject.fps} FPS
                </div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>DURATION</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>
                  {formatDuration(selectedProject.durationSeconds)} ({selectedProject.durationSeconds}s)
                </div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>AUDIO & VIDEO TRACKS</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>
                  {selectedProject.tracksCount} tracks active
                </div>
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>CREATED TIMESTAMP</div>
              <div style={{ fontSize: 13, color: '#fff' }}>{new Date(selectedProject.createdAt).toISOString()}</div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
