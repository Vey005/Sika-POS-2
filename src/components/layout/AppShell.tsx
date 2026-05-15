import { useEffect, useRef } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import TitleBar from './TitleBar';
import Sidebar from './Sidebar';
<<<<<<< HEAD
import CashierRouteGuard from './CashierRouteGuard';
=======
>>>>>>> 3f9ceb5465a3e53b5e5300921300cc3a0983f1cf
import styles from './AppShell.module.css';

export default function AppShell() {
  const navigate = useNavigate();
  const lastNotifiedCount = useRef<number | null>(null);
<<<<<<< HEAD
  const lastUpdateAvailableVersion = useRef<string | null>(null);
  const lastUpdateDownloadedVersion = useRef<string | null>(null);
=======
>>>>>>> 3f9ceb5465a3e53b5e5300921300cc3a0983f1cf

  useEffect(() => {
    if (!window.sikapos?.notifications) return;
    
    const cleanup = window.sikapos.notifications.onClick((data: any) => {
      if (data?.filter === 'low_stock') {
        navigate('/inventory?filter=low');
      }
<<<<<<< HEAD
      if (data?.filter === 'expiring') {
        navigate('/inventory?filter=expiring');
      }
      if (data?.action === 'app_update') {
        navigate('/settings?tab=about');
      }
=======
>>>>>>> 3f9ceb5465a3e53b5e5300921300cc3a0983f1cf
    });

    return cleanup;
  }, [navigate]);

  useEffect(() => {
<<<<<<< HEAD
    if (!window.sikapos?.updates || !window.sikapos?.notifications) return;

    const cleanupAvailable = window.sikapos.updates.onAvailable?.(({ version }) => {
      if (lastUpdateAvailableVersion.current === version) return;
      lastUpdateAvailableVersion.current = version;
      window.sikapos.notifications.show(
        'Update Available',
        `SikaPOS v${version} is available. Click to open Settings and download.`,
        { action: 'app_update' },
      );
    });

    const cleanupDownloaded = window.sikapos.updates.onDownloaded?.(({ version }) => {
      if (lastUpdateDownloadedVersion.current === version) return;
      lastUpdateDownloadedVersion.current = version;
      window.sikapos.notifications.show(
        'Update Ready',
        `SikaPOS v${version} has been downloaded. Click to restart and install.`,
        { action: 'app_update' },
      );
    });

    return () => {
      cleanupAvailable?.();
      cleanupDownloaded?.();
    };
  }, []);

  useEffect(() => {
    if (!window.sikapos?.inventory) return;

    const lastExpiringCount = { current: null as number | null };

    const checkLowStock = async () => {
      try {
        const count = await window.sikapos.inventory.getLowStockCount();
=======
    if (!window.sikapos?.inventory) return;

    const checkLowStock = async () => {
      try {
        const count = await window.sikapos.inventory.getLowStockCount();
        // Only notify if count > 0 AND it's greater than the last time we notified (to avoid fatigue)
>>>>>>> 3f9ceb5465a3e53b5e5300921300cc3a0983f1cf
        if (count > 0 && (lastNotifiedCount.current === null || count > lastNotifiedCount.current)) {
          window.sikapos.notifications.show(
            'Low Stock Alert',
            `${count} items are running low. Click to view.`,
            { filter: 'low_stock' }
          );
          lastNotifiedCount.current = count;
        } else if (count === 0) {
          lastNotifiedCount.current = 0;
        }
      } catch (err) {
        console.error('Low stock check failed', err);
      }
    };

<<<<<<< HEAD
    const checkExpiring = async () => {
      try {
        const count = await window.sikapos.inventory.getExpiringCount();
        if (count > 0 && (lastExpiringCount.current === null || count > lastExpiringCount.current)) {
          window.sikapos.notifications.show(
            'Expiry Alert',
            `${count} products are expiring soon or already expired. Click to view.`,
            { filter: 'expiring' }
          );
          lastExpiringCount.current = count;
        } else if (count === 0) {
          lastExpiringCount.current = 0;
        }
      } catch (err) {
        console.error('Expiry check failed', err);
      }
    };

    checkLowStock();
    checkExpiring();

    const interval = setInterval(() => {
      checkLowStock();
      checkExpiring();
    }, 30 * 60 * 1000);
=======
    // Initial check
    checkLowStock();

    // Periodic check every 30 minutes
    const interval = setInterval(checkLowStock, 30 * 60 * 1000);
>>>>>>> 3f9ceb5465a3e53b5e5300921300cc3a0983f1cf
    return () => clearInterval(interval);
  }, []);

  return (
    <div className={styles.shell}>
      <TitleBar />
      <div className={styles.body}>
        <Sidebar />
        <main className={styles.main}>
<<<<<<< HEAD
          <CashierRouteGuard>
            <Outlet />
          </CashierRouteGuard>
=======
          <Outlet />
>>>>>>> 3f9ceb5465a3e53b5e5300921300cc3a0983f1cf
        </main>
      </div>
    </div>
  );
}
