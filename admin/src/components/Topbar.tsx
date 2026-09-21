import React from 'react';
import { Search, LogOut, Bell, Shield, Radio } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface TopbarProps {
  onSearch?: (query: string) => void;
  systemStatus?: string;
}

export const Topbar: React.FC<TopbarProps> = ({ onSearch, systemStatus = 'HEALTHY' }) => {
  const { user, logout } = useAuth();

  return (
    <header className="admin-topbar">
      {/* Search Input */}
      <div className="search-bar">
        <Search size={16} color="var(--text-muted)" />
        <input
          type="text"
          placeholder="Search users, projects, jobs, logs..."
          onChange={(e) => onSearch && onSearch(e.target.value)}
        />
      </div>

      {/* Topbar Right Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        {/* Environment Pill */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: 'rgba(255, 255, 255, 0.04)',
            padding: '4px 12px',
            borderRadius: 8,
            border: '1px solid var(--border-subtle)',
            fontSize: 12,
            color: 'var(--text-secondary)',
          }}
        >
          <Radio size={14} color="var(--info)" />
          <span style={{ fontWeight: 600, color: '#fff' }}>LOCAL CLUSTER</span>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>:4000</span>
        </div>

        {/* System Health Indicator */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
            fontWeight: 600,
            color: systemStatus === 'HEALTHY' ? 'var(--success)' : 'var(--warning)',
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: systemStatus === 'HEALTHY' ? 'var(--success)' : 'var(--warning)',
              boxShadow: `0 0 8px ${systemStatus === 'HEALTHY' ? 'rgba(16, 185, 129, 0.6)' : 'rgba(245, 158, 11, 0.6)'}`,
            }}
          />
          <span>{systemStatus}</span>
        </div>

        {/* Divider */}
        <div style={{ width: 1, height: 24, background: 'var(--border-subtle)' }} />

        {/* Current Admin User Profile */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #4f46e5 0%, #06b6d4 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: 14,
              color: '#fff',
            }}
          >
            {user?.displayName ? user.displayName[0].toUpperCase() : 'A'}
          </div>
          <div style={{ lineHeight: 1.2 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>
              {user?.displayName || 'Administrator'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{user?.email || 'admin@techxayan.com'}</div>
          </div>
          <span className="badge badge-purple" style={{ fontSize: 10, padding: '2px 8px' }}>
            <Shield size={10} />
            {user?.role || 'SUPERADMIN'}
          </span>
        </div>

        {/* Logout Button */}
        <button
          className="btn btn-secondary btn-sm"
          onClick={logout}
          title="Sign out of Admin Console"
          style={{ padding: '7px 12px' }}
        >
          <LogOut size={15} />
          <span>Logout</span>
        </button>
      </div>
    </header>
  );
};
