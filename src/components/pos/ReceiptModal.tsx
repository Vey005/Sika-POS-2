import { useEffect, useRef } from 'react';
import { useCartStore } from '../../store/cart';
import { useAuthStore } from '../../store/auth';
import styles from './ReceiptModal.module.css';

interface Props {
  result: TransactionResult;
  onClose: () => void;
}

export default function ReceiptModal({ result, onClose }: Props) {
  const { items, customerName, discountAmount, discountType, orderType, orderNote } = useCartStore();
  const { businessName, businessLogo, user, receiptFooter } = useAuthStore();
  const printRef = useRef<HTMLDivElement>(null);

  // Auto-focus for keyboard nav
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === 'n') onClose();
      if (e.key === 'p' || (e.ctrlKey && e.key === 'p')) { e.preventDefault(); handlePrint(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-GH', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
  const timeStr = now.toLocaleTimeString('en-GH', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });

  const effectiveDiscount = discountType === 'percentage'
    ? (items.reduce((s, i) => s + i.unit_price * i.quantity, 0)) * (discountAmount / 100)
    : discountAmount;

  const handlePrint = async () => {
    try {
      const receiptData = {
        businessName,
        businessLogo,
        cashier: user?.name || 'Cashier',
        date: dateStr,
        receiptNumber: result.receiptNumber,
        items: items.map(i => ({
          name: i.product_name,
          size: i.product_size,
          quantity: i.quantity,
          unitPrice: i.unit_price,
          subtotal: i.quantity * i.unit_price
        })),
        subtotal: result.grandTotal - result.tax.totalTax,
        tax: result.tax.totalTax,
        discount: effectiveDiscount,
        total: result.grandTotal,
        paymentMethod: result.changeGiven >= 0 ? 'cash' : 'momo',
        amountTendered: result.grandTotal + result.changeGiven,
        change: result.changeGiven,
        customerName: result.customerName || customerName,
        orderType: orderType,
        orderNote: orderNote,
        footerMessage: receiptFooter || 'Thank you for shopping with us!'
      };
      
      if (window.sikapos?.printer) {
        await window.sikapos.printer.printReceipt(receiptData);
      } else {
        console.warn('Native printer API not available. Cannot print.');
      }
    } catch (err) {
      console.error('Failed to print receipt:', err);
      alert('Failed to print receipt. Check printer connection. You can also save as PDF.');
    }
  };

  const handleSavePDF = async () => {
    try {
      const receiptData = {
        businessName,
        businessLogo,
        cashier: user?.name || 'Cashier',
        date: dateStr,
        receiptNumber: result.receiptNumber,
        items: items.map(i => ({
          name: i.product_name,
          size: i.product_size,
          quantity: i.quantity,
          unitPrice: i.unit_price,
          subtotal: i.quantity * i.unit_price
        })),
        subtotal: result.grandTotal - result.tax.totalTax,
        tax: result.tax.totalTax,
        discount: effectiveDiscount,
        total: result.grandTotal,
        paymentMethod: result.changeGiven >= 0 ? 'cash' : 'momo',
        amountTendered: result.grandTotal + result.changeGiven,
        change: result.changeGiven,
        customerName: result.customerName || customerName,
        orderType: orderType,
        orderNote: orderNote,
        footerMessage: receiptFooter || 'Thank you for shopping with us!'
      };
      
      if (window.sikapos?.printer) {
        await window.sikapos.printer.saveAsPDF(receiptData, 'receipt');
      }
    } catch (err: any) {
      alert('Failed to save PDF: ' + err.message);
    }
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.modal} ref={printRef}>
        {/* Success animation */}
        <div className={styles.successHeader}>
          <div className={styles.checkCircle}>
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
              <circle cx="20" cy="20" r="20" fill="rgba(34,197,94,0.1)"/>
              <polyline
                points="10,20 17,27 30,12"
                stroke="#22C55E"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="30"
                strokeDashoffset="0"
                style={{ animation: 'draw 0.4s ease 0.1s both' }}
              />
            </svg>
          </div>
          <h2 className={styles.successTitle}>Sale Complete!</h2>
          <p className={styles.receiptNumber}>{result.receiptNumber}</p>
        </div>

        {/* Receipt body */}
        <div className={styles.receipt}>
          {/* Business info */}
          <div className={styles.receiptHeader}>
            {businessLogo && (
              <img 
                src={businessLogo} 
                alt="Business Logo" 
                style={{ width: '64px', height: '64px', objectFit: 'contain', marginBottom: '12px', display: 'block', marginLeft: 'auto', marginRight: 'auto' }} 
              />
            )}
            <p className={styles.receiptBusinessName}>{businessName}</p>
            <p className={styles.receiptDate}>{dateStr} · {timeStr}</p>
            <p className={styles.receiptDate}>Cashier: {user?.name || 'Cashier'}</p>
            {(result.customerName || customerName) && <p className={styles.receiptDate}>Customer: {result.customerName || customerName}</p>}
            {orderType !== 'retail' && <p className={styles.receiptDate}>Order: {orderType?.toUpperCase()}</p>}
            {orderNote && <p className={styles.receiptDate}>Note: {orderNote}</p>}
          </div>

          <div className={styles.divider} />

          {/* Items */}
          <div className={styles.items}>
            {items.map(item => (
              <div key={item.product_id} className={styles.item}>
                <div>
                  <p className={styles.itemName}>
                    {item.product_name}
                    {item.product_size && <span style={{ color: 'var(--color-gold)', marginLeft: '6px', fontSize: '11px', fontWeight: 600 }}>({item.product_size})</span>}
                  </p>
                  <p className={styles.itemDetail}>{item.quantity} × GHS {item.unit_price.toFixed(2)}</p>
                </div>
                <span className={styles.itemTotal}>GHS {(item.unit_price * item.quantity).toFixed(2)}</span>
              </div>
            ))}
          </div>

          <div className={styles.divider} />

          {/* Totals */}
          <div className={styles.totals}>
            {effectiveDiscount > 0 && (
              <div className={styles.totalRow}>
                <span>Discount</span>
                <span style={{ color: 'var(--color-success)' }}>- GHS {effectiveDiscount.toFixed(2)}</span>
              </div>
            )}
            {result.tax && (
              <>
                <div className={styles.totalRow}>
                  <span>VAT (12.5%)</span>
                  <span>GHS {(result.tax.vat || 0).toFixed(2)}</span>
                </div>
                <div className={styles.totalRow}>
                  <span>NHIL (2.5%)</span>
                  <span>GHS {(result.tax.nhil || 0).toFixed(2)}</span>
                </div>
                <div className={styles.totalRow}>
                  <span>GETFund (2.5%)</span>
                  <span>GHS {(result.tax.getfund || 0).toFixed(2)}</span>
                </div>
                <div className={styles.totalRow}>
                  <span>COVID Levy (1%)</span>
                  <span>GHS {(result.tax.covid || 0).toFixed(2)}</span>
                </div>
              </>
            )}
            <div className={`${styles.totalRow} ${styles.grandTotalRow}`}>
              <span>TOTAL</span>
              <span>GHS {(result.grandTotal || 0).toFixed(2)}</span>
            </div>
            {(result.changeGiven || 0) > 0 && (
              <div className={`${styles.totalRow} ${styles.changeRow}`}>
                <span>Change Given</span>
                <span>GHS {(result.changeGiven || 0).toFixed(2)}</span>
              </div>
            )}
          </div>
          <div className={styles.divider} />
          <div style={{ textAlign: 'center', marginTop: '16px' }}>
            <p style={{ fontSize: '13px', fontStyle: 'italic', marginBottom: '8px' }}>
              {receiptFooter || 'Thank you for shopping with us!'}
            </p>
            <p style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Powered by SikaPOS (DanniTech Solution)</p>
          </div>
        </div>

        {/* Actions */}
        <div className={styles.actions}>
          <button className={styles.printBtn} onClick={handlePrint}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 6 2 18 2 18 9"/>
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
              <rect x="6" y="14" width="12" height="8"/>
            </svg>
            Print
          </button>
          <button className={styles.pdfBtn} title="Save as PDF" onClick={handleSavePDF}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <path d="M12 18v-6"/>
              <path d="m9 15 3 3 3-3"/>
            </svg>
          </button>
          <button className={styles.newSaleBtn} onClick={onClose}>
            New Sale
          </button>
        </div>
      </div>
    </div>
  );
}
