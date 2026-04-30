import { useEffect, useState } from 'react';
import { useAuthStore } from '../store/auth';
import { getApiUrl, API_CONFIG } from '../config/api';
import {
  LogOut, DollarSign, ShoppingCart, RefreshCw, TrendingUp,
  Package, BarChart3, LayoutDashboard, Search
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';

type Tab = 'dashboard' | 'inventory' | 'reports';

// This file is deprecated - use Dashboard.tsx, Inventory.tsx, Transactions.tsx, Reports.tsx instead
export default function BusinessDashboard() {
  const { logout, businessName, businessId, token } = useAuthStore();
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [loading, setLoading] = useState(true);

  // Dashboard Data
  const [dashboardData, setDashboardData] = useState<{
    totalSales: number;
    transactionCount: number;
    chartData: any[];
    recentTx: any[];
  } | null>(null);

  // Inventory Data
  const [inventory, setInventory] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [invPagination, setInvPagination] = useState({ page: 1, limit: 50, total: 0, pages: 0 });
  const [invLoading, setInvLoading] = useState(false);

  // Note: Reports functionality moved to dedicated Reports page

  const authHeaders = { headers: { Authorization: `Bearer ${token}` } };

  const fetchDashboard = async () => {
    try {
      const res = await fetch(getApiUrl(API_CONFIG.ENDPOINTS.DASHBOARD_SUMMARY), authHeaders);
      if (!res.ok) throw new Error('Session expired');
      const summary = await res.json();
      setDashboardData(summary);
    } catch (err: any) {
      if (err.message === 'Session expired') logout();
    }
  };

  const fetchInventory = async (page = 1, search = '') => {
    setInvLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '50' });
      if (search) params.set('search', search);
      const res = await fetch(getApiUrl(`${API_CONFIG.ENDPOINTS.INVENTORY}?${params}`), authHeaders);
      if (!res.ok) throw new Error('Session expired');
      const data = await res.json();
      setInventory(data.products || []);
      setInvPagination(data.pagination || { page: 1, limit: 50, total: 0, pages: 0 });
    } catch (err: any) {
      if (err.message === 'Session expired') logout();
    } finally {
      setInvLoading(false);
    }
  };

  // Note: fetchSales and fetchInvOverview moved to dedicated Transactions and Inventory pages

  const loadData = async () => {
    setLoading(true);
    if (activeTab === 'dashboard') await fetchDashboard();
    else if (activeTab === 'inventory') await fetchInventory(invPagination.page, searchQuery);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [businessId, activeTab]);

  // Reports tab functionality moved to dedicated pages
  useEffect(() => {
    // No-op - reports now handled by separate routes
  }, []);

  const filteredInventory = searchQuery ? inventory.filter(p =>
    (p.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (p.barcode || '').toLowerCase().includes(searchQuery.toLowerCase())
  ) : inventory;

  const handleInvSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setInvPagination(p => ({ ...p, page: 1 }));
    fetchInventory(1, searchQuery);
  };

  // Unused functions removed - replaced by new Reports page

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '40px 20px' }}>
      {/* Header */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '30px' }}>
        <div>
          <h1 style={{ fontSize: '32px', marginBottom: '8px' }}>{businessName}</h1>
          <p style={{ color: 'var(--text-muted)' }}>Cloud Management Portal</p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button onClick={loadData} className="btn-secondary" style={{ padding: '8px 16px' }}>
            <RefreshCw size={16} /> Refresh
          </button>
          <button onClick={logout} className="btn-secondary" style={{ padding: '8px 16px' }}>
            <LogOut size={16} /> Sign Out
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '30px', borderBottom: '1px solid var(--border-light)', paddingBottom: '2px' }}>
        {[
          { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
          { id: 'inventory', label: 'Inventory', icon: Package },
          { id: 'reports', label: 'Reports', icon: BarChart3 },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as Tab)}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 24px',
              background: 'transparent', border: 'none', borderBottom: activeTab === tab.id ? '2px solid var(--primary)' : '2px solid transparent',
              color: activeTab === tab.id ? 'var(--primary)' : 'var(--text-muted)',
              cursor: 'pointer', transition: 'all 0.2s', fontWeight: 500
            }}
          >
            <tab.icon size={18} />
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ padding: '80px', textAlign: 'center', color: 'var(--text-muted)' }}>
          <RefreshCw size={32} className="spin" style={{ marginBottom: '16px', opacity: 0.5 }} />
          <p>Syncing remote data...</p>
        </div>
      ) : (
        <>
          {/* --- DASHBOARD TAB --- */}
          {activeTab === 'dashboard' && dashboardData && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginBottom: '40px' }}>
                <div className="glass-panel" style={{ padding: '24px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <div style={{ color: 'var(--primary)', background: 'rgba(139,92,246,0.1)', padding: '12px', borderRadius: '12px' }}><DollarSign size={24} /></div>
                    <TrendingUp size={20} color="var(--success)" />
                  </div>
                  <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '4px' }}>Total Synced Revenue</p>
                  <p style={{ fontSize: '32px', fontWeight: 600, fontFamily: 'Outfit' }}>GHS {dashboardData.totalSales.toFixed(2)}</p>
                </div>
                <div className="glass-panel" style={{ padding: '24px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <div style={{ color: 'var(--secondary)', background: 'rgba(212,160,23,0.1)', padding: '12px', borderRadius: '12px' }}><ShoppingCart size={24} /></div>
                  </div>
                  <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '4px' }}>Total Transactions</p>
                  <p style={{ fontSize: '32px', fontWeight: 600, fontFamily: 'Outfit' }}>{dashboardData.transactionCount}</p>
                </div>
              </div>

              <div className="glass-panel" style={{ padding: '24px', marginBottom: '40px' }}>
                <h3 style={{ marginBottom: '24px', fontSize: '18px' }}>Revenue Trend (Last 7 Days)</h3>
                <div style={{ height: '300px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={dashboardData.chartData}>
                      <defs>
                        <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                      <XAxis dataKey="date" stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val) => `${val}`} />
                      <Tooltip 
                        contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '8px' }}
                        itemStyle={{ color: 'var(--primary)' }}
                      />
                      <Area type="monotone" dataKey="sales" stroke="var(--primary)" strokeWidth={3} fillOpacity={1} fill="url(#colorSales)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="glass-panel" style={{ padding: '24px' }}>
                <h3 style={{ marginBottom: '24px', fontSize: '18px' }}>Recent Remote Transactions</h3>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-light)', color: 'var(--text-muted)', fontSize: '14px' }}>
                        <th style={{ padding: '16px', fontWeight: 500 }}>Receipt No.</th>
                        <th style={{ padding: '16px', fontWeight: 500 }}>Date/Time</th>
                        <th style={{ padding: '16px', fontWeight: 500 }}>Cashier</th>
                        <th style={{ padding: '16px', fontWeight: 500 }}>Total (GHS)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dashboardData.recentTx.map((tx: any, i: number) => (
                        <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          <td style={{ padding: '16px', fontWeight: 500 }}>{tx.receipt_number}</td>
                          <td style={{ padding: '16px', color: 'var(--text-muted)' }}>{new Date(tx.created_at).toLocaleString()}</td>
                          <td style={{ padding: '16px' }}>{tx.cashier_name}</td>
                          <td style={{ padding: '16px', color: 'var(--success)', fontWeight: 600 }}>{tx.grand_total.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* --- INVENTORY TAB --- */}
          {activeTab === 'inventory' && (
            <div className="glass-panel" style={{ padding: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
                <h3 style={{ fontSize: '18px' }}>Product Catalog ({invPagination.total} items)</h3>
                <form onSubmit={handleInvSearch} style={{ display: 'flex', gap: '8px' }}>
                  <div style={{ position: 'relative' }}>
                    <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input
                      type="text" placeholder="Search by name or barcode..."
                      value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                      style={{
                        width: '260px', padding: '10px 12px 10px 40px', background: 'rgba(255,255,255,0.05)',
                        border: '1px solid var(--border-light)', borderRadius: '8px', color: 'var(--text-main)',
                        outline: 'none'
                      }}
                    />
                  </div>
                  <button type="submit" className="btn-primary" style={{ padding: '10px 16px' }}>Search</button>
                </form>
              </div>
              {invLoading ? (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}><RefreshCw size={24} className="spin" /></div>
              ) : (
                <>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border-light)', color: 'var(--text-muted)', fontSize: '14px' }}>
                          <th style={{ padding: '16px', fontWeight: 500 }}>Barcode</th>
                          <th style={{ padding: '16px', fontWeight: 500 }}>Product Name</th>
                          <th style={{ padding: '16px', fontWeight: 500 }}>Category</th>
                          <th style={{ padding: '16px', fontWeight: 500 }}>Price (GHS)</th>
                          <th style={{ padding: '16px', fontWeight: 500 }}>Stock</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredInventory.map((p, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                            <td style={{ padding: '16px', fontFamily: 'monospace', fontSize: '13px' }}>{p.barcode || '-'}</td>
                            <td style={{ padding: '16px', fontWeight: 500 }}>{p.name}</td>
                            <td style={{ padding: '16px' }}>
                              <span style={{ padding: '4px 8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', fontSize: '12px' }}>{p.category}</span>
                            </td>
                            <td style={{ padding: '16px' }}>{(p.unit_price || p.price || 0).toFixed(2)}</td>
                            <td style={{ padding: '16px' }}>
                              <span style={{
                                fontWeight: 600,
                                color: (p.stock_qty || p.stock || 0) <= (p.low_stock_threshold || 5) ? 'var(--danger)' : 'var(--success)'
                              }}>
                                {p.stock_qty || p.stock || 0} {p.unit || ''}
                              </span>
                            </td>
                          </tr>
                        ))}
                        {filteredInventory.length === 0 && (
                          <tr><td colSpan={5} style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>No products found</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' }}>
                    <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                      Page {invPagination.page} of {invPagination.pages || 1}
                    </span>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button onClick={() => { const p = Math.max(1, invPagination.page - 1); setInvPagination(x => ({ ...x, page: p })); fetchInventory(p, searchQuery); }} disabled={invPagination.page <= 1} className="btn-secondary" style={{ padding: '8px 16px' }}>Prev</button>
                      <button onClick={() => { const p = invPagination.page + 1; setInvPagination(x => ({ ...x, page: p })); fetchInventory(p, searchQuery); }} disabled={invPagination.page >= invPagination.pages} className="btn-secondary" style={{ padding: '8px 16px' }}>Next</button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* --- REPORTS TAB - Use the new Reports page instead --- */}
          {activeTab === 'reports' && (
            <div className="glass-panel" style={{ padding: '40px', textAlign: 'center' }}>
              <p style={{ color: 'var(--text-muted)' }}>Reports have been moved to the dedicated Reports tab</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
