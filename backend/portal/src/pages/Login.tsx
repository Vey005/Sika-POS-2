import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth';
import { Building2, CheckCircle2, ChevronRight, Eye, EyeOff, Lock, Mail, UserPlus } from 'lucide-react';
import { getApiUrl, API_CONFIG } from '../config/api';
import { switchOwnerStore } from '../utils/ownerApi';

type LoginMode = 'store' | 'owner' | 'register';

export default function Login() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<LoginMode>('store');
  const [storeName, setStoreName] = useState('');
  const [email, setEmail] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [successModal, setSuccessModal] = useState<string | null>(null);

  const { login, setOwnerSession, setBusinessSession } = useAuthStore();

  const handleStoreLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch(getApiUrl(API_CONFIG.ENDPOINTS.LOGIN), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeName, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Login failed');
      if (data.role === 'admin') {
        login('admin', undefined, undefined, data.token, undefined, data.name);
        navigate('/admin', { replace: true });
      } else {
        login(
          'business',
          data.businessId,
          data.businessName,
          data.token,
          data.businessLogo,
          data.userName,
          data.businessAddress,
          data.businessPhone
        );
        navigate('/reports', { replace: true });
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleOwnerLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch(getApiUrl(API_CONFIG.ENDPOINTS.OWNER_LOGIN), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Login failed');
      const stores = data.stores || [];
      setOwnerSession(data.token, data.ownerName, stores);
      if (stores.length === 1) {
        const switched = await switchOwnerStore(stores[0].businessId, data.token);
        setBusinessSession({
          token: switched.token,
          businessId: switched.businessId,
          businessName: switched.businessName,
          businessLogo: switched.businessLogo,
          businessAddress: switched.businessAddress,
          businessPhone: switched.businessPhone,
          userName: switched.userName,
        });
        navigate('/reports', { replace: true });
      } else {
        navigate('/owner/stores', { replace: true });
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch(getApiUrl(API_CONFIG.ENDPOINTS.OWNER_REGISTER), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name: ownerName || email.split('@')[0] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Registration failed');
      setMode('owner');
      setSuccessModal('Account created. Sign in, then link each store with its license key and admin PIN.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const onSubmit =
    mode === 'store' ? handleStoreLogin : mode === 'owner' ? handleOwnerLogin : handleRegister;

  return (
    <div className="login-page">
      {/* Premium animated background glows */}
      <div className="login-bg-glow login-bg-glow-1" />
      <div className="login-bg-glow login-bg-glow-2" />

      <div className="animate-fade-in login-glass-card">
        <div style={{ textAlign: 'center', marginBottom: 32, position: 'relative' }}>
          <div className="login-logo-circle">
            <span style={{ fontSize: 32, color: 'var(--primary)', fontWeight: 700 }}>₵</span>
          </div>
          <h1 style={{ fontSize: 28, marginBottom: 8, letterSpacing: '-0.02em' }}>
            SikaPOS <span className="gradient-text">Cloud</span>
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 15 }}>Remote management & analytics portal</p>
        </div>

        <div className="login-tabs">
          <TabButton active={mode === 'store'} onClick={() => { setMode('store'); setError(''); }}>
            Single store
          </TabButton>
          <TabButton active={mode === 'owner' || mode === 'register'} onClick={() => { setMode('owner'); setError(''); }}>
            Multi-store
          </TabButton>
        </div>

        <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {mode === 'store' && (
            <div className="animate-fade-in">
              <InputRow
                label="Store name"
                icon={<Building2 size={18} />}
                value={storeName}
                onChange={setStoreName}
                placeholder="Your shop name (from SikaPOS)"
              />
            </div>
          )}

          {(mode === 'owner' || mode === 'register') && (
            <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {mode === 'register' && (
                <InputRow
                  label="Your name"
                  icon={<UserPlus size={18} />}
                  value={ownerName}
                  onChange={setOwnerName}
                  placeholder="Full name"
                />
              )}
              <InputRow
                label="Email"
                icon={<Mail size={18} />}
                value={email}
                onChange={setEmail}
                placeholder="owner@example.com"
                type="email"
              />
            </div>
          )}

          <div className="animate-fade-in">
            <InputRow
              label="Password"
              icon={<Lock size={18} />}
              value={password}
              onChange={setPassword}
              placeholder="••••••••"
              type={showPassword ? 'text' : 'password'}
              showToggle
              onToggleVisibility={() => setShowPassword(!showPassword)}
              isVisible={showPassword}
            />
          </div>

          {mode === 'owner' && (
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
              For owners with multiple shops. After sign-in, link each store with its license key and admin PIN.
            </p>
          )}

          {error && (
            <div
              style={{
                padding: '12px 16px',
                background: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                borderRadius: '10px',
                color: 'var(--danger)',
                fontSize: 14,
                fontWeight: 500
              }}
            >
              {error}
            </div>
          )}

          <button type="submit" className="login-submit-btn" disabled={loading}>
            {loading ? (
              <div className="license-spinner" style={{ width: 18, height: 18, borderWidth: '2px', borderTopColor: '#000', margin: 0 }} />
            ) : mode === 'register' ? 'Create account' : 'Sign in'}
            {!loading && <ChevronRight size={18} />}
          </button>
        </form>

        {mode === 'owner' && (
          <p style={{ marginTop: 20, textAlign: 'center', fontSize: 13, color: 'var(--text-secondary)' }}>
            New owner?{' '}
            <button
              type="button"
              style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', textDecoration: 'underline', fontWeight: 600 }}
              onClick={() => { setMode('register'); setError(''); }}
            >
              Create account
            </button>
          </p>
        )}
        {mode === 'register' && (
          <p style={{ marginTop: 20, textAlign: 'center', fontSize: 13, color: 'var(--text-secondary)' }}>
            Already registered?{' '}
            <button
              type="button"
              style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', textDecoration: 'underline', fontWeight: 600 }}
              onClick={() => { setMode('owner'); setError(''); }}
            >
              Sign in
            </button>
          </p>
        )}

        <div style={{ marginTop: 28, textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', fontWeight: 500, letterSpacing: '0.3px' }}>
          Powered by DanniTech Solutions
        </div>
      </div>

      {successModal && (
        <div className="modal-overlay animate-fade-in" style={{ zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="login-glass-card modal-panel" style={{ textAlign: 'center', padding: '32px 24px', maxWidth: 380, width: '90%' }}>
            <div className="login-logo-circle" style={{ width: 64, height: 64, borderRadius: '50%', border: '2.5px solid var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
              <CheckCircle2 size={28} color="var(--primary)" />
            </div>
            <h2 style={{ fontSize: 20, marginBottom: 12, fontWeight: 700 }}>Registration Successful!</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6, marginBottom: 24, textAlign: 'center' }}>
              {successModal}
            </p>
            <button
              type="button"
              className="btn-primary ripple"
              style={{ width: '100%', minHeight: 48 }}
              onClick={() => setSuccessModal(null)}
            >
              Continue to Login
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`login-tab-btn ${active ? 'active' : ''}`}
    >
      {children}
    </button>
  );
}

function InputRow({
  label,
  icon,
  value,
  onChange,
  placeholder,
  type = 'text',
  showToggle,
  onToggleVisibility,
  isVisible,
}: {
  label: string;
  icon: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  type?: string;
  showToggle?: boolean;
  onToggleVisibility?: () => void;
  isVisible?: boolean;
}) {
  return (
    <div className="login-input-group">
      <label>{label}</label>
      <div className="login-input-wrapper">
        <span className="login-input-icon">{icon}</span>
        <input
          type={type}
          className="login-input-field"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required
          style={showToggle ? { paddingRight: 48 } : undefined}
        />
        {showToggle && (
          <button
            type="button"
            onClick={onToggleVisibility}
            className="login-password-toggle"
            aria-label={isVisible ? 'Hide password' : 'Show password'}
          >
            {isVisible ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        )}
      </div>
    </div>
  );
}

