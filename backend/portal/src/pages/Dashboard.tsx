import { useEffect, useState } from 'react';
import { useAuthStore } from '../store/auth';
import StatCard from '../components/StatCard';
import { getApiUrl, API_CONFIG } from '../config/api';
import { paymentMethodLabel, paymentBadgeStyle } from '../utils/paymentDisplay';
import {
  DollarSign,
  ShoppingCart,
  Package,
  TrendingUp,
  RefreshCw,
  Receipt,
  Calendar,
  ChevronDown,
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
  totalCredit: number;
  lowStockCount: number;
  chartData: Array<{ date: string; sales: number; transactions: number }>;
    recentTransactions: Array<{
      id: number;
      receipt_number: string;
      grand_total: number;
      payment_method: string;
      split_cash?: number;
      split_momo?: number;
      change_given?: number;
      created_at: string;
      cashier_name: string;
      status: string;
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
  const [periodOpen, setPeriodOpen] = useState(false);

  const fetchDashboard = async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      
      // Helper to format date as YYYY-MM-DD (no timezone, date-only)
      const fmt = (d: Date): string => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      };
      
      // Calculate date range based on filter
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      
      let fromDate: Date;
      let toDate: Date;
      
      switch (dateFilter) {
        case 'today':
          fromDate = today;
          toDate = today;
          break;
        case 'yesterday':
          fromDate = yesterday;
          toDate = yesterday;
          break;
        case 'lastWeek':
          // Last 7 days (not including today)
          const weekEnd = new Date(today);
          weekEnd.setDate(today.getDate() - 1);
          const weekStart = new Date(today);
          weekStart.setDate(today.getDate() - 7);
          fromDate = weekStart;
          toDate = weekEnd;
          break;
        case 'thisMonth':
          fromDate = new Date(today.getFullYear(), today.getMonth(), 1);
          toDate = today;
          break;
        case 'lastMonth':
          fromDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
          toDate = new Date(today.getFullYear(), today.getMonth(), 0);
          break;
        case 'allTime':
          fromDate = new Date(2000, 0, 1);
          toDate = new Date(2100, 11, 31);
          break;
        case 'custom':
          if (customDate) {
            fromDate = new Date(customDate);
            if (customDateTo) {
              toDate = new Date(customDateTo);
            } else {
              toDate = new Date(fromDate);
            }
          } else {
            fromDate = today;
            toDate = today;
          }
          break;
        default:
          fromDate = today;
          toDate = today;
      }
      
      params.set('from', fmt(fromDate));
      params.set('to', fmt(toDate));
      
      const res = await fetch(getApiUrl(`${API_CONFIG.ENDPOINTS.DASHBOARD_SUMMARY}?${params}`), {
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
        totalCredit: summary.totalCredit || 0,
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
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: 'clamp(1.2rem,5vw,1.75rem)', marginBottom: '4px' }}>{businessName}</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Real-time business overview</p>
      </div>

      {/* Date Filter */}
      <div className="glass-panel" style={{ 
        padding: '10px 14px', 
        marginBottom: '20px',
        width: '100%',
        boxSizing: 'border-box',
        overflow: 'visible',
        position: 'relative',
        zIndex: 50
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Calendar size={15} color="var(--primary)" />
            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Period:</span>
            <div style={{ position: 'relative' }} onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => setPeriodOpen(!periodOpen)}
                className="portal-select"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  minHeight: 'auto',
                }}
              >
                <span>{
                  dateFilter === 'today' ? 'Today' :
                  dateFilter === 'yesterday' ? 'Yesterday' :
                  dateFilter === 'lastWeek' ? 'Last Week' :
                  dateFilter === 'thisMonth' ? 'This Month' :
                  dateFilter === 'lastMonth' ? 'Last Month' :
                  dateFilter === 'allTime' ? 'All Time' :
                  'Custom Range'
                }</span>
                <ChevronDown size={14} style={{ opacity: 0.7 }} />
              </button>

              {periodOpen && (
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    marginTop: 6,
                    minWidth: '180px',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-strong)',
                    borderRadius: 'var(--radius-md)',
                    boxShadow: '0 12px 32px rgba(0,0,0,0.35)',
                    zIndex: 120,
                    overflow: 'hidden',
                  }}
                >
                  {[
                    { value: 'today', label: 'Today' },
                    { value: 'yesterday', label: 'Yesterday' },
                    { value: 'lastWeek', label: 'Last Week' },
                    { value: 'thisMonth', label: 'This Month' },
                    { value: 'lastMonth', label: 'Last Month' },
                    { value: 'allTime', label: 'All Time' },
                    { value: 'custom', label: 'Custom Date Range' }
                  ].map((filter) => (
                    <button
                      key={filter.value}
                      type="button"
                      onClick={() => {
                        setDateFilter(filter.value as any);
                        setPeriodOpen(false);
                      }}
                      style={{
                        display: 'block',
                        width: '100%',
                        textAlign: 'left',
                        padding: '10px 14px',
                        border: 'none',
                        borderBottom: '1px solid var(--border-light)',
                        background: dateFilter === filter.value ? 'rgba(212,160,23,0.12)' : 'transparent',
                        color: dateFilter === filter.value ? 'var(--primary)' : 'var(--text-main)',
                        fontSize: 12,
                        fontWeight: '500',
                        cursor: 'pointer',
                      }}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          
          {dateFilter === 'custom' && (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                type="date"
                value={customDate}
                onChange={(e) => setCustomDate(e.target.value)}
                className="portal-date-input"
              />
              <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>to</span>
              <input
                type="date"
                value={customDateTo}
                onChange={(e) => setCustomDateTo(e.target.value)}
                className="portal-date-input"
              />
              <button
                onClick={fetchDashboard}
                disabled={!customDate}
                className="btn-primary"
                style={{
                  padding: '6px 12px',
                  fontSize: '12px',
                  borderRadius: '8px',
                  minHeight: 'auto',
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
      <div className="stat-grid" style={{ marginBottom: '20px' }}>
        <StatCard
          title="Total Revenue"
          value={formatCurrency(data.totalSales)}
          subtitle="All time synced sales"
          icon={DollarSign}
          color="primary"
        />
        <StatCard
          title="Outstanding Credit"
          value={formatCurrency(data.totalCredit)}
          subtitle="Unpaid debt balance"
          icon={Receipt}
          color={data.totalCredit > 0 ? 'danger' : 'secondary'}
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
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
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
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                        <span
                          style={{
                            padding: '4px 10px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 600,
                            textTransform: tx.payment_method === 'split' ? 'none' : 'uppercase',
                            background: paymentBadgeStyle(tx.payment_method).bg,
                            color: paymentBadgeStyle(tx.payment_method).color,
                          }}
                        >
                          {paymentMethodLabel(tx.payment_method, tx)}
                        </span>
                        {tx.status === 'debt' && (
                          <span style={{ fontSize: '10px', fontWeight: 'bold', color: '#FB923C' }}>OWES</span>
                        )}
                      </div>
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
