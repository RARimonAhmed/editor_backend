import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { AdminCommentView } from '../types/admin';
import { DataTable, Column } from '../components/DataTable';
import { MessageSquare, RefreshCw, Clock, Layers } from 'lucide-react';

export const CommentsPage: React.FC = () => {
  const [comments, setComments] = useState<AdminCommentView[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadComments = async () => {
    setIsLoading(true);
    try {
      const data = await api.getComments();
      setComments(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadComments();
  }, []);

  const formatTimecode = (seconds?: number) => {
    if (seconds === undefined || seconds === null) return '-';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const frames = Math.floor((seconds % 1) * 30);
    return `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}:${frames < 10 ? '0' : ''}${frames}`;
  };

  const columns: Column<AdminCommentView>[] = [
    {
      key: 'text',
      header: 'Comment Review Message',
      render: (c) => (
        <div>
          <div style={{ fontWeight: 600, color: '#fff', fontSize: 13 }}>{c.text}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
            Project: <code>{c.projectId}</code>
          </div>
        </div>
      ),
    },
    {
      key: 'authorName',
      header: 'Author / Editor',
      render: (c) => (
        <div>
          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{c.authorName}</div>
          <code style={{ fontSize: 10, color: 'var(--text-muted)' }}>{c.userId.slice(0, 10)}...</code>
        </div>
      ),
    },
    {
      key: 'timecodeSeconds',
      header: 'Timeline Offset',
      render: (c) => (
        <span
          className="badge badge-queued font-mono"
          style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}
        >
          <Clock size={11} />
          {formatTimecode(c.timecodeSeconds)}
        </span>
      ),
    },
    {
      key: 'trackId',
      header: 'Target Track',
      render: (c) => (
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          {c.trackId ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Layers size={12} color="var(--primary)" />
              {c.trackId}
            </span>
          ) : (
            'Global Canvas'
          )}
        </span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Timestamp',
      render: (c) => (
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {new Date(c.createdAt).toLocaleString()}
        </span>
      ),
    },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <MessageSquare size={26} />
            Real-Time Collaboration Comments
          </h1>
          <p className="page-subtitle">
            Timeline timecode markers, client feedback annotations, and project review threads.
          </p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={loadComments} disabled={isLoading}>
          <RefreshCw size={14} className={isLoading ? 'pulse' : ''} />
          <span>Refresh Comments</span>
        </button>
      </div>

      <div className="card">
        <DataTable
          columns={columns}
          data={comments}
          isLoading={isLoading}
          searchPlaceholder="Search comments, author, project..."
          searchFilter={(c, q) =>
            c.text.toLowerCase().includes(q.toLowerCase()) ||
            c.authorName.toLowerCase().includes(q.toLowerCase()) ||
            c.projectId.toLowerCase().includes(q.toLowerCase())
          }
        />
      </div>
    </div>
  );
};
