import { useState, useEffect } from 'react';
import { NavLink, useLocation, Outlet } from 'react-router-dom';
import { useAuthStore } from '../store/auth';
import {
  Package,
  BarChart3,
  LogOut,
  Store,
  Users,
  User,
  ChevronDown,
  MapPin,
  Phone,
  Truck,
  Settings as SettingsIcon,
  Sun,
  Moon,
} from 'lucide-react';
import StoreSwitcher from './StoreSwitcher';
import RippleButton from './RippleButton';

const navItems = [
  { path: '/reports', label: 'Reports', icon: BarChart3 },
  { path: '/inventory', label: 'Inventory', icon: Package },
  { path: '/restock', label: 'Restock', icon: Truck },
  { path: '/customers', label: 'Customers', icon: Users },
  { path: '/settings', label: 'Settings', icon: SettingsIcon },
];

export default function Layout() {
  const {
    businessName,
    businessLogo,
    businessAddress,
    businessPhone,
    userName,
    userRole,
    logout,
  } = useAuthStore();

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('portal-theme') as 'light' | 'dark') || 'dark';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('portal-theme', theme);
  }, [theme]);

  const location = useLocation();

  const displayInitial = (userName?.[0] || businessName?.[0] || 'U').toUpperCase();

  useEffect(() => {
    setDropdownOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!dropdownOpen) return;
    const handleClick = () => setDropdownOpen(false);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, [dropdownOpen]);

  const navClass = (isActive: boolean) =>
    `portal-nav-link${isActive ? ' active' : ''}`;

  return (
    <div className="portal-shell">
      {/* Desktop sidebar only — hidden on phone via responsive.css */}
      <aside className="portal-sidebar no-print" aria-label="Main navigation">
        <div className="portal-sidebar-brand">
          <div className="portal-sidebar-logo">₵</div>
          <div>
            <h2>SikaPOS</h2>
            <p>Cloud Portal</p>
          </div>
        </div>

        <nav className="portal-sidebar-nav">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <NavLink key={item.path} to={item.path} className={navClass(isActive)}>
                <Icon size={20} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
      </aside>

      <main className="portal-main">
        <header className="portal-header no-print">
          <div className="portal-header-store">
            <div style={{
              width: '32px', height: '32px', borderRadius: '8px',
              background: 'var(--primary-glow)', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              border: '1px solid rgba(212,160,23,0.2)'
            }}>
              <Store size={18} style={{ color: 'var(--primary)' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <span className="portal-header-store-name" style={{ fontSize: '15px', lineHeight: 1.2 }}>{businessName}</span>
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Cloud Active</span>
            </div>
            <StoreSwitcher />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <RippleButton
              type="button"
              className="icon-btn portal-theme-toggle-btn"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              aria-label="Toggle theme"
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid var(--border-light)',
                borderRadius: '12px',
                width: '40px',
                height: '40px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: theme === 'dark' ? 'var(--primary)' : 'var(--text-main)',
                cursor: 'pointer',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
            >
              {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
            </RippleButton>

            <div className="portal-header-profile" onClick={(e) => e.stopPropagation()}>
              <RippleButton
                type="button"
                className="icon-btn portal-profile-btn"
                onClick={() => setDropdownOpen(!dropdownOpen)}
                aria-expanded={dropdownOpen}
                aria-label="Account menu"
                style={{
                  padding: '4px 8px 4px 4px',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid var(--border-light)',
                  borderRadius: '100px',
                  height: '40px',
                }}
              >
                <div className="portal-profile-avatar" style={{ width: '32px', height: '32px', fontSize: '14px' }}>{displayInitial}</div>
                <ChevronDown
                  size={14}
                  style={{
                    color: 'var(--text-muted)',
                    transform: dropdownOpen ? 'rotate(180deg)' : 'none',
                    transition: 'transform 0.2s var(--motion-standard)',
                  }}
                />
              </RippleButton>

              {dropdownOpen && (
                <div className="portal-profile-menu" onClick={(e) => e.stopPropagation()}>
                  <div className="portal-profile-menu-header">
                    <div className="portal-profile-menu-brand">
                      {businessLogo ? (
                        <img src={businessLogo} alt="" className="portal-profile-menu-logo" />
                      ) : (
                        <div className="portal-profile-menu-logo-placeholder">
                          <Store size={28} />
                        </div>
                      )}
                      <h3>{businessName}</h3>
                      <p>{userRole} account</p>
                      {businessAddress && (
                        <div className="portal-profile-menu-meta">
                          <MapPin size={14} color="var(--primary)" />
                          <span>{businessAddress}</span>
                        </div>
                      )}
                      {businessPhone && (
                        <div className="portal-profile-menu-meta">
                          <Phone size={14} color="var(--primary)" />
                          <span>{businessPhone}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ padding: 8 }}>
                    <div className="portal-profile-menu-user">
                      <User size={18} style={{ color: 'var(--primary)' }} />
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>{userName || 'Administrator'}</p>
                        <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>Logged in via PIN</p>
                      </div>
                    </div>
                    <RippleButton type="button" className="portal-sign-out-btn" onClick={logout}>
                      <LogOut size={18} />
                      Sign Out
                    </RippleButton>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="portal-content">
          <Outlet />
        </div>

        {/* Phone navigation — same items & labels as sidebar */}
        <nav className="portal-bottom-nav no-print" aria-label="Main navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={isActive ? 'active' : ''}
                aria-current={isActive ? 'page' : undefined}
              >
                <Icon size={22} strokeWidth={isActive ? 2.5 : 2} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
      </main>
    </div>
  );
}
