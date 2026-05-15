import { useEffect, useState, useCallback } from 'react';
import { useAuthStore } from '../store/auth';
import {
  RefreshCw,
  Eye,
  X,
  Calendar,
  Printer,
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
  items?: any[];
  total_tax?: number;
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
  const { token, logout, businessName, businessLogo } = useAuthStore();
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

  // Fetch full details when a transaction is selected
  useEffect(() => {
    // Only fetch if we have a selection AND either no items list OR an empty list but the count says there should be items
    if (selectedTx && (!selectedTx.items || (selectedTx.items.length === 0 && selectedTx.item_count > 0))) {
      const fetchDetails = async () => {
        try {
          const res = await fetch(`/api/portal/sales/${selectedTx.id}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            const data = await res.json();
            // Use String comparison to avoid type mismatches
            setSelectedTx(prev => prev && String(prev.id) === String(data.id) ? { ...prev, ...data } : prev);
          }
        } catch (err) {
          console.error('Failed to fetch transaction details:', err);
        }
      };
      fetchDetails();
    }
  }, [selectedTx, token]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Calculate date range based on filter
      // We send date-only strings (YYYY-MM-DD) to the server for SQL DATE() comparison
      // IMPORTANT: Use local date components (getFullYear/getMonth/getDate) not toISOString() 
      // because toISOString() converts to UTC which can shift the date
      const fmt = (d: Date): string => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      };

      const today = new Date();
      const todayStr = fmt(today);
      
      const yesterday = new Date(today);
      yesterday.setDate(today.getDate() - 1);
      const yesterdayStr = fmt(yesterday);

      let fromStr: string;
      let toStr: string;
      
      switch (dateFilter) {
        case 'today':
          fromStr = todayStr;
          toStr = todayStr;
          break;
        case 'yesterday':
          fromStr = yesterdayStr;
          toStr = yesterdayStr;
          break;
        case 'lastWeek': {
          // Last 7 days (not including today)
          const weekEnd = new Date(today);
          weekEnd.setDate(today.getDate() - 1); // yesterday
          const weekStart = new Date(today);
          weekStart.setDate(today.getDate() - 7); // 7 days ago
          fromStr = fmt(weekStart);
          toStr = fmt(weekEnd);
          break;
        }
        case 'thisMonth':
          fromStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
          toStr = todayStr;
          break;
        case 'lastMonth': {
          const lmStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
          const lmEnd = new Date(today.getFullYear(), today.getMonth(), 0); // last day of prev month
          fromStr = fmt(lmStart);
          toStr = fmt(lmEnd);
          break;
        }
        case 'allTime':
          fromStr = '2000-01-01';
          toStr = '2100-12-31';
          break;
        case 'custom':
          fromStr = customDate || todayStr;
          toStr = customDateTo || customDate || todayStr;
          break;
        default:
          fromStr = todayStr;
          toStr = todayStr;
      }
      
      if (activeTab === 'sales') {
        // Use a SINGLE data source for both summary and transactions
        // This ensures the summary numbers always match the transaction list
        const params = new URLSearchParams();
        params.set('from', fromStr);
        params.set('to', toStr);
        params.set('limit', '200');
        
        const txRes = await fetch(`/api/portal/sales?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (txRes.ok) {
          const txData = await txRes.json();
          // Use the summary from the SAME endpoint that provides the list
          if (txData.summary) {
            setSummary({
              total_revenue: txData.summary.total_revenue || 0,
              transaction_count: txData.summary.transaction_count || 0,
              avg_basket: txData.summary.avg_basket || 0,
              cash_total: txData.summary.cash_total || 0,
              momo_total: txData.summary.momo_total || 0,
              card_total: txData.summary.card_total || 0,
              credit_total: txData.summary.credit_total || 0,
            });
          }
          setTransactions(txData.transactions || []);
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

  const handlePrintReport = async () => {
    try {
      const fromStr = dateFilter === 'custom' ? customDate : 
                     dateFilter === 'today' ? new Date().toISOString().split('T')[0] :
                     dateFilter === 'yesterday' ? new Date(Date.now() - 86400000).toISOString().split('T')[0] :
                     new Date(Date.now() - (parseInt(dateFilter) || 7) * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      
      const toStr = dateFilter === 'custom' ? customDateTo : new Date().toISOString().split('T')[0];

      // Fetch detailed data for printing
      const [salesRes, reportsRes] = await Promise.all([
        fetch(`/api/portal/sales?from=${fromStr}&to=${toStr}&includeItems=true&limit=500`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch(`/api/portal/reports?from=${fromStr}&to=${toStr}`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);

      if (!salesRes.ok || !reportsRes.ok) throw new Error('Failed to fetch detailed report data');

      const salesData = await salesRes.json();
      const reportsData = await reportsRes.json();

      const printWindow = window.open('', '_blank');
      if (!printWindow) return;

      const logo = useAuthStore.getState().businessLogo || '';
      const dateLabel = dateFilter === 'today' ? new Date().toLocaleDateString('en-GH') : 
                        dateFilter === 'yesterday' ? new Date(Date.now() - 86400000).toLocaleDateString('en-GH') :
                        `${fromStr} to ${toStr}`;

      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>SikaPOS - End of Day Report</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
            @media print {
              @page { margin: 1cm; }
              body { margin: 0; padding: 0; }
              .no-print { display: none; }
            }
            body {
              font-family: 'Inter', -apple-system, sans-serif;
              color: #1a1a1a;
              max-width: 900px;
              margin: 0 auto;
              padding: 40px;
              line-height: 1.5;
              background: #fff;
            }
            .header { text-align: center; margin-bottom: 40px; }
            .logo { width: 80px; height: 80px; object-fit: contain; margin-bottom: 12px; }
            .business-name { font-size: 24px; font-weight: 700; margin: 0; color: #000; }
            .report-title { font-size: 16px; font-weight: 500; margin: 8px 0; color: #666; text-transform: uppercase; letter-spacing: 1px; }
            .date { font-size: 14px; color: #888; font-weight: 500; }
            
            .section-header { 
              font-size: 18px; 
              font-weight: 700; 
              margin: 32px 0 16px; 
              padding-bottom: 8px;
              border-bottom: 2px solid #f0f0f0;
            }

            .summary-grid {
              display: grid;
              grid-template-columns: repeat(3, 1fr);
              gap: 16px;
              margin-bottom: 32px;
            }
            .summary-card {
              background: #f8f9fa;
              padding: 20px;
              border-radius: 12px;
              border: 1px solid #eee;
            }
            .summary-label { font-size: 12px; font-weight: 600; color: #888; text-transform: uppercase; margin-bottom: 8px; }
            .summary-value { font-size: 20px; font-weight: 700; color: #000; }

            table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
            th { text-align: left; padding: 12px; background: #f8f9fa; font-size: 12px; font-weight: 700; color: #666; text-transform: uppercase; }
            td { padding: 12px; border-bottom: 1px solid #eee; font-size: 13px; }
            .row-zebra:nth-child(even) { background: #fafafa; }
            
            .item-row { font-size: 11px; color: #666; padding: 4px 12px 4px 40px !important; border: none !important; }
            .item-row span { color: #f59e0b; font-weight: 500; }

            .footer { 
              text-align: center; 
              margin-top: 60px; 
              padding-top: 20px;
              border-top: 1px solid #eee;
              font-size: 12px; 
              color: #999; 
            }
            .tx-receipt { font-weight: 600; font-family: monospace; }
          </style>
        </head>
        <body>
          <div class="header">
            ${logo ? `<img src="${logo}" class="logo" />` : '<div style="height: 80px"></div>'}
            <h1 class="business-name">${businessName || 'SikaPOS Shop'}</h1>
            <h2 class="report-title">End of Day Report</h2>
            <div class="date">${dateLabel}</div>
          </div>

          <div class="section-header">Performance Summary</div>
          <div class="summary-grid">
            <div class="summary-card">
              <div class="summary-label">Total Revenue</div>
              <div class="summary-value">GHS ${formatCurrency(salesData.summary.total_revenue)}</div>
            </div>
            <div class="summary-card">
              <div class="summary-label">Transactions</div>
              <div class="summary-value">${salesData.summary.transaction_count}</div>
            </div>
            <div class="summary-card">
              <div class="summary-label">Cash Total</div>
              <div class="summary-value">GHS ${formatCurrency(salesData.summary.cash_total)}</div>
            </div>
            <div class="summary-card">
              <div class="summary-label">MoMo Total</div>
              <div class="summary-value">GHS ${formatCurrency(salesData.summary.momo_total)}</div>
            </div>
            <div class="summary-card">
              <div class="summary-label">Credit Total</div>
              <div class="summary-value">GHS ${formatCurrency(salesData.summary.credit_total)}</div>
            </div>
          </div>

          <div class="section-header">Transactions</div>
          <table>
            <thead>
              <tr>
                <th>Receipt #</th>
                <th>Time</th>
                <th>Method</th>
                <th style="text-align: right">Total</th>
              </tr>
            </thead>
            <tbody>
              ${salesData.transactions.map((tx: any) => `
                <tr class="row-zebra">
                  <td class="tx-receipt">${tx.receipt_number}</td>
                  <td>${new Date(tx.created_at).toLocaleTimeString('en-GH', { hour: '2-digit', minute: '2-digit', hour12: true })}</td>
                  <td>${tx.payment_method.toUpperCase()}</td>
                  <td style="text-align: right; font-weight: 700;">GHS ${formatCurrency(tx.grand_total)}</td>
                </tr>
                ${tx.items && tx.items.length > 0 ? tx.items.map((item: any) => `
                  <tr>
                    <td colspan="4" class="item-row">
                      ${item.product_name} <span>(1kg)</span> × ${item.quantity}
                      <span style="float: right; color: #888; font-weight: 400;">GHS ${formatCurrency(item.line_total)}</span>
                    </td>
                  </tr>
                `).join('') : ''}
              `).join('')}
            </tbody>
          </table>

          <div class="section-header">Items Sold Summary</div>
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th style="text-align: right">Total Qty Sold</th>
              </tr>
            </thead>
            <tbody>
              ${reportsData.topProducts.map((p: any) => `
                <tr>
                  <td>${p.name} <span>(1kg)</span></td>
                  <td style="text-align: right; font-weight: 700;">× ${p.quantity}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <div class="footer">
            <p>Generated on ${new Date().toLocaleString('en-GH')} · Powered by SikaPOS (DanniTech Solution)</p>
          </div>

          <script>
            window.onload = () => {
              setTimeout(() => {
                window.print();
                // window.close(); // Uncomment to close automatically after print
              }, 500);
            };
          </script>
        </body>
        </html>
      `;

      printWindow.document.write(html);
      printWindow.document.close();
    } catch (err: any) {
      alert('Failed to generate report: ' + err.message);
    }
  };

  useEffect(() => { load(); }, [load, dateFilter, customDate, customDateTo]);

  const paymentMethodLabel = (method: string) => {
    const map: Record<string, string> = {
      cash: '💵 Cash', momo: '📱 MoMo', card: '💳 Card', credit: '📋 Credit',
    };
    return map[method] || method;
  };

  const formatCurrency = (val: number) =>
    `${(val || 0).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  if (loading && !summary && !invSummary) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <RefreshCw size={32} className="spin" style={{ opacity: 0.5 }} />
      </div>
    );
  }

  return (
    <div className="reports-container">
      <style>{`
        .reports-container {
          padding-bottom: 40px;
        }
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: clamp(8px, 2vw, 16px);
          margin-bottom: clamp(16px, 4vw, 24px);
        }
        @media (max-width: 600px) {
          .stats-grid {
            grid-template-columns: 1fr;
          }
          .filter-buttons {
            display: grid !important;
            grid-template-columns: repeat(2, 1fr);
            gap: 8px !important;
          }
          .filter-buttons button {
            width: 100% !important;
            padding: 10px 8px !important;
            font-size: 12px !important;
          }
          .tabs-container {
            overflow-x: auto;
            white-space: nowrap;
            -webkit-overflow-scrolling: touch;
            padding-bottom: 4px;
          }
          .tabs-container button {
            padding: 10px 12px !important;
            font-size: 13px !important;
          }
          .glass-panel {
            padding: 16px !important;
          }
          h1 {
            font-size: 24px !important;
          }
        }
      `}</style>
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h1 style={{ fontSize: '28px', marginBottom: '8px' }}>Reports</h1>
            <p style={{ color: 'var(--text-muted)' }}>Sales history & analytics</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              onClick={handlePrintReport}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 16px',
                background: 'var(--primary)',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                color: '#000',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '600',
                transition: 'all 0.2s',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 6 2 18 2 18 9"/>
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
                <rect x="6" y="14" width="12" height="8"/>
              </svg>
              Print Report
            </button>
          </div>
        </div>
        
        {/* Date Filter */}
        <div className="glass-panel" style={{ 
          padding: '16px', 
          marginTop: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          width: '100%'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <Calendar size={16} style={{ color: 'var(--primary)' }} />
            <span style={{ fontSize: '14px', fontWeight: '500', color: 'var(--text-main)' }}>Date Filter</span>
          </div>
          
          <div className="filter-buttons" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
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
      <div className="tabs-container" style={{ 
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
                <div className="stats-grid">
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
                                       tx.status === 'debt' ? 'rgba(249, 115, 22, 0.1)' :
                                       'rgba(245, 158, 11, 0.1)',
                            color: tx.status === 'completed' ? '#10B981' : 
                                   tx.status === 'voided' ? '#EF4444' : 
                                   tx.status === 'debt' ? '#FB923C' :
                                   '#F59E0B',
                          }}>
                            {tx.status === 'debt' ? 'Owes' : tx.status}
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
                <div className="stats-grid">
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
            <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
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

      {/* Transaction Receipt Modal */}
      {selectedTx && (
        <div className="receipt-print-container" style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px',
          backdropFilter: 'blur(4px)',
        }} onClick={() => setSelectedTx(null)}>
          <div className="glass-panel receipt-animation" style={{
            maxWidth: '400px',
            width: '100%',
            maxHeight: '90vh',
            overflowY: 'auto',
            position: 'relative',
            background: '#fff',
            color: '#000',
            padding: '0',
            borderRadius: '0', // Thermal receipt style
            boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
          }} onClick={e => e.stopPropagation()}>
            
            {/* Close Button (Fixed) */}
            <button
              onClick={() => setSelectedTx(null)}
              className="no-print"
              style={{
                position: 'absolute',
                top: '10px',
                right: '10px',
                background: 'rgba(0,0,0,0.05)',
                border: 'none',
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                zIndex: 10,
              }}
            >
              <X size={18} />
            </button>

            <div style={{ padding: '30px 20px' }}>
              {/* Receipt Header */}
              <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                {businessLogo && (
                  <img src={businessLogo} style={{ width: '60px', height: '60px', objectFit: 'contain', marginBottom: '10px' }} />
                )}
                <h2 style={{ fontSize: '18px', fontWeight: '700', margin: '0', textTransform: 'uppercase' }}>{businessName || 'SikaPOS Shop'}</h2>
                <p style={{ fontSize: '12px', margin: '4px 0', color: '#666' }}>OFFICIAL RECEIPT</p>
              </div>

              {/* Transaction Meta */}
              <div style={{ fontSize: '13px', marginBottom: '15px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span>Receipt #:</span>
                  <span style={{ fontWeight: '600' }}>{selectedTx.receipt_number}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span>Date:</span>
                  <span>{new Date(selectedTx.created_at).toLocaleDateString('en-GH')}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span>Time:</span>
                  <span>{new Date(selectedTx.created_at).toLocaleTimeString('en-GH', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span>Cashier:</span>
                  <span>{selectedTx.cashier_name}</span>
                </div>
                {selectedTx.customer_name && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span>Customer:</span>
                    <span>{selectedTx.customer_name}</span>
                  </div>
                )}
              </div>

              {/* Dotted Divider */}
              <div style={{ borderTop: '1px dashed #ccc', margin: '15px 0' }} />

              {/* Items Table */}
              <div style={{ marginBottom: '15px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 40px 80px', fontSize: '12px', fontWeight: '700', marginBottom: '8px', textTransform: 'uppercase' }}>
                  <span>Item</span>
                  <span style={{ textAlign: 'center' }}>Qty</span>
                  <span style={{ textAlign: 'right' }}>Total</span>
                </div>
                
                {/* We need to fetch items if they aren't here. 
                    For now, we'll assume they might be in a 'fullDetails' state we'll add */}
                {selectedTx.items ? selectedTx.items.map((item: any, idx: number) => (
                  <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 40px 80px', fontSize: '13px', marginBottom: '6px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontWeight: '500' }}>{item.product_name}</span>
                      <span style={{ fontSize: '11px', color: '#666' }}>@ GHS {formatCurrency(item.unit_price)}</span>
                    </div>
                    <span style={{ textAlign: 'center' }}>{item.quantity}</span>
                    <span style={{ textAlign: 'right' }}>GHS {formatCurrency(item.line_total)}</span>
                  </div>
                )) : (
                  <div style={{ textAlign: 'center', padding: '10px', fontSize: '12px', color: '#888' }}>
                    Loading items...
                  </div>
                )}
              </div>

              {/* Dotted Divider */}
              <div style={{ borderTop: '1px dashed #ccc', margin: '15px 0' }} />

              {/* Totals */}
              <div style={{ fontSize: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span>Subtotal:</span>
                  <span>GHS {formatCurrency(selectedTx.grand_total - (selectedTx.total_tax || 0))}</span>
                </div>
                {(selectedTx.total_tax || 0) > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span>Tax:</span>
                    <span>GHS {formatCurrency(selectedTx.total_tax || 0)}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px', fontSize: '18px', fontWeight: '800', borderTop: '1px solid #000', paddingTop: '10px' }}>
                  <span>TOTAL:</span>
                  <span>GHS {formatCurrency(selectedTx.grand_total)}</span>
                </div>
              </div>

              {/* Payment Info */}
              <div style={{ marginTop: '20px', fontSize: '12px', textAlign: 'center' }}>
                <p style={{ margin: '4px 0' }}>Payment: <span style={{ fontWeight: '700' }}>{selectedTx.payment_method.toUpperCase()}</span></p>
                <p style={{ margin: '4px 0' }}>Status: <span style={{ fontWeight: '700', color: selectedTx.status === 'completed' ? '#10B981' : '#EF4444' }}>{selectedTx.status.toUpperCase()}</span></p>
              </div>

              {/* Footer */}
              <div style={{ marginTop: '30px', textAlign: 'center', fontSize: '11px', color: '#888', fontStyle: 'italic' }}>
                <p>Thank you for your business!</p>
                <p>Powered by SikaPOS</p>
              </div>

              {/* Actions (No Print) */}
              <div className="no-print" style={{ display: 'flex', gap: '10px', marginTop: '30px' }}>
                <button 
                  onClick={() => window.print()}
                  style={{
                    flex: 1,
                    padding: '12px',
                    background: '#000',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                  }}
                >
                  <Printer size={16} /> Print
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
