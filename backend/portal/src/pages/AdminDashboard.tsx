import { useEffect, useState } from 'react';
import { useAuthStore } from '../store/auth';
import { getApiUrl, API_CONFIG } from '../config/api';
import { LogOut, Key, Search, Activity, MonitorSmartphone, Calendar, PlusCircle, Trash2 } from 'lucide-react';

export default function AdminDashboard() {
  const { logout, token } = useAuthStore();
  const [licenses, setLicenses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [newlyGeneratedKey, setNewlyGeneratedKey] = useState<string | null>(null);
  const [purging, setPurging] = useState(false);
  const [purgeResult, setPurgeResult] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Super Admin States
  const [admins, setAdmins] = useState<any[]>([]);
  const [newAdmin, setNewAdmin] = useState({ name: '', email: '', password: '' });
  const [showAdminForm, setShowAdminForm] = useState(false);
  const [adminLoading, setAdminLoading] = useState(false);

  const authHeaders = { headers: { Authorization: `Bearer ${token}` } };

  const fetchLicenses = async () => {
    try {
      const res = await fetch(getApiUrl(API_CONFIG.ENDPOINTS.ADMIN_LICENSES), authHeaders);
      const data = await res.json();
      setLicenses(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAdmins = async () => {
    try {
      const res = await fetch(getApiUrl(API_CONFIG.ENDPOINTS.ADMIN_SUPER_ADMINS), authHeaders);
      const data = await res.json();
      if (data.success) setAdmins(data.admins);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchLicenses();
    fetchAdmins();
  }, []);

  const handleGenerate = async () => {
    if (!confirm('Generate a new license key?')) return;
    setGenerating(true);
    setNewlyGeneratedKey(null);
    try {
      const res = await fetch(getApiUrl(API_CONFIG.ENDPOINTS.ADMIN_GENERATE_LICENSE), { method: 'POST', ...authHeaders });
      const data = await res.json();
      if (data.success && data.license_key) {
        setNewlyGeneratedKey(data.license_key);
      }
      fetchLicenses();
    } catch (err) {
      alert('Failed to generate key');
    } finally {
      setGenerating(false);
    }
  };

  const handlePurgeDuplicates = async () => {
    if (!confirm('This will permanently delete all duplicate transaction records from the cloud database, keeping only one copy of each sale. Continue?')) return;
    setPurging(true);
    setPurgeResult(null);
    try {
      const res = await fetch(getApiUrl(API_CONFIG.ENDPOINTS.ADMIN_PURGE_DUPLICATES), { method: 'POST', ...authHeaders });
      const data = await res.json();
      if (data.success) {
        setPurgeResult(`Deleted ${data.deleted} duplicate record(s). Revenue totals are now accurate.`);
      } else {
        setPurgeResult(`Failed: ${data.message}`);
      }
    } catch (err) {
      setPurgeResult('Failed to connect to the server.');
    } finally {
      setPurging(false);
    }
  };

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminLoading(true);
    try {
      const res = await fetch(getApiUrl(API_CONFIG.ENDPOINTS.ADMIN_SUPER_ADMINS), {
        method: 'POST',
        headers: { ...authHeaders.headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(newAdmin)
      });
      const data = await res.json();
      if (data.success) {
        setNewAdmin({ name: '', email: '', password: '' });
        setShowAdminForm(false);
        fetchAdmins();
      } else {
        alert(data.error || 'Failed to create admin');
      }
    } catch (err) {
      alert('Failed to connect to the server');
    } finally {
      setAdminLoading(false);
    }
  };

  const handleDeleteAdmin = async (id: number) => {
    if (!confirm('Are you sure you want to delete this super admin?')) return;
    try {
      const res = await fetch(`${getApiUrl(API_CONFIG.ENDPOINTS.ADMIN_SUPER_ADMINS)}/${id}`, {
        method: 'DELETE',
        ...authHeaders
      });
      const data = await res.json();
      if (data.success) fetchAdmins();
      else alert(data.error);
    } catch (err) {
      alert('Failed to connect to the server');
    }
  };

  const handleDeleteLicense = async (id: number) => {
    if (!confirm('Are you sure you want to delete this license key? This action cannot be undone.')) return;
    try {
      const res = await fetch(`${getApiUrl(API_CONFIG.ENDPOINTS.ADMIN_LICENSES)}/${id}`, {
        method: 'DELETE',
        ...authHeaders
      });
      const data = await res.json();
      if (data.success) fetchLicenses();
      else alert(data.error || 'Failed to delete license');
    } catch (err) {
      alert('Failed to connect to the server');
    }
  };

  const filteredLicenses = licenses.filter(l => 
    l.status === 'active' &&
    (l.license_key.toLowerCase().includes(search.toLowerCase()) || 
    (l.business_name && l.business_name.toLowerCase().includes(search.toLowerCase())))
  );

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '40px 20px' }}>
      {/* Header */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '40px' }}>
        <div>
          <h1 style={{ fontSize: '32px', marginBottom: '8px' }}>Super Admin</h1>
          <p style={{ color: 'var(--text-muted)' }}>Manage SikaPOS deployments and licenses</p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button className="btn-primary" onClick={() => setShowAdminForm(!showAdminForm)}>
            <PlusCircle size={18} /> {showAdminForm ? 'Close Form' : 'Add Admin'}
          </button>
          <button onClick={logout} className="btn-secondary">
            <LogOut size={16} /> Sign Out
          </button>
        </div>
      </header>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginBottom: '40px' }}>
        <div className="glass-panel" style={{ padding: '24px' }}>
          <div style={{ color: 'var(--primary)', marginBottom: '12px' }}><Key size={24} /></div>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '4px' }}>Total Licenses</p>
          <p style={{ fontSize: '32px', fontWeight: 600, fontFamily: 'Outfit' }}>{licenses.length}</p>
        </div>
        <div className="glass-panel" style={{ padding: '24px' }}>
          <div style={{ color: 'var(--success)', marginBottom: '12px' }}><Activity size={24} /></div>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '4px' }}>Active Deployments</p>
          <p style={{ fontSize: '32px', fontWeight: 600, fontFamily: 'Outfit' }}>
            {licenses.filter(l => l.status === 'active').length}
          </p>
        </div>
      </div>

      {/* Admin Form (moved near top) */}
      {showAdminForm && (
        <form onSubmit={handleCreateAdmin} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '16px', marginBottom: '40px', padding: '20px', background: 'var(--panel-bg)', borderRadius: '12px', border: '1px solid var(--primary)', boxShadow: '0 0 20px rgba(139, 92, 246, 0.15)' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', color: 'var(--text-muted)' }}>Name</label>
            <input type="text" className="input-field" required value={newAdmin.name} onChange={e => setNewAdmin({...newAdmin, name: e.target.value})} placeholder="Admin Name" />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', color: 'var(--text-muted)' }}>Email</label>
            <input type="email" className="input-field" required value={newAdmin.email} onChange={e => setNewAdmin({...newAdmin, email: e.target.value})} placeholder="admin@example.com" />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', color: 'var(--text-muted)' }}>Password</label>
            <input type="password" className="input-field" required value={newAdmin.password} onChange={e => setNewAdmin({...newAdmin, password: e.target.value})} placeholder="••••••••" />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button type="submit" className="btn-primary" disabled={adminLoading} style={{ height: '42px' }}>
              {adminLoading ? 'Adding...' : 'Save Admin'}
            </button>
          </div>
        </form>
      )}

      {/* Main Content */}
      <div className="glass-panel" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div style={{ position: 'relative', width: '300px' }}>
            <Search size={16} style={{ position: 'absolute', left: '16px', top: '14px', color: 'var(--text-muted)' }} />
            <input 
              type="text" 
              className="input-field" 
              placeholder="Search keys or businesses..." 
              style={{ paddingLeft: '44px' }}
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <button className="btn-primary" onClick={handleGenerate} disabled={generating}>
            <PlusCircle size={18} /> {generating ? 'Generating...' : 'Generate Key'}
          </button>
          <button
            onClick={handlePurgeDuplicates}
            disabled={purging}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '10px 18px', borderRadius: '8px', border: '1px solid rgba(239,68,68,0.4)',
              background: 'rgba(239,68,68,0.1)', color: '#ef4444',
              cursor: 'pointer', fontSize: '14px', fontWeight: 500,
              transition: 'background 0.2s'
            }}
          >
            <Trash2 size={16} /> {purging ? 'Purging...' : 'Purge Duplicates'}
          </button>
        </div>

        {newlyGeneratedKey && (
          <div style={{
            padding: '16px', borderRadius: '8px', marginBottom: '24px',
            background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center'
          }}>
            <div>
              <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '4px' }}>New License Key Generated</p>
              <p style={{ fontSize: '20px', fontWeight: 600, color: 'var(--success)', fontFamily: 'monospace', letterSpacing: '1px' }}>{newlyGeneratedKey}</p>
            </div>
            <button 
              className="btn-primary" 
              onClick={() => {
                navigator.clipboard.writeText(newlyGeneratedKey);
                alert('Copied to clipboard!');
              }}
            >
              Copy Key
            </button>
          </div>
        )}

        {purgeResult && (
          <div style={{
            padding: '12px 16px', borderRadius: '8px', marginBottom: '16px',
            background: purgeResult.startsWith('✅') ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
            border: `1px solid ${purgeResult.startsWith('✅') ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
            color: purgeResult.startsWith('✅') ? '#10b981' : '#ef4444',
            fontSize: '14px'
          }}>
            {purgeResult}
          </div>
        )}

        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-light)', color: 'var(--text-muted)', fontSize: '14px' }}>
                  <th style={{ padding: '16px', fontWeight: 500 }}>License Key</th>
                  <th style={{ padding: '16px', fontWeight: 500 }}>Business Name</th>
                  <th style={{ padding: '16px', fontWeight: 500 }}>Status</th>
                  <th style={{ padding: '16px', fontWeight: 500 }}>Machine ID</th>
                  <th style={{ padding: '16px', fontWeight: 500 }}>Activated On</th>
                  <th style={{ padding: '16px', fontWeight: 500, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredLicenses.map((l) => (
                  <tr key={l.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', transition: 'background 0.2s' }}>
                    <td style={{ padding: '16px', fontFamily: 'monospace', letterSpacing: '1px', color: 'var(--primary)' }}>
                      {l.license_key}
                    </td>
                    <td style={{ padding: '16px', fontWeight: 500 }}>
                      {l.business_name || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Not registered</span>}
                    </td>
                    <td style={{ padding: '16px' }}>
                      <span style={{ 
                        display: 'inline-flex', padding: '4px 12px', borderRadius: '100px', fontSize: '12px', fontWeight: 600,
                        background: l.status === 'active' ? 'rgba(16,185,129,0.1)' : 'rgba(255,255,255,0.1)',
                        color: l.status === 'active' ? 'var(--success)' : 'var(--text-muted)'
                      }}>
                        {l.status.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ padding: '16px', color: 'var(--text-muted)', fontSize: '14px' }}>
                      {l.machine_id ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <MonitorSmartphone size={14} /> {l.machine_id.substring(0, 8)}...
                        </div>
                      ) : '-'}
                    </td>
                    <td style={{ padding: '16px', color: 'var(--text-muted)', fontSize: '14px' }}>
                      {l.activated_at ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Calendar size={14} /> {new Date(l.activated_at).toLocaleDateString()}
                        </div>
                      ) : '-'}
                    </td>
                    <td style={{ padding: '16px', textAlign: 'right' }}>
                      <button 
                        onClick={() => handleDeleteLicense(l.id)} 
                        style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px' }} 
                        title="Delete License"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredLicenses.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      No licenses found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Super Admins Section */}
      <div className="glass-panel" style={{ padding: '24px', marginTop: '40px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 600 }}>Super Admins List</h2>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-light)', color: 'var(--text-muted)', fontSize: '14px' }}>
                <th style={{ padding: '16px', fontWeight: 500 }}>Name</th>
                <th style={{ padding: '16px', fontWeight: 500 }}>Email</th>
                <th style={{ padding: '16px', fontWeight: 500 }}>Added On</th>
                <th style={{ padding: '16px', fontWeight: 500, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {admins.map((admin) => (
                <tr key={admin.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', transition: 'background 0.2s' }}>
                  <td style={{ padding: '16px', fontWeight: 500 }}>{admin.name}</td>
                  <td style={{ padding: '16px', color: 'var(--text-muted)' }}>{admin.email}</td>
                  <td style={{ padding: '16px', color: 'var(--text-muted)', fontSize: '14px' }}>
                    {new Date(admin.created_at).toLocaleDateString()}
                  </td>
                  <td style={{ padding: '16px', textAlign: 'right' }}>
                    <button onClick={() => handleDeleteAdmin(admin.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px' }} title="Delete Admin">
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
              {admins.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No super admins found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
