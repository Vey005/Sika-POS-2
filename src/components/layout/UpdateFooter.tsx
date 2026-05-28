import { useEffect, useState } from 'react';
import styles from './UpdateFooter.module.css';

const DownloadCloud = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 17l4 4 4-4"/>
    <path d="M12 12v9"/>
    <path d="M20.88 18.09A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.29"/>
  </svg>
);

const Loader = ({ size = 20, className }: { size?: number; className?: string }) => (
  <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
  </svg>
);

const RefreshCw = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 4 23 10 17 10"/>
    <polyline points="1 20 1 14 7 14"/>
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
  </svg>
);

const CheckCircle = ({ size = 16, className }: { size?: number; className?: string }) => (
  <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
    <polyline points="22 4 12 14.01 9 11.01"/>
  </svg>
);

export default function UpdateFooter() {
  const [updateState, setUpdateState] = useState<{
    status: 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';
    percent?: number;
    message?: string;
    availableVersion?: string;
    currentVersion: string;
  } | null>(null);

  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!window.sikapos?.updates) return;

    // Fetch initial state
    window.sikapos.updates.getState().then((state: any) => {
      setUpdateState(state);
    });

    // Listen for updates
    const cleanup = window.sikapos.updates.onState((state: any) => {
      setUpdateState(state);
      if (state.status !== 'checking') {
        setChecking(false);
      }
    });

    return cleanup;
  }, []);

  if (!updateState) return null;

  const isUpdateProcess = ['available', 'downloading', 'downloaded'].includes(updateState.status);

  const handleAction = () => {
    if (updateState.status === 'available') {
      window.sikapos?.updates?.download();
    } else if (updateState.status === 'downloaded') {
      window.sikapos?.updates?.install();
    }
  };

  const handleCheckForUpdates = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (checking || isUpdateProcess) return;
    setChecking(true);
    try {
      await window.sikapos?.updates?.check();
    } catch (err) {
      console.error(err);
    } finally {
      setChecking(false);
    }
  };

  return (
    <div 
      className={`${styles.footer} ${isUpdateProcess ? styles[updateState.status] : styles.idle}`}
      onClick={isUpdateProcess && updateState.status !== 'downloading' ? handleAction : undefined}
    >
      {isUpdateProcess ? (
        // Update Action State UI (Vibrant and Prominent)
        <>
          <div className={styles.content}>
            <div className={`${styles.icon} ${
              updateState.status === 'available' ? styles.iconAvailable :
              updateState.status === 'downloading' ? styles.iconDownloading :
              updateState.status === 'downloaded' ? styles.iconDownloaded : ''
            }`}>
              {updateState.status === 'available' && <DownloadCloud size={16} />}
              {updateState.status === 'downloading' && <Loader size={16} />}
              {updateState.status === 'downloaded' && <RefreshCw size={16} />}
            </div>
            
            <div className={styles.text}>
              {updateState.status === 'available' && (
                <>
                  Update Available <span className={styles.subtext}>(v{updateState.availableVersion})</span>
                </>
              )}
              {updateState.status === 'downloading' && 'Downloading Update...'}
              {updateState.status === 'downloaded' && (
                <>
                  Update Ready <span className={styles.subtext}>(v{updateState.availableVersion})</span>
                </>
              )}
            </div>
          </div>

          {updateState.status === 'downloading' ? (
            <div className={styles.progressContainer}>
              <div className={styles.progressBar}>
                <div 
                  className={styles.progressFill} 
                  style={{ width: `${updateState.percent || 0}%` }}
                />
              </div>
              <span className={styles.progressText}>{Math.round(updateState.percent || 0)}%</span>
            </div>
          ) : (
            <button className={styles.actionButton}>
              {updateState.status === 'available' && 'Click to Download'}
              {updateState.status === 'downloaded' && 'Click to Restart & Install'}
            </button>
          )}
        </>
      ) : (
        // Persistent Standard Footer UI (Idle / Sleek / Matches Sidebar)
        <>
          <div className={styles.content}>
            <span className={styles.brandText}>SikaPOS v{updateState.currentVersion}</span>
            <div className={styles.statusDivider} />
            <div className={styles.statusIndicator}>
              <CheckCircle size={14} className={styles.checkIcon} />
              <span className={styles.statusText}>
                {checking || updateState.status === 'checking' ? 'Checking for updates...' : 'System Up-to-Date'}
              </span>
            </div>
          </div>

          <button 
            className={styles.checkUpdatesButton}
            onClick={handleCheckForUpdates}
            disabled={checking || updateState.status === 'checking'}
          >
            {(checking || updateState.status === 'checking') ? (
              <>
                <Loader size={12} className={styles.spinIcon} />
                Checking...
              </>
            ) : (
              'Check for Updates'
            )}
          </button>
        </>
      )}
    </div>
  );
}
