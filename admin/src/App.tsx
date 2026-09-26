import React, { useState, useEffect } from 'react';
import { useAuth } from './context/AuthContext';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { UsersPage } from './pages/UsersPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { MediaPage } from './pages/MediaPage';
import { JobsPage } from './pages/JobsPage';
import { AIJobsPage } from './pages/AIJobsPage';
import { RenderJobsPage } from './pages/RenderJobsPage';
import { CreditsPage } from './pages/CreditsPage';
import { SubscriptionsPage } from './pages/SubscriptionsPage';
import { CommentsPage } from './pages/CommentsPage';
import { AuditLogsPage } from './pages/AuditLogsPage';
import { SystemHealthPage } from './pages/SystemHealthPage';
import { SettingsPage } from './pages/SettingsPage';

export const App: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();
  
  const getPath = () => {
    const hash = window.location.hash.replace(/^#/, '');
    if (hash) return hash.startsWith('/') ? hash : `/${hash}`;
    const pathname = window.location.pathname.replace(/^\/admin/, '');
    const clean = pathname.replace(/\/$/, '');
    return clean.startsWith('/') ? clean : `/${clean || 'dashboard'}`;
  };

  const [currentPath, setCurrentPath] = useState<string>(getPath);

  useEffect(() => {
    const onLocationChange = () => {
      setCurrentPath(getPath());
    };
    window.addEventListener('hashchange', onLocationChange);
    window.addEventListener('popstate', onLocationChange);
    return () => {
      window.removeEventListener('hashchange', onLocationChange);
      window.removeEventListener('popstate', onLocationChange);
    };
  }, []);

  const navigate = (path: string) => {
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    window.location.hash = `#${cleanPath}`;
    setCurrentPath(cleanPath);
  };

  if (isLoading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#0a0d14',
          color: '#fff',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div className="loading-spinner" style={{ width: 32, height: 32 }} />
          <div style={{ marginTop: 16, fontSize: 14, color: 'var(--text-secondary)' }}>
            Initializing Enterprise Security Console...
          </div>
        </div>
      </div>
    );
  }

  // If not authenticated, render login page
  if (!isAuthenticated) {
    return <LoginPage />;
  }

  // Render current authenticated page
  const renderContent = () => {
    switch (currentPath) {
      case '/':
      case '/login':
      case '/dashboard':
        return <DashboardPage onNavigate={navigate} />;
      case '/users':
        return <UsersPage />;
      case '/projects':
        return <ProjectsPage />;
      case '/media':
        return <MediaPage />;
      case '/jobs':
        return <JobsPage />;
      case '/ai':
        return <AIJobsPage />;
      case '/render':
        return <RenderJobsPage />;
      case '/credits':
        return <CreditsPage />;
      case '/subscriptions':
        return <SubscriptionsPage />;
      case '/comments':
        return <CommentsPage />;
      case '/audit-logs':
        return <AuditLogsPage />;
      case '/system':
        return <SystemHealthPage />;
      case '/settings':
        return <SettingsPage />;
      default:
        return <DashboardPage onNavigate={navigate} />;
    }
  };

  return (
    <Layout currentPath={currentPath} onNavigate={navigate}>
      {renderContent()}
    </Layout>
  );
};
