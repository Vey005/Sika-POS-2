import { useState, useEffect } from 'react';
import { formatCurrency } from '../../utils/format';
import { getReceiptPaymentDisplay } from '../../utils/receiptPayment';
import Barcode from '../common/Barcode';
import styles from './TransactionDetailModal.module.css';
import { useAuthStore } from '../../store/auth';
import { showAlert } from '../../store/dialogStore';

interface Props {
  transactionId: number;
  onClose: () => void;
}

export default function TransactionDetailModal({ transactionId, onClose }: Props) {
  const { businessName, businessLogo, receiptFooter, receiptConfig } = useAuthStore();
  const [tx, setTx] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isPrinting, setIsPrinting] = useState(false);
  const [bizDetails, setBizDetails] = useState({ address: '', phone: '', tin: '' });

  const rc = receiptConfig;
  const cur = rc.currency || 'GH₵';

  useEffect(() => {
    async function load() {
      if (!window.sikapos) return;
      try {
        const [data, biz] = await Promise.all([
          window.sikapos.sales.getById(transactionId),
          window.sikapos.settings.getBusiness()
        ]);
        setTx(data);
        setBizDetails({
          address: biz.business_address || '',
          phone: biz.business_phone || '',
          tin: biz.tin || '',
        });
      } catch (err) {
        console.error('Failed to load transaction details:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [transactionId]);

  const buildReceiptDataFromTx = (transaction: typeof tx) => {
    const isVoidedOrReversed =
      transaction.status === 'voided' || transaction.status === 'reversed';
    const isCredit =
      String(transaction.payment_method || '').toLowerCase() === 'credit' ||
      transaction.status === 'debt';
    const tendered = isVoidedOrReversed || isCredit
      ? 0
      : Number(transaction.amount_tendered) || 0;
    const chg = isVoidedOrReversed || isCredit
      ? 0
      : Math.max(0, tendered - Number(transaction.grand_total));

    return {
      businessName,
      businessLogo,
      businessAddress: bizDetails.address,
      businessPhone: bizDetails.phone,
      tin: bizDetails.tin,
      cashier: transaction.cashier_name,
      date: new Date(transaction.created_at).toLocaleDateString('en-GH', {
        year: 'numeric', month: 'long', day: 'numeric',
      }),
      time: new Date(transaction.created_at).toLocaleTimeString('en-GH', {
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      }),
      receiptNumber: transaction.receipt_number,
      items: transaction.items.map((i: any) => ({
        name: i.product_name,
        size: i.product_size,
        quantity: i.quantity,
        unitPrice: i.unit_price,
        subtotal: i.line_total,
      })),
      subtotal: transaction.subtotal,
      tax: transaction.total_tax,
      taxBreakdown: useAuthStore.getState().taxConfig.map(t => ({
        name: t.name,
        rate: t.rate,
        amount: transaction[`tax_${t.id}`] || 0,
      })).filter(t => t.amount > 0),
      discount: transaction.discount_amount || 0,
      total: transaction.grand_total,
      paymentMethod: transaction.payment_method,
      status: transaction.status,
      paidAmount: Number(transaction.paid_amount) || 0,
      amountTendered: tendered,
      change: chg,
      customerName: transaction.customer_name,
      orderType: transaction.order_type,
      orderNote: transaction.order_note,
      footerMessage: receiptFooter || 'Reprinted Receipt',
      currency: cur,
      config: rc,
    };
  };

  const handlePrint = async () => {
    if (!tx || !window.sikapos) return;
    setIsPrinting(true);
    try {
      await window.sikapos.printer.printReceipt(buildReceiptDataFromTx(tx));
    } catch (err: any) {
      await showAlert('Failed to print: ' + err.message);
    } finally {
      setIsPrinting(false);
    }
  };

  const handleSavePDF = async () => {
    if (!tx || !window.sikapos) return;
    try {
      await window.sikapos.printer.saveAsPDF(buildReceiptDataFromTx(tx), 'receipt');
    } catch (err: any) {
      await showAlert('Failed to save PDF: ' + err.message);
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
            {/* Header section matching ReceiptModal */}
            <div className={styles.receiptHeader}>
              {rc.showLogo && businessLogo && (
                <img 
                  src={businessLogo} 
                  alt="Business Logo" 
                  className={styles.logo}
                />
              )}
              <h3 className={styles.receiptBusinessName}>{businessName}</h3>
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

            {/* Transaction meta matching ReceiptModal */}
            <div className={styles.metaGrid}>
              <div className={styles.metaRow}>
                <span>Receipt #</span>
                <span>{tx.receipt_number}</span>
              </div>
              <div className={styles.metaRow}>
                <span>Date</span>
                <span>{new Date(tx.created_at).toLocaleDateString('en-GH')}</span>
              </div>
              <div className={styles.metaRow}>
                <span>Time</span>
                <span>{new Date(tx.created_at).toLocaleTimeString('en-GH')}</span>
              </div>
              {rc.showCashier && (
                <div className={styles.metaRow}>
                  <span>Cashier</span>
                  <span>{tx.cashier_name}</span>
                </div>
              )}
              {rc.showCustomer && tx.customer_name && (
                <div className={styles.metaRow}>
                  <span>Customer</span>
                  <span>{tx.customer_name}</span>
                </div>
              )}
              {rc.showOrderType && tx.order_type !== 'retail' && (
                <div className={styles.metaRow}>
                  <span>Order</span>
                  <span>{tx.order_type?.toUpperCase()}</span>
                </div>
              )}
              {rc.showOrderNote && tx.order_note && (
                <div className={styles.metaRow}>
                  <span>Note</span>
                  <span>{tx.order_note}</span>
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

            {/* Items List */}
            <div className={styles.itemsList}>
              {tx.items.map((item: any, idx: number) => (
                <div key={idx} className={styles.itemRow}>
                  <span className={styles.itemName}>
                    {item.product_name}
                    {item.product_size && <em className={styles.itemSize}>({item.product_size})</em>}
                  </span>
                  <span className={styles.itemQty}>{item.quantity}</span>
                  <span className={styles.itemPrice}>{formatCurrency(item.unit_price)}</span>
                  <span className={styles.itemTotal}>{formatCurrency(item.line_total)}</span>
                </div>
              ))}
            </div>

            <div className={styles.dividerBold} />

            {/* Totals section */}
            <div className={styles.totals}>
              <div className={styles.totalRow}>
                <span>Subtotal</span>
                <span>{cur} {formatCurrency(tx.subtotal)}</span>
              </div>
              {tx.discount_amount > 0 && (
                <div className={styles.totalRow}>
                  <span>Discount</span>
                  <span className={styles.discountValue}>- {cur} {formatCurrency(tx.discount_amount)}</span>
                </div>
              )}
              {rc.showTaxBreakdown && useAuthStore.getState().taxConfig.map(t => {
                const amount = tx[`tax_${t.id}`] || 0;
                if (amount <= 0 || t.rate <= 0) return null;
                return (
                  <div key={t.id} className={styles.totalRow}>
                    <span>{t.name} ({t.rate}%)</span>
                    <span>{cur} {formatCurrency(amount)}</span>
                  </div>
                );
              })}
              {!rc.showTaxBreakdown && tx.total_tax > 0 && (
                <div className={styles.totalRow}>
                  <span>Tax</span>
                  <span>{cur} {formatCurrency(tx.total_tax)}</span>
                </div>
              )}
              <div className={`${styles.totalRow} ${styles.grandTotal}`}>
                <span>TOTAL</span>
                <span>{cur} {formatCurrency(tx.grand_total)}</span>
              </div>
            </div>

            <div className={styles.divider} />

            {/* Payment and Footer info */}
            <div className={styles.paymentInfo}>
              {getReceiptPaymentDisplay({
                paymentMethod: tx.payment_method,
                status: tx.status,
                total: tx.grand_total,
                amountTendered: tx.amount_tendered,
                paidAmount: tx.paid_amount,
                currency: cur,
              }).lines.map((line) => (
                <div key={line.label} className={styles.metaRow}>
                  <span>{line.label}</span>
                  <span>{line.value}</span>
                </div>
              ))}
            </div>

            <div className={styles.footerInfo}>
              <p className={styles.footerMessage}>{receiptFooter || 'Thank you for shopping with us!'}</p>
              {rc.showPoweredBy && (
                <p className={styles.poweredBy}>Powered by SikaPOS (DanniTech Solution)</p>
              )}
              {rc.showBarcode && (
                <div className={styles.barcodeContainer}>
                  <Barcode value={tx.receipt_number} width={180} height={40} className={styles.barcodeCanvas} />
                  <span className={styles.barcodeLabel}>{tx.receipt_number}</span>
                </div>
              )}
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
