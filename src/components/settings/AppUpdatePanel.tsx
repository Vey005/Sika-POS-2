import { useCallback, useEffect, useState } from 'react';
import { showConfirm } from '../../store/dialogStore';
import styles from './AppUpdatePanel.module.css';

type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error';

interface UpdateState {
  status: UpdateStatus;
  currentVersion: string;
  availableVersion?: string;
  releaseNotes?: string;
  percent?: number;
  message?: string;
  error?: string;
}

export default function AppUpdatePanel() {
  const [state, setState] = useState<UpdateState | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!window.sikapos?.updates) return;
    const s = await window.sikapos.updates.getState();
    setState(s);
  }, []);

  useEffect(() => {
    refresh();
    if (!window.sikapos?.updates?.onState) return;
    return window.sikapos.updates.onState(setState);
  }, [refresh]);

  const handleCheck = async () => {
    if (!window.sikapos?.updates) return;
    setBusy(true);
    try {
      const s = await window.sikapos.updates.check();
      setState(s);
    } finally {
      setBusy(false);
    }
  };

  const handleDownload = async () => {
    if (!window.sikapos?.updates) return;
    setBusy(true);
    try {
      const s = await window.sikapos.updates.download();
      setState(s);
    } finally {
      setBusy(false);
    }
  };

  const handleInstall = async () => {
    const ok = await showConfirm(
      'Restart SikaPOS now to install the update? Unsaved work in open forms may be lost.',
    );
    if (!ok || !window.sikapos?.updates) return;
    await window.sikapos.updates.install();
  };

  if (!window.sikapos?.updates) {
    return (
      <p className={styles.hint}>Updates are not available in this build.</p>
    );
  }

  const current = state?.currentVersion ?? '—';
  const status = state?.status ?? 'idle';

  return (
    <div className={styles.panel}>
      <div className={styles.row}>
        <span className={styles.label}>Installed version</span>
        <span className={styles.value}>v{current}</span>
      </div>
      {state?.availableVersion && status !== 'not-available' && (
        <div className={styles.row}>
          <span className={styles.label}>Available</span>
          <span className={styles.valueGold}>v{state.availableVersion}</span>
        </div>
      )}
      {state?.message && (
        <p className={styles.statusMsg} data-status={status}>
          {state.message}
          {status === 'downloading' && state.percent != null ? ` (${Math.round(state.percent)}%)` : ''}
        </p>
      )}
      {state?.releaseNotes && (
        <pre className={styles.notes}>{state.releaseNotes}</pre>
      )}
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.btn}
          onClick={handleCheck}
          disabled={busy || status === 'checking' || status === 'downloading'}
        >
          {status === 'checking' ? 'Checking…' : 'Check for updates'}
        </button>
        {status === 'available' && (
          <button type="button" className={styles.btnPrimary} onClick={handleDownload} disabled={busy}>
            Download update
          </button>
        )}
        {status === 'downloaded' && (
          <button type="button" className={styles.btnPrimary} onClick={handleInstall}>
            Restart & install
          </button>
        )}
      </div>
      {status === 'error' && state?.error && (
        <p className={styles.hint}>
          {state.error === 'dev'
            ? 'Run the packaged installer to test updates. Development mode cannot auto-update.'
            : state.error}
        </p>
      )}
    </div>
  );
}
