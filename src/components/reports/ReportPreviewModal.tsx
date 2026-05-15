import { formatCurrency } from '../../utils/format';
import {
  formatReportTransactionItemQty,
  formatStockUnitsSold,
} from '../../utils/formatReportTransactionItemQty';
import { useAuthStore } from '../../store/auth';
import { showAlert } from '../../store/dialogStore';
import styles from './ReportPreviewModal.module.css';

interface ReportData {
  businessName: string;
  businessLogo?: string;
  date: string;
  isShiftReport?: boolean;
  cashierName?: string;
  shiftDuration?: string;
  summary: {
    transaction_count: number;
    total_revenue: number;
    cash_total: number;
    momo_total: number;
    credit_total: number;
    debt_recovered: number;
  };
  transactions: Array<{
    receipt_number: string;
    created_at: string;
    grand_total: number;
    payment_method: string;
    items?: Array<{
      product_name: string;
      quantity: number;
      unit_price: number;
      line_total: number;
      sale_unit?: string | null;
      unit_multiplier?: number | null;
    }>;
  }>;
  itemSummary?: Array<{ product_name: string; total_qty: number }>;
}

interface Props {
  reports: ReportData[];
  onConfirm: () => void;
  onCancel: () => void;
  isPrinting: boolean;
}

export default function ReportPreviewModal({ reports, onConfirm, onCancel, isPrinting }: Props) {
  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>Print Preview ({reports.length} report{reports.length > 1 ? 's' : ''})</h2>
          <button className={styles.cancelBtn} onClick={onCancel}>&times;</button>
        </div>
        
        <div className={styles.scrollArea}>
          {reports.map((report, idx) => (
            <div key={idx} className={styles.reportContainer}>
              {report.businessLogo && (
                <img 
                  src={report.businessLogo} 
                  alt="Business Logo" 
                  style={{ width: '64px', height: '64px', objectFit: 'contain', marginBottom: '12px', display: 'block', marginLeft: 'auto', marginRight: 'auto' }} 
                />
              )}
              <p className={styles.businessName}>{report.businessName}</p>
              <p className={styles.reportTitle}>{report.isShiftReport ? 'SHIFT SUMMARY REPORT' : 'END OF DAY REPORT'}</p>
              <p className={styles.reportDate}>{report.date}</p>
              
              {report.isShiftReport && report.cashierName && (
                <div className={styles.shiftMeta}>
                  <span>Staff: {report.cashierName}</span>
                  {report.shiftDuration && <span> · Duration: {report.shiftDuration}</span>}
                </div>
              )}

              <div className={styles.divider} />
              
              <p className={styles.sectionTitle}>Performance Summary</p>
              <div className={styles.row}>
                <span>Total Revenue:</span>
                <span>{useAuthStore.getState().receiptConfig.currency} {formatCurrency(report.summary.total_revenue)}</span>
              </div>
              <div className={styles.row}>
                <span>Transactions:</span>
                <span>{report.summary.transaction_count}</span>
              </div>
              {report.summary.debt_recovered > 0 && (
                <div className={styles.row} style={{ color: 'var(--color-success, #22c55e)' }}>
                  <span>Debt Recovered:</span>
                  <span>{useAuthStore.getState().receiptConfig.currency} {formatCurrency(report.summary.debt_recovered)}</span>
                </div>
              )}
              
              <div className={styles.divider} />
              
              <div className={styles.row}>
                <span>Cash:</span>
                <span>{useAuthStore.getState().receiptConfig.currency} {formatCurrency(report.summary.cash_total)}</span>
              </div>
              <div className={styles.row}>
                <span>MoMo:</span>
                <span>{useAuthStore.getState().receiptConfig.currency} {formatCurrency(report.summary.momo_total)}</span>
              </div>
              <div className={styles.row}>
                <span>Credit:</span>
                <span>{useAuthStore.getState().receiptConfig.currency} {formatCurrency(report.summary.credit_total)}</span>
              </div>
              
              <div className={styles.divider} />

              <p className={styles.sectionTitle}>Transactions</p>
              {report.transactions.map((tx, tIdx) => (
                <div key={tIdx} style={{ marginBottom: '12px' }}>
                  <div className={styles.txHeader}>
                    <span className={styles.colReceipt}>{tx.receipt_number.split('-').pop()}</span>
                    <span className={styles.colTime}>
                      {new Date(tx.created_at).toLocaleTimeString('en-GH', { hour: '2-digit', minute: '2-digit', hour12: false })}
                    </span>
                    <span className={styles.colMethod}>{tx.payment_method.toUpperCase()}</span>
                    <span className={styles.colTotal}>{formatCurrency(tx.grand_total)}</span>
                  </div>
                  {tx.items && tx.items.length > 0 && (
                    <div style={{ paddingLeft: '12px', fontSize: '11px', color: 'var(--color-text-muted, #888)' }}>
                      {tx.items.map((item, iIdx) => (
                        <div key={iIdx} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                          <span>{item.product_name} × {formatReportTransactionItemQty(item)}</span>
                          <span>{useAuthStore.getState().receiptConfig.currency} {formatCurrency(item.line_total)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {report.itemSummary && report.itemSummary.length > 0 && (
                <>
                  <div className={styles.divider} />
                  <p className={styles.sectionTitle}>Items Sold (stock units)</p>
                  <div style={{ fontSize: '12px' }}>
                    {report.itemSummary.map((item, iIdx) => (
                      <div key={iIdx} className={styles.row}>
                        <span>{item.product_name}</span>
                        <span style={{ fontWeight: 600 }}>× {formatStockUnitsSold(item.total_qty)}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
              
              <div className={styles.divider} />
              
              <div className={styles.footer}>
                <p>Printed on: {new Date().toLocaleString('en-GH')}</p>
                <p>Powered by SikaPOS (DanniTech Solution)</p>
              </div>
            </div>
          ))}
        </div>

        <div className={styles.modalFooter}>
          <button className={styles.cancelBtn} onClick={onCancel} disabled={isPrinting}>
            Cancel
          </button>
          <button 
            className={styles.savePdfBtn} 
            onClick={async () => {
              try {
                if (window.sikapos?.printer) {
                  await window.sikapos.printer.saveAsPDF(reports, 'report');
                }
              } catch (err: any) {
                await showAlert('Failed to save PDF: ' + err.message);
              }
            }} 
            disabled={isPrinting}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <path d="M12 18v-6"/>
              <path d="m9 15 3 3 3-3"/>
            </svg>
            Save as PDF
          </button>
          <button className={styles.printBtn} onClick={onConfirm} disabled={isPrinting}>
            {isPrinting ? (
              'Printing...'
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 6 2 18 2 18 9"/>
                  <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
                  <rect x="6" y="14" width="12" height="8"/>
                </svg>
                Confirm &amp; Print All
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
