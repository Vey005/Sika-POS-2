import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/auth';
import styles from './Login.module.css';

const PIN_LENGTH = 4;

export default function LoginScreen() {
  const [pin, setPin] = useState('');
  const [businessName, setBusinessName] = useState('My Shop');
  const [shake, setShake] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const navigate = useNavigate();
  const { login } = useAuthStore();

  const [loginUser, setLoginUser] = useState<any | null>(null);

  // Recovery State
  const [isRecovering, setIsRecovering] = useState(false);
  const [users, setUsers] = useState<any[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<number | ''>('');
  const [licenseKeyInput, setLicenseKeyInput] = useState('');
  const [newPinInput, setNewPinInput] = useState('');
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    // Load business info
    if (window.sikapos) {
      window.sikapos.settings.getBusiness().then(biz => {
        if (biz.business_name) setBusinessName(biz.business_name);
      });
      window.sikapos.users.getAll().then(data => {
        setUsers(data);
      });
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only capture if a user is selected and we are ready for PIN input
      if (!loginUser || isRecovering || pin.length >= PIN_LENGTH || shake) return;
      
      if (/^[0-9]$/.test(e.key)) {
        handleDigit(e.key);
      } else if (e.key === 'Backspace') {
        handleBackspace();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [loginUser, isRecovering, pin, shake]);

  const handleDigit = async (digit: string) => {
    if (pin.length >= PIN_LENGTH) return;
    const newPin = pin + digit;
    setPin(newPin);
    setError('');
    setSuccessMsg('');

    if (newPin.length === PIN_LENGTH) {
      // Small delay for UI feel
      await new Promise(r => setTimeout(r, 100));
      
      try {
        const result = await window.sikapos.users.loginById(loginUser.id, newPin);
        if (result && 'locked' in result) {
          setShake(true);
          setError(`Too many attempts. Try again in ${result.secondsLeft}s`);
          setTimeout(() => {
            setPin('');
            setShake(false);
          }, 600);
        } else if (result && 'id' in result) {
          login(result);
          navigate('/pos');
        } else {
          setShake(true);
          setError('Incorrect PIN');
          setTimeout(() => {
            setPin('');
            setShake(false);
          }, 600);
        }
      } catch (err) {
        setError('Login failed');
        setPin('');
      }
    }
  };

  const handleBackspace = () => {
    setPin(p => p.slice(0, -1));
    setError('');
  };

  const handleRecoverySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId) {
      setError('Please select a user.');
      return;
    }
    if (newPinInput.length !== 4 || !/^\d{4}$/.test(newPinInput)) {
      setError('New PIN must be exactly 4 digits.');
      return;
    }
    if (!licenseKeyInput.trim()) {
      setError('License key is required.');
      return;
    }

    setRecovering(true);
    setError('');
    try {
      const result = await window.sikapos.users.resetPin({
        userId: Number(selectedUserId),
        licenseKey: licenseKeyInput,
        newPin: newPinInput
      });

      if (result.success) {
        setIsRecovering(false);
        setLicenseKeyInput('');
        setNewPinInput('');
        setSelectedUserId('');
        setPin('');
        setSuccessMsg('PIN reset successfully. Please log in.');
      } else {
        setError(result.message || 'Failed to reset PIN.');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred.');
    } finally {
      setRecovering(false);
    }
  };

  const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];

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
          <form className={styles.recoveryForm} onSubmit={handleRecoverySubmit}>
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
              <label>New 4-Digit PIN</label>
              <input 
                type="password" 
                className={styles.inputField} 
                placeholder="••••"
                maxLength={4}
                value={newPinInput}
                onChange={e => setNewPinInput(e.target.value.replace(/\D/g, ''))}
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
                {recovering ? 'Resetting...' : 'Reset PIN'}
              </button>
            </div>
          </form>
        ) : !loginUser ? (
          <div className={styles.userGrid}>
            {users.map(u => (
              <div 
                key={u.id} 
                className={styles.userCard}
                onClick={() => {
                  setLoginUser(u);
                  setError('');
                  setPin('');
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
        ) : (
          <>
            <button 
              className={styles.backToUsers}
              onClick={() => {
                setLoginUser(null);
                setPin('');
                setError('');
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="19" y1="12" x2="5" y2="12"></line>
                <polyline points="12 19 5 12 12 5"></polyline>
              </svg>
              Not {loginUser.name}?
            </button>
            <p className={styles.hint} style={{ marginBottom: '10px', fontSize: '14px', color: 'var(--color-text-primary)' }}>
              Welcome back, <strong>{loginUser.name}</strong>
            </p>

            {/* PIN dots */}
            <div className={styles.pinDots}>
              {Array.from({ length: PIN_LENGTH }).map((_, i) => (
                <div
                  key={i}
                  className={`${styles.dot} ${i < pin.length ? styles.dotFilled : ''} ${error ? styles.dotError : ''}`}
                />
              ))}
            </div>

            {/* Numpad */}
            <div className={styles.numpad}>
              {digits.map((d, i) => (
                d === '' ? (
                  <div key={i} className={styles.numEmpty} />
                ) : d === '⌫' ? (
                  <button
                    key={i}
                    className={`${styles.numBtn} ${styles.backspaceBtn}`}
                    onClick={handleBackspace}
                    disabled={pin.length === 0}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"/>
                      <line x1="18" y1="9" x2="12" y2="15"/>
                      <line x1="12" y1="9" x2="18" y2="15"/>
                    </svg>
                  </button>
                ) : (
                  <button
                    key={i}
                    className={styles.numBtn}
                    onClick={() => handleDigit(d)}
                  >
                    {d}
                  </button>
                )
              ))}
            </div>

            <p className={styles.hint}>Enter your 4-digit PIN</p>

            <button 
              className={styles.forgotPinBtn}
              onClick={() => { setIsRecovering(true); setError(''); setSuccessMsg(''); }}
            >
              Forgot PIN?
            </button>
          </>
        )}
      </div>

      <p className={styles.version}>SikaPOS v1.0 · Powered by DanniTech Solution</p>
    </div>
  );
}
