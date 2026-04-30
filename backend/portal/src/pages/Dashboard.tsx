import { useEffect, useState } from 'react';
import { useAuthStore } from '../store/auth';
import StatCard from '../components/StatCard';
import {
  DollarSign,
  ShoppingCart,
  Package,
  TrendingUp,
  RefreshCw,
  Receipt,
  Calendar,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface DashboardData {
  totalSales: number;
  transactionCount: number;
  totalProducts: number;
  lowStockCount: number;
  chartData: Array<{ date: string; sales: number; transactions: number }>;
  recentTransactions: Array<{
    id: number;
    receipt_number: string;
    grand_total: number;
    payment_method: string;
    created_at: string;
    cashier_name: string;
  }>;
}

export default function Dashboard() {
  const { token, businessName } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState('');
  const [dateFilter, setDateFilter] = useState<'today' | 'yesterday' | 'lastWeek' | 'thisMonth' | 'lastMonth' | 'allTime' | 'custom'>('today');
  const [customDate, setCustomDate] = useState('');
  const [customDateTo, setCustomDateTo] = useState('');

  const fetchDashboard = async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      
      // Calculate date range based on filter
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      
      let fromDate: Date;
      let toDate: Date;
      
      switch (dateFilter) {
        case 'today':
          fromDate = today;
          toDate = tomorrow;
          break;
        case 'yesterday':
          fromDate = yesterday;
          toDate = today;
          break;
        case 'lastWeek':
          // Last week: Monday to Sunday of previous week
          const lastWeekStart = new Date(today);
          lastWeekStart.setDate(today.getDate() - today.getDay() - 7);
          fromDate = lastWeekStart;
          const lastWeekEnd = new Date(lastWeekStart);
          lastWeekEnd.setDate(lastWeekStart.getDate() + 7);
          toDate = lastWeekEnd;
          break;
        case 'thisMonth':
          // This month: 1st to today
          fromDate = new Date(today.getFullYear(), today.getMonth(), 1);
          toDate = new Date(today);
          toDate.setHours(23, 59, 59, 999);
          break;
        case 'lastMonth':
          // Last month: 1st to last day of previous month
          fromDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
          toDate = new Date(today.getFullYear(), today.getMonth(), 0);
          toDate.setHours(23, 59, 59, 999);
          break;
        case 'allTime':
          // All time: far past to far future
          fromDate = new Date(2000, 0, 1); // Year 2000
          toDate = new Date(2100, 11, 31); // Year 2100
          break;
        case 'custom':
          if (customDate) {
            fromDate = new Date(customDate);
            fromDate.setHours(0, 0, 0, 0);
            if (customDateTo) {
              toDate = new Date(customDateTo);
              toDate.setHours(23, 59, 59, 999);
            } else {
              toDate = new Date(fromDate);
              toDate.setHours(23, 59, 59, 999);
            }
          } else {
            fromDate = today;
            toDate = tomorrow;
          }
          break;
        default:
          fromDate = today;
          toDate = tomorrow;
      }
      
      params.set('from', fromDate.toISOString());
      params.set('to', toDate.toISOString());
      
      const res = await fetch(`/api/portal/dashboard/summary?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const text = await res.text();
        console.error('Dashboard API Error:', res.status, text);
        throw new Error(`API Error ${res.status}: ${text.substring(0, 100)}`);
      }
      const summary = await res.json();
      console.log('Dashboard data:', summary);
      // Transform summary to DashboardData format
      setData({
        totalSales: summary.totalSales || 0,
        transactionCount: summary.transactionCount || 0,
        totalProducts: summary.totalProducts || 0,
        lowStockCount: summary.lowStockCount || 0,
        chartData: summary.chartData || [],
        recentTransactions: summary.recentTx || [],
      });
    } catch (err: any) {
      console.error('Dashboard fetch error:', err);
      if (err.message.includes('401')) {
        const { logout } = useAuthStore.getState();
        logout();
      }
      setError(err.message || 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, [token, dateFilter, customDate, customDateTo]);

  const formatCurrency = (val: number) =>
    `GHS ${(val || 0).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('en-GH', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <RefreshCw size={32} className="spin" style={{ opacity: 0.5 }} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass-panel" style={{ padding: '40px', textAlign: 'center' }}>
        <p style={{ color: 'var(--danger)', marginBottom: '16px' }}>{error}</p>
        <button onClick={fetchDashboard} className="btn-secondary">
          <RefreshCw size={16} /> Retry
        </button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '28px', marginBottom: '8px' }}>{businessName}</h1>
        <p style={{ color: 'var(--text-muted)' }}>Real-time business overview</p>
      </div>

      {/* Date Filter */}
      <div className="glass-panel" style={{ padding: '16px', marginBottom: '32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <Calendar size={16} color="var(--text-muted)" />
            <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>Date Range:</span>
            {[
              { id: 'today', label: 'Today' },
              { id: 'yesterday', label: 'Yesterday' },
              { id: 'lastWeek', label: 'Last Week' },
              { id: 'thisMonth', label: 'This Month' },
              { id: 'lastMonth', label: 'Last Month' },
              { id: 'allTime', label: 'All Time' },
              { id: 'custom', label: 'Custom' },
            ].map((filter) => (
              <button
                key={filter.id}
                onClick={() => setDateFilter(filter.id as any)}
                style={{
                  padding: '8px 14px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid',
                  borderColor: dateFilter === filter.id ? 'var(--primary)' : 'rgba(212, 160, 23, 0.3)',
                  background: dateFilter === filter.id ? 'var(--primary)' : 'rgba(212, 160, 23, 0.1)',
                  color: dateFilter === filter.id ? '#000' : 'var(--primary)',
                  cursor: 'pointer',
                  fontSize: '13px',
                }}
              >
                {filter.label}
              </button>
            ))}
          </div>
          
          {dateFilter === 'custom' && (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                type="date"
                value={customDate}
                onChange={(e) => setCustomDate(e.target.value)}
                style={{
                  padding: '8px 12px',
                  background: 'rgba(0,0,0,0.2)',
                  border: '1px solid var(--border-light)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-main)',
                  fontSize: '13px',
                }}
              />
              <span style={{ color: 'var(--text-muted)' }}>to</span>
              <input
                type="date"
                value={customDateTo}
                onChange={(e) => setCustomDateTo(e.target.value)}
                style={{
                  padding: '8px 12px',
                  background: 'rgba(0,0,0,0.2)',
                  border: '1px solid var(--border-light)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-main)',
                  fontSize: '13px',
                }}
              />
              <button
                onClick={fetchDashboard}
                disabled={!customDate}
                style={{
                  padding: '8px 16px',
                  background: customDate ? 'var(--primary)' : 'rgba(212, 160, 23, 0.2)',
                  border: '1px solid var(--primary)',
                  borderRadius: 'var(--radius-sm)',
                  color: customDate ? '#000' : 'var(--text-muted)',
                  cursor: customDate ? 'pointer' : 'not-allowed',
                  fontSize: '13px',
                  fontWeight: '500',
                  transition: 'all 0.2s',
                  opacity: customDate ? 1 : 0.6,
                }}
              >
                Apply
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Stats Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '20px',
          marginBottom: '32px',
        }}
      >
        <StatCard
          title="Total Revenue"
          value={formatCurrency(data.totalSales)}
          subtitle="All time synced sales"
          icon={DollarSign}
          color="primary"
        />
        <StatCard
          title="Transactions"
          value={data.transactionCount.toLocaleString()}
          subtitle="Total sales count"
          icon={ShoppingCart}
          color="secondary"
        />
        <StatCard
          title="Products"
          value={data.totalProducts.toLocaleString()}
          subtitle={`${data.lowStockCount} low stock alerts`}
          icon={Package}
          color="success"
          trend={data.lowStockCount > 0 ? 'down' : 'up'}
        />
        <StatCard
          title="Avg. Sale Value"
          value={formatCurrency(data.totalSales / (data.transactionCount || 1))}
          subtitle="Per transaction"
          icon={TrendingUp}
          color="primary"
        />
      </div>

      {/* Charts & Tables */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
          gap: '24px',
        }}
      >
        {/* Revenue Chart */}
        <div className="glass-panel" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
            <h3 style={{ fontSize: '18px', margin: 0 }}>Revenue Trend (Last 14 Days)</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--success)' }}>
              <TrendingUp size={16} />
              <span>Live sync</span>
            </div>
          </div>
          <div style={{ height: '300px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.chartData}>
                <defs>
                  <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis
                  dataKey="date"
                  stroke="var(--text-muted)"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={formatDate}
                />
                <YAxis
                  stroke="var(--text-muted)"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(val) => `GHS${val}`}
                />
                <Tooltip
                  contentStyle={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-light)',
                    borderRadius: '8px',
                  }}
                  formatter={(value) => [`GHS ${Number(value).toFixed(2)}`, 'Revenue']}
                />
                <Area
                  type="monotone"
                  dataKey="sales"
                  stroke="#8B5CF6"
                  strokeWidth={3}
                  fillOpacity={1}
                  fill="url(#colorSales)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Recent Transactions */}
        <div className="glass-panel" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
            <h3 style={{ fontSize: '18px', margin: 0 }}>Recent Transactions</h3>
            <Receipt size={20} color="var(--text-muted)" />
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-light)', color: 'var(--text-muted)', fontSize: '13px' }}>
                  <th style={{ padding: '12px', textAlign: 'left', fontWeight: 500 }}>Receipt</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontWeight: 500 }}>Cashier</th>
                  <th style={{ padding: '12px', textAlign: 'right', fontWeight: 500 }}>Amount</th>
                  <th style={{ padding: '12px', textAlign: 'center', fontWeight: 500 }}>Method</th>
                </tr>
              </thead>
              <tbody>
                {data.recentTransactions.slice(0, 5).map((tx) => (
                  <tr key={tx.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                    <td style={{ padding: '12px', fontFamily: 'monospace', fontSize: '13px' }}>
                      {tx.receipt_number}
                    </td>
                    <td style={{ padding: '12px' }}>{tx.cashier_name}</td>
                    <td style={{ padding: '12px', textAlign: 'right', fontWeight: 600, color: 'var(--success)' }}>
                      {tx.grand_total.toFixed(2)}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      <span
                        style={{
                          padding: '4px 10px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          background:
                            tx.payment_method === 'cash'
                              ? 'rgba(16,185,129,0.1)'
                              : tx.payment_method === 'momo'
                              ? 'rgba(139,92,246,0.1)'
                              : 'rgba(255,255,255,0.1)',
                          color:
                            tx.payment_method === 'cash'
                              ? 'var(--success)'
                              : tx.payment_method === 'momo'
                              ? 'var(--primary)'
                              : 'var(--text-muted)',
                        }}
                      >
                        {tx.payment_method}
                      </span>
                    </td>
                  </tr>
                ))}
                {data.recentTransactions.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      No recent transactions
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
