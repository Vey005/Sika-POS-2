import { useEffect, useRef } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import TitleBar from './TitleBar';
import Sidebar from './Sidebar';
import styles from './AppShell.module.css';

export default function AppShell() {
  const navigate = useNavigate();
  const lastNotifiedCount = useRef<number | null>(null);

  useEffect(() => {
    if (!window.sikapos?.notifications) return;
    
    const cleanup = window.sikapos.notifications.onClick((data: any) => {
      if (data?.filter === 'low_stock') {
        navigate('/inventory?filter=low');
      }
    });

    return cleanup;
  }, [navigate]);

  useEffect(() => {
    if (!window.sikapos?.inventory) return;

    const checkLowStock = async () => {
      try {
        const count = await window.sikapos.inventory.getLowStockCount();
        // Only notify if count > 0 AND it's greater than the last time we notified (to avoid fatigue)
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

    // Initial check
    checkLowStock();

    // Periodic check every 30 minutes
    const interval = setInterval(checkLowStock, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className={styles.shell}>
      <TitleBar />
      <div className={styles.body}>
        <Sidebar />
        <main className={styles.main}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
