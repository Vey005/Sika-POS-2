import { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { getApiUrl } from '../config/api';
import { useAuthStore } from '../store/auth';
import {
  Users, Plus, RefreshCw, Shield, X, Eye, EyeOff,
  Trash2, Edit3, ShoppingCart, Package, Truck, BarChart3,
  LayoutDashboard, Settings as SettingsIcon, UserCheck
} from 'lucide-react';

interface StaffUser {
  id: number;
  local_id: number;
  name: string;
  role: 'cashier' | 'manager' | 'admin';
  cashier_nav_visibility: string | null;
  created_at: string;
  updated_at: string;
}

const TABS = [
  { id: 'pos',       label: 'POS',       icon: ShoppingCart,    locked: true },
  { id: 'inventory', label: 'Inventory', icon: Package,         locked: false },
  { id: 'restock',   label: 'Restock',   icon: Truck,           locked: false },
  { id: 'customers', label: 'Customers', icon: Users,           locked: false },
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, locked: false },
  { id: 'reports',   label: 'Reports',   icon: BarChart3,       locked: false },
  { id: 'settings',  label: 'Settings',  icon: SettingsIcon,    locked: false },
];

const DEFAULT_VIS: Record<string, boolean> = {
  pos: true, inventory: false, restock: false,
  customers: true, dashboard: true, reports: false, settings: false,
};

function parseVis(json: string | null | undefined): Record<string, boolean> {
  const out = { ...DEFAULT_VIS };
  if (!json) return out;
  try {
    const p = JSON.parse(json) as Record<string, boolean>;
    for (const k of Object.keys(DEFAULT_VIS)) {
      if (typeof p[k] === 'boolean') out[k] = p[k];
    }
  } catch { /* keep defaults */ }
  out.pos = true;
  return out;
}

const ROLE_COLORS: Record<string, { bg: string; text: string }> = {
  admin:   { bg: 'var(--role-admin-bg)', text: 'var(--role-admin-text)' },
  manager: { bg: 'var(--role-manager-bg)', text: 'var(--role-manager-text)' },
  cashier: { bg: 'var(--role-cashier-bg)', text: 'var(--role-cashier-text)' },
};

const emptyForm = { name: '', pin: '', role: 'cashier' as StaffUser['role'], vis: { ...DEFAULT_VIS } };

export default function Settings() {
  const { token } = useAuthStore();
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editUser, setEditUser] = useState<StaffUser | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [showPin, setShowPin] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<StaffUser | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(getApiUrl('/api/portal/users'), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setUsers(data.users || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  useEffect(() => {
    const portalContent = document.querySelector('.portal-content') as HTMLElement;
    const isAnyModalOpen = showModal || !!deleteConfirm;
    if (isAnyModalOpen) {
      document.body.style.overflow = 'hidden';
      if (portalContent) {
        portalContent.style.overflow = 'hidden';
      }
      window.scrollTo(0, 0);
    } else {
      document.body.style.overflow = '';
      if (portalContent) {
        portalContent.style.overflow = '';
      }
    }
    return () => {
      document.body.style.overflow = '';
      if (portalContent) {
        portalContent.style.overflow = '';
      }
    };
  }, [showModal, deleteConfirm]);

  function openCreate() {
    setEditUser(null);
    setForm(emptyForm);
    setShowPin(false);
    setError('');
    setShowModal(true);
  }

  function openEdit(u: StaffUser) {
    setEditUser(u);
    setForm({ name: u.name, pin: '', role: u.role, vis: parseVis(u.cashier_nav_visibility) });
    setShowPin(false);
    setError('');
    setShowModal(true);
  }

  async function handleSubmit() {
    setError('');
    if (!form.name.trim()) return setError('Name is required.');
    if (!editUser && form.pin.trim().length < 4) return setError('PIN must be at least 4 characters.');
    if (editUser && form.pin && form.pin.trim().length < 4) return setError('New PIN must be at least 4 characters.');

    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        name: form.name.trim(),
        role: form.role,
        cashier_nav_visibility: form.role === 'cashier' ? JSON.stringify(form.vis) : null,
      };
      if (!editUser || form.pin.trim()) body.pin = form.pin.trim();

      const url  = getApiUrl(editUser ? `/api/portal/users/${editUser.id}` : '/api/portal/users');
      const method = editUser ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to save');
      setShowModal(false);
      fetchUsers();
    } catch (e: any) {
      setError(e.message || 'An error occurred.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(u: StaffUser) {
    try {
      const res = await fetch(getApiUrl(`/api/portal/users/${u.id}`), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to delete');
      setDeleteConfirm(null);
      fetchUsers();
    } catch (e: any) {
      alert(e.message);
    }
  }



  return (
    <div>
      <style>{`
        .desktop-only-table {
          display: block !important;
        }
        .mobile-only-cards {
          display: none !important;
        }
        @media (max-width: 768px) {
          .desktop-only-table {
            display: none !important;
          }
          .mobile-only-cards {
            display: grid !important;
            grid-template-columns: 1fr;
            gap: 12px;
            padding: 16px;
          }
        }
      `}</style>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h1 style={{ fontSize: 'clamp(20px,5vw,28px)', marginBottom: 4 }}>Settings</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Manage staff accounts and cashier tab permissions</p>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={fetchUsers} className="btn-secondary" style={{ padding: '10px 16px' }}>
              <RefreshCw size={15} /> Refresh
            </button>
            <button onClick={openCreate} className="btn-primary" style={{ padding: '10px 18px' }}>
              <Plus size={15} /> Add Staff
            </button>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 16, marginBottom: 24 }}>
        {(['admin','manager','cashier'] as const).map(role => {
          const count = users.filter(u => u.role === role).length;
          const c = ROLE_COLORS[role];
          return (
            <div key={role} className="glass-panel" style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: c.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Shield size={20} style={{ color: c.text }} />
              </div>
              <div>
                <p style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>{count}</p>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, textTransform: 'capitalize' }}>{role}{count !== 1 ? 's' : ''}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Staff table */}
      <div className="glass-panel" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <UserCheck size={18} style={{ color: 'var(--primary)' }} />
          <h3 style={{ margin: 0, fontSize: 16 }}>Staff Members</h3>
          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>{users.length} total</span>
        </div>

        {loading ? (
          <div style={{ padding: 60, textAlign: 'center' }}>
            <RefreshCw size={28} className="spin" style={{ opacity: 0.4 }} />
          </div>
        ) : users.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)' }}>
            <Users size={48} style={{ marginBottom: 12, opacity: 0.25 }} />
            <p>No staff members yet. Click "Add Staff" to create one.</p>
          </div>
        ) : (
          <>
            <div className="desktop-only-table" style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.02)' }}>
                    {['Staff Member','Role','Cashier Tabs Visible','Added','Actions'].map(h => (
                      <th key={h} style={{ padding: '13px 20px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => {
                    const vis = parseVis(u.cashier_nav_visibility);
                    const activeTabs = TABS.filter(t => vis[t.id]).map(t => t.label);
                    const rc = ROLE_COLORS[u.role] || ROLE_COLORS.cashier;
                    return (
                      <tr key={u.id} style={{ borderTop: '1px solid var(--border-light)', transition: 'background 0.15s' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.025)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                        <td style={{ padding: '16px 20px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div style={{ width: 38, height: 38, borderRadius: 10, background: rc.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, color: rc.text }}>
                              {u.name[0]?.toUpperCase()}
                            </div>
                            <div>
                              <p style={{ margin: 0, fontWeight: 600 }}>{u.name}</p>
                              <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>ID #{u.local_id ?? u.id}</p>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '16px 20px' }}>
                          <span style={{ padding: '4px 10px', borderRadius: 20, background: rc.bg, color: rc.text, fontSize: 12, fontWeight: 600, textTransform: 'capitalize' }}>
                            {u.role}
                          </span>
                        </td>
                        <td style={{ padding: '16px 20px' }}>
                          {u.role === 'cashier' ? (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                              {activeTabs.map(t => (
                                <span key={t} style={{ padding: '3px 8px', borderRadius: 6, background: 'rgba(212,160,23,0.12)', color: 'var(--primary)', fontSize: 11, fontWeight: 500 }}>{t}</span>
                              ))}
                            </div>
                          ) : (
                            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Full access</span>
                          )}
                        </td>
                        <td style={{ padding: '16px 20px', fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                          {new Date(u.created_at).toLocaleDateString('en-GH', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </td>
                        <td style={{ padding: '16px 20px' }}>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button onClick={() => openEdit(u)} style={{ padding: '7px 14px', background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 'var(--radius-sm)', color: '#818CF8', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.2s' }}
                              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.22)'; }}
                              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.12)'; }}>
                              <Edit3 size={13} /> Edit
                            </button>
                            <button onClick={() => setDeleteConfirm(u)} style={{ padding: '7px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 'var(--radius-sm)', color: '#EF4444', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.2s' }}
                              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.2)'; }}
                              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.1)'; }}>
                              <Trash2 size={13} /> Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards View */}
            <div className="mobile-only-cards">
              {users.map(u => {
                const vis = parseVis(u.cashier_nav_visibility);
                const activeTabs = TABS.filter(t => vis[t.id]).map(t => t.label);
                const rc = ROLE_COLORS[u.role] || ROLE_COLORS.cashier;
                return (
                  <div key={u.id} className="data-card animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ width: 44, height: 44, borderRadius: 12, background: rc.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, color: rc.text, boxShadow: 'var(--elevation-1)' }}>
                          {u.name[0]?.toUpperCase()}
                        </div>
                        <div>
                          <p style={{ margin: 0, fontWeight: 700, fontSize: '16px', color: 'var(--text-main)' }}>{u.name}</p>
                          <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>ID #{u.local_id ?? u.id}</p>
                        </div>
                      </div>
                      <span style={{ padding: '4px 12px', borderRadius: '100px', background: rc.bg, color: rc.text, fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        {u.role}
                      </span>
                    </div>

                    <div style={{ background: 'rgba(0,0,0,0.15)', borderRadius: '14px', padding: '14px', border: '1px solid var(--border-light)' }}>
                      {u.role === 'cashier' ? (
                        <>
                          <p style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Visible POS Tabs</p>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                            {activeTabs.map(t => (
                              <span key={t} style={{ padding: '3px 10px', borderRadius: '8px', background: 'var(--primary-glow)', color: 'var(--primary)', fontSize: '11px', fontWeight: 600, border: '1px solid rgba(212,160,23,0.2)' }}>{t}</span>
                            ))}
                          </div>
                        </>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)' }}>
                          <Shield size={16} style={{ color: 'var(--primary)' }} />
                          <span style={{ fontSize: '13px', fontWeight: 500 }}>Full Administrative Access</span>
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        Joined {new Date(u.created_at).toLocaleDateString('en-GH', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                      <div style={{ display: 'flex', gap: '10px' }}>
                        <button onClick={() => openEdit(u)} style={{ padding: '8px 14px', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: '10px', color: '#818CF8', fontSize: '12px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Edit3 size={14} /> Edit
                        </button>
                        <button onClick={() => setDeleteConfirm(u)} style={{ padding: '8px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '10px', color: '#EF4444', fontSize: '12px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Trash2 size={14} /> Delete
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Create / Edit Modal */}
      {showModal && createPortal(
        <div className="modal-overlay">
          <div className="glass-panel modal-panel" style={{ maxWidth: 520 }}>
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <h2 style={{ margin: 0, fontSize: 20 }}>{editUser ? 'Edit Staff Member' : 'Add Staff Member'}</h2>
              <button onClick={() => setShowModal(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {/* Name */}
              <div>
                <label style={{ display: 'block', fontSize: 13, color: 'var(--text-muted)', marginBottom: 6, fontWeight: 500 }}>Full Name *</label>
                <input
                  className="input-field"
                  placeholder="e.g. Kwame Asante"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                />
              </div>

              {/* Role */}
              <div>
                <label style={{ display: 'block', fontSize: 13, color: 'var(--text-muted)', marginBottom: 6, fontWeight: 500 }}>Role *</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {(['cashier', 'manager', 'admin'] as const).map(r => {
                    const rc = ROLE_COLORS[r];
                    const active = form.role === r;
                    return (
                      <button key={r} onClick={() => setForm(f => ({ ...f, role: r }))}
                        style={{ flex: 1, padding: '10px 12px', background: active ? rc.bg : 'var(--border-light)', border: `1px solid ${active ? rc.text + '77' : 'var(--border-light)'}`, borderRadius: 'var(--radius-md)', color: active ? rc.text : 'var(--text-muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize', transition: 'all 0.2s' }}>
                        {r}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* PIN */}
              <div>
                <label style={{ display: 'block', fontSize: 13, color: 'var(--text-muted)', marginBottom: 6, fontWeight: 500 }}>
                  {editUser ? 'New PIN (leave blank to keep current)' : 'PIN / Password *'}
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPin ? 'text' : 'password'}
                    className="input-field"
                    style={{ paddingRight: 44 }}
                    placeholder={editUser ? '••••••' : 'Min. 4 characters'}
                    value={form.pin}
                    onChange={e => setForm(f => ({ ...f, pin: e.target.value }))}
                  />
                  <button onClick={() => setShowPin(s => !s)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0 }}>
                    {showPin ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* Cashier tab visibility — only for cashiers */}
              {form.role === 'cashier' && (
                <div>
                  <label style={{ display: 'block', fontSize: 13, color: 'var(--text-muted)', marginBottom: 10, fontWeight: 500 }}>
                    Cashier Window Tabs
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {TABS.map(tab => {
                      const Icon = tab.icon;
                      const enabled = form.vis[tab.id];
                      return (
                        <button key={tab.id}
                          onClick={() => { if (!tab.locked) setForm(f => ({ ...f, vis: { ...f.vis, [tab.id]: !f.vis[tab.id] } })); }}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                            background: enabled ? 'var(--primary-glow)' : 'var(--border-light)',
                            border: `1px solid ${enabled ? 'var(--primary)' : 'var(--border-light)'}`,
                            borderRadius: 'var(--radius-md)', cursor: tab.locked ? 'default' : 'pointer',
                            color: enabled ? 'var(--primary)' : 'var(--text-secondary)', transition: 'all 0.2s',
                            fontSize: 13, fontWeight: 500, textAlign: 'left',
                          }}>
                          <Icon size={15} />
                          <span style={{ flex: 1 }}>{tab.label}</span>
                          {tab.locked && <span style={{ fontSize: 10, background: 'var(--primary-glow)', padding: '2px 6px', borderRadius: 4, color: 'var(--primary)' }}>Always On</span>}
                          {!tab.locked && (
                            <span style={{ width: 16, height: 16, borderRadius: 4, border: `1.5px solid ${enabled ? 'var(--primary)' : 'var(--border-strong)'}`, background: enabled ? 'var(--primary)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              {enabled && <span style={{ color: '#000', fontSize: 10, fontWeight: 700, lineHeight: 1 }}>✓</span>}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
                    These settings control which tabs are visible when this cashier logs into the POS desktop app.
                  </p>
                </div>
              )}

              {error && (
                <div style={{ padding: '12px 16px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 'var(--radius-md)', color: '#EF4444', fontSize: 13 }}>
                  {error}
                </div>
              )}

              <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
                <button onClick={() => setShowModal(false)} className="btn-secondary" style={{ flex: 1 }}>Cancel</button>
                <button onClick={handleSubmit} className="btn-primary" style={{ flex: 1 }} disabled={submitting}>
                  {submitting ? 'Saving...' : (editUser ? 'Save Changes' : 'Create Staff')}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && createPortal(
        <div className="modal-overlay">
          <div className="glass-panel modal-panel" style={{ maxWidth: 400 }}>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(239,68,68,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <Trash2 size={24} style={{ color: '#EF4444' }} />
              </div>
              <h2 style={{ margin: '0 0 8px', fontSize: 20 }}>Delete Staff Member?</h2>
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 14 }}>
                <strong style={{ color: 'var(--text-main)' }}>{deleteConfirm.name}</strong> will be permanently removed. This action cannot be undone.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => setDeleteConfirm(null)} className="btn-secondary" style={{ flex: 1 }}>Cancel</button>
              <button onClick={() => handleDelete(deleteConfirm)}
                style={{ flex: 1, padding: '12px 24px', background: '#EF4444', border: 'none', borderRadius: 'var(--radius-md)', color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}>
                Delete
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
