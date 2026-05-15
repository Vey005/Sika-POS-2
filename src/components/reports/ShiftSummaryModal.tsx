<<<<<<< HEAD
import { useState, useEffect, useMemo } from 'react';
import { formatCurrency } from '../../utils/format';
import { filterTransactionsBySearch } from '../../utils/filterTransactions';
import TransactionSearchBar from './TransactionSearchBar';
import { useAuthStore } from '../../store/auth';
import { showAlert } from '../../store/dialogStore';
=======
import { useState, useEffect } from 'react';
import { formatCurrency } from '../../utils/format';
>>>>>>> 3f9ceb5465a3e53b5e5300921300cc3a0983f1cf
import styles from './ShiftSummaryModal.module.css';

interface ShiftLog {
  id: number;
  user_id: number;
  user_name: string;
  clock_in: string;
  clock_out?: string;
}

interface Props {
  log: ShiftLog;
  onClose: () => void;
  onSelectTransaction?: (id: number) => void;
}

export default function ShiftSummaryModal({ log, onClose, onSelectTransaction }: Props) {
  const [loading, setLoading] = useState(true);
<<<<<<< HEAD
  const [isPrinting, setIsPrinting] = useState(false);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [txSearch, setTxSearch] = useState('');

  const { businessName, businessLogo, receiptConfig } = useAuthStore();

  const filteredTransactions = useMemo(
    () => filterTransactionsBySearch(transactions, txSearch),
    [transactions, txSearch],
  );
=======
  const [transactions, setTransactions] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
>>>>>>> 3f9ceb5465a3e53b5e5300921300cc3a0983f1cf

  useEffect(() => {
    async function fetchShiftData() {
      if (!window.sikapos) return;
      setLoading(true);
      try {
        const result = await window.sikapos.sales.getByShift({
          cashierName: log.user_name,
          clockIn: log.clock_in,
          clockOut: log.clock_out,
        });
        setTransactions(result.transactions || []);
        setSummary(result.summary || null);
      } catch (err) {
        console.error('Failed to load shift data:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchShiftData();
<<<<<<< HEAD
    setTxSearch('');
  }, [log]);

  const handlePrintShiftReport = async () => {
    if (!window.sikapos || !summary) return;
    setIsPrinting(true);
    try {
      const reportData = {
        businessName,
        businessLogo,
        date: new Date(log.clock_in).toLocaleDateString('en-GH'),
        summary: {
          ...summary,
          // getByShift uses 'credit_total' while buildReportBytes expects 'credit_total'
          // but we might want to clarify it's a shift report
        },
        cashierName: log.user_name,
        shiftDuration: shiftDuration(),
        isShiftReport: true,
        transactions: transactions, // buildReportBytes can use this if we update it
        currency: receiptConfig.currency,
        config: receiptConfig
      };
      
      await window.sikapos.printer.printReport(reportData);
    } catch (err: any) {
      await showAlert('Failed to print: ' + err.message);
    } finally {
      setIsPrinting(false);
    }
  };

=======
  }, [log]);

>>>>>>> 3f9ceb5465a3e53b5e5300921300cc3a0983f1cf
  const shiftDuration = () => {
    const start = new Date(log.clock_in);
    const end = log.clock_out ? new Date(log.clock_out) : new Date();
    const mins = Math.round((end.getTime() - start.getTime()) / (1000 * 60));
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h ${m}m`;
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <div>
            <h2>Shift Summary</h2>
<<<<<<< HEAD
            <div className={styles.shiftMeta}>
              <span>👤 {log.user_name}</span>
              <span>⏱️ {shiftDuration()}</span>
              {!log.clock_out && <span style={{ color: 'var(--color-success)' }}>(Active)</span>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {summary && (
              <button 
                className={styles.printBtn} 
                onClick={handlePrintShiftReport}
                disabled={isPrinting}
                title="Print this shift summary to the thermal printer"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 6 2 18 2 18 9"/>
                  <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
                  <rect x="6" y="14" width="12" height="8"/>
                </svg>
                {isPrinting ? 'Printing...' : 'Print Report'}
              </button>
            )}
            <button className={styles.closeBtn} onClick={onClose}>&times;</button>
          </div>
=======
            <div className={styles.staffBadge}>
              👤 {log.user_name} · {shiftDuration()}
              {!log.clock_out && ' (Still Active)'}
            </div>
          </div>
          <button className={styles.closeBtn} onClick={onClose}>&times;</button>
>>>>>>> 3f9ceb5465a3e53b5e5300921300cc3a0983f1cf
        </div>

        <div className={styles.body}>
          {loading ? (
            <div className={styles.loading}>Loading shift data...</div>
          ) : (
            <>
              {/* Summary Cards */}
              <div className={styles.summaryCards}>
                <div className={`${styles.card} ${styles.revenueCard}`}>
                  <p className={styles.cardLabel}>Total Revenue</p>
<<<<<<< HEAD
                  <p className={styles.cardValue}>{useAuthStore.getState().receiptConfig.currency} {formatCurrency(summary?.total_revenue)}</p>
=======
                  <p className={styles.cardValue}>GHS {formatCurrency(summary?.total_revenue)}</p>
>>>>>>> 3f9ceb5465a3e53b5e5300921300cc3a0983f1cf
                </div>
                <div className={styles.card}>
                  <p className={styles.cardLabel}>Transactions</p>
                  <p className={styles.cardValue}>{summary?.transaction_count || 0}</p>
                </div>
                <div className={styles.card}>
                  <p className={styles.cardLabel}>Cash</p>
<<<<<<< HEAD
                  <p className={styles.cardValue}>{useAuthStore.getState().receiptConfig.currency} {formatCurrency(summary?.cash_total)}</p>
                </div>
                {summary?.debt_recovered > 0 && (
                  <div className={`${styles.card} ${styles.successCard}`}>
                    <p className={styles.cardLabel}>Debt Recovered</p>
                    <p className={styles.cardValue}>{useAuthStore.getState().receiptConfig.currency} {formatCurrency(summary?.debt_recovered)}</p>
                  </div>
                )}
              </div>

              {/* Transaction List */}
              <h3 className={styles.sectionTitle}>Transactions</h3>
              <TransactionSearchBar
                value={txSearch}
                onChange={setTxSearch}
                shown={filteredTransactions.length}
                total={transactions.length}
              />
=======
                  <p className={styles.cardValue}>GHS {formatCurrency(summary?.cash_total)}</p>
                </div>
              </div>

              {/* Transaction List */}
              <h3 className={styles.sectionTitle}>
                Transactions ({transactions.length})
              </h3>
>>>>>>> 3f9ceb5465a3e53b5e5300921300cc3a0983f1cf

              {transactions.length === 0 ? (
                <div className={styles.emptyState}>
                  No transactions were made during this shift.
                </div>
<<<<<<< HEAD
              ) : filteredTransactions.length === 0 ? (
                <div className={styles.emptyState}>No transactions match your search.</div>
              ) : (
                <div className={styles.txList}>
                  {filteredTransactions.map((tx: any) => (
=======
              ) : (
                <div className={styles.txList}>
                  {transactions.map((tx: any) => (
>>>>>>> 3f9ceb5465a3e53b5e5300921300cc3a0983f1cf
                    <div
                      key={tx.id}
                      className={styles.txRow}
                      onClick={() => onSelectTransaction?.(tx.id)}
                    >
                      <div>
                        <div className={styles.txReceipt}>{tx.receipt_number}</div>
                        <div className={styles.txTime}>
                          {new Date(tx.created_at).toLocaleTimeString('en-GH', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
<<<<<<< HEAD
                        <div className={styles.txAmount}>{useAuthStore.getState().receiptConfig.currency} {formatCurrency(tx.grand_total)}</div>
                        <div className={styles.txMethod}>
                          {tx.payment_method}
                          {tx.status === 'debt' ? ' · on credit' : ''}
                        </div>
=======
                        <div className={styles.txAmount}>GHS {formatCurrency(tx.grand_total)}</div>
                        <div className={styles.txMethod}>{tx.payment_method}</div>
>>>>>>> 3f9ceb5465a3e53b5e5300921300cc3a0983f1cf
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div className={styles.footer}>
          <button className={styles.closeModalBtn} onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
