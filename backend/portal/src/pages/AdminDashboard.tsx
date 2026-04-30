import { useEffect, useState } from 'react';
import { useAuthStore } from '../store/auth';
import { getApiUrl, API_CONFIG } from '../config/api';
import { LogOut, Key, Search, Activity, MonitorSmartphone, Calendar, PlusCircle, Trash2 } from 'lucide-react';

export default function AdminDashboard() {
  const { logout, token } = useAuthStore();
  const [licenses, setLicenses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [purging, setPurging] = useState(false);
  const [purgeResult, setPurgeResult] = useState<string | null>(null);
  const [search, setSearch] = useState('');

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

  useEffect(() => {
    fetchLicenses();
  }, []);

  const handleGenerate = async () => {
    if (!confirm('Generate a new license key?')) return;
    setGenerating(true);
    try {
      await fetch(getApiUrl(API_CONFIG.ENDPOINTS.ADMIN_GENERATE_LICENSE), { method: 'POST', ...authHeaders });
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

  const filteredLicenses = licenses.filter(l => 
    l.license_key.toLowerCase().includes(search.toLowerCase()) || 
    (l.business_name && l.business_name.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '40px 20px' }}>
      {/* Header */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '40px' }}>
        <div>
          <h1 style={{ fontSize: '32px', marginBottom: '8px' }}>Super Admin</h1>
          <p style={{ color: 'var(--text-muted)' }}>Manage SikaPOS deployments and licenses</p>
        </div>
        <button onClick={logout} className="btn-secondary">
          <LogOut size={16} /> Sign Out
        </button>
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
    </div>
  );
}
