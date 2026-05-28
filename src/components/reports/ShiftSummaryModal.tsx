import { useState, useEffect, useMemo } from 'react';
import { formatCurrency } from '../../utils/format';
import { filterTransactionsBySearch } from '../../utils/filterTransactions';
import { buildItemSummaryFromTransactions, buildShiftReportPayload, formatShiftDuration } from '../../utils/shiftReport';
import { formatStockUnitsSold } from '../../utils/formatReportTransactionItemQty';
import TransactionSearchBar from './TransactionSearchBar';
import ReportPreviewModal from './ReportPreviewModal';
import { useAuthStore } from '../../store/auth';
import { showAlert } from '../../store/dialogStore';
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
  const [isPrinting, setIsPrinting] = useState(false);
  const [previewReports, setPreviewReports] = useState<any[] | null>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [itemSummary, setItemSummary] = useState<any[]>([]);
  const [txSearch, setTxSearch] = useState('');

  const { businessName, businessLogo, receiptConfig } = useAuthStore();

  const filteredTransactions = useMemo(
    () => filterTransactionsBySearch(transactions, txSearch),
    [transactions, txSearch],
  );

  const displayItemSummary = useMemo(() => {
    if (itemSummary.length > 0) return itemSummary;
    return buildItemSummaryFromTransactions(transactions);
  }, [itemSummary, transactions]);

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
        setItemSummary(result.itemSummary || []);
      } catch (err) {
        console.error('Failed to load shift data:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchShiftData();
    setTxSearch('');
  }, [log]);

  const buildReportData = () => {
    const report = buildShiftReportPayload({
      log,
      summary,
      transactions,
      businessName,
      businessLogo: businessLogo ?? undefined,
      currency: receiptConfig.currency,
      receiptConfig,
    });
    report.itemSummary = displayItemSummary;
    return report;
  };

  const openPrintPreview = () => {
    if (!summary) return;
    setPreviewReports([buildReportData()]);
  };

  const handleConfirmPrint = async () => {
    if (!window.sikapos || !previewReports) return;
    setIsPrinting(true);
    try {
      for (const report of previewReports) {
        await window.sikapos.printer.printReport(report);
      }
      setPreviewReports(null);
    } catch (err: any) {
      await showAlert('Failed to print: ' + (err?.message || 'Unknown error'));
    } finally {
      setIsPrinting(false);
    }
  };

  const shiftDuration = () => formatShiftDuration(log.clock_in, log.clock_out);

  return (
    <>
      <div className={styles.overlay}>
        <div className={styles.modal} onClick={e => e.stopPropagation()}>
          <div className={styles.header}>
            <div>
              <h2>Shift Summary</h2>
              <div className={styles.shiftMeta}>
                <span>👤 {log.user_name}</span>
                <span>⏱️ {shiftDuration()}</span>
                {!log.clock_out && <span style={{ color: 'var(--color-success)' }}>(Active)</span>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              {summary && (
                <button
                  type="button"
                  className={styles.printBtn}
                  onClick={openPrintPreview}
                  disabled={isPrinting || loading}
                  title="Preview and print end-of-day style report (thermal or PDF)"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 6 2 18 2 18 9"/>
                    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
                    <rect x="6" y="14" width="12" height="8"/>
                  </svg>
                  Print Report
                </button>
              )}
              <button className={styles.closeBtn} onClick={onClose}>&times;</button>
            </div>
          </div>

          <div className={styles.body}>
            {loading ? (
              <div className={styles.loading}>Loading shift data...</div>
            ) : (
              <>
                <div className={styles.summaryCards}>
                  <div className={`${styles.card} ${styles.revenueCard}`}>
                    <p className={styles.cardLabel}>Total Revenue</p>
                    <p className={styles.cardValue}>{receiptConfig.currency} {formatCurrency(summary?.total_revenue)}</p>
                  </div>
                  <div className={styles.card}>
                    <p className={styles.cardLabel}>Transactions</p>
                    <p className={styles.cardValue}>{summary?.transaction_count || 0}</p>
                  </div>
                  <div className={styles.card}>
                    <p className={styles.cardLabel}>Cash</p>
                    <p className={styles.cardValue}>{receiptConfig.currency} {formatCurrency(summary?.cash_total)}</p>
                  </div>
                  <div className={styles.card}>
                    <p className={styles.cardLabel}>MoMo</p>
                    <p className={styles.cardValue}>{receiptConfig.currency} {formatCurrency(summary?.momo_total)}</p>
                  </div>
                  {summary?.debt_recovered > 0 && (
                    <div className={`${styles.card} ${styles.successCard}`}>
                      <p className={styles.cardLabel}>Debt Recovered</p>
                      <p className={styles.cardValue}>{receiptConfig.currency} {formatCurrency(summary?.debt_recovered)}</p>
                    </div>
                  )}
                </div>

                <h3 className={styles.sectionTitle}>Transactions</h3>
                <TransactionSearchBar
                  value={txSearch}
                  onChange={setTxSearch}
                  shown={filteredTransactions.length}
                  total={transactions.length}
                />

                {transactions.length === 0 ? (
                  <div className={styles.emptyState}>
                    No transactions were made during this shift.
                  </div>
                ) : filteredTransactions.length === 0 ? (
                  <div className={styles.emptyState}>No transactions match your search.</div>
                ) : (
                  <div className={styles.txList}>
                    {filteredTransactions.map((tx: any) => (
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
                          <div className={styles.txAmount}>{receiptConfig.currency} {formatCurrency(tx.grand_total)}</div>
                          <div className={styles.txMethod}>
                            {tx.payment_method}
                            {tx.status === 'debt' ? ' · on credit' : ''}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <h3 className={styles.sectionTitle} style={{ marginTop: '20px' }}>
                  Items Sold Summary
                </h3>
                {displayItemSummary.length === 0 ? (
                  <div className={styles.emptyState} style={{ padding: '24px 16px' }}>
                    No items sold during this shift.
                  </div>
                ) : (
                  <div className={styles.itemList}>
                    {displayItemSummary.map((item, idx) => (
                      <div key={`${item.product_name}-${item.product_size || ''}-${idx}`} className={styles.itemRow}>
                        <span className={styles.itemName}>
                          {item.product_name}
                          {item.product_size ? (
                            <span className={styles.itemSize}> ({item.product_size})</span>
                          ) : null}
                        </span>
                        <span className={styles.itemQty}>× {formatStockUnitsSold(item.total_qty)}</span>
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

      {previewReports && (
        <ReportPreviewModal
          reports={previewReports}
          onConfirm={handleConfirmPrint}
          onCancel={() => setPreviewReports(null)}
          isPrinting={isPrinting}
        />
      )}
    </>
  );
}
