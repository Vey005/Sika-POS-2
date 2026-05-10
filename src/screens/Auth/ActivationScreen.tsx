import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/auth';
import { CLOUD_SERVER_URL } from '../../config';
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
        setError(data.message || 'Activation failed');
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

      // Check if cloud has existing data (returning customer / recovery)
      setStatus('Checking for existing data...');
      try {
        const pullRes = await fetch(`${CLOUD_SERVER_URL}/v1/sync/pull?business_id=${encodeURIComponent(key)}`);
        const pullData = await pullRes.json();

        if (pullData.success && pullData.data && Object.keys(pullData.data).length > 0) {
          // ── RECOVERY: Returning customer ──
          setStatus('Found your data! Restoring everything...');
          await window.sikapos?.sync?.restore();

          if (data.business_name) setBusinessInfo(data.business_name);
          if (data.business_logo) setBusinessLogo(data.business_logo);

          // If we restored users, we can go to login. Otherwise setup Step 2.
          const hasUsers = pullData.data.users && pullData.data.users.length > 0;

          if (hasUsers) {
            setSetupComplete(true);
            await window.sikapos?.secureStore.set('setup_complete', 'true');
            setStatus('✅ All data restored!');
            await new Promise(r => setTimeout(r, 1500));
            navigate('/login', { replace: true });
          } else {
            setStatus('Profile restored. Please create an admin account.');
            await new Promise(r => setTimeout(r, 1000));
            navigate('/setup', { replace: true });
          }
          return;
        }
      } catch (err) {
        console.warn('Sync pull failed during activation:', err);
      }

      // ── FIRST TIME: New customer → go to business setup ──
      setStatus('Welcome! Let\'s set up your business...');
      await new Promise(r => setTimeout(r, 800));
      navigate('/setup', { replace: true });

    } catch (err) {
      setError('Could not connect to activation server');
      setStatus('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
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
          <p>Don't have a key? Contact DanniTech Solution</p>
        </div>
      </div>
    </div>
  );
}
