import { useState, useEffect } from 'react';
import { formatCurrency } from '../../utils/format';
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
  const [transactions, setTransactions] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);

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
  }, [log]);

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
            <div className={styles.staffBadge}>
              👤 {log.user_name} · {shiftDuration()}
              {!log.clock_out && ' (Still Active)'}
            </div>
          </div>
          <button className={styles.closeBtn} onClick={onClose}>&times;</button>
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
                  <p className={styles.cardValue}>GHS {formatCurrency(summary?.total_revenue)}</p>
                </div>
                <div className={styles.card}>
                  <p className={styles.cardLabel}>Transactions</p>
                  <p className={styles.cardValue}>{summary?.transaction_count || 0}</p>
                </div>
                <div className={styles.card}>
                  <p className={styles.cardLabel}>Cash</p>
                  <p className={styles.cardValue}>GHS {formatCurrency(summary?.cash_total)}</p>
                </div>
              </div>

              {/* Transaction List */}
              <h3 className={styles.sectionTitle}>
                Transactions ({transactions.length})
              </h3>

              {transactions.length === 0 ? (
                <div className={styles.emptyState}>
                  No transactions were made during this shift.
                </div>
              ) : (
                <div className={styles.txList}>
                  {transactions.map((tx: any) => (
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
                        <div className={styles.txAmount}>GHS {formatCurrency(tx.grand_total)}</div>
                        <div className={styles.txMethod}>{tx.payment_method}</div>
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
