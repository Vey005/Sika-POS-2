import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './TitleBar.module.css';
import { useAuthStore } from '../../store/auth';
import { useThemeStore } from '../../store/theme';
<<<<<<< HEAD
import { promptClockOutBeforeExit } from '../../utils/exitWithAttendancePrompt';
=======
>>>>>>> 3f9ceb5465a3e53b5e5300921300cc3a0983f1cf

export default function TitleBar() {
  const { businessName, user, logout } = useAuthStore();
  const { theme, toggleTheme } = useThemeStore();
  const [time, setTime] = useState(new Date());
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const timeStr = time.toLocaleTimeString('en-GH', {
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
  const dateStr = time.toLocaleDateString('en-GH', {
    weekday: 'short', month: 'short', day: 'numeric',
  });

<<<<<<< HEAD
  const handleLogout = async () => {
    if (!user) {
      logout();
      navigate('/');
      return;
    }
    const result = await promptClockOutBeforeExit(user.id);
    if (result === 'cancel') return;
    setShowDropdown(false);
=======
  const handleLogout = () => {
>>>>>>> 3f9ceb5465a3e53b5e5300921300cc3a0983f1cf
    logout();
    navigate('/');
  };

<<<<<<< HEAD
  const handleSwitchUser = async () => {
    if (!user) {
      logout();
      navigate('/');
      return;
    }
    const result = await promptClockOutBeforeExit(user.id);
    if (result === 'cancel') return;
    setShowDropdown(false);
=======
  const handleSwitchUser = () => {
>>>>>>> 3f9ceb5465a3e53b5e5300921300cc3a0983f1cf
    logout();
    navigate('/');
  };

  const initials = user?.name
    ? user.name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
    : '??';

  return (
    <div className={styles.titleBar}>
      <div className={styles.dragArea}>
        <div className={styles.logo}>
          <span className={styles.logoText}>
            <span className={styles.logoIcon}>₵</span> SIKAPOS
          </span>
        </div>
      </div>

      <div className={styles.center}>
        <span className={styles.businessName}>{businessName}</span>
        <span className={styles.divider}>·</span>
        <span className={styles.timeDisplay}>{dateStr} &nbsp; {timeStr}</span>
      </div>

      <div className={styles.rightSection}>
        <button 
          className={styles.themeToggle} 
          onClick={toggleTheme}
          title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
        >
          {theme === 'dark' ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
            </svg>
          )}
        </button>

        <div className={styles.userProfile} ref={dropdownRef}>
          <button 
            className={styles.profileBtn}
            onClick={() => setShowDropdown(!showDropdown)}
          >
            <div className={styles.avatar}>{initials}</div>
            <span className={styles.userName}>{user?.name}</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: showDropdown ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
              <path d="m6 9 6 6 6-6"/>
            </svg>
          </button>

          {showDropdown && (
            <div className={styles.dropdown}>
              <div className={styles.dropdownHeader}>
                <p className={styles.headerName}>{user?.name}</p>
                <p className={styles.headerRole}>{user?.role}</p>
              </div>
              <div className={styles.dropdownDivider} />
              <button className={styles.dropdownItem} onClick={handleSwitchUser}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
                Switch User
              </button>
              <button className={`${styles.dropdownItem} ${styles.logoutOption}`} onClick={handleLogout}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
                </svg>
                Logout
              </button>
            </div>
          )}
        </div>

        <div className={styles.windowControls}>
          <button
            className={styles.controlBtn}
            onClick={() => window.sikapos?.window.minimize()}
            title="Minimize"
          >
            <svg width="10" height="1" viewBox="0 0 10 1">
              <line x1="0" y1="0.5" x2="10" y2="0.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
          <button
            className={styles.controlBtn}
            onClick={() => window.sikapos?.window.maximize()}
            title="Maximize"
          >
            <svg width="10" height="10" viewBox="0 0 10 10">
              <rect x="0.75" y="0.75" width="8.5" height="8.5" rx="1" stroke="currentColor" strokeWidth="1.5" fill="none"/>
            </svg>
          </button>
          <button
            className={`${styles.controlBtn} ${styles.closeBtn}`}
            onClick={() => window.sikapos?.window.close()}
            title="Close"
          >
            <svg width="10" height="10" viewBox="0 0 10 10">
              <line x1="1" y1="1" x2="9" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <line x1="9" y1="1" x2="1" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
