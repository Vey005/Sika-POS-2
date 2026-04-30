import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '../../store/auth';
import ReportPreviewModal from '../../components/reports/ReportPreviewModal';
import TransactionDetailModal from '../../components/reports/TransactionDetailModal';
import ShiftSummaryModal from '../../components/reports/ShiftSummaryModal';
import { formatCurrency, formatNumber } from '../../utils/format';
import styles from './Reports.module.css';

export default function ReportsScreen() {
  const [activeTab, setActiveTab] = useState<'sales' | 'inventory' | 'attendance'>('sales');
  const [summary, setSummary] = useState<TodaySummary | null>(null);
  const [invSummary, setInvSummary] = useState<{ total_items: number; total_stock: number; total_value_selling: number; total_value_cost: number } | null>(null);
  const [categorySummary, setCategorySummary] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [attendanceLogs, setAttendanceLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState({ from: '', to: '' });
  const [voidingId, setVoidingId] = useState<number | null>(null);
  const [selectedTxId, setSelectedTxId] = useState<number | null>(null);
  const [isPrinting, setIsPrinting] = useState(false);
  const [previewReports, setPreviewReports] = useState<any[] | null>(null);
  const [selectedShiftLog, setSelectedShiftLog] = useState<any | null>(null);
  const { user, businessName } = useAuthStore();

  const today = new Date().toISOString().slice(0, 10);

  const load = useCallback(async () => {
    if (!window.sikapos) return;
    setLoading(true);
    try {
      const currentFilters = dateRange.from || dateRange.to ? dateRange : undefined;
      
      if (activeTab === 'sales') {
        const [sum, txs] = await Promise.all([
          window.sikapos.sales.getSummary(currentFilters),
          window.sikapos.sales.getAll(currentFilters),
        ]);
        setSummary(sum);
        setTransactions(txs);
      } else if (activeTab === 'inventory') {
        const [inv, cats] = await Promise.all([
          window.sikapos.inventory.getSummary(),
          window.sikapos.inventory.getCategorySummary(),
        ]);
        setInvSummary(inv);
        setCategorySummary(cats);
      } else if (activeTab === 'attendance') {
        const logs = await window.sikapos.attendance.getHistory(undefined, currentFilters);
        setAttendanceLogs(logs);
      }
    } finally {
      setLoading(false);
    }
  }, [dateRange, activeTab]);

  useEffect(() => { load(); }, [load]);

  const handleVoid = async (id: number) => {
    const reason = prompt('Reason for voiding this transaction?');
    if (!reason) return;
    setVoidingId(id);
    try {
      const result = await window.sikapos.sales.void(id, reason);
      if (result.success) {
        await load();
      } else {
        alert(`Error: ${result.message}`);
      }
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setVoidingId(null);
    }
  };

  const handleReverse = (id: number) => {
    if (!window.sikapos) return;
    
    const ok = confirm('Are you sure you want to reverse this sale? All items will be returned to stock.');
    if (!ok) return;

    const reason = 'Administrative Reversal';
    setVoidingId(id);
    window.sikapos.sales.reverse(id, reason)
      .then((result: any) => {
        if (result && result.success) {
          load();
        } else {
          alert('Error: ' + (result?.message || 'Unknown error'));
        }
      })
      .catch((err: any) => {
        alert('Error: ' + err.message);
      })
      .finally(() => {
        setVoidingId(null);
      });
  };

  const handlePrintEOD = async () => {
    if (!window.sikapos) return;
    
    const from = dateRange.from || today;
    const to = dateRange.to || today;
    
    const dates: string[] = [];
    let current = new Date(from);
    const endDate = new Date(to);
    
    while (current <= endDate) {
      dates.push(current.toISOString().slice(0, 10));
      current.setDate(current.getDate() + 1);
    }

    if (dates.length === 0) return;

    setLoading(true);
    try {
      const reportsToPreview: any[] = [];
      for (const date of dates) {
        const data = await window.sikapos.sales.getDailyReportData(date);
        if (data.summary.transaction_count > 0) {
          reportsToPreview.push({
            businessName,
            businessLogo: useAuthStore.getState().businessLogo,
            date,
            summary: data.summary,
            transactions: data.transactions,
            itemSummary: data.itemSummary
          });
        }
      }
      
      if (reportsToPreview.length === 0) {
        alert('No transactions found for the selected period.');
        return;
      }
      
      setPreviewReports(reportsToPreview);
    } catch (err: any) {
      alert('Failed to load report data: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmPrint = async () => {
    if (!window.sikapos || !previewReports) return;

    setIsPrinting(true);
    try {
      for (const report of previewReports) {
        await window.sikapos.printer.printReport(report);
      }
      setPreviewReports(null);
      alert('Reports sent to printer.');
    } catch (err: any) {
      alert('Failed to print: ' + err.message);
    } finally {
      setIsPrinting(false);
    }
  };

  const handleSendReport = async () => {
    if (!window.sikapos || !summary) return;
    
    setLoading(true);
    try {
      const biz = await window.sikapos.settings.getBusiness();
      const phone = biz.owner_whatsapp;
      
      if (!phone) {
        alert('Please set the Daily Report Phone Number in Settings → Business first.');
        return;
      }

      const dateStr = dateRange.from || today;
      const smsMessage = [
        `SikaPOS Daily Report`,
        `${businessName}`,
        `Date: ${dateStr}`,
        ``,
        `Revenue: GHS ${formatCurrency(summary.total_revenue)}`,
        `Transactions: ${summary.transaction_count}`,
        `Avg Basket: GHS ${formatCurrency(summary.avg_basket)}`,
        ``,
        `Payment Breakdown:`,
        `Cash: GHS ${formatCurrency(summary.cash_total)}`,
        `MoMo: GHS ${formatCurrency(summary.momo_total)}`,
        `Card: GHS ${formatCurrency(summary.card_total)}`,
        `Credit: GHS ${formatCurrency(summary.credit_total)}`,
        ``,
        `Generated via SikaPOS.`
      ].join('\n');

      // Send via official SMS gateway
      const res = await window.sikapos.notifications.sendOfficial(phone, smsMessage);
      
      if (res.success) {
        alert(`✅ Daily report sent successfully to ${phone}!`);
      } else {
        // SMS failed — show error, offer WhatsApp fallback
        const useWhatsApp = confirm(
          `SMS delivery failed: ${res.message || 'Unknown error'}\n\nWould you like to send via WhatsApp instead?`
        );
        if (useWhatsApp) {
          const waMessage = `📊 *SikaPOS Daily Report*\n🏢 *${businessName}*\n📅 Date: ${dateStr}\n\n💰 *Revenue:* GHS ${formatCurrency(summary.total_revenue)}\n🛒 *Transactions:* ${summary.transaction_count}\n🧺 *Avg Basket:* GHS ${formatCurrency(summary.avg_basket)}\n\n💳 *Payment Breakdown:*\n- Cash: GHS ${formatCurrency(summary.cash_total)}\n- MoMo: GHS ${formatCurrency(summary.momo_total)}\n- Card: GHS ${formatCurrency(summary.card_total)}\n- Credit: GHS ${formatCurrency(summary.credit_total)}\n\n✅ *Total Sales Summary generated via SikaPOS.*`;
          const whatsappUrl = `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(waMessage)}`;
          window.open(whatsappUrl, '_blank');
        }
      }
    } catch (err: any) {
      alert('Failed to send report: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const paymentMethodLabel = (method: string) => {
    const map: Record<string, string> = {
      cash: '💵 Cash', momo: '📱 MoMo', card: '💳 Card', credit: '📋 Credit',
    };
    return map[method] || method;
  };

  return (
    <div className={styles.screen}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Reports</h1>
          <p className={styles.subtitle}>Sales history & analytics</p>
        </div>
        <div className={styles.dateRange}>
          <input type="date" value={dateRange.from || today} className={styles.dateInput} onChange={e => setDateRange(r => ({ ...r, from: e.target.value }))} />
          <span style={{ color: 'var(--color-text-muted)' }}>to</span>
          <input type="date" value={dateRange.to || today} className={styles.dateInput} onChange={e => setDateRange(r => ({ ...r, to: e.target.value }))} />
        </div>
        {activeTab === 'sales' && (
          <div style={{ display: 'flex', gap: '10px' }}>
            <button 
              className={styles.shareWhatsAppBtn} 
              onClick={handleSendReport}
              disabled={loading || !summary}
              title="Send professional sales summary to owner"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
              </svg>
              Send Official Report
            </button>
            <button 
              className={styles.printReportBtn} 
              onClick={handlePrintEOD}
              disabled={isPrinting}
            >
              {isPrinting ? 'Printing...' : 'Print EOD Report'}
            </button>
          </div>
        )}
      </div>

      <div className={styles.tabs}>
        <button className={`${styles.tab} ${activeTab === 'sales' ? styles.active : ''}`} onClick={() => setActiveTab('sales')}>Sales Performance</button>
        <button className={`${styles.tab} ${activeTab === 'inventory' ? styles.active : ''}`} onClick={() => setActiveTab('inventory')}>Inventory Overview</button>
        <button className={`${styles.tab} ${activeTab === 'attendance' ? styles.active : ''}`} onClick={() => setActiveTab('attendance')}>Attendance Logs</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {activeTab === 'sales' && (
          <>
            {summary && (
              <div className={styles.summarySection}>
                <div className={styles.summaryCards}>
                  <div className={styles.card}>
                    <p className={styles.cardLabel}>Revenue</p>
                    <p className={styles.cardValue}>GHS {formatCurrency(summary.total_revenue)}</p>
                  </div>
                  <div className={styles.card}>
                    <p className={styles.cardLabel}>Transactions</p>
                    <p className={styles.cardValue}>{summary.transaction_count}</p>
                  </div>
                  <div className={styles.card}>
                    <p className={styles.cardLabel}>Avg Basket</p>
                    <p className={styles.cardValue}>GHS {formatCurrency(summary.avg_basket)}</p>
                  </div>
                  <div className={styles.card}>
                    <p className={styles.cardLabel}>Cash</p>
                    <p className={styles.cardValue}>GHS {formatCurrency(summary.cash_total)}</p>
                  </div>
                  <div className={styles.card}>
                    <p className={styles.cardLabel}>MoMo</p>
                    <p className={styles.cardValue}>GHS {formatCurrency(summary.momo_total)}</p>
                  </div>
                  <div className={`${styles.card} ${summary.credit_total > 0 ? styles.cardWarning : ''}`}>
                    <p className={styles.cardLabel}>Credit</p>
                    <p className={styles.cardValue}>GHS {formatCurrency(summary.credit_total)}</p>
                  </div>
                </div>
              </div>
            )}

            <div className={styles.tableSection}>
              <h2 className={styles.sectionTitle}>Transaction History</h2>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Receipt No.</th>
                      <th>Date & Time</th>
                      <th>Cashier</th>
                      <th>Customer</th>
                      <th>Items</th>
                      <th>Payment</th>
                      <th>Total</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={9} className={styles.loadingRow}>Loading...</td></tr>
                    ) : transactions.length === 0 ? (
                      <tr><td colSpan={9} className={styles.emptyRow}>No transactions found for this period</td></tr>
                    ) : transactions.map(tx => (
                      <tr 
                        key={tx.id} 
                        className={`${styles.tableRow} ${tx.status === 'voided' || tx.status === 'reversed' ? styles.voided : ''}`}
                        onClick={() => setSelectedTxId(tx.id)}
                      >
                        <td><span className={styles.receiptNum}>{tx.receipt_number}</span></td>
                        <td className={styles.dateCell}>
                          {new Date(tx.created_at).toLocaleDateString('en-GH')}<br />
                          <span className={styles.timeText}>{new Date(tx.created_at).toLocaleTimeString('en-GH')}</span>
                        </td>
                        <td>{tx.cashier_name}</td>
                        <td>{tx.customer_name || <span className={styles.muted}>Walk-in</span>}</td>
                        <td className={styles.monoCell}>{tx.item_count}</td>
                        <td>{paymentMethodLabel(tx.payment_method)}</td>
                        <td className={styles.totalCell}>GHS {formatCurrency(tx.grand_total)}</td>
                        <td>
                          <span className={`${styles.statusBadge} ${tx.status === 'voided' ? styles.statusVoided : tx.status === 'reversed' ? styles.statusReversed : styles.statusCompleted}`}>
                            {tx.status}
                          </span>
                        </td>
                        <td>
                          {tx.status === 'completed' && (
                            <div className={styles.actionCell}>
                              <button className={styles.receiptBtn} onClick={(e) => { e.stopPropagation(); setSelectedTxId(tx.id); }}>
                                Receipt
                              </button>
                              <button className={styles.voidBtn} onClick={(e) => { e.stopPropagation(); handleVoid(tx.id); }} disabled={voidingId === tx.id}>
                                {voidingId === tx.id ? '...' : 'Void'}
                              </button>
                              {user?.role === 'admin' && (
                                <button className={styles.reverseBtn} onClick={() => handleReverse(tx.id)} disabled={voidingId === tx.id}>
                                  Reverse
                                </button>
                              )}
                            </div>
                          )}
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
          <div className={styles.summarySection} style={{ padding: '20px 0' }}>
            <div className={styles.summaryCards}>
              <div className={`${styles.card} ${styles.stockCard}`}>
                <p className={styles.cardLabel}>Total Stock Items</p>
                <p className={styles.cardValue}>{invSummary?.total_stock?.toLocaleString() || 0}</p>
              </div>
              <div className={`${styles.card} ${styles.stockCard}`}>
                <p className={styles.cardLabel}>Unique Products</p>
                <p className={styles.cardValue}>{invSummary?.total_items || 0}</p>
              </div>
              <div className={`${styles.card} ${styles.stockCard}`}>
                <p className={styles.cardLabel}>Stock Value (Selling)</p>
                <p className={styles.cardValue}>GHS {formatCurrency(invSummary?.total_value_selling)}</p>
              </div>
              <div className={`${styles.card} ${styles.stockValueCard}`}>
                <p className={styles.cardLabel}>Stock Value (Cost)</p>
                <p className={styles.cardValue}>GHS {formatCurrency(invSummary?.total_value_cost)}</p>
              </div>
            </div>

            <div className={styles.tableSection} style={{ marginTop: '20px' }}>
              <h2 className={styles.sectionTitle}>Stock Value by Category</h2>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Category</th>
                      <th>Unique Products</th>
                      <th>Total Stock</th>
                      <th>Total Value (Selling)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={4} className={styles.loadingRow}>Loading...</td></tr>
                    ) : categorySummary.length === 0 ? (
                      <tr><td colSpan={4} className={styles.emptyRow}>No data available</td></tr>
                    ) : categorySummary.map((cat, idx) => (
                      <tr key={idx} className={styles.tableRow}>
                        <td style={{ fontWeight: '600' }}>{cat.category}</td>
                        <td className={styles.monoCell}>{cat.item_count}</td>
                        <td className={styles.monoCell}>{cat.total_stock?.toLocaleString() || 0}</td>
                        <td className={styles.totalCell}>GHS {formatCurrency(cat.total_value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <p style={{ padding: '20px 24px', color: 'var(--color-text-muted)', fontSize: '13px' }}>
              For detailed inventory management, please visit the Inventory tab in the main sidebar.
            </p>
          </div>
        )}

        {activeTab === 'attendance' && (
          <div className={styles.tableSection}>
            <h2 className={styles.sectionTitle}>Attendance Logs</h2>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Staff Name</th>
                    <th>Date</th>
                    <th>Clock In</th>
                    <th>Clock Out</th>
                    <th>Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={5} className={styles.loadingRow}>Loading logs...</td></tr>
                  ) : attendanceLogs.length === 0 ? (
                    <tr><td colSpan={5} className={styles.emptyRow}>No attendance logs found for this period</td></tr>
                  ) : attendanceLogs.map(log => {
                    const duration = log.clock_out 
                      ? Math.round((new Date(log.clock_out).getTime() - new Date(log.clock_in).getTime()) / (1000 * 60))
                      : null;
                    const hours = duration ? Math.floor(duration / 60) : 0;
                    const mins = duration ? duration % 60 : 0;

                    return (
                      <tr key={log.id} className={styles.tableRow} onClick={() => setSelectedShiftLog(log)} style={{ cursor: 'pointer' }}>
                        <td style={{ fontWeight: '600' }}>{log.user_name}</td>
                        <td>{new Date(log.clock_in).toLocaleDateString('en-GH')}</td>
                        <td className={styles.monoCell}>{new Date(log.clock_in).toLocaleTimeString('en-GH')}</td>
                        <td>
                          {log.clock_out ? (
                            <span className={styles.monoCell}>{new Date(log.clock_out).toLocaleTimeString('en-GH')}</span>
                          ) : (
                            <span className={styles.statusBadge} style={{ background: 'var(--color-success-dim)', color: 'var(--color-success)' }}>
                              Still In
                            </span>
                          )}
                        </td>
                        <td className={styles.monoCell}>
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

      {previewReports && (
        <ReportPreviewModal
          reports={previewReports}
          onConfirm={handleConfirmPrint}
          onCancel={() => setPreviewReports(null)}
          isPrinting={isPrinting}
        />
      )}
      {selectedTxId && (
        <TransactionDetailModal 
          transactionId={selectedTxId} 
          onClose={() => setSelectedTxId(null)} 
        />
      )}
      {selectedShiftLog && (
        <ShiftSummaryModal
          log={selectedShiftLog}
          onClose={() => setSelectedShiftLog(null)}
          onSelectTransaction={(id) => { setSelectedShiftLog(null); setSelectedTxId(id); }}
        />
      )}
    </div>
  );
}
