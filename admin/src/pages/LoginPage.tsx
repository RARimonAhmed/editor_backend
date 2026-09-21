import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Shield, Key, Mail, Lock, Layers, AlertCircle, ArrowRight } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const [activeTab, setActiveTab] = useState<'credentials' | 'key'>('credentials');
  const [email, setEmail] = useState('admin@techxayan.com');
  const [password, setPassword] = useState('Admin123!');
  const [adminKey, setAdminKey] = useState('adm_super_secret_production_key_32bytes');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      if (activeTab === 'credentials') {
        await login({ email, password });
      } else {
        await login({ adminKey });
      }
      window.location.hash = '#/dashboard';
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#0a0d14',
        padding: '24px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Glow background effects */}
      <div
        style={{
          position: 'absolute',
          top: '20%',
          left: '30%',
          width: 500,
          height: 500,
          background: 'radial-gradient(circle, rgba(99, 102, 241, 0.15) 0%, rgba(0, 0, 0, 0) 70%)',
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: '10%',
          right: '25%',
          width: 450,
          height: 450,
          background: 'radial-gradient(circle, rgba(168, 85, 247, 0.12) 0%, rgba(0, 0, 0, 0) 70%)',
          pointerEvents: 'none',
        }}
      />

      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: 440,
          padding: '40px 36px',
          background: 'rgba(19, 25, 41, 0.85)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          boxShadow: '0 20px 40px -10px rgba(0, 0, 0, 0.6), 0 0 30px -5px rgba(99, 102, 241, 0.2)',
          zIndex: 10,
        }}
      >
        {/* Logo and Brand */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div
            style={{
              width: 52,
              height: 52,
              margin: '0 auto 16px',
              borderRadius: 14,
              background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 8px 20px rgba(99, 102, 241, 0.4)',
            }}
          >
            <Layers size={28} color="#fff" />
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em', marginBottom: 6 }}>
            my_editor Console
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Enterprise Cloud Administration & Orchestration
          </p>
        </div>

        {/* Tab Selector */}
        <div
          style={{
            display: 'flex',
            background: 'var(--bg-input)',
            padding: 4,
            borderRadius: 10,
            marginBottom: 24,
            border: '1px solid var(--border-subtle)',
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab('credentials')}
            style={{
              flex: 1,
              padding: '8px 12px',
              fontSize: 13,
              fontWeight: 600,
              borderRadius: 8,
              border: 'none',
              background: activeTab === 'credentials' ? 'var(--primary)' : 'transparent',
              color: activeTab === 'credentials' ? '#fff' : 'var(--text-secondary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              transition: 'all 0.2s',
            }}
          >
            <Mail size={14} />
            Administrator
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('key')}
            style={{
              flex: 1,
              padding: '8px 12px',
              fontSize: 13,
              fontWeight: 600,
              borderRadius: 8,
              border: 'none',
              background: activeTab === 'key' ? 'var(--primary)' : 'transparent',
              color: activeTab === 'key' ? '#fff' : 'var(--text-secondary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              transition: 'all 0.2s',
            }}
          >
            <Key size={14} />
            Master API Key
          </button>
        </div>

        {/* Error Notice */}
        {error && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              background: 'var(--danger-bg)',
              color: 'var(--danger)',
              padding: '12px 16px',
              borderRadius: 8,
              fontSize: 13,
              marginBottom: 20,
              border: '1px solid rgba(239, 68, 68, 0.3)',
            }}
          >
            <AlertCircle size={18} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {activeTab === 'credentials' ? (
            <>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  Admin Email
                </label>
                <div style={{ position: 'relative' }}>
                  <Mail
                    size={16}
                    color="var(--text-muted)"
                    style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }}
                  />
                  <input
                    type="email"
                    required
                    className="form-input"
                    style={{ paddingLeft: 40 }}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@techxayan.com"
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  Password
                </label>
                <div style={{ position: 'relative' }}>
                  <Lock
                    size={16}
                    color="var(--text-muted)"
                    style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }}
                  />
                  <input
                    type="password"
                    required
                    className="form-input"
                    style={{ paddingLeft: 40 }}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                  />
                </div>
              </div>
            </>
          ) : (
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                Master Platform Security Key
              </label>
              <div style={{ position: 'relative' }}>
                <Key
                  size={16}
                  color="var(--text-muted)"
                  style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }}
                />
                <input
                  type="password"
                  required
                  className="form-input"
                  style={{ paddingLeft: 40 }}
                  value={adminKey}
                  onChange={(e) => setAdminKey(e.target.value)}
                  placeholder="adm_..."
                />
              </div>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                Configured in <code>ADMIN_API_KEY</code> environment variable.
              </p>
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            disabled={isLoading}
            style={{ width: '100%', padding: '12px', marginTop: 10, fontSize: 14 }}
          >
            {isLoading ? (
              <span className="loading-spinner" style={{ width: 18, height: 18 }} />
            ) : (
              <>
                <span>Authenticate Session</span>
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>

        {/* Security watermark */}
        <div
          style={{
            marginTop: 24,
            paddingTop: 18,
            borderTop: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            fontSize: 11,
            color: 'var(--text-muted)',
          }}
        >
          <Shield size={12} color="var(--success)" />
          <span>Protected by Enterprise RBAC & JWT Session Auth</span>
        </div>
      </div>
    </div>
  );
};
