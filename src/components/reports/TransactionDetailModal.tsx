import { useState, useEffect } from 'react';
import { formatCurrency } from '../../utils/format';
import styles from './TransactionDetailModal.module.css';
import { useAuthStore } from '../../store/auth';

interface Props {
  transactionId: number;
  onClose: () => void;
}

export default function TransactionDetailModal({ transactionId, onClose }: Props) {
  const { businessName, businessLogo, receiptFooter } = useAuthStore();
  const [tx, setTx] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isPrinting, setIsPrinting] = useState(false);

  useEffect(() => {
    async function load() {
      if (!window.sikapos) return;
      try {
        const data = await window.sikapos.sales.getById(transactionId);
        setTx(data);
      } catch (err) {
        console.error('Failed to load transaction details:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [transactionId]);

  const handlePrint = async () => {
    if (!tx || !window.sikapos) return;
    setIsPrinting(true);
    try {
      const receiptData = {
        businessName: 'SikaPOS', // Ideally fetch from settings
        cashier: tx.cashier_name,
        date: new Date(tx.created_at).toLocaleDateString('en-GH', {
          year: 'numeric', month: 'long', day: 'numeric',
        }),
        receiptNumber: tx.receipt_number,
        items: tx.items.map((i: any) => ({
          name: i.product_name,
          quantity: i.quantity,
          unitPrice: i.unit_price,
          subtotal: i.line_total
        })),
        subtotal: tx.subtotal,
        tax: tx.total_tax,
        discount: tx.discount_amount || 0,
        total: tx.grand_total,
        paymentMethod: tx.payment_method,
        amountTendered: tx.amount_tendered || tx.grand_total,
        change: Math.max(0, (tx.amount_tendered || tx.grand_total) - tx.grand_total),
        customerName: tx.customer_name,
        orderType: tx.order_type,
        orderNote: tx.order_note,
        footerMessage: receiptFooter || 'Reprinted Receipt'
      };

      await window.sikapos.printer.printReceipt(receiptData);
    } catch (err: any) {
      alert('Failed to print: ' + err.message);
    } finally {
      setIsPrinting(false);
    }
  };

  const handleSavePDF = async () => {
    if (!tx || !window.sikapos) return;
    try {
      const receiptData = {
        businessName: 'SikaPOS',
        cashier: tx.cashier_name,
        date: new Date(tx.created_at).toLocaleDateString('en-GH'),
        receiptNumber: tx.receipt_number,
        items: tx.items.map((i: any) => ({
          name: i.product_name,
          quantity: i.quantity,
          unitPrice: i.unit_price,
          subtotal: i.line_total
        })),
        subtotal: tx.subtotal,
        tax: tx.total_tax,
        discount: tx.discount_amount || 0,
        total: tx.grand_total,
        paymentMethod: tx.payment_method,
        amountTendered: tx.amount_tendered || tx.grand_total,
        change: Math.max(0, (tx.amount_tendered || tx.grand_total) - tx.grand_total),
        customerName: tx.customer_name,
        orderType: tx.order_type,
        orderNote: tx.order_note,
        footerMessage: receiptFooter || 'Reprinted Receipt'
      };
      await window.sikapos.printer.saveAsPDF(receiptData, 'receipt');
    } catch (err: any) {
      alert('Failed to save PDF: ' + err.message);
    }
  };

  if (loading) {
    return (
      <div className={styles.overlay}>
        <div className={styles.modal}>
          <div className={styles.loading}>Loading details...</div>
        </div>
      </div>
    );
  }

  if (!tx) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>Transaction Details</h2>
          <button className={styles.closeBtn} onClick={onClose}>&times;</button>
        </div>

        <div className={styles.body}>
          <div className={styles.receiptPreview}>
            <div className={styles.receiptHeader}>
              <h3>{tx.receipt_number}</h3>
              <p>{new Date(tx.created_at).toLocaleString('en-GH')}</p>
              <p>Cashier: {tx.cashier_name}</p>
              {tx.customer_name && <p>Customer: {tx.customer_name}</p>}
              {tx.order_type && tx.order_type !== 'retail' && <p>Order Type: {tx.order_type.toUpperCase()}</p>}
              {tx.order_note && <p>Note: {tx.order_note}</p>}
            </div>

            <div className={styles.divider} />

            <div className={styles.itemsList}>
              {tx.items.map((item: any, idx: number) => (
                <div key={idx} className={styles.itemRow}>
                  <div>
                    <p className={styles.itemName}>{item.product_name}</p>
                    <p className={styles.itemQty}>{item.quantity} x GHS {formatCurrency(item.unit_price)}</p>
                  </div>
                  <p className={styles.itemTotal}>GHS {formatCurrency(item.line_total)}</p>
                </div>
              ))}
            </div>

            <div className={styles.divider} />

            <div className={styles.totals}>
              <div className={styles.totalRow}>
                <span>Subtotal</span>
                <span>GHS {formatCurrency(tx.subtotal)}</span>
              </div>
              {tx.discount_amount > 0 && (
                <div className={styles.totalRow}>
                  <span>Discount</span>
                  <span>- GHS {formatCurrency(tx.discount_amount)}</span>
                </div>
              )}
              <div className={styles.totalRow}>
                <span>Tax</span>
                <span>GHS {formatCurrency(tx.total_tax)}</span>
              </div>
              <div className={`${styles.totalRow} ${styles.grandTotal}`}>
                <span>Total</span>
                <span>GHS {formatCurrency(tx.grand_total)}</span>
              </div>
            </div>

            <div className={styles.paymentInfo}>
              <p>Payment: {tx.payment_method.toUpperCase()}</p>
              <p>Status: {tx.status.toUpperCase()}</p>
            </div>
          </div>
        </div>

        <div className={styles.footer}>
          <button className={styles.pdfBtn} onClick={handleSavePDF}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M12 18v-6"/><path d="m9 15 3 3 3-3"/>
            </svg>
            PDF
          </button>
          <button className={styles.printBtn} onClick={handlePrint} disabled={isPrinting}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>
            </svg>
            {isPrinting ? 'Printing...' : 'Reprint Receipt'}
          </button>
        </div>
      </div>
    </div>
  );
}
