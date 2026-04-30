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
  const navigate = useNavigate();
  const { login } = useAuthStore();

  useEffect(() => {
    // Load business info
    if (window.sikapos) {
      window.sikapos.settings.getBusiness().then(biz => {
        if (biz.business_name) setBusinessName(biz.business_name);
      });
    }
  }, []);

  const handleDigit = async (digit: string) => {
    if (pin.length >= PIN_LENGTH) return;
    const newPin = pin + digit;
    setPin(newPin);
    setError('');

    if (newPin.length === PIN_LENGTH) {
      // Small delay for UI feel
      await new Promise(r => setTimeout(r, 100));
      
      try {
        const result = await window.sikapos.users.login(newPin);
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

        {/* PIN dots */}
        <div className={styles.pinDots}>
          {Array.from({ length: PIN_LENGTH }).map((_, i) => (
            <div
              key={i}
              className={`${styles.dot} ${i < pin.length ? styles.dotFilled : ''} ${error ? styles.dotError : ''}`}
            />
          ))}
        </div>

        {error && <p className={styles.errorText}>{error}</p>}

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
      </div>

      <p className={styles.version}>SikaPOS v1.0 · Powered by DanniTech Solution</p>
    </div>
  );
}
