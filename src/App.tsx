import { useEffect, useState } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/auth';
import { promptClockOutBeforeExit } from './utils/exitWithAttendancePrompt';
import { useThemeStore } from './store/theme';
import AppShell from './components/layout/AppShell';
import LoginScreen from './screens/Auth/Login';
import ActivationScreen from './screens/Auth/ActivationScreen';
import SetupScreen from './screens/Auth/SetupScreen';
import POSScreen from './screens/POS';
import InventoryScreen from './screens/Inventory';
import RestockScreen from './screens/Restock';
import CustomersScreen from './screens/Customers';
import ReportsScreen from './screens/Reports';
import SettingsScreen from './screens/Settings';
import DashboardScreen from './screens/Dashboard';
import GlobalDialog from './components/common/GlobalDialog';

export default function App() {
  const { isAuthenticated, isActivated, isSetupComplete, setBusinessInfo, setBusinessLogo, setActivated, setSetupComplete } = useAuthStore();
  const { theme } = useThemeStore();
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    async function initApp() {
      if (!window.sikapos) {
        setLoaded(true);
        return;
      }

      try {
        // 1. Check activation status
        if (window.sikapos.secureStore) {
          const isAct = await window.sikapos.secureStore.get('is_activated');
          if (isAct === 'true') {
            setActivated(true);
          }

          // 2. Check if setup was completed
          const setupDone = await window.sikapos.secureStore.get('setup_complete');
          if (setupDone === 'true') {
            setSetupComplete(true);
          }

          // 3. Load business name & logo
          const savedBiz = await window.sikapos.secureStore.get('business_name');
          if (savedBiz) {
            setBusinessInfo(savedBiz);
          }
          
          const savedLogo = await window.sikapos.secureStore.get('business_logo');
          if (savedLogo) {
            setBusinessLogo(savedLogo);
          }
        }

        // Also try to load from local DB settings
        const biz = await window.sikapos.settings.getBusiness();
        if (biz.business_name) {
          setBusinessInfo(biz.business_name);
        }
        if (biz.receipt_footer) {
          useAuthStore.getState().setReceiptFooter(biz.receipt_footer);
        }
        if (biz.tax_config) {
          try {
            useAuthStore.getState().setTaxConfig(JSON.parse(biz.tax_config));
          } catch(e) {}
        }
        if (biz.tax_enabled !== undefined) {
          useAuthStore.getState().setTaxEnabled(biz.tax_enabled === 'true' || biz.tax_enabled === '1');
        }
        if (biz.receipt_config) {
          try {
            const saved = JSON.parse(biz.receipt_config);
            const current = useAuthStore.getState().receiptConfig;
            useAuthStore.getState().setReceiptConfig({ ...current, ...saved });
          } catch(e) {}
        }
        useAuthStore.getState().setCashierNavVisibility(biz.cashier_nav_visibility ?? undefined);
      } catch (err) {
        console.error('App init failed', err);
      } finally {
        setLoaded(true);
      }
    }

    initApp();
  }, [setBusinessInfo, setActivated, setSetupComplete]);

  // Quit / title-bar close: prompt clock-out if signed in and still clocked in
  useEffect(() => {
    if (!window.sikapos?.onCloseIntercepted || !window.sikapos.window.confirmClose) return;

    const cleanup = window.sikapos.onCloseIntercepted(() => {
      void (async () => {
        const { isAuthenticated, user } = useAuthStore.getState();
        if (!isAuthenticated || !user) {
          window.sikapos.window.confirmClose();
          return;
        }
        const result = await promptClockOutBeforeExit(user.id);
        if (result === 'cancel') return;
        window.sikapos.window.confirmClose();
      })();
    });

    return cleanup;
  }, []);

  // Listen for background user updates (e.g. from cloud sync)
  useEffect(() => {
    if (!window.sikapos?.sync?.onUsersUpdated) return;

    const cleanup = window.sikapos.sync.onUsersUpdated(() => {
      void (async () => {
        const { user } = useAuthStore.getState();
        if (!user) return;
        
        try {
          const [biz, row] = await Promise.all([
            window.sikapos.settings.getBusiness(),
            window.sikapos.users.getById(user.id)
          ]);
          
          if (row) {
            const { resolveCashierNavForUser } = await import('./constants/cashierNav');
            const newVisibility = resolveCashierNavForUser(biz.cashier_nav_visibility, row.cashier_nav_visibility);
            useAuthStore.getState().setCashierNavVisibility(newVisibility);
          } else {
            // User was deleted from the portal
            useAuthStore.getState().logout();
          }
        } catch (err) {
          console.error('Failed to refresh user nav visibility on sync:', err);
        }
      })();
    });

    return cleanup;
  }, []);

  if (!loaded) {
    return (
      <div style={{
        width: '100%', height: '100%', background: '#0C0C0F',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{ color: '#D4A017', fontSize: '24px', fontFamily: 'Syne, sans-serif' }}>
          ₵
        </div>
      </div>
    );
  }

  // Determine where to redirect based on state
  const getDefaultRoute = () => {
    if (!isActivated) return '/activate';
    if (!isSetupComplete) return '/setup';
    if (!isAuthenticated) return '/login';
    return '/pos';
  };

  return (
    <>
      <GlobalDialog />
      <HashRouter>
        <Routes>
        {/* Step 1: License Activation */}
        <Route
          path="/activate"
          element={isActivated ? <Navigate to={isSetupComplete ? '/login' : '/setup'} replace /> : <ActivationScreen />}
        />

        {/* Step 2: Business Setup (first-time only) */}
        <Route
          path="/setup"
          element={!isActivated ? <Navigate to="/activate" replace /> : isSetupComplete ? <Navigate to="/login" replace /> : <SetupScreen />}
        />

        {/* Step 3: Login */}
        <Route
          path="/login"
          element={
            !isActivated ? <Navigate to="/activate" replace /> :
            !isSetupComplete ? <Navigate to="/setup" replace /> :
            isAuthenticated ? <Navigate to="/pos" replace /> :
            <LoginScreen />
          }
        />

        {/* Step 4: Main App */}
        <Route
          path="/"
          element={
            !isActivated ? <Navigate to="/activate" replace /> :
            !isSetupComplete ? <Navigate to="/setup" replace /> :
            !isAuthenticated ? <Navigate to="/login" replace /> :
            <AppShell />
          }
        >
          <Route index element={<Navigate to="/pos" replace />} />
          <Route path="pos" element={<POSScreen />} />
          <Route path="inventory" element={<InventoryScreen />} />
          <Route path="restock" element={<RestockScreen />} />
          <Route path="customers" element={<CustomersScreen />} />
          <Route path="dashboard" element={<DashboardScreen />} />
          <Route path="reports" element={<ReportsScreen />} />
          <Route path="settings" element={<SettingsScreen />} />
        </Route>

        {/* Catch-all */}
        <Route path="*" element={<Navigate to={getDefaultRoute()} replace />} />
      </Routes>
    </HashRouter>
    </>
  );
}
