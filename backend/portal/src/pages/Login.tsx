import { useState } from 'react';
import { useAuthStore } from '../store/auth';
import { Building2, ChevronRight, Lock } from 'lucide-react';
import { getApiUrl, API_CONFIG } from '../config/api';

export default function Login() {
  const [storeName, setStoreName] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const { login } = useAuthStore();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch(getApiUrl(API_CONFIG.ENDPOINTS.LOGIN), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeName, password })
      });
      
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || 'Login failed');
      
      if (data.role === 'admin') {
        login('admin', undefined, undefined, data.token);
      } else {
        login('business', data.businessId, data.businessName, data.token, data.businessLogo);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div className="glass-panel animate-fade-in" style={{ width: '100%', maxWidth: '440px', padding: '40px', position: 'relative', overflow: 'hidden' }}>
        
        {/* Decorative elements */}
        <div style={{ position: 'absolute', top: '-50px', right: '-50px', width: '150px', height: '150px', background: 'var(--primary-glow)', filter: 'blur(40px)', borderRadius: '50%' }} />
        
        <div style={{ textAlign: 'center', marginBottom: '32px', position: 'relative' }}>
          <div style={{ 
            width: '64px', height: '64px', borderRadius: '16px', 
            background: 'linear-gradient(135deg, rgba(139,92,246,0.2) 0%, rgba(212,160,23,0.1) 100%)',
            border: '1px solid var(--border-light)', margin: '0 auto 16px',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <span style={{ fontSize: '28px', color: 'var(--secondary)' }}>₵</span>
          </div>
          <h1 style={{ fontSize: '24px', marginBottom: '8px' }}>SikaPOS <span className="gradient-text">Cloud</span></h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '15px' }}>Remote management & analytics portal</p>
        </div>

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--text-muted)' }}>Store Name / Admin Email</label>
            <div style={{ position: 'relative' }}>
              <Building2 size={18} style={{ position: 'absolute', left: '16px', top: '16px', color: 'var(--text-muted)' }} />
              <input 
                type="text" 
                className="input-field" 
                style={{ paddingLeft: '44px' }}
                placeholder="Your Shop Name or Email"
                value={storeName}
                onChange={e => setStoreName(e.target.value)}
                required
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--text-muted)' }}>PIN / Password</label>
            <div style={{ position: 'relative' }}>
              <Lock size={18} style={{ position: 'absolute', left: '16px', top: '16px', color: 'var(--text-muted)' }} />
              <input 
                type="password" 
                className="input-field" 
                style={{ paddingLeft: '44px' }}
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
            </div>
          </div>

          {error && (
            <div style={{ padding: '12px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: 'var(--radius-sm)', color: 'var(--danger)', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              {error}
            </div>
          )}

          <button type="submit" className="btn-primary" style={{ width: '100%', marginTop: '8px' }} disabled={loading}>
            {loading ? 'Authenticating...' : 'Sign In'}
            {!loading && <ChevronRight size={18} />}
          </button>
        </form>

        <div style={{ marginTop: '24px', textAlign: 'center', fontSize: '13px', color: 'var(--text-muted)' }}>
          Powered by DanniTech Solutions
        </div>
      </div>
    </div>
  );
}
