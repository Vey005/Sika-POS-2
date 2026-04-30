import { useEffect, useState, useCallback } from 'react';
import { useAuthStore } from '../store/auth';
import {
  RefreshCw,
  Eye,
  X,
  Calendar,
} from 'lucide-react';

interface TodaySummary {
  total_revenue: number;
  transaction_count: number;
  avg_basket: number;
  cash_total: number;
  momo_total: number;
  card_total: number;
  credit_total: number;
}

interface Transaction {
  id: number;
  receipt_number: string;
  created_at: string;
  cashier_name: string;
  customer_name?: string;
  grand_total: number;
  payment_method: string;
  status: string;
  item_count: number;
}

interface InventorySummary {
  total_items: number;
  total_stock: number;
  total_value_selling: number;
  total_value_cost: number;
}

interface CategorySummary {
  category: string;
  item_count: number;
  total_stock: number;
  total_value: number;
}

interface AttendanceLog {
  id: number;
  user_name: string;
  clock_in: string;
  clock_out?: string;
}

export default function Reports() {
  const { token, logout } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'sales' | 'inventory' | 'attendance'>('sales');
  const [summary, setSummary] = useState<TodaySummary | null>(null);
  const [invSummary, setInvSummary] = useState<InventorySummary | null>(null);
  const [categorySummary, setCategorySummary] = useState<CategorySummary[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [attendanceLogs, setAttendanceLogs] = useState<AttendanceLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [dateFilter, setDateFilter] = useState<'today' | 'yesterday' | 'lastWeek' | 'thisMonth' | 'lastMonth' | 'allTime' | 'custom'>('today');
  const [customDate, setCustomDate] = useState('');
  const [customDateTo, setCustomDateTo] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
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
      
      if (activeTab === 'sales') {
        // Load sales summary and transactions
        const params = new URLSearchParams();
        params.set('from', fromDate.toISOString());
        params.set('to', toDate.toISOString());
        
        const [summaryRes, txRes] = await Promise.all([
          fetch(`/api/portal/reports?${params}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`/api/portal/sales?${params}`, {
            headers: { Authorization: `Bearer ${token}` },
          })
        ]);

        if (summaryRes.ok) {
          const reportData = await summaryRes.json();
          setSummary({
            total_revenue: reportData.summary.totalRevenue,
            transaction_count: reportData.summary.totalTransactions,
            avg_basket: reportData.summary.averageOrderValue,
            cash_total: reportData.salesByPayment.find((p: any) => p.method === 'cash')?.amount || 0,
            momo_total: reportData.salesByPayment.find((p: any) => p.method === 'momo')?.amount || 0,
            card_total: reportData.salesByPayment.find((p: any) => p.method === 'card')?.amount || 0,
            credit_total: reportData.salesByPayment.find((p: any) => p.method === 'credit')?.amount || 0,
          });
        }

        if (txRes.ok) {
          const txData = await txRes.json();
          setTransactions(txData.sales || txData.transactions || []);
        }
      } else if (activeTab === 'inventory') {
        // Load inventory summary
        const [invRes, catRes] = await Promise.all([
          fetch('/api/portal/inventory/overview', {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch('/api/portal/inventory', {
            headers: { Authorization: `Bearer ${token}` },
          })
        ]);

        if (invRes.ok) {
          const invData = await invRes.json();
          setInvSummary(invData.totals);
        }

        if (catRes.ok) {
          const catData = await catRes.json();
          // Calculate category summary from products
          const categoryMap = new Map<string, CategorySummary>();
          (catData.products || []).forEach((product: any) => {
            const cat = product.category || 'General';
            if (!categoryMap.has(cat)) {
              categoryMap.set(cat, {
                category: cat,
                item_count: 0,
                total_stock: 0,
                total_value: 0,
              });
            }
            const summary = categoryMap.get(cat)!;
            summary.item_count++;
            summary.total_stock += parseInt(product.stock_qty || 0);
            summary.total_value += parseFloat(product.unit_price || 0) * parseInt(product.stock_qty || 0);
          });
          setCategorySummary(Array.from(categoryMap.values()));
        }
      } else if (activeTab === 'attendance') {
        // Attendance would need a separate endpoint - for now show empty
        setAttendanceLogs([]);
      }
    } catch (err: any) {
      console.error('Failed to load reports:', err);
      if (err?.message?.includes('401') || (err?.response && err.response.status === 401)) {
        logout();
      }
    } finally {
      setLoading(false);
    }
  }, [activeTab, token, dateFilter, customDate, customDateTo]);

  useEffect(() => { load(); }, [load, dateFilter, customDate, customDateTo]);

  const paymentMethodLabel = (method: string) => {
    const map: Record<string, string> = {
      cash: '💵 Cash', momo: '📱 MoMo', card: '💳 Card', credit: '📋 Credit',
    };
    return map[method] || method;
  };

  const formatCurrency = (val: number) =>
    `GHS ${(val || 0).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  if (loading && !summary && !invSummary) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <RefreshCw size={32} className="spin" style={{ opacity: 0.5 }} />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h1 style={{ fontSize: '28px', marginBottom: '8px' }}>Reports</h1>
            <p style={{ color: 'var(--text-muted)' }}>Sales history & analytics</p>
          </div>
        </div>
        
        {/* Date Filter */}
        <div className="glass-panel" style={{ 
          padding: '16px', 
          marginTop: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <Calendar size={16} style={{ color: 'var(--primary)' }} />
            <span style={{ fontSize: '14px', fontWeight: '500', color: 'var(--text-main)' }}>Date Filter</span>
          </div>
          
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {[
              { value: 'today', label: 'Today' },
              { value: 'yesterday', label: 'Yesterday' },
              { value: 'lastWeek', label: 'Last Week' },
              { value: 'thisMonth', label: 'This Month' },
              { value: 'lastMonth', label: 'Last Month' },
              { value: 'allTime', label: 'All Time' },
              { value: 'custom', label: 'Custom' }
            ].map((filter) => (
              <button
                key={filter.value}
                onClick={() => setDateFilter(filter.value as any)}
                style={{
                  padding: '8px 16px',
                  background: dateFilter === filter.value 
                    ? 'var(--primary)' 
                    : 'rgba(212, 160, 23, 0.1)',
                  border: dateFilter === filter.value 
                    ? '1px solid var(--primary)' 
                    : '1px solid rgba(212, 160, 23, 0.3)',
                  borderRadius: 'var(--radius-sm)',
                  color: dateFilter === filter.value 
                    ? '#000' 
                    : 'var(--primary)',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: '500',
                  transition: 'all 0.2s',
                }}
              >
                {filter.label}
              </button>
            ))}
          </div>
          
          {dateFilter === 'custom' && (
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '12px',
              flexWrap: 'wrap',
              marginTop: '8px'
            }}>
              <input 
                type="date" 
                value={customDate} 
                style={{
                  padding: '8px 12px',
                  background: 'rgba(0,0,0,0.2)',
                  border: '1px solid var(--border-light)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-main)',
                  fontSize: '13px',
                }}
                onChange={e => setCustomDate(e.target.value)} 
              />
              <span style={{ color: 'var(--text-muted)' }}>to</span>
              <input 
                type="date" 
                value={customDateTo} 
                style={{
                  padding: '8px 12px',
                  background: 'rgba(0,0,0,0.2)',
                  border: '1px solid var(--border-light)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-main)',
                  fontSize: '13px',
                }}
                onChange={e => setCustomDateTo(e.target.value)} 
              />
              <button
                onClick={() => load()}
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

      {/* Tabs */}
      <div style={{ 
        display: 'flex', 
        borderBottom: '1px solid var(--border-light)', 
        marginBottom: '24px',
        gap: '4px'
      }}>
        {[
          { id: 'sales', label: 'Sales Performance' },
          { id: 'inventory', label: 'Inventory Overview' },
          { id: 'attendance', label: 'Attendance Logs' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            style={{
              padding: '12px 20px',
              background: activeTab === tab.id ? 'var(--bg-surface)' : 'transparent',
              border: 'none',
              borderBottom: activeTab === tab.id ? '2px solid var(--primary)' : '2px solid transparent',
              color: activeTab === tab.id ? 'var(--text-main)' : 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: activeTab === tab.id ? '600' : '400',
              transition: 'all 0.2s',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ minHeight: '400px' }}>
        {activeTab === 'sales' && (
          <>
            {summary && (
              <div style={{ marginBottom: 'clamp(20px, 5vw, 32px)' }}>
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', 
                  gap: 'clamp(8px, 2vw, 16px)',
                  marginBottom: 'clamp(16px, 4vw, 24px)'
                }}>
                  <div className="glass-panel" style={{ padding: 'clamp(12px, 3vw, 20px)' }}>
                    <p style={{ fontSize: 'clamp(10px, 2.5vw, 12px)', color: 'var(--text-muted)', marginBottom: '4px' }}>Revenue</p>
                    <p style={{ fontSize: 'clamp(18px, 4vw, 24px)', fontWeight: '600', color: 'var(--text-main)', wordBreak: 'break-word' }}>
                      GHS {formatCurrency(summary.total_revenue)}
                    </p>
                  </div>
                  <div className="glass-panel" style={{ padding: 'clamp(12px, 3vw, 20px)' }}>
                    <p style={{ fontSize: 'clamp(10px, 2.5vw, 12px)', color: 'var(--text-muted)', marginBottom: '4px' }}>Transactions</p>
                    <p style={{ fontSize: 'clamp(18px, 4vw, 24px)', fontWeight: '600', color: 'var(--text-main)' }}>
                      {summary.transaction_count}
                    </p>
                  </div>
                  <div className="glass-panel" style={{ padding: 'clamp(12px, 3vw, 20px)' }}>
                    <p style={{ fontSize: 'clamp(10px, 2.5vw, 12px)', color: 'var(--text-muted)', marginBottom: '4px' }}>Avg Basket</p>
                    <p style={{ fontSize: 'clamp(18px, 4vw, 24px)', fontWeight: '600', color: 'var(--text-main)', wordBreak: 'break-word' }}>
                      GHS {formatCurrency(summary.avg_basket)}
                    </p>
                  </div>
                  <div className="glass-panel" style={{ padding: 'clamp(12px, 3vw, 20px)' }}>
                    <p style={{ fontSize: 'clamp(10px, 2.5vw, 12px)', color: 'var(--text-muted)', marginBottom: '4px' }}>Cash</p>
                    <p style={{ fontSize: 'clamp(18px, 4vw, 24px)', fontWeight: '600', color: 'var(--text-main)', wordBreak: 'break-word' }}>
                      GHS {formatCurrency(summary.cash_total)}
                    </p>
                  </div>
                  <div className="glass-panel" style={{ padding: 'clamp(12px, 3vw, 20px)' }}>
                    <p style={{ fontSize: 'clamp(10px, 2.5vw, 12px)', color: 'var(--text-muted)', marginBottom: '4px' }}>MoMo</p>
                    <p style={{ fontSize: 'clamp(18px, 4vw, 24px)', fontWeight: '600', color: 'var(--text-main)', wordBreak: 'break-word' }}>
                      GHS {formatCurrency(summary.momo_total)}
                    </p>
                  </div>
                  <div className="glass-panel" style={{ padding: 'clamp(12px, 3vw, 20px)', borderLeft: summary.credit_total > 0 ? '3px solid var(--danger)' : undefined }}>
                    <p style={{ fontSize: 'clamp(10px, 2.5vw, 12px)', color: 'var(--text-muted)', marginBottom: '4px' }}>Credit</p>
                    <p style={{ fontSize: 'clamp(18px, 4vw, 24px)', fontWeight: '600', color: 'var(--text-main)', wordBreak: 'break-word' }}>
                      GHS {formatCurrency(summary.credit_total)}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="glass-panel" style={{ padding: 'clamp(16px, 4vw, 24px)' }}>
              <h2 style={{ fontSize: 'clamp(16px, 4vw, 18px)', marginBottom: 'clamp(16px, 4vw, 20px)', color: 'var(--text-main)' }}>Transaction History</h2>
              <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '800px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-light)' }}>
                      <th style={{ padding: 'clamp(8px, 2vw, 12px)', textAlign: 'left', fontSize: 'clamp(10px, 2.5vw, 12px)', color: 'var(--text-muted)' }}>Receipt No.</th>
                      <th style={{ padding: 'clamp(8px, 2vw, 12px)', textAlign: 'left', fontSize: 'clamp(10px, 2.5vw, 12px)', color: 'var(--text-muted)' }}>Date & Time</th>
                      <th style={{ padding: 'clamp(8px, 2vw, 12px)', textAlign: 'left', fontSize: 'clamp(10px, 2.5vw, 12px)', color: 'var(--text-muted)' }}>Cashier</th>
                      <th style={{ padding: 'clamp(8px, 2vw, 12px)', textAlign: 'left', fontSize: 'clamp(10px, 2.5vw, 12px)', color: 'var(--text-muted)' }}>Customer</th>
                      <th style={{ padding: 'clamp(8px, 2vw, 12px)', textAlign: 'left', fontSize: 'clamp(10px, 2.5vw, 12px)', color: 'var(--text-muted)' }}>Items</th>
                      <th style={{ padding: 'clamp(8px, 2vw, 12px)', textAlign: 'left', fontSize: 'clamp(10px, 2.5vw, 12px)', color: 'var(--text-muted)' }}>Payment</th>
                      <th style={{ padding: 'clamp(8px, 2vw, 12px)', textAlign: 'left', fontSize: 'clamp(10px, 2.5vw, 12px)', color: 'var(--text-muted)' }}>Total</th>
                      <th style={{ padding: 'clamp(8px, 2vw, 12px)', textAlign: 'left', fontSize: 'clamp(10px, 2.5vw, 12px)', color: 'var(--text-muted)' }}>Status</th>
                      <th style={{ padding: 'clamp(8px, 2vw, 12px)', textAlign: 'left', fontSize: 'clamp(10px, 2.5vw, 12px)', color: 'var(--text-muted)' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={9} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                          Loading...
                        </td>
                      </tr>
                    ) : transactions.length === 0 ? (
                      <tr>
                        <td colSpan={9} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                          No transactions found for this period
                        </td>
                      </tr>
                    ) : transactions.map(tx => (
                      <tr 
                        key={tx.id} 
                        style={{ 
                          borderBottom: '1px solid var(--border-light)',
                          cursor: 'pointer'
                        }}
                        onClick={() => setSelectedTx(tx)}
                      >
                        <td style={{ padding: 'clamp(8px, 2vw, 12px)' }}>
                          <span style={{ fontFamily: 'monospace', fontSize: 'clamp(10px, 2.5vw, 12px)', wordBreak: 'break-all' }}>{tx.receipt_number}</span>
                        </td>
                        <td style={{ padding: 'clamp(8px, 2vw, 12px)' }}>
                          <div style={{ fontSize: 'clamp(11px, 2.5vw, 13px)' }}>
                            {new Date(tx.created_at).toLocaleDateString('en-GH')}
                          </div>
                          <div style={{ fontSize: 'clamp(9px, 2vw, 11px)', color: 'var(--text-muted)' }}>
                            {new Date(tx.created_at).toLocaleTimeString('en-GH')}
                          </div>
                        </td>
                        <td style={{ padding: 'clamp(8px, 2vw, 12px)', fontSize: 'clamp(11px, 2.5vw, 13px)' }}>{tx.cashier_name}</td>
                        <td style={{ padding: 'clamp(8px, 2vw, 12px)', fontSize: 'clamp(11px, 2.5vw, 13px)' }}>
                          {tx.customer_name || <span style={{ color: 'var(--text-muted)' }}>Walk-in</span>}
                        </td>
                        <td style={{ padding: 'clamp(8px, 2vw, 12px)', fontFamily: 'monospace', fontSize: 'clamp(10px, 2.5vw, 12px)' }}>{tx.item_count}</td>
                        <td style={{ padding: 'clamp(8px, 2vw, 12px)', fontSize: 'clamp(11px, 2.5vw, 13px)' }}>{paymentMethodLabel(tx.payment_method)}</td>
                        <td style={{ padding: 'clamp(8px, 2vw, 12px)', fontWeight: '600', fontSize: 'clamp(11px, 2.5vw, 13px)', wordBreak: 'break-word' }}>
                          GHS {formatCurrency(tx.grand_total)}
                        </td>
                        <td style={{ padding: 'clamp(8px, 2vw, 12px)' }}>
                          <span style={{
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontSize: 'clamp(9px, 2vw, 11px)',
                            fontWeight: '600',
                            background: tx.status === 'completed' ? 'rgba(16, 185, 129, 0.1)' : 
                                       tx.status === 'voided' ? 'rgba(239, 68, 68, 0.1)' : 
                                       'rgba(245, 158, 11, 0.1)',
                            color: tx.status === 'completed' ? '#10B981' : 
                                   tx.status === 'voided' ? '#EF4444' : 
                                   '#F59E0B',
                          }}>
                            {tx.status}
                          </span>
                        </td>
                        <td style={{ padding: 'clamp(8px, 2vw, 12px)' }}>
                          <button
                            onClick={(e) => { e.stopPropagation(); setSelectedTx(tx); }}
                            style={{
                              padding: '4px 6px',
                              background: 'rgba(139, 92, 246, 0.1)',
                              border: '1px solid var(--primary)',
                              borderRadius: '4px',
                              color: 'var(--primary)',
                              cursor: 'pointer',
                              fontSize: 'clamp(10px, 2vw, 12px)',
                            }}
                          >
                            <Eye size={12} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {activeTab === 'inventory' && (
          <div className="glass-panel" style={{ padding: '24px' }}>
            {invSummary && (
              <div style={{ marginBottom: '32px' }}>
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
                  gap: '16px',
                  marginBottom: '24px'
                }}>
                  <div className="glass-panel" style={{ padding: '20px' }}>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Total Stock Items</p>
                    <p style={{ fontSize: '24px', fontWeight: '600', color: 'var(--text-main)' }}>
                      {invSummary.total_stock?.toLocaleString() || 0}
                    </p>
                  </div>
                  <div className="glass-panel" style={{ padding: '20px' }}>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Unique Products</p>
                    <p style={{ fontSize: '24px', fontWeight: '600', color: 'var(--text-main)' }}>
                      {invSummary.total_items || 0}
                    </p>
                  </div>
                  <div className="glass-panel" style={{ padding: '20px' }}>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Stock Value (Selling)</p>
                    <p style={{ fontSize: '24px', fontWeight: '600', color: 'var(--text-main)' }}>
                      GHS {formatCurrency(invSummary.total_value_selling)}
                    </p>
                  </div>
                  <div className="glass-panel" style={{ padding: '20px' }}>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Stock Value (Cost)</p>
                    <p style={{ fontSize: '24px', fontWeight: '600', color: 'var(--text-main)' }}>
                      GHS {formatCurrency(invSummary.total_value_cost)}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <h2 style={{ fontSize: '18px', marginBottom: '20px', color: 'var(--text-main)' }}>Stock Value by Category</h2>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-light)' }}>
                    <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', color: 'var(--text-muted)' }}>Category</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', color: 'var(--text-muted)' }}>Unique Products</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', color: 'var(--text-muted)' }}>Total Stock</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', color: 'var(--text-muted)' }}>Total Value (Selling)</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={4} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                        Loading...
                      </td>
                    </tr>
                  ) : categorySummary.length === 0 ? (
                    <tr>
                      <td colSpan={4} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                        No data available
                      </td>
                    </tr>
                  ) : categorySummary.map((cat, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid var(--border-light)' }}>
                      <td style={{ padding: '12px', fontWeight: '600' }}>{cat.category}</td>
                      <td style={{ padding: '12px', fontFamily: 'monospace', fontSize: '12px' }}>{cat.item_count}</td>
                      <td style={{ padding: '12px', fontFamily: 'monospace', fontSize: '12px' }}>{cat.total_stock?.toLocaleString() || 0}</td>
                      <td style={{ padding: '12px', fontWeight: '600' }}>
                        GHS {formatCurrency(cat.total_value)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p style={{ marginTop: '24px', padding: '20px', color: 'var(--text-muted)', fontSize: '13px' }}>
              For detailed inventory management, please visit the Inventory tab in the sidebar.
            </p>
          </div>
        )}

        {activeTab === 'attendance' && (
          <div className="glass-panel" style={{ padding: '24px' }}>
            <h2 style={{ fontSize: '18px', marginBottom: '20px', color: 'var(--text-main)' }}>Attendance Logs</h2>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-light)' }}>
                    <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', color: 'var(--text-muted)' }}>Staff Name</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', color: 'var(--text-muted)' }}>Date</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', color: 'var(--text-muted)' }}>Clock In</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', color: 'var(--text-muted)' }}>Clock Out</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', color: 'var(--text-muted)' }}>Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={5} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                        Loading logs...
                      </td>
                    </tr>
                  ) : attendanceLogs.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                        No attendance logs found for this period
                      </td>
                    </tr>
                  ) : attendanceLogs.map(log => {
                    const duration = log.clock_out 
                      ? Math.round((new Date(log.clock_out).getTime() - new Date(log.clock_in).getTime()) / (1000 * 60))
                      : null;
                    const hours = duration ? Math.floor(duration / 60) : 0;
                    const mins = duration ? duration % 60 : 0;

                    return (
                      <tr key={log.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                        <td style={{ padding: '12px', fontWeight: '600' }}>{log.user_name}</td>
                        <td style={{ padding: '12px' }}>{new Date(log.clock_in).toLocaleDateString('en-GH')}</td>
                        <td style={{ padding: '12px', fontFamily: 'monospace', fontSize: '12px' }}>
                          {new Date(log.clock_in).toLocaleTimeString('en-GH')}
                        </td>
                        <td style={{ padding: '12px' }}>
                          {log.clock_out ? (
                            <span style={{ fontFamily: 'monospace', fontSize: '12px' }}>
                              {new Date(log.clock_out).toLocaleTimeString('en-GH')}
                            </span>
                          ) : (
                            <span style={{
                              padding: '4px 8px',
                              borderRadius: '4px',
                              fontSize: '11px',
                              fontWeight: '600',
                              background: 'rgba(16, 185, 129, 0.1)',
                              color: '#10B981',
                            }}>
                              Still In
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '12px', fontFamily: 'monospace', fontSize: '12px' }}>
                          {duration !== null ? `${hours}h ${mins}m` : '---'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Transaction Detail Modal */}
      {selectedTx && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div className="glass-panel" style={{
            maxWidth: '600px',
            width: '90%',
            maxHeight: '80vh',
            overflowY: 'auto',
            position: 'relative',
          }}>
            <button
              onClick={() => setSelectedTx(null)}
              style={{
                position: 'absolute',
                top: '16px',
                right: '16px',
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
              }}
            >
              <X size={20} />
            </button>
            
            <div style={{ padding: '24px' }}>
              <h2 style={{ marginBottom: '20px' }}>Transaction Details</h2>
              <div style={{ display: 'grid', gap: '12px' }}>
                <div><strong>Receipt:</strong> {selectedTx.receipt_number}</div>
                <div><strong>Date:</strong> {new Date(selectedTx.created_at).toLocaleString('en-GH')}</div>
                <div><strong>Cashier:</strong> {selectedTx.cashier_name}</div>
                <div><strong>Customer:</strong> {selectedTx.customer_name || 'Walk-in'}</div>
                <div><strong>Payment:</strong> {paymentMethodLabel(selectedTx.payment_method)}</div>
                <div><strong>Total:</strong> GHS {formatCurrency(selectedTx.grand_total)}</div>
                <div><strong>Status:</strong> {selectedTx.status}</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
