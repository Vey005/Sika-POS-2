import { useEffect, useRef } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import TitleBar from './TitleBar';
import Sidebar from './Sidebar';
import CashierRouteGuard from './CashierRouteGuard';
import UpdateFooter from './UpdateFooter';
import styles from './AppShell.module.css';

export default function AppShell() {
  const navigate = useNavigate();
  const lastNotifiedCount = useRef<number | null>(null);
  const lastUpdateAvailableVersion = useRef<string | null>(null);
  const lastUpdateDownloadedVersion = useRef<string | null>(null);

  useEffect(() => {
    if (!window.sikapos?.notifications) return;
    
    const cleanup = window.sikapos.notifications.onClick((data: any) => {
      if (data?.filter === 'low_stock') {
        navigate('/inventory?filter=low');
      }
      if (data?.filter === 'expiring') {
        navigate('/inventory?filter=expiring');
      }
      if (data?.action === 'app_update') {
        navigate('/settings?tab=about');
      }
    });

    return cleanup;
  }, [navigate]);

  useEffect(() => {
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
    return () => clearInterval(interval);
  }, []);

  return (
    <div className={styles.shell}>
      <TitleBar />
      <div className={styles.body}>
        <Sidebar />
        <main className={styles.main}>
          <CashierRouteGuard>
            <Outlet />
          </CashierRouteGuard>
          <UpdateFooter />
        </main>
      </div>
    </div>
  );
}
