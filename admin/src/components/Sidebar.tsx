import React from 'react';
import {
  LayoutDashboard,
  Users,
  FolderGit2,
  Film,
  Server,
  Sparkles,
  Video,
  Coins,
  CreditCard,
  MessageSquare,
  ShieldCheck,
  Activity,
  Settings,
  Layers,
} from 'lucide-react';

interface SidebarProps {
  currentPath: string;
  onNavigate: (path: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentPath, onNavigate }) => {
  const sections = [
    {
      title: 'Platform Core',
      links: [
        { label: 'Overview', path: '/dashboard', icon: LayoutDashboard },
        { label: 'Users & RBAC', path: '/users', icon: Users },
        { label: 'Projects & Timelines', path: '/projects', icon: FolderGit2 },
        { label: 'Media Assets', path: '/media', icon: Film },
      ],
    },
    {
      title: 'Processing Engine',
      links: [
        { label: 'Unified Jobs', path: '/jobs', icon: Server },
        { label: 'AI Multi-Modal', path: '/ai', icon: Sparkles },
        { label: 'Render & Export', path: '/render', icon: Video },
      ],
    },
    {
      title: 'Commerce & Collab',
      links: [
        { label: 'Credits & Wallets', path: '/credits', icon: Coins },
        { label: 'Subscriptions', path: '/subscriptions', icon: CreditCard },
        { label: 'Comments', path: '/comments', icon: MessageSquare },
      ],
    },
    {
      title: 'Infrastructure',
      links: [
        { label: 'Security Audit', path: '/audit-logs', icon: ShieldCheck },
        { label: 'System Health', path: '/system', icon: Activity },
        { label: 'Settings & Config', path: '/settings', icon: Settings },
      ],
    },
  ];

  return (
    <aside className="admin-sidebar">
      {/* Brand Header */}
      <div
        style={{
          padding: '24px 20px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <div
          style={{
            width: 38,
            height: 38,
            borderRadius: 10,
            background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(99, 102, 241, 0.4)',
          }}
        >
          <Layers size={22} color="#fff" />
        </div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.02em', color: '#fff', lineHeight: 1.2 }}>
            my_editor
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                background: 'rgba(99, 102, 241, 0.2)',
                color: '#818cf8',
                padding: '1px 6px',
                borderRadius: 4,
                border: '1px solid rgba(99, 102, 241, 0.3)',
              }}
            >
              Enterprise Admin
            </span>
          </div>
        </div>
      </div>

      {/* Navigation Links */}
      <nav style={{ flex: 1, overflowY: 'auto', padding: '12px 0' }}>
        {sections.map((sec, idx) => (
          <div key={idx} style={{ marginBottom: 10 }}>
            <div className="nav-section-title">{sec.title}</div>
            {sec.links.map((link) => {
              const Icon = link.icon;
              const isActive = currentPath === link.path || (link.path === '/dashboard' && (currentPath === '/' || currentPath === ''));
              return (
                <div
                  key={link.path}
                  className={`nav-link ${isActive ? 'active' : ''}`}
                  onClick={() => onNavigate(link.path)}
                >
                  <Icon size={18} opacity={isActive ? 1 : 0.7} />
                  <span>{link.label}</span>
                </div>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Version Tag */}
      <div
        style={{
          padding: '16px 20px',
          borderTop: '1px solid var(--border-subtle)',
          fontSize: 12,
          color: 'var(--text-muted)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span>Platform v1.0.0</span>
        <span style={{ color: 'var(--success)', display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--success)' }} />
          Online
        </span>
      </div>
    </aside>
  );
};
