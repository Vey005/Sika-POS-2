import { useEffect, useRef, useState } from 'react';
import { useCartStore } from '../../store/cart';
import { useAuthStore } from '../../store/auth';
import Barcode from '../common/Barcode';
import styles from './ReceiptModal.module.css';

interface Props {
  result: TransactionResult;
  onClose: () => void;
}

export default function ReceiptModal({ result, onClose }: Props) {
  const { items, customerName, discountAmount, discountType, orderType, orderNote } = useCartStore();
  const { businessName, businessLogo, user, receiptFooter, receiptConfig } = useAuthStore();
  const printRef = useRef<HTMLDivElement>(null);
  const [bizDetails, setBizDetails] = useState({ address: '', phone: '', tin: '' });

  const rc = receiptConfig;
  const cur = rc.currency || 'GHS';

  useEffect(() => {
    // Load business address/phone/tin for receipt
    if (window.sikapos?.settings) {
      window.sikapos.settings.getBusiness().then((biz: any) => {
        setBizDetails({
          address: biz.business_address || '',
          phone: biz.business_phone || '',
          tin: biz.tin || '',
        });
      });
    }
  }, []);

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
        businessAddress: bizDetails.address,
        businessPhone: bizDetails.phone,
        tin: bizDetails.tin,
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
        taxBreakdown: useAuthStore.getState().taxConfig.map(t => ({
          name: t.name,
          rate: t.rate,
          amount: result.tax[t.id as keyof typeof result.tax] || 0
        })).filter(t => t.amount > 0),
        discount: effectiveDiscount,
        total: result.grandTotal,
        paymentMethod: result.changeGiven >= 0 ? 'cash' : 'momo',
        amountTendered: result.grandTotal + result.changeGiven,
        change: result.changeGiven,
        customerName: result.customerName || customerName,
        orderType: orderType,
        orderNote: orderNote,
        footerMessage: receiptFooter || 'Thank you for shopping with us!',
        currency: cur,
        config: rc,
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
        businessAddress: bizDetails.address,
        businessPhone: bizDetails.phone,
        tin: bizDetails.tin,
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
        taxBreakdown: useAuthStore.getState().taxConfig.map(t => ({
          name: t.name,
          rate: t.rate,
          amount: result.tax[t.id as keyof typeof result.tax] || 0
        })).filter(t => t.amount > 0),
        discount: effectiveDiscount,
        total: result.grandTotal,
        paymentMethod: result.changeGiven >= 0 ? 'cash' : 'momo',
        amountTendered: result.grandTotal + result.changeGiven,
        change: result.changeGiven,
        customerName: result.customerName || customerName,
        orderType: orderType,
        orderNote: orderNote,
        footerMessage: receiptFooter || 'Thank you for shopping with us!',
        currency: cur,
        config: rc,
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
      <div 
        className={styles.modal} 
        ref={printRef}
        style={{ width: rc.paperSize === '58mm' ? '320px' : '440px' }}
      >
        {/* Success animation */}
        <div className={styles.successHeader}>
          <div className={styles.checkCircle}>
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
              <circle cx="24" cy="24" r="24" fill="rgba(34,197,94,0.1)"/>
              <polyline
                points="14,24 21,31 34,16"
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
            {rc.showLogo && businessLogo && (
              <img 
                src={businessLogo} 
                alt="Business Logo" 
                className={styles.logo}
              />
            )}
            <p className={styles.receiptBusinessName}>{businessName}</p>
            {rc.showAddress && bizDetails.address && (
              <p className={styles.receiptMeta}>{bizDetails.address}</p>
            )}
            {rc.showPhone && bizDetails.phone && (
              <p className={styles.receiptMeta}>Tel: {bizDetails.phone}</p>
            )}
            {rc.showTIN && bizDetails.tin && (
              <p className={styles.receiptMeta}>TIN: {bizDetails.tin}</p>
            )}
          </div>

          <div className={styles.divider} />

          {/* Transaction meta */}
          <div className={styles.metaGrid}>
            <div className={styles.metaRow}>
              <span>Date</span>
              <span>{dateStr}</span>
            </div>
            <div className={styles.metaRow}>
              <span>Time</span>
              <span>{timeStr}</span>
            </div>
            {rc.showCashier && (
              <div className={styles.metaRow}>
                <span>Cashier</span>
                <span>{user?.name || 'Cashier'}</span>
              </div>
            )}
            {rc.showCustomer && (result.customerName || customerName) && (
              <div className={styles.metaRow}>
                <span>Customer</span>
                <span>{result.customerName || customerName}</span>
              </div>
            )}
            {rc.showOrderType && orderType !== 'retail' && (
              <div className={styles.metaRow}>
                <span>Order</span>
                <span>{orderType?.toUpperCase()}</span>
              </div>
            )}
            {rc.showOrderNote && orderNote && (
              <div className={styles.metaRow}>
                <span>Note</span>
                <span>{orderNote}</span>
              </div>
            )}
          </div>

          <div className={styles.divider} />

          {/* Items table header */}
          <div className={styles.itemsHeader}>
            <span>Item</span>
            <span>Qty</span>
            <span>Price</span>
            <span>Total</span>
          </div>

          {/* Items */}
          <div className={styles.items}>
            {items.map(item => (
              <div key={item.product_id} className={styles.item}>
                <span className={styles.itemName}>
                  {item.product_name}
                  {item.product_size && <em className={styles.itemSize}>({item.product_size})</em>}
                </span>
                <span className={styles.itemQty}>{item.quantity}</span>
                <span className={styles.itemPrice}>{item.unit_price.toFixed(2)}</span>
                <span className={styles.itemTotal}>{(item.unit_price * item.quantity).toFixed(2)}</span>
              </div>
            ))}
          </div>

          <div className={styles.dividerBold} />

          {/* Totals */}
          <div className={styles.totals}>
            <div className={styles.totalRow}>
              <span>Subtotal</span>
              <span>{cur} {(result.grandTotal - result.tax.totalTax).toFixed(2)}</span>
            </div>
            {effectiveDiscount > 0 && (
              <div className={styles.totalRow}>
                <span>Discount</span>
                <span className={styles.discountValue}>- {cur} {effectiveDiscount.toFixed(2)}</span>
              </div>
            )}
            {rc.showTaxBreakdown && result.tax && useAuthStore.getState().taxConfig.map(t => {
              const amount = result.tax[t.id as keyof typeof result.tax] as number || 0;
              if (amount <= 0 || t.rate <= 0) return null;
              return (
                <div key={t.id} className={styles.totalRow}>
                  <span>{t.name} ({t.rate}%)</span>
                  <span>{cur} {amount.toFixed(2)}</span>
                </div>
              );
            })}
            {!rc.showTaxBreakdown && result.tax.totalTax > 0 && (
              <div className={styles.totalRow}>
                <span>Tax</span>
                <span>{cur} {result.tax.totalTax.toFixed(2)}</span>
              </div>
            )}
            <div className={`${styles.totalRow} ${styles.grandTotalRow}`}>
              <span>TOTAL</span>
              <span>{cur} {(result.grandTotal || 0).toFixed(2)}</span>
            </div>
            {(result.changeGiven || 0) > 0 && (
              <div className={`${styles.totalRow} ${styles.changeRow}`}>
                <span>Change Given</span>
                <span>{cur} {(result.changeGiven || 0).toFixed(2)}</span>
              </div>
            )}
          </div>

          <div className={styles.divider} />

          {/* Footer */}
          <div className={styles.footer}>
            <p className={styles.footerMessage}>
              {receiptFooter || 'Thank you for shopping with us!'}
            </p>
            {rc.showPoweredBy && (
              <p className={styles.poweredBy}>Powered by SikaPOS (DanniTech Solution)</p>
            )}
            {rc.showBarcode && (
              <div className={styles.barcodeContainer}>
                <Barcode value={result.receiptNumber} width={200} height={44} className={styles.barcodeCanvas} />
                <span className={styles.barcodeLabel}>{result.receiptNumber}</span>
              </div>
            )}
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
