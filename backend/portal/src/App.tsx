import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import { useAuthStore } from './store/auth';

const Login = lazy(() => import('./pages/Login'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const OwnerStores = lazy(() => import('./pages/OwnerStores'));
const Inventory = lazy(() => import('./pages/Inventory'));
const Restock = lazy(() => import('./pages/Restock'));
const Reports = lazy(() => import('./pages/Reports'));
const Customers = lazy(() => import('./pages/Customers'));
const Settings = lazy(() => import('./pages/Settings'));

function homePath(role: string | null) {
  if (role === 'admin') return '/admin';
  if (role === 'owner') return '/owner/stores';
  return '/reports';
}

function OwnerStoresGate() {
  const { isAuthenticated, userRole, ownerToken } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (userRole === 'owner' || (userRole === 'business' && ownerToken)) {
    return <OwnerStores />;
  }
  return <Navigate to={homePath(userRole)} replace />;
}

function ProtectedRoute({ children, role }: { children: React.ReactNode; role: 'admin' | 'business' | 'owner' }) {
  const { isAuthenticated, userRole } = useAuthStore();

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (userRole !== role) return <Navigate to={homePath(userRole)} replace />;

  return <>{children}</>;
}

export default function App() {
  const { isAuthenticated, userRole } = useAuthStore();

  return (
    <BrowserRouter>
      <Suspense fallback={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-base, #121418)', color: 'var(--text-main, #ffffff)', fontFamily: 'Outfit, sans-serif' }}>
          Loading...
        </div>
      }>
        <Routes>
          <Route
            path="/login"
            element={
              isAuthenticated ? <Navigate to={homePath(userRole)} replace /> : <Login />
            }
          />

          <Route
            path="/admin"
            element={
              <ProtectedRoute role="admin">
                <AdminDashboard />
              </ProtectedRoute>
            }
          />

          <Route path="/owner/stores" element={<OwnerStoresGate />} />

          <Route element={<ProtectedRoute role="business"><Layout /></ProtectedRoute>}>
            <Route path="/inventory" element={<Inventory />} />
            <Route path="/restock" element={<Restock />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/customers" element={<Customers />} />
            <Route path="/settings" element={<Settings />} />
          </Route>

          <Route path="*" element={<Navigate to={isAuthenticated ? homePath(userRole) : '/login'} replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
