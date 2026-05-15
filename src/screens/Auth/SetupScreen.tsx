import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/auth';
import { CLOUD_SERVER_URL } from '../../config';
import { formatErrorMsg } from '../../utils/errorFormatter';
import styles from './Login.module.css';

export default function SetupScreen() {
  const [step, setStep] = useState<1 | 2>(1);
  const { setSetupComplete, setBusinessInfo, setBusinessLogo } = useAuthStore();
  const navigate = useNavigate();

  // Step 1: Business info
  const [businessName, setBusinessName] = useState('');
  const [businessAddress, setBusinessAddress] = useState('');
  const [businessPhone, setBusinessPhone] = useState('');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState('');

  // Step 2: Admin account
  const [adminName, setAdminName] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Pre-populate if data exists from activation
  useState(() => {
    const loadProfile = async () => {
      if (window.sikapos?.secureStore) {
        const name = await window.sikapos.secureStore.get('business_name');
        const addr = await window.sikapos.secureStore.get('business_address');
        const phone = await window.sikapos.secureStore.get('business_phone');
        const logo = await window.sikapos.secureStore.get('business_logo');

        if (name) {
          setBusinessName(name);
          if (addr) setBusinessAddress(addr);
          if (phone) setBusinessPhone(phone);
          if (logo) setLogoPreview(logo);
          
          // Auto-skip to Step 2 if name is already set (returning company)
          setStep(2);
        }
      }
    };
    loadProfile();
  });

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setLogoFile(file);
      const reader = new FileReader();
      reader.onload = (ev) => setLogoPreview(ev.target?.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleStep1 = () => {
    if (!businessName.trim()) {
      setError('Business name is required');
      return;
    }
    setError('');
    setStep(2);
  };

  const handleComplete = async () => {
    if (!adminName.trim()) {
      setError('Admin name is required');
      return;
    }
    if (adminPassword.length < 4) {
      setError('Password must be at least 4 characters');
      return;
    }
    if (adminPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // 1. Save business settings
      await window.sikapos?.settings.setBusiness({
        business_name: businessName,
        business_address: businessAddress,
        business_phone: businessPhone,
        cashier_name: adminName,
        receipt_footer: 'Thank you for your patronage!',
        tin: '',
      });

      // 2. Save logo if provided
      if (logoFile) {
        await new Promise<void>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = async (ev) => {
            try {
              const base64 = ev.target?.result as string;
              await window.sikapos?.secureStore.set('business_logo', base64);
              resolve();
            } catch (e) {
              reject(e);
            }
          };
          reader.onerror = () => reject(new Error('Failed to read logo file'));
          reader.readAsDataURL(logoFile);
        });
      }

      // 3. Create the admin user
      await window.sikapos?.users.save({
        name: adminName,
        password: adminPassword,
        role: 'admin',
      });

      // 4. Mark setup as complete
      await window.sikapos?.secureStore.set('setup_complete', 'true');

      // 5. Update business name in cloud so portal login works
      const licenseKey = await window.sikapos?.secureStore.get('license_key');
      if (licenseKey && !licenseKey.startsWith('SIKA-DEMO')) {
        try {
          await fetch(`${CLOUD_SERVER_URL}/v1/licenses/update-name`, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${licenseKey}`
            },
            body: JSON.stringify({ license_key: licenseKey, business_name: businessName })
          });
        } catch (e) {
          console.warn('[Setup] Failed to update cloud business name, portal login might be delayed.', e);
        }
      }

      setBusinessInfo(businessName);
      if (logoPreview) {
        setBusinessLogo(logoPreview);
      }
      setSetupComplete(true);
      navigate('/login', { replace: true });
    } catch (err: any) {
      setError(formatErrorMsg(err, 'Setup failed. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.loginCard} style={{ width: '460px', maxHeight: '90vh', overflow: 'auto' }}>
        <div className={styles.header}>
          <div className={styles.logoRing}>
            <span className={styles.cedi}>₵</span>
          </div>
          <h1 className={styles.title}>SikaPOS</h1>
          <p className={styles.subtitle}>
            {step === 1 ? 'Set Up Your Business' : 'Create Admin Account'}
          </p>
        </div>

        {/* Step Indicator */}
        <div style={{
          display: 'flex', justifyContent: 'center', gap: '8px',
          marginBottom: '24px',
        }}>
          <div style={{
            width: '40px', height: '4px', borderRadius: '2px',
            background: 'var(--color-gold)',
          }} />
          <div style={{
            width: '40px', height: '4px', borderRadius: '2px',
            background: step === 2 ? 'var(--color-gold)' : 'var(--color-border)',
            transition: 'background 0.3s',
          }} />
        </div>

        {step === 1 ? (
          /* ── Step 1: Business Info ── */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Logo Upload */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '8px' }}>
              <label style={{
                width: '80px', height: '80px', borderRadius: '50%',
                border: '2px dashed var(--color-border-strong)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', overflow: 'hidden',
                background: logoPreview ? 'none' : 'var(--color-elevated)',
                transition: 'border-color 0.2s',
              }}>
                {logoPreview ? (
                  <img src={logoPreview} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ textAlign: 'center' }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                      <circle cx="8.5" cy="8.5" r="1.5"/>
                      <polyline points="21 15 16 10 5 21"/>
                    </svg>
                    <p style={{ fontSize: '9px', color: 'var(--color-text-muted)', marginTop: '2px' }}>Logo</p>
                  </div>
                )}
                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleLogoChange} />
              </label>
            </div>

            <div className={styles.inputGroup}>
              <label>Business Name *</label>
              <input
                type="text"
                placeholder="e.g. Kwame's Supermarket"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                autoFocus
              />
            </div>

            <div className={styles.inputGroup}>
              <label>Business Address</label>
              <input
                type="text"
                placeholder="e.g. Osu, Accra"
                value={businessAddress}
                onChange={(e) => setBusinessAddress(e.target.value)}
              />
            </div>

            <div className={styles.inputGroup}>
              <label>Business Phone</label>
              <input
                type="tel"
                placeholder="e.g. 024 000 0000"
                value={businessPhone}
                onChange={(e) => setBusinessPhone(e.target.value)}
              />
            </div>

            {error && <p className={styles.error} style={{ textAlign: 'center' }}>{error}</p>}

            <button
              type="button"
              className={styles.loginButton}
              onClick={handleStep1}
              style={{ marginTop: '8px' }}
            >
              Continue →
            </button>
          </div>
        ) : (
          /* ── Step 2: Admin Account ── */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '13px', textAlign: 'center' }}>
              This will be the owner/admin account. You can add more staff later in Settings.
            </p>

            <div className={styles.inputGroup}>
              <label>Admin Name *</label>
              <input
                type="text"
                placeholder="e.g. Daniel Mensah"
                value={adminName}
                onChange={(e) => setAdminName(e.target.value)}
                autoFocus
              />
            </div>

            <div className={styles.inputGroup}>
              <label>Password *</label>
              <input
                type="password"
                placeholder="Enter a password (min 4 characters)"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
              />
            </div>

            <div className={styles.inputGroup}>
              <label>Confirm Password *</label>
              <input
                type="password"
                placeholder="Re-enter your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>

            {error && <p className={styles.error} style={{ textAlign: 'center' }}>{error}</p>}

            <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
              <button
                type="button"
                onClick={() => { setStep(1); setError(''); }}
                style={{
                  flex: 1, padding: '14px', background: 'transparent',
                  border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
                  color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: '14px',
                }}
              >
                ← Back
              </button>
              <button
                type="button"
                className={styles.loginButton}
                onClick={handleComplete}
                disabled={loading}
                style={{ flex: 2 }}
              >
                {loading ? 'Setting up...' : 'Complete Setup ✓'}
              </button>
            </div>
          </div>
        )}

        <div className={styles.footer} style={{ marginTop: '20px' }}>
          <p>Step {step} of 2</p>
        </div>
      </div>
    </div>
  );
}
