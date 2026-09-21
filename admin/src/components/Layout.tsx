import React from 'react';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

interface LayoutProps {
  currentPath: string;
  onNavigate: (path: string) => void;
  children: React.ReactNode;
  systemStatus?: string;
  onSearch?: (q: string) => void;
}

export const Layout: React.FC<LayoutProps> = ({
  currentPath,
  onNavigate,
  children,
  systemStatus,
  onSearch,
}) => {
  return (
    <div className="admin-layout">
      <Sidebar currentPath={currentPath} onNavigate={onNavigate} />
      <div className="admin-main">
        <Topbar onSearch={onSearch} systemStatus={systemStatus} />
        <main className="admin-container">{children}</main>
      </div>
    </div>
  );
};
