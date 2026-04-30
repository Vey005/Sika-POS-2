import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import AdminDashboard from './pages/AdminDashboard';
import Layout from './components/Layout';
import Inventory from './pages/Inventory';
import Reports from './pages/Reports';
import { useAuthStore } from './store/auth';

function ProtectedRoute({ children, role }: { children: React.ReactNode; role: 'admin' | 'business' }) {
  const { isAuthenticated, userRole } = useAuthStore();
  
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (userRole !== role) return <Navigate to={userRole === 'admin' ? '/admin' : '/dashboard'} replace />;
  
  return <>{children}</>;
}

export default function App() {
  const { isAuthenticated, userRole } = useAuthStore();

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={
          isAuthenticated 
            ? <Navigate to={userRole === 'admin' ? '/admin' : '/reports'} replace /> 
            : <Login />
        } />
        
        <Route path="/admin" element={
          <ProtectedRoute role="admin">
            <AdminDashboard />
          </ProtectedRoute>
        } />
        
        <Route element={<ProtectedRoute role="business"><Layout /></ProtectedRoute>}>
          <Route path="/inventory" element={<Inventory />} />
          <Route path="/reports" element={<Reports />} />
        </Route>

        <Route path="*" element={<Navigate to={isAuthenticated ? (userRole === 'admin' ? '/admin' : '/reports') : '/login'} replace />} />
      </Routes>
    </BrowserRouter>
  );
}
