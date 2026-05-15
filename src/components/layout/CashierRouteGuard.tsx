import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/auth';
import type { CashierNavTabId } from '../../constants/cashierNav';

const PATH_TO_TAB: Partial<Record<string, CashierNavTabId>> = {
  '/pos': 'pos',
  '/inventory': 'inventory',
  '/customers': 'customers',
  '/dashboard': 'dashboard',
  '/reports': 'reports',
  '/settings': 'settings',
};

export default function CashierRouteGuard({ children }: { children: ReactNode }) {
  const user = useAuthStore(s => s.user);
  const cashierNav = useAuthStore(s => s.cashierNavVisibility);
  const location = useLocation();

  if (user?.role !== 'cashier') return <>{children}</>;

  const tab = PATH_TO_TAB[location.pathname];
  if (!tab) return <>{children}</>;

  if (tab === 'pos' || cashierNav[tab]) return <>{children}</>;

  return <Navigate to="/pos" replace />;
}
