import { useState, useEffect } from 'react';
import { NavLink, useLocation, Outlet } from 'react-router-dom';
import { useAuthStore } from '../store/auth';
import {
  Package,
  BarChart3,
  LogOut,
  Menu,
  X,
  Store,
  Users
} from 'lucide-react';

const navItems = [
  { path: '/reports', label: 'Reports', icon: BarChart3 },
  { path: '/inventory', label: 'Inventory', icon: Package },
  { path: '/customers', label: 'Customers', icon: Users },
];

export default function Layout() {
  const { businessName, logout } = useAuthStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  
  // Close sidebar when route changes on mobile
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-base)' }}>
      {/* Mobile Sidebar Overlay */}
      <div
        className="no-print"
        style={{
          position: 'fixed',
          inset: 0,
          background: sidebarOpen ? 'rgba(0,0,0,0.5)' : 'transparent',
          zIndex: 40,
          pointerEvents: sidebarOpen ? 'auto' : 'none',
          transition: 'background 0.3s ease',
        }}
        onClick={() => sidebarOpen && setSidebarOpen(false)}
      />

      {/* Sidebar */}
      <aside
        className="no-print"
        style={{
          width: sidebarOpen ? 'min(260px, 80vw)' : '0',
          maxWidth: '260px',
          minWidth: sidebarOpen ? 'min(260px, 80vw)' : '0',
          background: 'var(--bg-base)',
          borderRight: '1px solid var(--border-light)',
          display: 'flex',
          flexDirection: 'column',
          position: 'fixed',
          left: sidebarOpen ? 0 : '-260px',
          top: 0,
          bottom: 0,
          zIndex: 50,
          transition: 'left 0.3s ease, width 0.3s ease',
        }}
      >
        {/* Logo */}
        <div style={{ padding: '24px 20px', borderBottom: '1px solid var(--border-light)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '20px',
                fontWeight: 700,
              }}
            >
              ₵
            </div>
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: 600, margin: 0 }}>SikaPOS</h2>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>Cloud Portal</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav style={{ flex: 1, padding: '16px 12px', overflowY: 'auto' }}>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: 'clamp(10px, 3vw, 12px) clamp(12px, 4vw, 16px)',
                  borderRadius: 'var(--radius-md)',
                  color: isActive ? 'var(--primary)' : 'var(--text-muted)',
                  background: isActive ? 'rgba(212, 160, 23, 0.1)' : 'transparent',
                  textDecoration: 'none',
                  marginBottom: '4px',
                  transition: 'all 0.2s',
                  fontWeight: 500,
                  fontSize: 'clamp(13px, 3.5vw, 14px)',
                  minHeight: '44px',
                }}
              >
                <Icon size={20} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
      </aside>

      {/* Main Content */}
      <main style={{ 
        flex: 1, 
        marginLeft: '0', 
        transition: 'margin-left 0.3s ease', 
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh'
      }}>
        {/* Mobile Header */}
        <header
          className="no-print"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: 'clamp(12px, 4vw, 16px) clamp(16px, 5vw, 20px)',
            borderBottom: '1px solid var(--border-light)',
            background: 'var(--bg-base)',
            position: 'sticky',
            top: 0,
            zIndex: 30,
            minHeight: '60px',
            gap: '12px',
          }}
        >
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-main)',
              cursor: 'pointer',
              padding: '12px',
              borderRadius: 'var(--radius-sm)',
              minWidth: '44px',
              minHeight: '44px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            aria-label={sidebarOpen ? 'Close menu' : 'Open menu'}
          >
            {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
          
          {/* Store Name - Top Left */}
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '8px',
            flex: 1,
            minWidth: 0,
          }}>
            <Store size={18} color="var(--primary)" />
            <span style={{ 
              fontSize: 'clamp(13px, 3.5vw, 15px)', 
              fontWeight: 600, 
              color: 'var(--text-main)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}>
              {businessName}
            </span>
          </div>

          {/* Logout Button - Top Right */}
          <button
            onClick={logout}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 12px',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-light)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: 'clamp(12px, 3vw, 13px)',
              transition: 'all 0.2s',
              minHeight: '36px',
            }}
          >
            <LogOut size={16} />
            <span style={{ display: 'none' }}>Logout</span>
          </button>
        </header>

        {/* Page Content */}
        <div style={{ 
          padding: 'clamp(16px, 4vw, 24px) clamp(12px, 3vw, 20px)', 
          maxWidth: '1800px', 
          margin: '0 auto',
          width: '100%',
          flex: 1,
        }}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
