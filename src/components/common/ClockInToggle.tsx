import React, { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '../../store/auth';
import { showAlert } from '../../store/dialogStore';
import styles from './ClockInToggle.module.css';

interface Props {
  expanded?: boolean;
}

export default function ClockInToggle({ expanded = true }: Props) {
  const { user } = useAuthStore();
  const [status, setStatus] = useState<'in' | 'out' | null>(null);
  const [lastEventTime, setLastEventTime] = useState<string | null>(null);
  const [duration, setDuration] = useState<string>('');
  const [loading, setLoading] = useState(true);

  const fetchStatus = useCallback(async () => {
    if (!user || !window.sikapos) return;
    try {
      const lastEvent = await window.sikapos.attendance.getStatus(user.id);
      if (lastEvent) {
        setStatus(lastEvent.type);
        setLastEventTime(lastEvent.created_at);
      } else {
        setStatus('out');
      }
    } catch (err) {
      console.error('Failed to fetch attendance status:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Listen for clock-in changes from other components (e.g. POS modal)
  useEffect(() => {
    const handler = () => fetchStatus();
    window.addEventListener('attendance-changed', handler);
    return () => window.removeEventListener('attendance-changed', handler);
  }, [fetchStatus]);

  useEffect(() => {
    if (status !== 'in' || !lastEventTime) {
      setDuration('');
      return;
    }

    const interval = setInterval(() => {
      const start = new Date(lastEventTime).getTime();
      const now = new Date().getTime();
      const diff = now - start;

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setDuration(
        `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
      );
    }, 1000);

    return () => clearInterval(interval);
  }, [status, lastEventTime]);

  const handleToggle = async () => {
    if (!user || !window.sikapos) return;
    
    setLoading(true);
    try {
      if (status === 'in') {
        await window.sikapos.attendance.clockOut(user.id);
        setStatus('out');
      } else {
        await window.sikapos.attendance.clockIn(user.id);
        setStatus('in');
        setLastEventTime(new Date().toISOString());
      }
      // Re-fetch to ensure sync with DB
      fetchStatus();
    } catch (err) {
      await showAlert('Failed to update attendance status');
    } finally {
      setLoading(false);
    }
  };

  if (!user || (loading && status === null)) return null;

  return (
    <button 
      className={`${styles.container} ${status === 'in' ? styles.clockedIn : styles.clockedOut} ${!expanded ? styles.compact : ''}`}
      onClick={handleToggle}
      disabled={loading}
      title={status === 'in' ? `Clock Out (Shift: ${duration})` : 'Clock In'}
    >
      <div className={styles.iconWrap}>
        {status === 'in' ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18.36 6.64a9 9 0 1 1-12.73 0"/>
            <line x1="12" y1="2" x2="12" y2="12"/>
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
          </svg>
        )}
      </div>
      
      {expanded && (
        <div className={styles.info}>
          <span className={styles.label}>{status === 'in' ? 'End Shift' : 'Start Shift'}</span>
          <span className={styles.duration}>
            {status === 'in' ? `Clocked in: ${duration || '00:00:00'}` : 'Currently clocked out'}
          </span>
        </div>
      )}
    </button>
  );
}
