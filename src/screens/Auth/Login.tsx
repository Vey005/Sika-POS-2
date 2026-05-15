import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/auth';
import { resolveCashierNavForUser } from '../../constants/cashierNav';
import { formatErrorMsg } from '../../utils/errorFormatter';
import styles from './Login.module.css';

export default function LoginScreen() {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [businessName, setBusinessName] = useState('My Shop');
  const [shake, setShake] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuthStore();
  const passwordRef = useRef<HTMLInputElement>(null);

  const [loginUser, setLoginUser] = useState<any | null>(null);

  // Recovery State
  const [isRecovering, setIsRecovering] = useState(false);
  const [users, setUsers] = useState<any[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<number | ''>('');
  const [licenseKeyInput, setLicenseKeyInput] = useState('');
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [recovering, setRecovering] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);

  useEffect(() => {
    // Load business info
    if (window.sikapos) {
      window.sikapos.settings.getBusiness().then(biz => {
        if (biz.business_name) setBusinessName(biz.business_name);
      });
      (async () => {
        const data = await window.sikapos.users.getAll();
        setUsers(data);

        // New PC / fresh install scenario:
        // If activated but no local users exist yet, restore from cloud first.
        if (data.length === 0) {
          try {
            const licenseKey = await window.sikapos.secureStore.get('license_key');
            if (licenseKey) {
              setLoadingUsers(true);
              await window.sikapos.sync.restore();
              const after = await window.sikapos.users.getAll();
              setUsers(after);

              // If still no users after restore, they truly need setup.
              if (after.length === 0) {
                navigate('/setup', { replace: true });
              }
            }
          } catch {
            // ignore restore failures; user can still go to setup if needed
          } finally {
            setLoadingUsers(false);
          }
        }
      })();
    }
  }, []);

  // Focus password once when a user is selected (avoid autoFocus + delayed focus fighting each other)
  useLayoutEffect(() => {
    if (!loginUser || isRecovering) return;
    const id = window.requestAnimationFrame(() => {
      const el = passwordRef.current;
      if (!el) return;
      el.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(id);
  }, [loginUser, isRecovering]);

  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!password.trim() || loading) return;

    setLoading(true);
    setError('');

    try {
      const result = await window.sikapos.users.loginById(loginUser.id, password);
      if (result && 'locked' in result) {
        setShake(true);
        setError(`Too many attempts. Try again in ${result.secondsLeft}s`);
        setTimeout(() => {
          setPassword('');
          setShake(false);
        }, 600);
      } else if (result && 'id' in result) {
        login(result);
        try {
          const biz = await window.sikapos.settings.getBusiness();
          const row = await window.sikapos.users.getById(result.id);
          useAuthStore.getState().setCashierNavVisibility(
            resolveCashierNavForUser(biz.cashier_nav_visibility, row?.cashier_nav_visibility ?? null)
          );
        } catch {
          /* keep defaults */
        }
        navigate('/pos');
      } else {
        setShake(true);
        setError('Incorrect password');
        setTimeout(() => {
          setPassword('');
          setShake(false);
        }, 600);
      }
    } catch (err) {
      setError(formatErrorMsg(err, 'Login failed.'));
      setPassword('');
    } finally {
      setLoading(false);
    }
  };

  const handleRecoverySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId) {
      setError('Please select a user.');
      return;
    }
    if (newPasswordInput.length < 4) {
      setError('New password must be at least 4 characters.');
      return;
    }
    if (!licenseKeyInput.trim()) {
      setError('License key is required.');
      return;
    }

    setRecovering(true);
    setError('');
    try {
      const result = await window.sikapos.users.resetPassword({
        userId: Number(selectedUserId),
        licenseKey: licenseKeyInput,
        newPassword: newPasswordInput
      });

      if (result.success) {
        setIsRecovering(false);
        setLicenseKeyInput('');
        setNewPasswordInput('');
        setSelectedUserId('');
        setPassword('');
        setSuccessMsg('Password reset successfully. Please log in.');
      } else {
        setError(formatErrorMsg(result.message, 'Failed to reset password.'));
      }
    } catch (err: any) {
      setError(formatErrorMsg(err, 'An error occurred.'));
    } finally {
      setRecovering(false);
    }
  };

  return (
    <div className={styles.container}>
      {/* Background pattern */}
      <div className={styles.bg} />

      {/* Exit Button */}
      <button 
        className={styles.exitBtn} 
        onClick={() => window.sikapos?.window.close()}
        title="Exit Application"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>

      <div className={`${styles.card} ${shake ? styles.shake : ''}`}>
        {/* Logo */}
        <div className={styles.logoArea}>
          <div className={styles.logoRing}>
            <span className={styles.logoSymbol}>₵</span>
          </div>
          <h1 className={styles.appName}>SIKAPOS</h1>
          <p className={styles.businessName}>{businessName}</p>
        </div>

        {error && <p className={styles.errorText}>{error}</p>}
        {successMsg && <p style={{ color: 'var(--color-success)', fontSize: '13px', textAlign: 'center' }}>{successMsg}</p>}

        {isRecovering ? (
          <form
            className={styles.recoveryForm}
            onSubmit={handleRecoverySubmit}
            onKeyDown={e => {
              if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) {
                e.stopPropagation();
              }
            }}
          >
            <div className={styles.inputGroup}>
              <label>Select User</label>
              <select 
                className={styles.inputField}
                value={selectedUserId}
                onChange={e => setSelectedUserId(e.target.value === '' ? '' : Number(e.target.value))}
                required
              >
                <option value="" disabled>-- Choose User --</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                ))}
              </select>
            </div>
            
            <div className={styles.inputGroup}>
              <label>Business License Key</label>
              <input 
                type="text" 
                className={styles.inputField} 
                placeholder="SIKA-XXXX-XXXX-XXXX"
                value={licenseKeyInput}
                onChange={e => setLicenseKeyInput(e.target.value.toUpperCase())}
                required
              />
            </div>

            <div className={styles.inputGroup}>
              <label>New Password</label>
              <input 
                type="password" 
                className={styles.inputField} 
                placeholder="Enter new password (min 4 characters)"
                value={newPasswordInput}
                onChange={e => setNewPasswordInput(e.target.value)}
                required
              />
            </div>

            <div className={styles.actionRow}>
              <button 
                type="button" 
                className={styles.cancelBtn} 
                onClick={() => { setIsRecovering(false); setError(''); }}
                disabled={recovering}
              >
                Cancel
              </button>
              <button type="submit" className={styles.submitBtn} disabled={recovering}>
                {recovering ? 'Resetting...' : 'Reset Password'}
              </button>
            </div>
          </form>
        ) : !loginUser ? (
          loadingUsers ? (
            <div style={{ textAlign: 'center', padding: '18px 0', color: 'var(--color-text-muted)', fontSize: '13px' }}>
              Restoring your staff accounts...
            </div>
          ) : (
            <div className={styles.userGrid}>
              {users.map(u => (
                <div 
                  key={u.id} 
                  className={styles.userCard}
                  onClick={() => {
                    setLoginUser(u);
                    setError('');
                    setPassword('');
                  }}
                >
                  <div className={styles.userAvatar}>
                    {u.name.charAt(0).toUpperCase()}
                  </div>
                  <div className={styles.userName} title={u.name}>{u.name}</div>
                  <div className={styles.userRole}>{u.role}</div>
                </div>
              ))}
            </div>
          )
        ) : (
          <form
            onSubmit={handleLogin}
            style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}
            onKeyDown={e => {
              if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
                e.stopPropagation();
              }
            }}
          >
            <button 
              type="button"
              className={styles.backToUsers}
              onClick={() => {
                setLoginUser(null);
                setPassword('');
                setError('');
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="19" y1="12" x2="5" y2="12"></line>
                <polyline points="12 19 5 12 12 5"></polyline>
              </svg>
              Not {loginUser.name}?
            </button>

            <p className={styles.hint} style={{ fontSize: '14px', color: 'var(--color-text-primary)' }}>
              Welcome back, <strong>{loginUser.name}</strong>
            </p>

            {/* Password input */}
            <div className={styles.passwordWrapper}>
              <input
                id="login-password"
                name="password"
                ref={passwordRef}
                type={showPassword ? 'text' : 'password'}
                className={styles.passwordField}
                placeholder="Enter your password"
                value={password}
                onChange={e => { setPassword(e.target.value); setError(''); }}
                autoComplete="current-password"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
              />
              <button 
                type="button"
                className={styles.togglePassword}
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
              >
                {showPassword ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                )}
              </button>
            </div>

            {/* Login button */}
            <button 
              type="submit"
              className={styles.loginBtn}
              disabled={loading || !password.trim()}
            >
              {loading ? (
                <><span className={styles.btnSpinner} /> Signing in...</>
              ) : (
                <>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
                    <polyline points="10 17 15 12 10 7"/>
                    <line x1="15" y1="12" x2="3" y2="12"/>
                  </svg>
                  Sign In
                </>
              )}
            </button>

            <button 
              type="button"
              className={styles.forgotPasswordBtn}
              onClick={() => { setIsRecovering(true); setError(''); setSuccessMsg(''); }}
            >
              Forgot Password?
            </button>
          </form>
        )}
      </div>

      <p className={styles.version}>SikaPOS v1.0 · Powered by DanniTech Solution</p>
    </div>
  );
}
