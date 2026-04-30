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
  const { setActivated, setBusinessInfo, setSetupComplete } = useAuthStore();
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
      
      // ── OFFLINE BYPASS FOR DEMO / SCHOOL PROJECT ──
      const demoKeys = ['SIKA-DEMO-2024', 'SIKA-20LY-2QE1-H1NR'];
      if (demoKeys.includes(key) || key.startsWith('SIKA-DEMO')) {
        setStatus('Offline demo key accepted. Activating...');
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

      // Save activation to secure storage
      if (window.sikapos?.secureStore) {
        await window.sikapos.secureStore.set('license_key', key);
        await window.sikapos.secureStore.set('is_activated', 'true');
        await window.sikapos.secureStore.set('business_name', data.business_name);
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
          setBusinessInfo(data.business_name);
          setSetupComplete(true);
          await window.sikapos?.secureStore.set('setup_complete', 'true');
          setStatus('✅ All data restored!');
          await new Promise(r => setTimeout(r, 1500));
          navigate('/login', { replace: true });
          return;
        }
      } catch {
        // Cloud unreachable — continue to fresh setup
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
