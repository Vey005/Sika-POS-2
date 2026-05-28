import { useEffect, useState, useCallback } from 'react';
import { useAuthStore } from '../store/auth';
import { getApiUrl, API_CONFIG } from '../config/api';
import { LogOut, Key, Search, Activity, MonitorSmartphone, Calendar, PlusCircle, Trash2, UploadCloud, Download, FileText, Shield, Users, Info, Cpu, BarChart3, TrendingUp, Package } from 'lucide-react';

export default function AdminDashboard() {
  const { logout, token } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'licenses' | 'admins' | 'updates' | 'analytics'>('licenses');
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

  const [uploadingUpdate, setUploadingUpdate] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [updateUploadResult, setUpdateUploadResult] = useState<{ success: boolean; message: string } | null>(null);
  const [updateFiles, setUpdateFiles] = useState<{ latestYml: File | null; installer: File | null }>({ latestYml: null, installer: null });
  const [releases, setReleases] = useState<any[]>([]);
  const [releasesLoading, setReleasesLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);

  // Product Analytics States
  const [analyticsData, setAnalyticsData] = useState<any>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);

  const authHeaders = { headers: { Authorization: `Bearer ${token}` } };

  const formatFileSize = (bytes: number) => {
    if (!bytes || bytes <= 0) return '—';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const fetchLicenses = async () => {
    try {
      const res = await fetch(getApiUrl(API_CONFIG.ENDPOINTS.ADMIN_LICENSES), authHeaders);
      const data = await res.json();
      setLicenses(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
      setLicenses([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchAdmins = async () => {
    try {
      const res = await fetch(getApiUrl(API_CONFIG.ENDPOINTS.ADMIN_SUPER_ADMINS), authHeaders);
      const data = await res.json();
      if (data.success && Array.isArray(data.admins)) {
        setAdmins(data.admins);
      } else {
        setAdmins([]);
      }
    } catch (err) {
      console.error(err);
      setAdmins([]);
    }
  };

  const fetchReleases = async () => {
    setReleasesLoading(true);
    try {
      const res = await fetch(getApiUrl(API_CONFIG.ENDPOINTS.ADMIN_RELEASES), authHeaders);
      const data = await res.json();
      if (data.success && Array.isArray(data.releases)) {
        setReleases(data.releases);
      } else {
        setReleases([]);
      }
    } catch (err) {
      console.error(err);
      setReleases([]);
    } finally {
      setReleasesLoading(false);
    }
  };

  const downloadReleaseFile = async (releaseId: number, filename: string, kind: 'installer' | 'yml') => {
    setDownloadingId(releaseId);
    try {
      const endpoint =
        kind === 'yml'
          ? `${API_CONFIG.ENDPOINTS.ADMIN_RELEASES}/${releaseId}/download-yml`
          : `${API_CONFIG.ENDPOINTS.ADMIN_RELEASES}/${releaseId}/download`;
      const res = await fetch(getApiUrl(endpoint), authHeaders);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert((err as { error?: string }).error || 'Download failed');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      alert('Failed to download file');
    } finally {
      setDownloadingId(null);
    }
  };

  useEffect(() => {
    fetchLicenses();
    fetchAdmins();
    fetchReleases();
  }, []);

  const fetchProductAnalytics = useCallback(async () => {
    setAnalyticsLoading(true);
    setAnalyticsError(null);
    try {
      const res = await fetch(getApiUrl(API_CONFIG.ENDPOINTS.ADMIN_PRODUCT_ANALYTICS), authHeaders);
      if (!res.ok) {
        throw new Error(`Server returned status ${res.status}`);
      }
      const contentType = res.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error('Server did not return JSON. The backend might still be deploying.');
      }
      const data = await res.json();
      setAnalyticsData(data);
    } catch (err: any) {
      console.error(err);
      setAnalyticsError(err.message || 'Failed to fetch product analytics');
    } finally {
      setAnalyticsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (activeTab === 'analytics') {
      fetchProductAnalytics();
    }
  }, [activeTab, fetchProductAnalytics]);

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

  const handleUploadUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!updateFiles.latestYml || !updateFiles.installer) {
      alert('Please select both the latest.yml file and the installer executable.');
      return;
    }

    setUploadingUpdate(true);
    setUploadProgress(0);
    setUpdateUploadResult(null);

    const installerFile = updateFiles.installer;
    const latestYmlFile = updateFiles.latestYml;
    const chunkSize = 5 * 1024 * 1024; // 5MB chunks
    const totalChunks = Math.ceil(installerFile.size / chunkSize);

    try {
      // 1. Upload installer chunks sequentially
      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        const start = chunkIndex * chunkSize;
        const end = Math.min(start + chunkSize, installerFile.size);
        const chunk = installerFile.slice(start, end);

        const formData = new FormData();
        formData.append('chunk', chunk, `chunk-${Date.now()}-${chunkIndex}`);
        formData.append('chunkIndex', chunkIndex.toString());
        formData.append('totalChunks', totalChunks.toString());
        formData.append('originalname', installerFile.name);

        await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('POST', getApiUrl('/api/portal/admin/updates/upload-chunk'), true);
          xhr.setRequestHeader('Authorization', `Bearer ${token}`);

          xhr.onload = () => {
            if (xhr.status === 200) {
              try {
                const data = JSON.parse(xhr.responseText);
                if (data.success) {
                  setUploadProgress(Math.round(((chunkIndex + 1) / totalChunks) * 90)); // Max 90% for installer
                  resolve(data);
                } else {
                  reject(new Error(data.error || 'Failed to upload chunk.'));
                }
              } catch (err) {
                reject(new Error('Invalid response from server.'));
              }
            } else {
              reject(new Error(`Server error: ${xhr.status}`));
            }
          };

          xhr.onerror = () => {
            reject(new Error('Network error occurred during chunk upload.'));
          };

          xhr.send(formData);
        });
      }

      // 2. Upload latest.yml
      const latestFormData = new FormData();
      latestFormData.append('latestYml', latestYmlFile);

      const publishResult = await new Promise<{ success: boolean; message?: string; warning?: string }>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', getApiUrl('/api/portal/admin/updates/upload-latest'), true);
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);

        xhr.onload = () => {
          if (xhr.status === 200) {
            try {
              const data = JSON.parse(xhr.responseText);
              if (data.success) {
                setUploadProgress(100);
                resolve(data);
              } else {
                reject(new Error(data.error || 'Failed to upload latest.yml.'));
              }
            } catch (err) {
              reject(new Error('Invalid response from server.'));
            }
          } else {
            reject(new Error(`Server error: ${xhr.status}`));
          }
        };

        xhr.onerror = () => {
          reject(new Error('Network error occurred during latest.yml upload.'));
        };

        xhr.send(latestFormData);
      });

      // 3. Complete
      const publishMsg = publishResult.warning
        ? `${publishResult.message || 'Published.'} Warning: ${publishResult.warning}`
        : 'App update published and saved. Checksums were verified against the installer. You can download from Saved Releases below.';
      setUpdateUploadResult({ success: true, message: publishMsg });
      setUpdateFiles({ latestYml: null, installer: null });
      const fileInputs = document.querySelectorAll<HTMLInputElement>('input[type="file"]');
      fileInputs.forEach(input => input.value = '');
      fetchReleases();
      
    } catch (err: any) {
      setUpdateUploadResult({ success: false, message: err.message || 'An unexpected error occurred.' });
    } finally {
      setUploadingUpdate(false);
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
    <div className="portal-shell">
      {/* Desktop sidebar only — hidden on phone via responsive.css */}
      <aside className="portal-sidebar no-print" aria-label="Admin navigation">
        <div className="portal-sidebar-brand">
          <div className="portal-sidebar-logo" style={{ background: 'rgba(212, 160, 23, 0.15)', color: 'var(--primary)' }}>A</div>
          <div>
            <h2>SikaPOS</h2>
            <p>Super Admin</p>
          </div>
        </div>

        <nav className="portal-sidebar-nav">
          {[
            { id: 'licenses', label: 'License Keys', icon: Key },
            { id: 'admins', label: 'Super Admins', icon: Users },
            { id: 'updates', label: 'App Updates', icon: UploadCloud },
            { id: 'analytics', label: 'Product Analytics', icon: BarChart3 },
          ].map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <a
                key={item.id}
                href="#"
                className={`portal-nav-link ${isActive ? 'active' : ''}`}
                onClick={(e) => {
                  e.preventDefault();
                  setActiveTab(item.id as any);
                }}
              >
                <Icon size={20} />
                <span>{item.label}</span>
              </a>
            );
          })}
        </nav>
      </aside>

      <main className="portal-main">
        <header className="portal-header no-print">
          <div className="portal-header-store">
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: 'rgba(212, 160, 23, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid rgba(212, 160, 23, 0.2)'
            }}>
              <Shield size={18} style={{ color: 'var(--primary)' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <span className="portal-header-store-name" style={{ fontSize: '15px', lineHeight: 1.2 }}>Super Admin</span>
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Signed in as Administrator</span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {activeTab === 'admins' && (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowAdminForm(!showAdminForm)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  height: '36px',
                  minHeight: '36px',
                  padding: '0 12px',
                  borderRadius: '10px',
                  fontSize: '13px'
                }}
              >
                <PlusCircle size={15} /> {showAdminForm ? 'Close Form' : 'Add Admin'}
              </button>
            )}
            <button
              type="button"
              className="btn-secondary"
              onClick={logout}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                height: '36px',
                minHeight: '36px',
                padding: '0 12px',
                borderRadius: '10px',
                fontSize: '13px'
              }}
            >
              <LogOut size={15} /> Log out
            </button>
          </div>
        </header>

        <div className="portal-content" style={{ maxWidth: '900px', margin: '0 auto', padding: '24px 20px 48px' }}>
          <p style={{ color: 'var(--text-muted)', marginBottom: 24, fontSize: 15 }}>
            Manage SikaPOS deployments, license keys, super admin accounts, and desktop application releases.
          </p>

          {/* Tab contents */}
          {activeTab === 'licenses' && (
            <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* ── Stat Cards ── */}
              <div className="license-stat-grid">
                <div className="license-stat-card">
                  <div className="license-stat-icon" style={{ background: 'linear-gradient(135deg, rgba(212,160,23,0.2), rgba(212,160,23,0.05))' }}>
                    <Key size={22} style={{ color: 'var(--primary)' }} />
                  </div>
                  <div>
                    <p className="license-stat-value">{licenses.length}</p>
                    <p className="license-stat-label">Total Licenses</p>
                  </div>
                </div>
                <div className="license-stat-card">
                  <div className="license-stat-icon" style={{ background: 'linear-gradient(135deg, rgba(34,197,94,0.2), rgba(34,197,94,0.05))' }}>
                    <Activity size={22} style={{ color: '#22c55e' }} />
                  </div>
                  <div>
                    <p className="license-stat-value">{licenses.filter(l => l.status === 'active').length}</p>
                    <p className="license-stat-label">Active Deployments</p>
                  </div>
                </div>
                <div className="license-stat-card">
                  <div className="license-stat-icon" style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.2), rgba(99,102,241,0.05))' }}>
                    <MonitorSmartphone size={22} style={{ color: '#818cf8' }} />
                  </div>
                  <div>
                    <p className="license-stat-value">{licenses.filter(l => l.machine_id).length}</p>
                    <p className="license-stat-label">Linked Devices</p>
                  </div>
                </div>
              </div>

              {/* ── Generated Key Banner ── */}
              {newlyGeneratedKey && (
                <div className="license-key-banner">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(16,185,129,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Key size={16} style={{ color: '#10b981' }} />
                    </div>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.5px' }}>New License Key Generated</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                    <code className="license-key-code">{newlyGeneratedKey}</code>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => { navigator.clipboard.writeText(newlyGeneratedKey); alert('Copied to clipboard!'); }}
                      style={{ padding: '8px 16px', fontSize: '13px', borderRadius: '8px', whiteSpace: 'nowrap' }}
                    >
                      Copy Key
                    </button>
                  </div>
                </div>
              )}

              {/* ── Purge Result ── */}
              {purgeResult && (
                <div style={{
                  padding: '14px 18px', borderRadius: '12px',
                  background: purgeResult.includes('Deleted') ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
                  border: `1px solid ${purgeResult.includes('Deleted') ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)'}`,
                  color: purgeResult.includes('Deleted') ? '#10b981' : '#ef4444',
                  fontSize: '14px', fontWeight: 500
                }}>
                  {purgeResult}
                </div>
              )}

              {/* ── License List Panel ── */}
              <div className="glass-panel" style={{ overflow: 'hidden' }}>
                {/* Panel Header */}
                <div className="license-panel-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Key size={18} style={{ color: 'var(--primary)' }} />
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>License Keys</h3>
                    <span className="license-count-badge">{filteredLicenses.length}</span>
                  </div>
                  <div className="license-actions-row">
                    <div className="license-search-wrap">
                      <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                      <input
                        type="text"
                        className="input-field"
                        placeholder="Search keys or businesses..."
                        style={{ paddingLeft: '34px', height: '38px', fontSize: '13px' }}
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                      />
                    </div>
                    <div className="license-btn-group">
                      <button type="button" className="btn-primary" onClick={handleGenerate} disabled={generating}
                        style={{ padding: '0 14px', fontSize: '13px', height: '38px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}>
                        <PlusCircle size={15} /> {generating ? 'Generating…' : 'Generate Key'}
                      </button>
                      <button type="button" onClick={handlePurgeDuplicates} disabled={purging}
                        className="license-purge-btn">
                        <Trash2 size={14} /> {purging ? 'Purging…' : 'Purge Duplicates'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Loading */}
                {loading ? (
                  <div style={{ padding: '60px 24px', textAlign: 'center' }}>
                    <div className="license-spinner" />
                    <p style={{ color: 'var(--text-muted)', marginTop: '12px', fontSize: '14px' }}>Loading licenses…</p>
                  </div>
                ) : filteredLicenses.length === 0 ? (
                  /* Empty state */
                  <div style={{ padding: '60px 24px', textAlign: 'center' }}>
                    <div style={{ width: 56, height: 56, borderRadius: 16, background: 'rgba(255,255,255,0.04)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                      <Key size={24} style={{ color: 'var(--text-muted)' }} />
                    </div>
                    <p style={{ color: 'var(--text-muted)', fontSize: '15px', fontWeight: 500 }}>No licenses found</p>
                    <p style={{ color: 'var(--text-muted)', fontSize: '13px', opacity: 0.7, marginTop: 4 }}>
                      {search ? 'Try adjusting your search query.' : 'Click "Generate Key" to create a new license.'}
                    </p>
                  </div>
                ) : (
                  <>
                    {/* ── Desktop Table ── */}
                    <div className="portal-table-wrap">
                      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid var(--border-light)', color: 'var(--text-muted)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            <th style={{ padding: '14px 24px', fontWeight: 600 }}>License Key</th>
                            <th style={{ padding: '14px 24px', fontWeight: 600 }}>Business</th>
                            <th style={{ padding: '14px 24px', fontWeight: 600 }}>Status</th>
                            <th style={{ padding: '14px 24px', fontWeight: 600 }}>Device</th>
                            <th style={{ padding: '14px 24px', fontWeight: 600 }}>Activated</th>
                            <th style={{ padding: '14px 24px', fontWeight: 600, textAlign: 'right' }}>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredLicenses.map((l) => (
                            <tr key={l.id} className="license-table-row">
                              <td style={{ padding: '14px 24px' }}>
                                <code style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '13px', letterSpacing: '0.5px', color: 'var(--primary)', background: 'rgba(212,160,23,0.06)', padding: '3px 8px', borderRadius: '6px' }}>
                                  {l.license_key}
                                </code>
                              </td>
                              <td style={{ padding: '14px 24px', fontWeight: 500, fontSize: '14px' }}>
                                {l.business_name || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontWeight: 400 }}>Not registered</span>}
                              </td>
                              <td style={{ padding: '14px 24px' }}>
                                <span className={`license-status-badge ${l.status === 'active' ? 'active' : ''}`}>
                                  <span className="license-status-dot" />
                                  {l.status === 'active' ? 'Active' : l.status}
                                </span>
                              </td>
                              <td style={{ padding: '14px 24px', color: 'var(--text-muted)', fontSize: '13px' }}>
                                {l.machine_id ? (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <MonitorSmartphone size={14} />
                                    <span style={{ fontFamily: 'monospace', fontSize: '12px' }}>{l.machine_id.substring(0, 8)}…</span>
                                  </div>
                                ) : <span style={{ opacity: 0.4 }}>—</span>}
                              </td>
                              <td style={{ padding: '14px 24px', color: 'var(--text-muted)', fontSize: '13px' }}>
                                {l.activated_at ? (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <Calendar size={14} /> {new Date(l.activated_at).toLocaleDateString()}
                                  </div>
                                ) : <span style={{ opacity: 0.4 }}>—</span>}
                              </td>
                              <td style={{ padding: '14px 24px', textAlign: 'right' }}>
                                <button type="button" onClick={() => handleDeleteLicense(l.id)}
                                  className="license-delete-btn" title="Delete License">
                                  <Trash2 size={15} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* ── Mobile Card List ── */}
                    <div className="portal-card-list">
                      {filteredLicenses.map((l) => (
                        <div key={l.id} className="data-card license-card">
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <code style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '13px', letterSpacing: '0.5px', color: 'var(--primary)', wordBreak: 'break-all' }}>
                                {l.license_key}
                              </code>
                              <p style={{ fontSize: '14px', fontWeight: 600, margin: '6px 0 0', color: 'var(--text-main)' }}>
                                {l.business_name || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontWeight: 400, fontSize: '13px' }}>Not registered</span>}
                              </p>
                            </div>
                            <span className={`license-status-badge ${l.status === 'active' ? 'active' : ''}`} style={{ flexShrink: 0 }}>
                              <span className="license-status-dot" />
                              {l.status === 'active' ? 'Active' : l.status}
                            </span>
                          </div>

                          <div className="license-card-meta">
                            {l.machine_id && (
                              <div className="license-card-meta-item">
                                <MonitorSmartphone size={13} />
                                <span>{l.machine_id.substring(0, 10)}…</span>
                              </div>
                            )}
                            {l.activated_at && (
                              <div className="license-card-meta-item">
                                <Calendar size={13} />
                                <span>{new Date(l.activated_at).toLocaleDateString()}</span>
                              </div>
                            )}
                          </div>

                          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                            <button type="button" onClick={() => handleDeleteLicense(l.id)}
                              className="license-delete-btn" title="Delete License">
                              <Trash2 size={15} /> <span style={{ fontSize: '12px' }}>Delete</span>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Super Admins Tab */}
          {activeTab === 'admins' && (
            <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {/* Admin Form */}
              {showAdminForm && (
                <form
                  onSubmit={handleCreateAdmin}
                  className="glass-panel"
                  style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16, border: '1px solid var(--primary)' }}
                >
                  <h3 style={{ margin: 0, fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <PlusCircle size={18} style={{ color: 'var(--primary)' }} /> Add Super Admin
                  </h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
                    <div>
                      <label style={{ display: 'block', marginBottom: 8, fontSize: 14, color: 'var(--text-muted)' }}>Name</label>
                      <input type="text" className="input-field" required value={newAdmin.name} onChange={e => setNewAdmin({...newAdmin, name: e.target.value})} placeholder="Admin Name" />
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: 8, fontSize: 14, color: 'var(--text-muted)' }}>Email</label>
                      <input type="email" className="input-field" required value={newAdmin.email} onChange={e => setNewAdmin({...newAdmin, email: e.target.value})} placeholder="admin@example.com" />
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: 8, fontSize: 14, color: 'var(--text-muted)' }}>Password</label>
                      <input type="password" className="input-field" required value={newAdmin.password} onChange={e => setNewAdmin({...newAdmin, password: e.target.value})} placeholder="••••••••" />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 8 }}>
                    <button type="button" className="btn-secondary" onClick={() => setShowAdminForm(false)}>
                      Cancel
                    </button>
                    <button type="submit" className="btn-primary" disabled={adminLoading}>
                      {adminLoading ? 'Adding...' : 'Save Admin'}
                    </button>
                  </div>
                </form>
              )}

              <div className="glass-panel" style={{ overflow: 'hidden' }}>
                <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Users size={18} style={{ color: 'var(--primary)' }} />
                  <h3 style={{ margin: 0, fontSize: 16 }}>Super Admins</h3>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>({admins.length} total)</span>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => setShowAdminForm(!showAdminForm)}
                    style={{ marginLeft: 'auto', padding: '6px 12px', fontSize: '13px', height: '36px', borderRadius: '8px' }}
                  >
                    <PlusCircle size={15} /> {showAdminForm ? 'Close Form' : 'Add Admin'}
                  </button>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-light)', color: 'var(--text-muted)', fontSize: '13px', background: 'rgba(255,255,255,0.01)' }}>
                        <th style={{ padding: '12px 24px', fontWeight: 600 }}>Name</th>
                        <th style={{ padding: '12px 24px', fontWeight: 600 }}>Email</th>
                        <th style={{ padding: '12px 24px', fontWeight: 600 }}>Added On</th>
                        <th style={{ padding: '12px 24px', fontWeight: 600, textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {admins.map((admin) => (
                        <tr key={admin.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', transition: 'background 0.2s' }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                        >
                          <td style={{ padding: '12px 24px', fontWeight: 500 }}>{admin.name}</td>
                          <td style={{ padding: '12px 24px', color: 'var(--text-muted)' }}>{admin.email}</td>
                          <td style={{ padding: '12px 24px', color: 'var(--text-muted)', fontSize: '13px' }}>
                            {new Date(admin.created_at).toLocaleDateString()}
                          </td>
                          <td style={{ padding: '12px 24px', textAlign: 'right' }}>
                            <button type="button" onClick={() => handleDeleteAdmin(admin.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px' }} title="Delete Admin">
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
          )}

          {/* App Updates Tab */}
          {activeTab === 'updates' && (
            <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div className="glass-panel" style={{ overflow: 'hidden' }}>
                <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <UploadCloud size={18} style={{ color: 'var(--primary)' }} />
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>App Updates Management</h3>
                </div>
                
                <div style={{ padding: '24px' }}>
                  <div className="updates-info-banner">
                    <div className="updates-info-icon-wrap">
                      <Info size={18} style={{ color: 'var(--primary)' }} />
                    </div>
                    <div style={{ flex: 1, fontSize: '13.5px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                      <strong style={{ color: 'var(--text-main)' }}>Publish new desktop releases of SikaPOS.</strong> Shops auto-update from the latest publish.
                      <div style={{ marginTop: '4px' }}>
                        Upload the <strong style={{ color: 'var(--primary)' }}>latest.yml</strong> configuration first, then the <strong style={{ color: 'var(--primary)' }}>installer (.exe)</strong> from the same build (found in the <code>release-staging</code> directory).
                      </div>
                    </div>
                  </div>

                  {updateUploadResult && (
                    <div style={{
                      padding: '12px 18px', borderRadius: '12px', marginBottom: '24px',
                      background: updateUploadResult.success ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
                      border: `1px solid ${updateUploadResult.success ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)'}`,
                      color: updateUploadResult.success ? '#10b981' : '#ef4444',
                      fontSize: '14px', fontWeight: 500
                    }}>
                      {updateUploadResult.message}
                    </div>
                  )}

                  {uploadingUpdate && (
                    <div style={{
                      marginBottom: '24px', padding: '18px',
                      background: 'rgba(255,255,255,0.02)', borderRadius: '14px',
                      border: '1px solid rgba(255,255,255,0.06)'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: 'var(--text-main)', marginBottom: '10px' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 500 }}>
                          <UploadCloud size={16} style={{ color: 'var(--primary)' }} className="license-pulse" /> Uploading Update...
                        </span>
                        <span style={{ fontWeight: 700, color: 'var(--primary)' }}>{uploadProgress}%</span>
                      </div>
                      <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.06)', borderRadius: '100px', overflow: 'hidden' }}>
                        <div style={{ width: `${uploadProgress}%`, height: '100%', background: 'linear-gradient(90deg, var(--primary) 0%, #e8b820 100%)', borderRadius: '100px', transition: 'width 0.2s ease-out' }}></div>
                      </div>
                    </div>
                  )}

                  <form onSubmit={handleUploadUpdate} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20 }}>
                      <div>
                        <span style={{ display: 'block', marginBottom: '8px', fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)' }}>1. latest.yml file</span>
                        <label className="upload-dropzone">
                          <input 
                            type="file" 
                            accept=".yml,.yaml" 
                            required 
                            onChange={e => setUpdateFiles({ ...updateFiles, latestYml: e.target.files?.[0] || null })}
                            style={{ display: 'none' }}
                          />
                          {updateFiles.latestYml ? (
                            <div className="upload-dropzone-active">
                              <FileText size={24} style={{ color: '#10b981' }} />
                              <span className="file-name">{updateFiles.latestYml.name}</span>
                              <span className="file-size">{(updateFiles.latestYml.size / 1024).toFixed(1)} KB</span>
                            </div>
                          ) : (
                            <div className="upload-dropzone-empty">
                              <UploadCloud size={24} style={{ color: 'var(--text-muted)' }} />
                              <span className="upload-title">Choose latest.yml</span>
                              <span className="upload-subtitle">Click to select file</span>
                            </div>
                          )}
                        </label>
                      </div>
                      <div>
                        <span style={{ display: 'block', marginBottom: '8px', fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)' }}>2. Installer (.exe) file</span>
                        <label className="upload-dropzone">
                          <input 
                            type="file" 
                            accept=".exe" 
                            required 
                            onChange={e => setUpdateFiles({ ...updateFiles, installer: e.target.files?.[0] || null })}
                            style={{ display: 'none' }}
                          />
                          {updateFiles.installer ? (
                            <div className="upload-dropzone-active">
                              <Cpu size={24} style={{ color: 'var(--primary)' }} />
                              <span className="file-name">{updateFiles.installer.name}</span>
                              <span className="file-size">{(updateFiles.installer.size / (1024 * 1024)).toFixed(1)} MB</span>
                            </div>
                          ) : (
                            <div className="upload-dropzone-empty">
                              <UploadCloud size={24} style={{ color: 'var(--text-muted)' }} />
                              <span className="upload-title">Choose installer (.exe)</span>
                              <span className="upload-subtitle">Click to select file</span>
                            </div>
                          )}
                        </label>
                      </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button type="submit" className="btn-primary" disabled={uploadingUpdate} style={{ height: '42px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', width: '100%', maxWidth: '240px', borderRadius: '10px' }}>
                        <UploadCloud size={18} /> {uploadingUpdate ? 'Uploading...' : 'Publish Update'}
                      </button>
                    </div>
                  </form>

                  <div style={{ marginTop: '40px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                      <FileText size={18} style={{ color: 'var(--primary)' }} />
                      <h3 style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>Saved Releases</h3>
                      <span className="license-count-badge">{releases.length}</span>
                    </div>

                    {releasesLoading ? (
                      <div style={{ padding: '60px 24px', textAlign: 'center' }}>
                        <div className="license-spinner" />
                        <p style={{ color: 'var(--text-muted)', marginTop: '12px', fontSize: '14px' }}>Loading releases…</p>
                      </div>
                    ) : releases.length === 0 ? (
                      <div style={{ padding: '60px 24px', textAlign: 'center', border: '1px dashed rgba(255,255,255,0.08)', borderRadius: '14px', background: 'rgba(255,255,255,0.01)' }}>
                        <UploadCloud size={24} style={{ color: 'var(--text-muted)', opacity: 0.6, marginBottom: '8px' }} />
                        <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: 0 }}>No saved releases found.</p>
                      </div>
                    ) : (
                      <>
                        {/* ── Desktop Releases Table ── */}
                        <div className="portal-table-wrap">
                          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                            <thead>
                              <tr style={{ borderBottom: '1px solid var(--border-light)', color: 'var(--text-muted)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                <th style={{ padding: '14px 20px', fontWeight: 600 }}>Version</th>
                                <th style={{ padding: '14px 20px', fontWeight: 600 }}>Installer</th>
                                <th style={{ padding: '14px 20px', fontWeight: 600 }}>Size</th>
                                <th style={{ padding: '14px 20px', fontWeight: 600 }}>Published</th>
                                <th style={{ padding: '14px 20px', fontWeight: 600 }}>Status</th>
                                <th style={{ padding: '14px 20px', fontWeight: 600, textAlign: 'right' }}>Download</th>
                              </tr>
                            </thead>
                            <tbody>
                              {releases.map((r) => (
                                <tr key={r.id} className="license-table-row">
                                  <td style={{ padding: '14px 20px' }}>
                                    <code style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '13px', fontWeight: 700, color: 'var(--primary)', background: 'rgba(212,160,23,0.06)', padding: '3px 8px', borderRadius: '6px' }}>
                                      v{r.version}
                                    </code>
                                  </td>
                                  <td style={{ padding: '14px 20px', fontSize: '13px', color: 'var(--text-main)', fontWeight: 500 }}>
                                    {r.installer_filename}
                                  </td>
                                  <td style={{ padding: '14px 20px', fontSize: '13px', color: 'var(--text-muted)' }}>
                                    {formatFileSize(Number(r.installer_size))}
                                  </td>
                                  <td style={{ padding: '14px 20px', fontSize: '13px', color: 'var(--text-muted)' }}>
                                    <div>{new Date(r.created_at).toLocaleDateString()}</div>
                                    <div style={{ fontSize: '11px', opacity: 0.7, marginTop: '2px' }}>
                                      {new Date(r.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                      {r.uploaded_by ? ` · ${r.uploaded_by}` : ''}
                                    </div>
                                  </td>
                                  <td style={{ padding: '14px 20px' }}>
                                    {r.is_current ? (
                                      <span style={{
                                        padding: '4px 10px',
                                        borderRadius: '100px',
                                        fontSize: '11px',
                                        fontWeight: 700,
                                        background: 'rgba(16,185,129,0.15)',
                                        color: '#10b981',
                                      }}>
                                        LIVE
                                      </span>
                                    ) : (
                                      <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Archived</span>
                                    )}
                                  </td>
                                  <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                      <button
                                        type="button"
                                        className="btn-secondary"
                                        style={{ padding: '0 12px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '6px', height: '32px', borderRadius: '8px' }}
                                        disabled={downloadingId === r.id}
                                        onClick={() => downloadReleaseFile(r.id, r.installer_filename, 'installer')}
                                        title="Download Installer (.exe)"
                                      >
                                        <Download size={13} /> .exe
                                      </button>
                                      <button
                                        type="button"
                                        className="btn-secondary"
                                        style={{ padding: '0 12px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '6px', height: '32px', borderRadius: '8px' }}
                                        disabled={downloadingId === r.id}
                                        onClick={() => downloadReleaseFile(r.id, `latest-${r.version}.yml`, 'yml')}
                                        title="Download latest.yml"
                                      >
                                        <FileText size={13} /> yml
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        {/* ── Mobile Releases Card List ── */}
                        <div className="portal-card-list">
                          {releases.map((r) => (
                            <div key={r.id} className="data-card release-card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <code style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '13px', fontWeight: 700, color: 'var(--primary)', background: 'rgba(212,160,23,0.08)', padding: '3px 8px', borderRadius: '6px' }}>
                                    v{r.version}
                                  </code>
                                  {r.is_current ? (
                                    <span style={{
                                      padding: '3px 8px',
                                      borderRadius: '100px',
                                      fontSize: '10px',
                                      fontWeight: 700,
                                      background: 'rgba(16,185,129,0.12)',
                                      color: '#10b981',
                                    }}>
                                      LIVE
                                    </span>
                                  ) : (
                                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Archived</span>
                                  )}
                                </div>
                                <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 500 }}>
                                  {formatFileSize(Number(r.installer_size))}
                                </span>
                              </div>

                              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                <p style={{ margin: '0 0 4px', fontStyle: 'italic', wordBreak: 'break-all', color: 'var(--text-main)' }}>{r.installer_filename}</p>
                                <p style={{ margin: 0, fontSize: '11px', opacity: 0.8 }}>
                                  {new Date(r.created_at).toLocaleDateString()} at {new Date(r.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  {r.uploaded_by ? ` · by ${r.uploaded_by}` : ''}
                                </p>
                              </div>

                              <div style={{ display: 'flex', gap: '8px', marginTop: '4px', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                                <button
                                  type="button"
                                  className="btn-secondary"
                                  style={{ flex: 1, padding: '8px 12px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px', height: '36px', borderRadius: '8px' }}
                                  disabled={downloadingId === r.id}
                                  onClick={() => downloadReleaseFile(r.id, r.installer_filename, 'installer')}
                                >
                                  <Download size={13} /> .exe
                                </button>
                                <button
                                  type="button"
                                  className="btn-secondary"
                                  style={{ flex: 1, padding: '8px 12px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px', height: '36px', borderRadius: '8px' }}
                                  disabled={downloadingId === r.id}
                                  onClick={() => downloadReleaseFile(r.id, `latest-${r.version}.yml`, 'yml')}
                                >
                                  <FileText size={13} /> yml
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Product Analytics Tab */}
          {activeTab === 'analytics' && (
            <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {/* Refresh header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <BarChart3 size={20} style={{ color: 'var(--primary)' }} />
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>Product Analytics</h3>
                </div>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={fetchProductAnalytics}
                  disabled={analyticsLoading}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '36px', padding: '0 12px', borderRadius: '8px', fontSize: '13px' }}
                >
                  <Activity size={14} className={analyticsLoading ? 'license-pulse' : ''} />
                  {analyticsLoading ? 'Loading...' : 'Refresh Analytics'}
                </button>
              </div>

              {analyticsError && (
                <div style={{
                  padding: '12px 18px', borderRadius: '12px',
                  background: 'rgba(239,68,68,0.08)',
                  border: '1px solid rgba(239,68,68,0.25)',
                  color: '#ef4444',
                  fontSize: '14px', fontWeight: 500
                }}>
                  {analyticsError}
                </div>
              )}

              {analyticsLoading && !analyticsData ? (
                <div style={{ padding: '80px 24px', textAlign: 'center' }}>
                  <div className="license-spinner" />
                  <p style={{ color: 'var(--text-muted)', marginTop: '16px', fontSize: '14px' }}>Compiling product analytics across all stores...</p>
                </div>
              ) : !analyticsData ? (
                <div style={{ padding: '60px 24px', textAlign: 'center', border: '1px dashed rgba(255,255,255,0.08)', borderRadius: '14px' }}>
                  <p style={{ color: 'var(--text-muted)', fontSize: '13.5px' }}>No analytics compilation data found. Click Refresh to query database.</p>
                </div>
              ) : (
                <>
                  {/* Summary Stat Cards */}
                  <div className="license-stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                    <div className="license-stat-card">
                      <div className="license-stat-icon" style={{ background: 'linear-gradient(135deg, rgba(212,160,23,0.2), rgba(212,160,23,0.05))' }}>
                        <Package size={22} style={{ color: 'var(--primary)' }} />
                      </div>
                      <div>
                        <p className="license-stat-value">{analyticsData.summary?.totalProducts || 0}</p>
                        <p className="license-stat-label">Total Synced Products</p>
                      </div>
                    </div>

                    <div className="license-stat-card">
                      <div className="license-stat-icon" style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.2), rgba(99,102,241,0.05))' }}>
                        <Shield size={22} style={{ color: '#818cf8' }} />
                      </div>
                      <div>
                        <p className="license-stat-value">{analyticsData.summary?.totalBusinesses || 0}</p>
                        <p className="license-stat-label">Stores Syncing Inventory</p>
                      </div>
                    </div>

                    <div className="license-stat-card">
                      <div className="license-stat-icon" style={{ background: 'linear-gradient(135deg, rgba(34,197,94,0.2), rgba(34,197,94,0.05))' }}>
                        <TrendingUp size={22} style={{ color: '#22c55e' }} />
                      </div>
                      <div>
                        <p className="license-stat-value">{analyticsData.summary?.avgProductsPerBusiness || 0}</p>
                        <p className="license-stat-label">Avg Products per Store</p>
                      </div>
                    </div>
                  </div>

                  {/* Two Column Grid for Desktop, Single Column for Mobile */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
                    
                    {/* Top Selling Products */}
                    <div className="glass-panel" style={{ overflow: 'hidden', height: 'fit-content' }}>
                      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <TrendingUp size={16} style={{ color: 'var(--primary)' }} />
                        <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 600 }}>Top Selling Products (Global)</h4>
                      </div>
                      
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid var(--border-light)', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.01)' }}>
                              <th style={{ padding: '12px 16px', fontWeight: 600 }}>Product Name</th>
                              <th style={{ padding: '12px 16px', fontWeight: 600, textAlign: 'center' }}>Stores</th>
                              <th style={{ padding: '12px 16px', fontWeight: 600, textAlign: 'center' }}>Qty Sold</th>
                              <th style={{ padding: '12px 16px', fontWeight: 600, textAlign: 'right' }}>Total Value</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(analyticsData.topSoldProducts || []).map((p: any, idx: number) => (
                              <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                <td style={{ padding: '12px 16px', fontWeight: 500, color: 'var(--text-main)' }}>
                                  <span style={{ color: 'var(--text-muted)', marginRight: '8px', fontSize: '11px' }}>#{idx+1}</span>
                                  {p.product_name}
                                </td>
                                <td style={{ padding: '12px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>{p.active_stores}</td>
                                <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 600, color: 'var(--primary)' }}>{p.total_qty_sold}</td>
                                <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: '#10b981' }}>
                                  ₵{(p.total_sales_value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </td>
                              </tr>
                            ))}
                            {(analyticsData.topSoldProducts || []).length === 0 && (
                              <tr>
                                <td colSpan={4} style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>No sales transactions synced yet.</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Popular Product Categories */}
                    <div className="glass-panel" style={{ overflow: 'hidden', height: 'fit-content' }}>
                      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Package size={16} style={{ color: 'var(--primary)' }} />
                        <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 600 }}>Top Categories across Stores</h4>
                      </div>

                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid var(--border-light)', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.01)' }}>
                              <th style={{ padding: '12px 16px', fontWeight: 600 }}>Category</th>
                              <th style={{ padding: '12px 16px', fontWeight: 600, textAlign: 'center' }}>Total Products</th>
                              <th style={{ padding: '12px 16px', fontWeight: 600, textAlign: 'center' }}>Active Stores</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(analyticsData.categories || []).map((cat: any, idx: number) => (
                              <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-main)' }}>{cat.category}</td>
                                <td style={{ padding: '12px 16px', textAlign: 'center', color: 'var(--primary)', fontWeight: 700 }}>{cat.total_products}</td>
                                <td style={{ padding: '12px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>{cat.total_businesses}</td>
                              </tr>
                            ))}
                            {(analyticsData.categories || []).length === 0 && (
                              <tr>
                                <td colSpan={3} style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>No categories found.</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                  </div>

                  {/* Business Stock & Inventory Breakdown */}
                  <div className="glass-panel" style={{ overflow: 'hidden' }}>
                    <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <Shield size={16} style={{ color: 'var(--primary)' }} />
                      <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 600 }}>Inventory Breakdown by Store</h4>
                    </div>

                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid var(--border-light)', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.01)' }}>
                            <th style={{ padding: '12px 20px', fontWeight: 600 }}>Store / License Name</th>
                            <th style={{ padding: '12px 20px', fontWeight: 600, textAlign: 'center' }}>Products Synced</th>
                            <th style={{ padding: '12px 20px', fontWeight: 600, textAlign: 'center' }}>Total Stock Qty</th>
                            <th style={{ padding: '12px 20px', fontWeight: 600, textAlign: 'right' }}>Total Inventory Value</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(analyticsData.businessBreakdown || []).map((biz: any, idx: number) => (
                            <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                              <td style={{ padding: '12px 20px', fontWeight: 600, color: 'var(--text-main)' }}>
                                {biz.business_name || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontWeight: 400 }}>Unnamed Store</span>}
                              </td>
                              <td style={{ padding: '12px 20px', textAlign: 'center', color: 'var(--primary)', fontWeight: 700 }}>{biz.total_products}</td>
                              <td style={{ padding: '12px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>{biz.total_stock_qty?.toLocaleString() || 0}</td>
                              <td style={{ padding: '12px 20px', textAlign: 'right', fontWeight: 600, color: '#10b981' }}>
                                ₵{(biz.total_stock_value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                            </tr>
                          ))}
                          {(analyticsData.businessBreakdown || []).length === 0 && (
                            <tr>
                              <td colSpan={4} style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>No stores are syncing inventory products yet.</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Recently Synced Products */}
                  <div className="glass-panel" style={{ overflow: 'hidden' }}>
                    <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <Activity size={16} style={{ color: 'var(--primary)' }} />
                      <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 600 }}>Recently Synced Products</h4>
                    </div>

                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid var(--border-light)', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.01)' }}>
                            <th style={{ padding: '12px 20px', fontWeight: 600 }}>Product Name</th>
                            <th style={{ padding: '12px 20px', fontWeight: 600 }}>Category</th>
                            <th style={{ padding: '12px 20px' }}>Store</th>
                            <th style={{ padding: '12px 20px', textAlign: 'right' }}>Price</th>
                            <th style={{ padding: '12px 20px', textAlign: 'right' }}>Last Updated</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(analyticsData.recentProducts || []).map((prod: any, idx: number) => (
                            <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                              <td style={{ padding: '12px 20px', fontWeight: 500, color: 'var(--text-main)' }}>{prod.product_name}</td>
                              <td style={{ padding: '12px 20px', color: 'var(--text-muted)' }}>
                                <span style={{ background: 'rgba(255,255,255,0.04)', padding: '2px 6px', borderRadius: '4px', fontSize: '12px' }}>{prod.category}</span>
                              </td>
                              <td style={{ padding: '12px 20px', color: 'var(--text-muted)' }}>
                                {prod.business_name || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Unnamed Store</span>}
                              </td>
                              <td style={{ padding: '12px 20px', textAlign: 'right', fontWeight: 600, color: 'var(--primary)' }}>
                                ₵{(prod.unit_price || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              <td style={{ padding: '12px 20px', textAlign: 'right', color: 'var(--text-muted)', fontSize: '12px' }}>
                                {new Date(prod.updated_at).toLocaleString()}
                              </td>
                            </tr>
                          ))}
                          {(analyticsData.recentProducts || []).length === 0 && (
                            <tr>
                              <td colSpan={5} style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>No products synced recently.</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Bottom navigation for phone */}
        <nav className="portal-bottom-nav no-print" aria-label="Admin navigation" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
          {[
            { id: 'licenses', label: 'Licenses', icon: Key },
            { id: 'admins', label: 'Admins', icon: Users },
            { id: 'updates', label: 'Updates', icon: UploadCloud },
            { id: 'analytics', label: 'Analytics', icon: BarChart3 },
          ].map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <a
                key={item.id}
                href="#"
                className={isActive ? 'active' : ''}
                onClick={(e) => {
                  e.preventDefault();
                  setActiveTab(item.id as any);
                }}
              >
                <Icon size={22} strokeWidth={isActive ? 2.5 : 2} />
                <span>{item.label}</span>
              </a>
            );
          })}
        </nav>
      </main>
    </div>
  );
}
