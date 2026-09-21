import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { AdminMediaView } from '../types/admin';
import { DataTable, Column } from '../components/DataTable';
import { StatusBadge } from '../components/StatusBadge';
import { Film, Music, Image as ImageIcon, File, RefreshCw, Eye } from 'lucide-react';
import { Modal } from '../components/Modal';

export const MediaPage: React.FC = () => {
  const [media, setMedia] = useState<AdminMediaView[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedMedia, setSelectedMedia] = useState<AdminMediaView | null>(null);

  const loadMedia = async () => {
    setIsLoading(true);
    try {
      const data = await api.getMedia();
      setMedia(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadMedia();
  }, []);

  const formatSize = (bytes: number): string => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

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

  const columns: Column<AdminMediaView>[] = [
    {
      key: 'fileName',
      header: 'Media File',
      render: (m) => (
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
            }}
          >
            {getCategoryIcon(m.category)}
          </div>
          <div>
            <div style={{ fontWeight: 600, color: '#fff' }}>{m.fileName}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>MIME: {m.mimeType}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      render: (m) => (
        <span
          className="badge badge-queued"
          style={{ textTransform: 'uppercase', fontSize: 10 }}
        >
          {m.category}
        </span>
      ),
    },
    {
      key: 'fileSizeBytes',
      header: 'File Size',
      render: (m) => <span style={{ fontWeight: 600 }}>{formatSize(m.fileSizeBytes)}</span>,
    },
    {
      key: 'durationSeconds',
      header: 'Duration',
      render: (m) => (
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          {m.durationSeconds ? `${m.durationSeconds.toFixed(1)}s` : '-'}
        </span>
      ),
    },
    {
      key: 'dimensions',
      header: 'Dimensions',
      render: (m) => (
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {m.width && m.height ? `${m.width} × ${m.height}` : '-'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (m) => <StatusBadge status={m.status} />,
    },
    {
      key: 'createdAt',
      header: 'Uploaded',
      render: (m) => (
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {new Date(m.createdAt).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (m) => (
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => setSelectedMedia(m)}
          title="Inspect Media"
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
            <Film size={26} />
            Media Storage & Asset Catalog
          </h1>
          <p className="page-subtitle">
            Ingested videos, audios, and images processed via FFprobe/FFmpeg background pipeline.
          </p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={loadMedia} disabled={isLoading}>
          <RefreshCw size={14} className={isLoading ? 'pulse' : ''} />
          <span>Refresh Media</span>
        </button>
      </div>

      <div className="card">
        <DataTable
          columns={columns}
          data={media}
          isLoading={isLoading}
          searchPlaceholder="Search media by filename, MIME, category, or owner..."
          searchFilter={(m, q) =>
            m.fileName.toLowerCase().includes(q.toLowerCase()) ||
            m.mimeType.toLowerCase().includes(q.toLowerCase()) ||
            m.category.toLowerCase().includes(q.toLowerCase()) ||
            m.userId.toLowerCase().includes(q.toLowerCase())
          }
        />
      </div>

      {/* Media Inspection Modal */}
      <Modal
        isOpen={Boolean(selectedMedia)}
        onClose={() => setSelectedMedia(null)}
        title={`Asset Details: ${selectedMedia?.fileName}`}
        footer={
          <button className="btn btn-secondary" onClick={() => setSelectedMedia(null)}>
            Close
          </button>
        }
      >
        {selectedMedia && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>MEDIA ASSET ID</div>
              <code style={{ fontSize: 13, color: '#fff' }}>{selectedMedia.id}</code>
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>UPLOADER USER ID</div>
              <code style={{ fontSize: 13, color: '#fff' }}>{selectedMedia.userId}</code>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>CATEGORY / MIME</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>
                  {selectedMedia.category.toUpperCase()} ({selectedMedia.mimeType})
                </div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>SIZE ON DISK</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>
                  {formatSize(selectedMedia.fileSizeBytes)}
                </div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>RESOLUTION</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>
                  {selectedMedia.width && selectedMedia.height ? `${selectedMedia.width} × ${selectedMedia.height}` : 'N/A'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>DURATION</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>
                  {selectedMedia.durationSeconds ? `${selectedMedia.durationSeconds.toFixed(2)}s` : 'N/A'}
                </div>
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>PIPELINE STATUS</div>
              <div style={{ marginTop: 4 }}>
                <StatusBadge status={selectedMedia.status} />
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
