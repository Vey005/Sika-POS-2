import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/auth';
import { CLOUD_SERVER_URL } from '../../config';
import { formatErrorMsg } from '../../utils/errorFormatter';
import styles from './Login.module.css';

export default function ActivationScreen() {
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const { setActivated, setBusinessInfo, setBusinessLogo, setSetupComplete } = useAuthStore();
  const navigate = useNavigate();

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (key.length < 10) {
      setError('Please enter a valid license key');
      return;
    }

    setLoading(true);
    setError('');
    setStatus('Validating license key...');

    try {
      const machineId = window.sikapos?.machineId || 'PC-' + Math.random().toString(36).substring(7).toUpperCase();

      // ── OFFLINE DEMO BYPASS — DEV BUILDS ONLY ──
      // Available only when running `vite dev` (import.meta.env.DEV).
      // Never accept demo keys in a packaged production build.
      if (import.meta.env.DEV && key.startsWith('SIKA-DEMO')) {
        setStatus('Dev demo key accepted. Activating...');
        if (window.sikapos?.secureStore) {
          await window.sikapos.secureStore.set('license_key', key);
          await window.sikapos.secureStore.set('is_activated', 'true');
          await window.sikapos.secureStore.set('business_name', 'SikaPOS Demo Shop');
        }
        setActivated(true);
        setStatus('Welcome! Let\'s set up your business...');
        await new Promise(r => setTimeout(r, 800));
        navigate('/setup', { replace: true });
        return;
      }

      // Get machine name (computer name)
      const machineName = window.sikapos?.machineName || 'Unknown PC';

      const response = await fetch(`${CLOUD_SERVER_URL}/v1/licenses/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ license_key: key, machine_id: machineId, machine_name: machineName })
      });

      const data = await response.json();

      if (!data.success) {
        setError(formatErrorMsg(data.message, 'Activation failed'));
        setStatus('');
        setLoading(false);
        return;
      }

      // Save activation and profile to secure storage
      if (window.sikapos?.secureStore) {
        await window.sikapos.secureStore.set('license_key', key);
        await window.sikapos.secureStore.set('is_activated', 'true');
        if (data.business_name) await window.sikapos.secureStore.set('business_name', data.business_name);
        if (data.business_address) await window.sikapos.secureStore.set('business_address', data.business_address);
        if (data.business_phone) await window.sikapos.secureStore.set('business_phone', data.business_phone);
        if (data.business_logo) await window.sikapos.secureStore.set('business_logo', data.business_logo);
      }

      setActivated(true);

      // If this license key is already associated with a business in the cloud,
      // skip setup and go straight to login.
      const hasBusinessProfile =
        typeof data.business_name === 'string' && data.business_name.trim().length > 0;

      if (hasBusinessProfile) {
        setStatus('Welcome back! Loading your account...');
        setSetupComplete(true);
        try {
          await window.sikapos?.secureStore.set('setup_complete', 'true');
        } catch {}

        // Best-effort: restore cloud data in the background (do not block login).
        try {
          window.sikapos?.sync?.restore();
        } catch {}

        if (data.business_name) setBusinessInfo(data.business_name);
        if (data.business_logo) setBusinessLogo(data.business_logo);

        await new Promise(r => setTimeout(r, 500));
        navigate('/login', { replace: true });
        return;
      }

      // ── FIRST TIME: New customer → go to business setup ──
      setStatus('Welcome! Let\'s set up your business...');
      await new Promise(r => setTimeout(r, 800));
      navigate('/setup', { replace: true });

    } catch (err) {
      setError(formatErrorMsg(err, 'Could not connect to activation server'));
      setStatus('');
    } finally {
      setLoading(false);
    }
  };

  const handleExit = () => {
    if (window.sikapos?.window?.confirmClose) {
      window.sikapos.window.confirmClose();
    } else {
      window.close();
    }
  };

  return (
    <div className={styles.container}>
      <button className={styles.exitBtn} onClick={handleExit} title="Close Application">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
      
      <div className={styles.loginCard} style={{ width: '400px' }}>
        <div className={styles.header}>
          <div className={styles.logoRing}>
            <span className={styles.cedi}>₵</span>
          </div>
          <h1 className={styles.title}>SikaPOS</h1>
          <p className={styles.subtitle}>Product Activation</p>
        </div>

        <form className={styles.form} onSubmit={handleActivate}>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '13px', textAlign: 'center', marginBottom: '24px' }}>
            Enter your license key to get started.
          </p>

          <div className={styles.inputGroup}>
            <label>License Key</label>
            <input
              type="text"
              placeholder="SIKA-XXXX-XXXX-XXXX"
              value={key}
              onChange={(e) => setKey(e.target.value.toUpperCase())}
              required
              disabled={loading}
              style={{ textAlign: 'center', letterSpacing: '2px', fontFamily: 'monospace' }}
            />
          </div>

          {error && <p className={styles.error} style={{ textAlign: 'center' }}>{error}</p>}

          {status && (
            <p style={{
              textAlign: 'center', fontSize: '12px', color: 'var(--color-gold)',
              padding: '8px', background: 'rgba(212,160,23,0.08)', borderRadius: 'var(--radius-md)',
            }}>
              {status}
            </p>
          )}

          <button type="submit" className={styles.loginButton} disabled={loading} style={{ marginTop: '16px' }}>
            {loading ? 'Please wait...' : 'Activate Now'}
          </button>
        </form>

        <div className={styles.footer} style={{ marginTop: '24px' }}>
          <p style={{ margin: '0 0 8px 0' }}>Don't have a key? Contact DanniTech Solution</p>
          <p style={{ margin: 0, fontWeight: 600, color: 'var(--color-gold)' }}>0548470413 / 0599008533</p>
        </div>
      </div>
    </div>
  );
}
