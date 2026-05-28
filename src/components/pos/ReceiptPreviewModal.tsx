import { useEffect, useState } from 'react';
import { useAuthStore } from '../../store/auth';
import styles from './ReceiptModal.module.css';

interface Props {
  onClose: () => void;
}

const SAMPLE_ITEMS = [
  { product_name: 'Malta Guinness', product_size: '330ml', quantity: 2, unit_price: 8.5 },
  { product_name: 'Peak Milk', product_size: undefined as string | undefined, quantity: 1, unit_price: 18.0 },
  { product_name: 'Bread (Loaf)', product_size: undefined, quantity: 3, unit_price: 6.0 },
];

export default function ReceiptPreviewModal({ onClose }: Props) {
  const { businessName, businessLogo, user, receiptFooter, receiptConfig } = useAuthStore();
  const rc = receiptConfig;
  const cur = rc.currency || 'GH₵';
  const [bizDetails, setBizDetails] = useState({ address: '', phone: '', tin: '' });

  useEffect(() => {
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

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-GH', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
  const timeStr = now.toLocaleTimeString('en-GH', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });

  const subtotal = SAMPLE_ITEMS.reduce((s, i) => s + i.unit_price * i.quantity, 0);
  const tax = subtotal * 0.05;
  const total = subtotal + tax;

  return (
    <div className={styles.overlay}>
      <div
        className={`${styles.modal} ${styles.previewModal}`}
        style={{ width: rc.paperSize === '58mm' ? '320px' : '440px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.previewBanner}>
          <span>Receipt design preview</span>
          <span className={styles.previewHint}>Sample items — no sale recorded</span>
        </div>

        <div className={`${styles.receipt} ${rc.template === 'compact' ? styles.compactReceipt : rc.template === 'elegant' ? styles.elegantReceipt : ''}`}>
          <div className={styles.receiptHeader}>
            {rc.showLogo && businessLogo && (
              <img src={businessLogo} alt="Business Logo" className={styles.logo} />
            )}
            <p className={styles.receiptBusinessName}>{businessName || 'Your Business'}</p>
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
            {rc.showCustomer && (
              <div className={styles.metaRow}>
                <span>Customer</span>
                <span>Walk-in Customer</span>
              </div>
            )}
          </div>

          <div className={styles.divider} />

          <div className={styles.itemsHeader}>
            <span>Item</span>
            <span>Qty</span>
            <span>Price</span>
            <span>Total</span>
          </div>

          <div className={styles.items}>
            {SAMPLE_ITEMS.map((item, index) => (
              <div key={item.product_name}>
                <div className={styles.item}>
                  <span className={styles.itemName}>
                    {item.product_name}
                    {item.product_size && (
                      <em className={styles.itemSize}>({item.product_size})</em>
                    )}
                  </span>
                  <span className={styles.itemQty}>{item.quantity}</span>
                  <span className={styles.itemPrice}>{item.unit_price.toFixed(2)}</span>
                  <span className={styles.itemTotal}>
                    {(item.unit_price * item.quantity).toFixed(2)}
                  </span>
                </div>
                {index < SAMPLE_ITEMS.length - 1 && <div className={styles.itemDivider} aria-hidden />}
              </div>
            ))}
          </div>

          <div className={styles.dividerBold} />

          <div className={styles.totals}>
            <div className={styles.totalRow}>
              <span>Subtotal</span>
              <span>{cur} {subtotal.toFixed(2)}</span>
            </div>
            <div className={styles.totalRow}>
              <span>Tax (sample)</span>
              <span>{cur} {tax.toFixed(2)}</span>
            </div>
            <div className={`${styles.totalRow} ${styles.grandTotalRow}`}>
              <span>TOTAL</span>
              <span>{cur} {total.toFixed(2)}</span>
            </div>
            <div className={styles.totalRow}>
              <span>Payment</span>
              <span>CASH</span>
            </div>
          </div>

          <div className={styles.divider} />

          <div className={styles.footer}>
            <p className={styles.footerMessage}>
              {receiptFooter || 'Thank you for shopping with us!'}
            </p>
            {rc.showPoweredBy && (
              <p className={styles.poweredBy}>Powered by SikaPOS (DanniTech Solution)</p>
            )}
          </div>
        </div>

        <div className={styles.actions}>
          <button type="button" className={styles.printBtn} onClick={() => window.print()}>
            Print preview
          </button>
          <button type="button" className={styles.newSaleBtn} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
