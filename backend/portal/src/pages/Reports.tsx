import { useEffect, useState, useCallback, useMemo } from 'react';
import { useAuthStore } from '../store/auth';
import { getApiUrl, API_CONFIG } from '../config/api';
import {
  getReportDateRange,
  validateCustomDateRange,
  type ReportDateFilter,
} from '../utils/reportDateRange';
import {
  RefreshCw,
  Eye,
  X,
  Calendar,
  Printer,
  ChevronDown,
  Receipt,
} from 'lucide-react';
import { buildItemSummaryFromTransactions, buildShiftReportPayload } from '../utils/shiftReport';
import { openEodReportPrint } from '../utils/eodReportPrint';
import { paymentMethodLabel } from '../utils/paymentDisplay';

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
  split_cash?: number;
  split_momo?: number;
  change_given?: number;
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
  const [dateFilter, setDateFilter] = useState<ReportDateFilter>('today');
  const [customDate, setCustomDate] = useState('');
  const [customDateTo, setCustomDateTo] = useState('');
  const [printing, setPrinting] = useState(false);
  const [periodOpen, setPeriodOpen] = useState(false);

  const [selectedAttendance, setSelectedAttendance] = useState<AttendanceLog | null>(null);
  const [attendanceSales, setAttendanceSales] = useState<any[]>([]);
  const [attendanceShiftSummary, setAttendanceShiftSummary] = useState<{
    total_revenue: number;
    transaction_count: number;
    cash_total: number;
    momo_total: number;
    card_total: number;
    credit_total: number;
    debt_recovered?: number;
  } | null>(null);
  const [attendanceItemSummary, setAttendanceItemSummary] = useState<any[]>([]);
  const [loadingAttendanceSales, setLoadingAttendanceSales] = useState(false);
  const [shiftReportPrinting, setShiftReportPrinting] = useState(false);
  const [attendanceSalesError, setAttendanceSalesError] = useState('');

  const handleAttendanceClick = async (log: AttendanceLog) => {
    setSelectedAttendance(log);
    setLoadingAttendanceSales(true);
    setAttendanceSales([]);
    setAttendanceShiftSummary(null);
    setAttendanceItemSummary([]);
    setAttendanceSalesError('');
    try {
      const params = new URLSearchParams({
        includeItems: 'true',
        cashierName: log.user_name,
      });
      const res = await fetch(getApiUrl(`/api/portal/reports/attendance/${log.id}/sales?${params}`), {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAttendanceSalesError((data as { error?: string }).error || `Could not load shift sales (${res.status})`);
        return;
      }
      setAttendanceSales(data.transactions || []);
      setAttendanceShiftSummary({
        total_revenue: data.summary?.total_revenue || 0,
        transaction_count: data.summary?.transaction_count || 0,
        cash_total: data.summary?.cash_total || 0,
        momo_total: data.summary?.momo_total || 0,
        card_total: data.summary?.card_total || 0,
        credit_total: data.summary?.credit_total || 0,
        debt_recovered: data.summary?.debt_recovered || 0,
      });
      setAttendanceItemSummary(data.itemSummary || []);
    } catch (err) {
      console.error('Failed to fetch shift sales:', err);
      setAttendanceSalesError('Network error loading shift sales. Check your connection and try again.');
    } finally {
      setLoadingAttendanceSales(false);
    }
  };

  const displayAttendanceItemSummary = useMemo(() => {
    if (attendanceItemSummary.length > 0) return attendanceItemSummary;
    return buildItemSummaryFromTransactions(attendanceSales);
  }, [attendanceItemSummary, attendanceSales]);

  const handleShiftReportPrint = () => {
    if (!selectedAttendance || !attendanceShiftSummary) return;
    const data = buildShiftReportPayload({
      log: selectedAttendance,
      summary: attendanceShiftSummary,
      transactions: attendanceSales,
      businessName: businessName || 'SikaPOS',
      businessLogo: businessLogo || undefined,
      itemSummary: displayAttendanceItemSummary,
    });

    setShiftReportPrinting(true);
    try {
      const staffLine = `Staff: ${data.cashierName} · Duration: ${data.shiftDuration} · ${data.shiftTimeRange}`;
      const fileDate = data.reportFileDate || selectedAttendance.clock_in.slice(0, 10);
      const safeName = data.cashierName.replace(/[^\w\-]+/g, '-').replace(/-+/g, '-');
      openEodReportPrint({
        businessName: data.businessName,
        businessLogo: data.businessLogo,
        dateLabel: data.date,
        staffLine,
        documentTitle: `EOD Report - ${safeName} - ${fileDate}`,
        summary: data.summary,
        transactions: data.transactions,
        itemSummary: data.itemSummary.map((row) => ({
          product_name: row.product_name,
          total_qty: row.total_qty,
        })),
        formatCurrency: (n) => formatCurrency(Number(n) || 0),
      });
    } finally {
      setTimeout(() => setShiftReportPrinting(false), 600);
    }
  };

  // Fetch full details when a transaction is selected
  useEffect(() => {
    // Only fetch if we have a selection AND either no items list OR an empty list but the count says there should be items
    if (selectedTx && (!selectedTx.items || (selectedTx.items.length === 0 && selectedTx.item_count > 0))) {
      const fetchDetails = async () => {
        try {
          const res = await fetch(getApiUrl(`/api/portal/sales/${selectedTx.id}`), {
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
      const { from: fromStr, to: toStr } = getReportDateRange(dateFilter, customDate, customDateTo);
      
      if (activeTab === 'sales') {
        // Use a SINGLE data source for both summary and transactions
        // This ensures the summary numbers always match the transaction list
        const params = new URLSearchParams();
        params.set('from', fromStr);
        params.set('to', toStr);
        params.set('limit', '200');
        
        const txRes = await fetch(getApiUrl(`${API_CONFIG.ENDPOINTS.SALES}?${params}`), {
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
        const invRes = await fetch(getApiUrl('/api/portal/inventory/overview'), {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (invRes.ok) {
          const invData = await invRes.json();
          setInvSummary(invData.totals);
          setCategorySummary(invData.categories || []);
        }
      } else if (activeTab === 'attendance') {
        const params = new URLSearchParams();
        params.set('from', fromStr);
        params.set('to', toStr);
        const attRes = await fetch(getApiUrl(`/api/portal/reports/attendance?${params}`), {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (attRes.ok) {
          const attData = await attRes.json();
          setAttendanceLogs(attData || []);
        } else {
          setAttendanceLogs([]);
        }
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

  const fetchAllSalesForPrint = async (fromStr: string, toStr: string) => {
    const allTransactions: Transaction[] = [];
    let summary: TodaySummary | null = null;
    let page = 1;
    let totalPages = 1;

    do {
      const params = new URLSearchParams({
        from: fromStr,
        to: toStr,
        includeItems: 'true',
        limit: '100',
        page: String(page),
      });
      const res = await fetch(getApiUrl(`${API_CONFIG.ENDPOINTS.SALES}?${params}`), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error((errBody as { error?: string }).error || 'Failed to fetch sales for print');
      }
      const data = await res.json();
      if (data.summary) {
        summary = {
          total_revenue: data.summary.total_revenue || 0,
          transaction_count: data.summary.transaction_count || 0,
          avg_basket: data.summary.avg_basket || 0,
          cash_total: data.summary.cash_total || 0,
          momo_total: data.summary.momo_total || 0,
          card_total: data.summary.card_total || 0,
          credit_total: data.summary.credit_total || 0,
        };
      }
      allTransactions.push(...(data.transactions || []));
      totalPages = data.pagination?.pages || 1;
      page += 1;
    } while (page <= totalPages);

    return {
      summary: summary || {
        total_revenue: 0,
        transaction_count: 0,
        avg_basket: 0,
        cash_total: 0,
        momo_total: 0,
        card_total: 0,
        credit_total: 0,
      },
      transactions: allTransactions,
    };
  };

  const handlePrintReport = async () => {
    const validationError = validateCustomDateRange(dateFilter, customDate);
    if (validationError) {
      alert(validationError);
      return;
    }

    setPrinting(true);
    try {
      const { from: fromStr, to: toStr, label: dateLabel } = getReportDateRange(
        dateFilter,
        customDate,
        customDateTo
      );

      const [salesData, reportsRes] = await Promise.all([
        fetchAllSalesForPrint(fromStr, toStr),
        fetch(getApiUrl(`/api/portal/reports?from=${encodeURIComponent(fromStr)}&to=${encodeURIComponent(toStr)}`), {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (!reportsRes.ok) {
        const errBody = await reportsRes.json().catch(() => ({}));
        throw new Error((errBody as { error?: string }).error || 'Failed to fetch report summary');
      }

      const reportsData = await reportsRes.json();
      const topProducts = reportsData.topProducts || [];

      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        alert('Pop-up blocked. Allow pop-ups for this site to print the report.');
        return;
      }

      const logo = useAuthStore.getState().businessLogo || '';

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
                  <td>${paymentMethodLabel(tx.payment_method, tx)}</td>
                  <td style="text-align: right; font-weight: 700;">GHS ${formatCurrency(tx.grand_total)}</td>
                </tr>
                ${tx.items && tx.items.length > 0 ? tx.items.map((item: any) => `
                  <tr>
                    <td colspan="4" class="item-row">
                      ${item.product_name} × ${item.quantity}
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
              ${topProducts.length > 0 ? topProducts.map((p: { name: string; quantity: number }) => `
                <tr>
                  <td>${p.name}</td>
                  <td style="text-align: right; font-weight: 700;">× ${p.quantity}</td>
                </tr>
              `).join('') : '<tr><td colspan="2" style="text-align:center;color:#888;">No items sold in this period</td></tr>'}
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
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      alert('Failed to generate report: ' + message);
    } finally {
      setPrinting(false);
    }
  };

  useEffect(() => { load(); }, [load, dateFilter, customDate, customDateTo]);

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
          .glass-panel {
            padding: 16px !important;
          }
          h1 {
            font-size: 24px !important;
          }
        }
      `}</style>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h1 style={{ fontSize: 'clamp(24px, 5vw, 32px)', marginBottom: '4px' }}>Reports</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Sales history & analytics</p>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
              onClick={() => load()}
              disabled={loading}
              className="btn-secondary"
              style={{
                padding: '10px 16px',
                fontSize: '14px',
                minHeight: '48px',
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <RefreshCw size={16} className={loading ? 'spin' : ''} />
              Refresh
            </button>
            <button
              type="button"
              onClick={handlePrintReport}
              disabled={printing || (dateFilter === 'custom' && !customDate)}
              className="btn-primary"
              style={{
                opacity: printing || (dateFilter === 'custom' && !customDate) ? 0.6 : 1,
                padding: '10px 18px',
                fontSize: '14px',
                minHeight: '48px',
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <Printer size={18} />
              {printing ? 'Preparing…' : 'Print Report'}
            </button>
          </div>
        </div>
        
        {/* Date Filter Bar */}
        <div className="glass-panel" style={{ 
          padding: '12px 16px',
          marginTop: '20px',
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid var(--border-light)',
          borderRadius: '16px',
          overflow: 'visible',
          position: 'relative',
          zIndex: 50,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                width: '36px', height: '36px', borderRadius: '10px',
                background: 'rgba(212, 160, 23, 0.1)', display: 'flex',
                alignItems: 'center', justifyContent: 'center'
              }}>
                <Calendar size={18} style={{ color: 'var(--primary)' }} />
              </div>
              <div style={{ position: 'relative' }}>
                <button
                  type="button"
                  onClick={() => setPeriodOpen(!periodOpen)}
                  className="portal-select"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 14px',
                    background: 'rgba(0,0,0,0.2)',
                    minHeight: '44px',
                    borderRadius: '10px',
                  }}
                >
                  <span style={{ fontWeight: 600 }}>{
                    dateFilter === 'today' ? 'Today' :
                    dateFilter === 'yesterday' ? 'Yesterday' :
                    dateFilter === 'lastWeek' ? 'Last Week' :
                    dateFilter === 'thisMonth' ? 'This Month' :
                    dateFilter === 'lastMonth' ? 'Last Month' :
                    dateFilter === 'allTime' ? 'All Time' :
                    'Custom Range'
                  }</span>
                  <ChevronDown size={16} style={{ opacity: 0.7, transform: periodOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                </button>

                {periodOpen && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 'calc(100% + 8px)',
                      left: 0,
                      minWidth: '220px',
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border-strong)',
                      borderRadius: '16px',
                      boxShadow: 'var(--elevation-3)',
                      zIndex: 150,
                      overflow: 'hidden',
                      animation: 'menuDropIn 0.25s var(--motion-decelerate) both',
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
                          padding: '12px 16px',
                          border: 'none',
                          borderBottom: '1px solid var(--border-light)',
                          background: dateFilter === filter.value ? 'var(--primary-glow)' : 'transparent',
                          color: dateFilter === filter.value ? 'var(--primary)' : 'var(--text-main)',
                          fontSize: 14,
                          fontWeight: dateFilter === filter.value ? 700 : 500,
                          cursor: 'pointer',
                          transition: 'background 0.2s',
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
                  className="portal-date-input"
                  onChange={e => setCustomDate(e.target.value)} 
                />
                <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>to</span>
                <input 
                  type="date" 
                  value={customDateTo} 
                  className="portal-date-input"
                  onChange={e => setCustomDateTo(e.target.value)} 
                />
                <button
                  onClick={() => load()}
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
      </div>

      {/* Tabs */}
      <div className="tabs-container report-tabs" style={{ marginBottom: '24px' }}>
        {[
          { id: 'sales', label: 'Sales Performance', shortLabel: 'Sales' },
          { id: 'inventory', label: 'Inventory Overview', shortLabel: 'Inventory' },
          { id: 'attendance', label: 'Attendance Logs', shortLabel: 'Attendance' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`report-tab-btn ${activeTab === tab.id ? 'active' : ''}`}
          >
            <span className="tab-label-desktop">{tab.label}</span>
            <span className="tab-label-mobile">{tab.shortLabel}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ minHeight: '400px' }}>
        {activeTab === 'sales' && (
          <div className="animate-fade-in">
            {summary && (
              <div style={{ marginBottom: 'clamp(20px, 5vw, 32px)' }}>
                <div className="stat-grid">
                  <div className="glass-panel" style={{ padding: '20px', borderLeft: '4px solid var(--primary)' }}>
                    <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>Total Revenue</p>
                    <p style={{ fontSize: 'clamp(20px, 4vw, 28px)', fontWeight: '700', color: 'var(--text-main)', wordBreak: 'break-word', letterSpacing: '-0.02em' }}>
                      GHS {formatCurrency(summary.total_revenue)}
                    </p>
                  </div>
                  <div className="glass-panel" style={{ padding: '20px' }}>
                    <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>Transactions</p>
                    <p style={{ fontSize: 'clamp(20px, 4vw, 28px)', fontWeight: '700', color: 'var(--text-main)' }}>
                      {summary.transaction_count}
                    </p>
                  </div>
                  <div className="glass-panel" style={{ padding: '20px' }}>
                    <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>Cash Total</p>
                    <p style={{ fontSize: 'clamp(18px, 4vw, 24px)', fontWeight: '700', color: 'var(--success)' }}>
                      GHS {formatCurrency(summary.cash_total)}
                    </p>
                  </div>
                  <div className="glass-panel" style={{ padding: '20px' }}>
                    <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>MoMo Total</p>
                    <p style={{ fontSize: 'clamp(18px, 4vw, 24px)', fontWeight: '700', color: '#8B5CF6' }}>
                      GHS {formatCurrency(summary.momo_total)}
                    </p>
                  </div>
                  <div className="glass-panel" style={{ padding: '20px' }}>
                    <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>Card Total</p>
                    <p style={{ fontSize: 'clamp(18px, 4vw, 24px)', fontWeight: '700', color: '#3B82F6' }}>
                      GHS {formatCurrency(summary.card_total)}
                    </p>
                  </div>
                  <div className="glass-panel" style={{ padding: '20px', borderLeft: summary.credit_total > 0 ? '4px solid var(--danger)' : undefined }}>
                    <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>Outstanding Debt</p>
                    <p style={{ fontSize: 'clamp(18px, 4vw, 24px)', fontWeight: '700', color: summary.credit_total > 0 ? 'var(--danger)' : 'var(--text-main)' }}>
                      GHS {formatCurrency(summary.credit_total)}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="glass-panel" style={{ padding: 'clamp(16px, 4vw, 24px)' }}>
              <h2 style={{ fontSize: 'clamp(16px, 4vw, 18px)', marginBottom: 'clamp(16px, 4vw, 20px)', color: 'var(--text-main)' }}>Transaction History</h2>
              <div className="hide-mobile table-scroll">
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
                        <td style={{ padding: 'clamp(8px, 2vw, 12px)', fontSize: 'clamp(11px, 2.5vw, 13px)' }}>{paymentMethodLabel(tx.payment_method, tx)}</td>
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
                                       tx.status === 'voided' || tx.status === 'reversed' ? 'rgba(239, 68, 68, 0.1)' : 
                                       tx.status === 'debt' ? 'rgba(249, 115, 22, 0.1)' :
                                       'rgba(245, 158, 11, 0.1)',
                            color: tx.status === 'completed' ? '#10B981' : 
                                   tx.status === 'voided' || tx.status === 'reversed' ? '#EF4444' : 
                                   tx.status === 'debt' ? '#FB923C' :
                                   '#F59E0B',
                          }}>
                            {tx.status === 'debt' ? 'Owes' : tx.status === 'reversed' ? 'Reversed' : tx.status}
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

              {/* Mobile Card List */}
              <div className="hide-desktop portal-card-list" style={{ padding: 0 }}>
                {loading ? (
                  <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <RefreshCw size={24} className="spin" style={{ opacity: 0.5 }} />
                  </div>
                ) : transactions.length === 0 ? (
                  <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No transactions found for this period
                  </div>
                ) : (
                  transactions.map(tx => {
                    const statusClass = tx.status === 'completed' ? 'completed' : tx.status === 'voided' || tx.status === 'reversed' ? 'failed' : 'warning';
                    return (
                      <div 
                        key={tx.id} 
                        className="data-card animate-fade-in"
                        onClick={() => setSelectedTx(tx)}
                        style={{ cursor: 'pointer', marginBottom: '6px' }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ padding: '6px', background: 'rgba(255,255,255,0.04)', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
                              <Receipt size={14} style={{ color: 'var(--primary)' }} />
                            </div>
                            <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--text-main)', fontSize: '14px' }}>{tx.receipt_number}</span>
                          </div>
                          <span className={`status-pill status-${statusClass}`}>
                            {tx.status}
                          </span>
                        </div>

                        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                          <span>Cashier: <strong style={{ color: 'var(--text-main)', fontWeight: 600 }}>{tx.cashier_name}</strong></span>
                          <span style={{ color: 'var(--border-strong)' }}>|</span>
                          <span>Payment: <strong style={{ color: 'var(--text-main)', fontWeight: 600 }}>{paymentMethodLabel(tx.payment_method, tx)}</strong></span>
                        </div>

                        <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>
                              {new Date(tx.created_at).toLocaleDateString('en-GH')} · {new Date(tx.created_at).toLocaleTimeString('en-GH', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginTop: '2px', fontWeight: 500 }}>{tx.item_count} items</span>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <span style={{ fontWeight: 800, color: 'var(--primary)', fontSize: '18px', letterSpacing: '-0.02em' }}>
                              GHS {formatCurrency(tx.grand_total)}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'inventory' && (
          <div className="glass-panel" style={{ padding: '24px' }}>
            {invSummary && (
              <div style={{ marginBottom: '32px' }}>
                <div className="stat-grid">
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
            <div className="table-scroll">
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
            <div className="hide-mobile table-scroll">
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
                      <tr 
                        key={log.id} 
                        style={{ 
                          borderBottom: '1px solid var(--border-light)',
                          cursor: 'pointer',
                          transition: 'background 0.2s'
                        }}
                        onClick={() => handleAttendanceClick(log)}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(212, 160, 23, 0.05)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                      >
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

            {/* Mobile Card List */}
            <div className="hide-desktop portal-card-list" style={{ padding: 0 }}>
              {loading ? (
                <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  Loading logs...
                </div>
              ) : attendanceLogs.length === 0 ? (
                <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  No attendance logs found for this period
                </div>
              ) : (
                attendanceLogs.map(log => {
                  const duration = log.clock_out 
                    ? Math.round((new Date(log.clock_out).getTime() - new Date(log.clock_in).getTime()) / (1000 * 60))
                    : null;
                  const hours = duration ? Math.floor(duration / 60) : 0;
                  const mins = duration ? duration % 60 : 0;

                  return (
                    <div 
                      key={log.id} 
                      className="data-card"
                      onClick={() => handleAttendanceClick(log)}
                      style={{ cursor: 'pointer' }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: '15px' }}>{log.user_name}</span>
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                          {new Date(log.clock_in).toLocaleDateString('en-GH')}
                        </span>
                      </div>

                      <div className="data-card-row">
                        <span className="data-card-label">Clock In</span>
                        <span style={{ fontFamily: 'monospace', fontSize: '13px', color: 'var(--text-main)' }}>
                          {new Date(log.clock_in).toLocaleTimeString('en-GH')}
                        </span>
                      </div>

                      <div className="data-card-row">
                        <span className="data-card-label">Clock Out</span>
                        <span>
                          {log.clock_out ? (
                            <span style={{ fontFamily: 'monospace', fontSize: '13px', color: 'var(--text-main)' }}>
                              {new Date(log.clock_out).toLocaleTimeString('en-GH')}
                            </span>
                          ) : (
                            <span style={{
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontSize: '10px',
                              fontWeight: '600',
                              background: 'rgba(16, 185, 129, 0.1)',
                              color: '#10B981',
                            }}>
                              Still In
                            </span>
                          )}
                        </span>
                      </div>

                      <div className="data-card-row" style={{ marginTop: '10px', paddingTop: '6px', borderTop: '1px solid var(--border-light)' }}>
                        <span className="data-card-label">Duration</span>
                        <span style={{ fontFamily: 'monospace', fontWeight: '600', color: 'var(--primary)' }}>
                          {duration !== null ? `${hours}h ${mins}m` : '---'}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* Selected Attendance Shift Sales Modal */}
      {selectedAttendance && (
        <div
          className="modal-overlay"
          style={{ backdropFilter: 'blur(6px)' }}
          onClick={() => setSelectedAttendance(null)}
        >
          <div
            className="glass-panel modal-panel"
            style={{
              maxWidth: 650,
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              maxHeight: '90vh',
              overflow: 'hidden',
              padding: '0',
            }}
            onClick={e => e.stopPropagation()}
          >
            
            {/* Close Button */}
            <button
              onClick={() => setSelectedAttendance(null)}
              style={{
                position: 'absolute',
                top: '16px',
                right: '16px',
                background: 'rgba(255,255,255,0.05)',
                border: 'none',
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: 'var(--text-main)',
                transition: 'all 0.2s',
                zIndex: 10,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
            >
              <X size={18} />
            </button>

            {/* Scrollable Modal Body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>

            {/* Header */}
            <div style={{ marginBottom: '24px' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', paddingRight: '40px' }}>
                <div>
                  <span style={{
                    fontSize: '11px',
                    fontWeight: '600',
                    textTransform: 'uppercase',
                    color: 'var(--primary)',
                    letterSpacing: '1px',
                  }}>
                    Shift Report & Sales
                  </span>
                  <h2 style={{ fontSize: '22px', fontWeight: '700', margin: '4px 0 0', color: 'var(--text-main)' }}>
                    {selectedAttendance.user_name}
                  </h2>
                </div>
                {!loadingAttendanceSales && !attendanceSalesError && (
                  <button
                    type="button"
                    onClick={handleShiftReportPrint}
                    disabled={shiftReportPrinting}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '8px 14px',
                      background: 'var(--primary)',
                      color: '#000',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: '600',
                      cursor: shiftReportPrinting ? 'wait' : 'pointer',
                      opacity: shiftReportPrinting ? 0.7 : 1,
                    }}
                    title="End-of-day style report — print or Save as PDF from the dialog"
                  >
                    <Printer size={14} />
                    {shiftReportPrinting ? 'Opening…' : 'Print Report'}
                  </button>
                )}
              </div>
              
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                gap: '12px',
                background: 'rgba(0,0,0,0.2)',
                padding: '12px',
                borderRadius: 'var(--radius-sm, 6px)',
                fontSize: '13px',
                color: 'var(--text-muted)',
              }}>
                <div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', opacity: 0.6 }}>Clocked In</div>
                  <div style={{ fontWeight: '500', color: 'var(--text-main)', marginTop: '2px' }}>
                    {new Date(selectedAttendance.clock_in).toLocaleString('en-GH')}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', opacity: 0.6 }}>Clocked Out</div>
                  <div style={{ fontWeight: '500', color: 'var(--text-main)', marginTop: '2px' }}>
                    {selectedAttendance.clock_out 
                      ? new Date(selectedAttendance.clock_out).toLocaleString('en-GH') 
                      : 'Still Clocked In'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', opacity: 0.6 }}>Shift Duration</div>
                  <div style={{ fontWeight: '500', color: 'var(--text-main)', marginTop: '2px' }}>
                    {(() => {
                      const duration = selectedAttendance.clock_out 
                        ? Math.round((new Date(selectedAttendance.clock_out).getTime() - new Date(selectedAttendance.clock_in).getTime()) / (1000 * 60))
                        : Math.round((new Date().getTime() - new Date(selectedAttendance.clock_in).getTime()) / (1000 * 60));
                      const hours = Math.floor(duration / 60);
                      const mins = duration % 60;
                      return `${hours}h ${mins}m`;
                    })()}
                  </div>
                </div>
              </div>
            </div>

            {attendanceSalesError && (
              <div style={{
                marginBottom: '16px',
                padding: '12px 14px',
                borderRadius: '6px',
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.35)',
                color: '#FCA5A5',
                fontSize: '13px',
              }}>
                {attendanceSalesError}
              </div>
            )}

            {/* Shift Summary Cards */}
            {!loadingAttendanceSales && !attendanceSalesError && attendanceShiftSummary && (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                gap: '12px',
                marginBottom: '24px',
              }}>
                <div className="glass-panel" style={{ padding: '16px', background: 'rgba(212, 160, 23, 0.05)', border: '1px solid rgba(212, 160, 23, 0.15)' }}>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Shift Revenue</div>
                  <div style={{ fontSize: '20px', fontWeight: '700', color: 'var(--primary)', marginTop: '4px' }}>
                    GHS {formatCurrency(attendanceShiftSummary.total_revenue)}
                  </div>
                </div>
                <div className="glass-panel" style={{ padding: '16px', background: 'rgba(255,255,255,0.02)' }}>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Transactions</div>
                  <div style={{ fontSize: '20px', fontWeight: '700', color: 'var(--text-main)', marginTop: '4px' }}>
                    {attendanceShiftSummary.transaction_count}
                  </div>
                </div>
                <div className="glass-panel" style={{ padding: '16px', background: 'rgba(255,255,255,0.02)' }}>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Cash</div>
                  <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-main)', marginTop: '4px' }}>
                    GHS {formatCurrency(attendanceShiftSummary.cash_total)}
                  </div>
                </div>
                <div className="glass-panel" style={{ padding: '16px', background: 'rgba(255,255,255,0.02)' }}>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>MoMo</div>
                  <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-main)', marginTop: '4px' }}>
                    GHS {formatCurrency(attendanceShiftSummary.momo_total)}
                  </div>
                </div>
              </div>
            )}

            {/* Sales Table */}
            <div>
              <h3 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '12px', color: 'var(--text-main)' }}>
                Processed Transactions
              </h3>
              
              {loadingAttendanceSales ? (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '150px' }}>
                  <RefreshCw size={24} className="spin" style={{ opacity: 0.5 }} />
                </div>
              ) : attendanceSalesError ? null : attendanceSales.length === 0 ? (
                <div style={{
                  padding: '30px',
                  textAlign: 'center',
                  color: 'var(--text-muted)',
                  background: 'rgba(0,0,0,0.1)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '13px',
                }}>
                  No transactions registered for this cashier during this shift.
                </div>
              ) : (
                <>
                  <div className="hide-mobile table-scroll">
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border-light)', color: 'var(--text-muted)' }}>
                          <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: '500' }}>Receipt No</th>
                          <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: '500' }}>Time</th>
                          <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: '500' }}>Method</th>
                          <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: '500' }}>Total</th>
                          <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: '500' }}>Status</th>
                          <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: '500' }}>View</th>
                        </tr>
                      </thead>
                      <tbody>
                        {attendanceSales.map(tx => (
                          <tr key={tx.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                            <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontWeight: '500' }}>
                              {tx.receipt_number}
                            </td>
                            <td style={{ padding: '10px 12px', color: 'var(--text-muted)' }}>
                              {new Date(tx.created_at).toLocaleTimeString('en-GH', { hour: '2-digit', minute: '2-digit' })}
                            </td>
                            <td style={{ padding: '10px 12px', textTransform: 'capitalize' }}>
                              {paymentMethodLabel(tx.payment_method, tx)}
                            </td>
                            <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '600', color: 'var(--text-main)' }}>
                              GHS {formatCurrency(parseFloat(tx.grand_total))}
                            </td>
                            <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                              <span style={{
                                padding: '2px 6px',
                                borderRadius: '4px',
                                fontSize: '10px',
                                fontWeight: '600',
                                background: tx.status === 'completed' ? 'rgba(16, 185, 129, 0.1)' : 
                                           tx.status === 'voided' || tx.status === 'reversed' ? 'rgba(239, 68, 68, 0.1)' : 
                                           tx.status === 'debt' ? 'rgba(249, 115, 22, 0.1)' :
                                           'rgba(245, 158, 11, 0.1)',
                                color: tx.status === 'completed' ? '#10B981' : 
                                       tx.status === 'voided' || tx.status === 'reversed' ? '#EF4444' : 
                                       tx.status === 'debt' ? '#FB923C' :
                                       '#F59E0B',
                              }}>
                                {tx.status}
                              </span>
                            </td>
                            <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                              <button
                                onClick={() => {
                                  setSelectedAttendance(null);
                                  setSelectedTx(tx);
                                }}
                                style={{
                                  padding: '4px 6px',
                                  background: 'rgba(212, 160, 23, 0.1)',
                                  border: '1px solid var(--primary)',
                                  borderRadius: '4px',
                                  color: 'var(--primary)',
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
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

                  {/* Mobile Card List */}
                  <div className="hide-desktop portal-card-list" style={{ padding: 0 }}>
                    {attendanceSales.map(tx => (
                      <div 
                        key={tx.id} 
                        className="data-card"
                        style={{ background: 'rgba(255,255,255,0.01)', marginBottom: '8px' }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                          <span style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--text-main)' }}>{tx.receipt_number}</span>
                          <span style={{
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontSize: '10px',
                            fontWeight: '600',
                            background: tx.status === 'completed' ? 'rgba(16, 185, 129, 0.1)' : 
                                       tx.status === 'voided' || tx.status === 'reversed' ? 'rgba(239, 68, 68, 0.1)' : 
                                       tx.status === 'debt' ? 'rgba(249, 115, 22, 0.1)' :
                                       'rgba(245, 158, 11, 0.1)',
                            color: tx.status === 'completed' ? '#10B981' : 
                                   tx.status === 'voided' || tx.status === 'reversed' ? '#EF4444' : 
                                   tx.status === 'debt' ? '#FB923C' :
                                   '#F59E0B',
                          }}>
                            {tx.status}
                          </span>
                        </div>

                        <div className="data-card-row">
                          <span className="data-card-label">Time</span>
                          <span style={{ color: 'var(--text-main)', fontSize: '13px' }}>
                            {new Date(tx.created_at).toLocaleTimeString('en-GH', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>

                        <div className="data-card-row">
                          <span className="data-card-label">Method</span>
                          <span style={{ textTransform: 'capitalize', color: 'var(--text-main)', fontSize: '13px' }}>
                            {paymentMethodLabel(tx.payment_method, tx)}
                          </span>
                        </div>

                        <div className="data-card-row" style={{ marginTop: '10px', paddingTop: '6px', borderTop: '1px solid var(--border-light)' }}>
                          <span className="data-card-label">Total</span>
                          <span style={{ fontWeight: '700', color: 'var(--text-main)', fontSize: '14px' }}>
                            GHS {formatCurrency(parseFloat(tx.grand_total))}
                          </span>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
                          <button
                            onClick={() => {
                              setSelectedAttendance(null);
                              setSelectedTx(tx);
                            }}
                            style={{
                              padding: '6px 12px',
                              background: 'rgba(212, 160, 23, 0.1)',
                              border: '1px solid var(--primary)',
                              borderRadius: '6px',
                              color: 'var(--primary)',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '6px',
                              fontSize: '12px',
                              fontWeight: '500',
                            }}
                          >
                            <Eye size={12} /> View Receipt
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {!loadingAttendanceSales && !attendanceSalesError && (
              <div style={{ marginTop: '24px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '12px', color: 'var(--text-main)' }}>
                  Items Sold Summary
                </h3>
                {displayAttendanceItemSummary.length === 0 ? (
                  <div style={{
                    padding: '24px',
                    textAlign: 'center',
                    color: 'var(--text-muted)',
                    background: 'rgba(0,0,0,0.1)',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '13px',
                  }}>
                    No items sold during this shift.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {displayAttendanceItemSummary.map((item, idx) => (
                      <div
                        key={`${item.product_name}-${item.product_size || ''}-${idx}`}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '10px 14px',
                          background: 'rgba(255,255,255,0.03)',
                          border: '1px solid var(--border-light)',
                          borderRadius: 'var(--radius-sm, 6px)',
                          fontSize: '13px',
                        }}
                      >
                        <span style={{ color: 'var(--text-main)' }}>
                          {item.product_name}
                          {item.product_size ? (
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '4px' }}>
                              ({item.product_size})
                            </span>
                          ) : null}
                        </span>
                        <span style={{ fontWeight: '700', fontFamily: 'monospace', color: 'var(--primary)' }}>
                          × {Number.isInteger(Number(item.total_qty)) ? item.total_qty : Number(item.total_qty).toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            
            </div>
          </div>
        </div>
      )}

      {/* Transaction Receipt Modal */}
      {selectedTx && (
        <div className="modal-overlay receipt-print-container" style={{
          background: 'rgba(0, 0, 0, 0.85)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
        }} onClick={() => setSelectedTx(null)}>
          <div className="glass-panel modal-panel receipt-animation" style={{
            maxWidth: '420px',
            width: '100%',
            background: '#fff',
            color: '#000',
            padding: '0',
            borderRadius: '24px',
            boxShadow: '0 30px 60px rgba(0,0,0,0.5)',
            border: 'none',
          }} onClick={e => e.stopPropagation()}>
            
            <div style={{ padding: '40px 24px' }}>
              {/* Receipt Header */}
              <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                <div style={{
                  width: '64px', height: '64px', background: '#f8f9fa',
                  borderRadius: '16px', margin: '0 auto 16px', display: 'flex',
                  alignItems: 'center', justifyContent: 'center'
                }}>
                  {businessLogo ? (
                    <img src={businessLogo} style={{ width: '48px', height: '48px', objectFit: 'contain' }} alt="Logo" />
                  ) : (
                    <span style={{ fontSize: '24px', fontWeight: 800 }}>₵</span>
                  )}
                </div>
                <h2 style={{ fontSize: '20px', fontWeight: '800', margin: '0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{businessName || 'SikaPOS Shop'}</h2>
                <div style={{ display: 'inline-block', padding: '4px 12px', background: '#000', color: '#fff', borderRadius: '4px', fontSize: '10px', fontWeight: 700, marginTop: '8px', textTransform: 'uppercase', letterSpacing: '1px' }}>Official Receipt</div>
              </div>

              {/* Transaction Meta */}
              <div style={{ fontSize: '13px', marginBottom: '20px', color: '#444' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ fontWeight: 500 }}>Receipt No.</span>
                  <span style={{ fontWeight: '700', fontFamily: 'monospace' }}>{selectedTx.receipt_number}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ fontWeight: 500 }}>Date & Time</span>
                  <span>{new Date(selectedTx.created_at).toLocaleDateString('en-GH')} · {new Date(selectedTx.created_at).toLocaleTimeString('en-GH', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ fontWeight: 500 }}>Cashier</span>
                  <span>{selectedTx.cashier_name}</span>
                </div>
                {selectedTx.customer_name && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontWeight: 500 }}>Customer</span>
                    <span style={{ fontWeight: 600 }}>{selectedTx.customer_name}</span>
                  </div>
                )}
              </div>

              {/* Dotted Divider */}
              <div style={{ borderTop: '2px dotted #eee', margin: '20px 0' }} />

              {/* Items Table */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 40px 100px', fontSize: '11px', fontWeight: '800', marginBottom: '12px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  <span>Description</span>
                  <span style={{ textAlign: 'center' }}>Qty</span>
                  <span style={{ textAlign: 'right' }}>Total</span>
                </div>
                
                {selectedTx.items ? selectedTx.items.map((item: any, idx: number) => (
                  <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 40px 100px', fontSize: '14px', marginBottom: '10px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontWeight: '600' }}>{item.product_name}</span>
                      <span style={{ fontSize: '11px', color: '#888' }}>@ GHS {formatCurrency(item.unit_price)}</span>
                    </div>
                    <span style={{ textAlign: 'center', fontWeight: 500 }}>{item.quantity}</span>
                    <span style={{ textAlign: 'right', fontWeight: 600 }}>GHS {formatCurrency(item.line_total)}</span>
                  </div>
                )) : (
                  <div style={{ textAlign: 'center', padding: '20px', fontSize: '12px', color: '#888' }}>
                    Loading item details...
                  </div>
                )}
              </div>

              {/* Dotted Divider */}
              <div style={{ borderTop: '2px dotted #eee', margin: '20px 0' }} />

              {/* Totals */}
              <div style={{ fontSize: '15px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ color: '#666' }}>Subtotal</span>
                  <span>GHS {formatCurrency(selectedTx.grand_total - (selectedTx.total_tax || 0))}</span>
                </div>
                {(selectedTx.total_tax || 0) > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ color: '#666' }}>Tax</span>
                    <span>GHS {formatCurrency(selectedTx.total_tax || 0)}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '16px', fontSize: '24px', fontWeight: '900', borderTop: '2px solid #000', paddingTop: '16px', letterSpacing: '-0.02em' }}>
                  <span>TOTAL</span>
                  <span>GHS {formatCurrency(selectedTx.grand_total)}</span>
                </div>
              </div>

              {/* Payment Info */}
              <div style={{ marginTop: '24px', padding: '16px', background: '#f8f9fa', borderRadius: '12px', fontSize: '13px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ color: '#666' }}>Payment Mode</span>
                  <span style={{ fontWeight: '700', textTransform: 'capitalize' }}>{paymentMethodLabel(selectedTx.payment_method, selectedTx)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#666' }}>Payment Status</span>
                  <span style={{ fontWeight: '800', color: selectedTx.status === 'completed' ? '#10B981' : '#EF4444' }}>{selectedTx.status.toUpperCase()}</span>
                </div>
              </div>

              {/* Footer */}
              <div style={{ marginTop: '40px', textAlign: 'center' }}>
                <p style={{ fontSize: '14px', fontWeight: 600, margin: '0 0 4px' }}>Thank you for shopping!</p>
                <p style={{ fontSize: '12px', color: '#888', margin: 0 }}>Powered by SikaPOS (DanniTech Solutions)</p>
              </div>

              {/* Actions (No Print) */}
              <div className="no-print" style={{ display: 'flex', gap: '12px', marginTop: '40px' }}>
                <button 
                  onClick={() => setSelectedTx(null)}
                  style={{
                    flex: 1,
                    padding: '14px',
                    background: '#f1f3f5',
                    color: '#000',
                    border: 'none',
                    borderRadius: '12px',
                    fontWeight: '700',
                    cursor: 'pointer',
                  }}
                >
                  Close
                </button>
                <button
                  onClick={() => window.print()}
                  style={{
                    flex: 1.5,
                    padding: '14px',
                    background: '#000',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '12px',
                    fontWeight: '700',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    boxShadow: '0 10px 20px rgba(0,0,0,0.2)',
                  }}
                >
                  <Printer size={18} /> Print Receipt
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
