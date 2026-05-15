import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuthStore } from '../../store/auth';
import { formatCurrency } from '../../utils/format';
import { filterTransactionsBySearch } from '../../utils/filterTransactions';
import TransactionSearchBar from '../../components/reports/TransactionSearchBar';
import styles from '../Reports/Reports.module.css';

export default function DashboardScreen() {
  const { user } = useAuthStore();
  const [summary, setSummary] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [txSearch, setTxSearch] = useState('');

  const filteredTransactions = useMemo(
    () => filterTransactionsBySearch(transactions, txSearch),
    [transactions, txSearch],
  );

  const loadTodaySales = useCallback(async () => {
    if (!window.sikapos) return;
    setLoading(true);
    try {
      const now = new Date();
      // Get YYYY-MM-DD in local time
      const todayString = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

      const filters = { from: todayString, to: todayString, cashier_name: user?.name };

      const [sum, txs] = await Promise.all([
        window.sikapos.sales.getSummary(filters),
        window.sikapos.sales.getAll(filters)
      ]);

      setSummary(sum);
      setTransactions(txs);
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.name]);

  useEffect(() => {
    loadTodaySales();
    
    // Auto refresh every 1 minute
    const interval = setInterval(loadTodaySales, 60 * 1000);

    // Listen for sync completion to update instantly if a sale comes from cloud
    let cleanupSync = () => {};
    if (window.sikapos?.sync?.onStatusChange) {
      cleanupSync = window.sikapos.sync.onStatusChange((status) => {
        if (status === 'synced') loadTodaySales();
      });
    }

    return () => {
      clearInterval(interval);
      cleanupSync();
    };
  }, [loadTodaySales]);

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
          <h1 className={styles.title}>Daily Dashboard</h1>
          <p className={styles.subtitle}>Current day's performance for {new Date().toLocaleDateString('en-GH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className={styles.printReportBtn} onClick={loadTodaySales} disabled={loading} style={{ background: 'var(--color-surface)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}>
            {loading ? 'Refreshing...' : 'Refresh Data'}
          </button>
        </div>
      </div>

      <div className={styles.tabs}>
        <button className={`${styles.tab} ${styles.active}`}>Sales Performance (Today)</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {summary && (
          <div className={styles.summarySection}>
            <div className={styles.summaryCards}>
              <div className={styles.card}>
                <p className={styles.cardLabel}>Revenue</p>
                <p className={styles.cardValue}>{useAuthStore.getState().receiptConfig.currency} {formatCurrency(summary.total_revenue)}</p>
              </div>
              <div className={styles.card}>
                <p className={styles.cardLabel}>Transactions</p>
                <p className={styles.cardValue}>{summary.transaction_count}</p>
              </div>
              <div className={styles.card}>
                <p className={styles.cardLabel}>Avg Basket</p>
                <p className={styles.cardValue}>{useAuthStore.getState().receiptConfig.currency} {formatCurrency(summary.avg_basket)}</p>
              </div>
              <div className={styles.card}>
                <p className={styles.cardLabel}>Cash</p>
                <p className={styles.cardValue}>{useAuthStore.getState().receiptConfig.currency} {formatCurrency(summary.cash_total)}</p>
              </div>
              <div className={styles.card}>
                <p className={styles.cardLabel}>MoMo</p>
                <p className={styles.cardValue}>{useAuthStore.getState().receiptConfig.currency} {formatCurrency(summary.momo_total)}</p>
              </div>
              <div className={`${styles.card} ${summary.credit_total > 0 ? styles.cardWarning : ''}`}>
                <p className={styles.cardLabel}>Credit</p>
                <p className={styles.cardValue}>{useAuthStore.getState().receiptConfig.currency} {formatCurrency(summary.credit_total)}</p>
              </div>
            </div>
          </div>
        )}

        <div className={styles.tableSection}>
          <h2 className={styles.sectionTitle}>Transaction History</h2>
          <TransactionSearchBar
            value={txSearch}
            onChange={setTxSearch}
            shown={filteredTransactions.length}
            total={transactions.length}
          />
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
                </tr>
              </thead>
              <tbody>
                {loading && transactions.length === 0 ? (
                  <tr><td colSpan={8} className={styles.loadingRow}>Loading...</td></tr>
                ) : transactions.length === 0 ? (
                  <tr><td colSpan={8} className={styles.emptyRow}>No transactions recorded today</td></tr>
                ) : filteredTransactions.length === 0 ? (
                  <tr><td colSpan={8} className={styles.emptyRow}>No transactions match your search</td></tr>
                ) : filteredTransactions.map(tx => (
                  <tr 
                    key={tx.id} 
                    className={`${styles.tableRow} ${tx.status === 'voided' || tx.status === 'reversed' ? styles.voided : ''}`}
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
                    <td className={styles.totalCell}>{useAuthStore.getState().receiptConfig.currency} {formatCurrency(tx.grand_total)}</td>
                    <td>
                      <span className={`${styles.statusBadge} ${
                        tx.status === 'voided' ? styles.statusVoided : 
                        tx.status === 'reversed' ? styles.statusReversed : 
                        tx.status === 'debt' ? styles.statusDebt : 
                        styles.statusCompleted
                      }`}>
                        {tx.status === 'debt' ? 'Owes' : tx.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
