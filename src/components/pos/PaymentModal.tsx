import { useState, useRef, useEffect } from 'react';
import { useCartStore } from '../../store/cart';
import { useAuthStore } from '../../store/auth';
import { formatCurrency } from '../../utils/format';
import styles from './PaymentModal.module.css';

interface Props {
  onClose: () => void;
  onComplete: (result: TransactionResult) => void;
}

type PaymentMethod = 'cash' | 'momo' | 'card' | 'credit';
type Step = 'method' | 'cash' | 'momo' | 'card' | 'credit' | 'processing';

const QUICK_AMOUNTS = [50, 100, 200, 500];

export default function PaymentModal({ onClose, onComplete }: Props) {
  const [step, setStep] = useState<Step>('method');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [amountTendered, setAmountTendered] = useState('');
  const [momoPhone, setMomoPhone] = useState('');
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [stockWarnings, setStockWarnings] = useState<string[]>([]);
  const [confirmedWarnings, setConfirmedWarnings] = useState(false);

    const { 
    items, customerId, customerName, discountAmount, discountType, grandTotal, taxBreakdown,
    orderType, orderNote 
  } = useCartStore();
  const { user } = useAuthStore();

  const total = grandTotal();
  const tax = taxBreakdown();
  const tendered = parseFloat(amountTendered) || 0;
  const change = Math.max(0, tendered - total);

  const cashInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step === 'cash') {
      setTimeout(() => cashInputRef.current?.focus(), 100);
    }
  }, [step]);

  useEffect(() => {
    if (confirmedWarnings && !processing) {
      processPayment();
    }
  }, [confirmedWarnings]);

  const handleMethodSelect = (m: PaymentMethod) => {
    setMethod(m);
    setStep(m);
  };

  const handleQuickAmount = (amount: number) => {
    setAmountTendered(amount.toString());
  };

  const handleExact = () => {
    setAmountTendered(total.toString());
  };

  const processPayment = async () => {
    if (processing) return;

    // Check for negative stock — only for inventory-tracked items
    const warnings = items
      .filter(i => i.is_inventory === 1 && i.quantity > i.stock_qty)
      .map(i => `${i.product_name}: Only ${i.stock_qty} left (selling ${i.quantity})`);

    if (warnings.length > 0 && !confirmedWarnings) {
      setStockWarnings(warnings);
      return;
    }

    setProcessing(true);
    setError('');

    try {
      const result = await window.sikapos.sales.create({
        items,
        customer_id: customerId,
        customer_name: customerName,
        cashier_name: user?.name || 'Cashier',
        payment_method: method,
        discount_amount: discountAmount,
        discount_type: discountType,
        amount_tendered: method === 'cash' ? tendered : total,
        momo_reference: method === 'momo' ? `MOMO-${Date.now()}` : undefined,
        order_type: orderType,
        order_note: orderNote,
      });

      window.sikapos.notifications.show(
        'Payment Confirmed',
        `GHS ${formatCurrency(total)} received via ${method === 'momo' ? 'Mobile Money' : method.toUpperCase()}.`
      );

      onComplete(result);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Payment failed. Please try again.');
      setProcessing(false);
    }
  };

  const canComplete = () => {
    if (method === 'cash') return tendered >= total;
    return true;
  };

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        {/* Header */}
        <div className={styles.header}>
          <div>
            <h2 className={styles.title}>Payment</h2>
            <p className={styles.subtitle}>
              Total: <span className={styles.totalAmount}>GHS {formatCurrency(total)}</span>
            </p>
          </div>
          <button className={styles.closeBtn} onClick={onClose}>×</button>
        </div>

        {/* Method selection */}
        {step === 'method' && (
          <div className={styles.methodGrid}>
            {[
              { id: 'cash', label: 'Cash', icon: '💵', desc: 'Physical currency' },
              { id: 'momo', label: 'Mobile Money', icon: '📱', desc: 'MTN, Telecel, AirtelTigo' },
              { id: 'card', label: 'Card', icon: '💳', desc: 'Debit / Credit card' },
              { id: 'credit', label: 'Credit', icon: '📋', desc: 'Add to customer balance' },
            ].map(m => (
              <button
                key={m.id}
                className={styles.methodCard}
                onClick={() => handleMethodSelect(m.id as PaymentMethod)}
              >
                <span className={styles.methodIcon}>{m.icon}</span>
                <span className={styles.methodLabel}>{m.label}</span>
                <span className={styles.methodDesc}>{m.desc}</span>
              </button>
            ))}
          </div>
        )}

        {/* Cash payment */}
        {step === 'cash' && (
          <div className={styles.cashStep}>
            <div className={styles.amountDisplay}>
              <p className={styles.amountLabel}>Amount to Collect</p>
              <p className={styles.totalBig}>GHS {formatCurrency(total)}</p>
            </div>

            <div className={styles.inputGroup}>
              <label className={styles.inputLabel}>Amount Received</label>
              <div className={styles.inputWrap}>
                <span className={styles.inputPrefix}>GHS</span>
                <input
                  ref={cashInputRef}
                  className={styles.amountInput}
                  type="number"
                  placeholder="0.00"
                  value={amountTendered}
                  onChange={e => setAmountTendered(e.target.value)}
                  min={0}
                  step={0.01}
                />
              </div>
            </div>

            <div className={styles.quickAmounts}>
              <button className={styles.quickBtn} onClick={handleExact}>Exact</button>
              {QUICK_AMOUNTS.map(amt => (
                <button key={amt} className={styles.quickBtn} onClick={() => handleQuickAmount(amt)}>
                  GHS {amt}
                </button>
              ))}
            </div>

            {tendered > 0 && (
              <div className={`${styles.changeDisplay} ${change > 0 ? styles.changePositive : ''}`}>
                <span>{change > 0 ? 'Give Change:' : tendered === total ? '✓ Exact amount' : 'Insufficient'}</span>
                {change > 0 && <span className={styles.changeAmount}>GHS {formatCurrency(change)}</span>}
              </div>
            )}
          </div>
        )}

        {/* MoMo */}
        {step === 'momo' && (
          <div className={styles.momoStep}>
            <div className={styles.momoIcon}>📱</div>
            <p className={styles.momoTitle}>Mobile Money Payment</p>
            <p className={styles.momoSubtitle}>Enter customer's phone number</p>
            <div className={styles.inputGroup}>
              <label className={styles.inputLabel}>Phone Number</label>
              <div className={styles.inputWrap}>
                <span className={styles.inputPrefix}>🇬🇭</span>
                <input
                  className={styles.amountInput}
                  type="tel"
                  placeholder="024 000 0000"
                  value={momoPhone}
                  onChange={e => setMomoPhone(e.target.value)}
                  maxLength={15}
                />
              </div>
            </div>
            <p className={styles.momoNote}>
              Ask the customer to confirm the GHS {formatCurrency(total)} payment on their phone.
            </p>
          </div>
        )}

        {/* Card */}
        {step === 'card' && (
          <div className={styles.cardStep}>
            <div className={styles.cardIcon}>💳</div>
            <p className={styles.momoTitle}>Card Payment</p>
            <p className={styles.momoSubtitle}>Amount: GHS {formatCurrency(total)}</p>
            <div className={styles.cardInstructions}>
              <p>1. Insert or tap customer's card on the POS terminal</p>
              <p>2. Customer enters PIN if prompted</p>
              <p>3. Confirm transaction on terminal, then click confirm</p>
            </div>
          </div>
        )}

        {/* Credit */}
        {step === 'credit' && (
          <div className={styles.creditStep}>
            <div className={styles.creditIcon}>📋</div>
            <p className={styles.momoTitle}>Credit Sale</p>
            {customerName ? (
              <>
                <p className={styles.momoSubtitle}>Adding to {customerName}'s account</p>
                <div className={styles.creditInfo}>
                  <div className={styles.creditRow}>
                    <span>Customer</span>
                    <span>{customerName}</span>
                  </div>
                  <div className={styles.creditRow}>
                    <span>Amount to credit</span>
                    <span>GHS {formatCurrency(total)}</span>
                  </div>
                </div>
              </>
            ) : (
              <p className={styles.momoSubtitle} style={{ color: 'var(--color-warning)' }}>
                ⚠ No customer selected. Credit requires a customer.
              </p>
            )}
          </div>
        )}

        {/* Stock Warnings */}
        {stockWarnings.length > 0 && !confirmedWarnings && (
          <div className={styles.warningBox}>
            <div className={styles.warningHeader}>
              <span className={styles.warningIcon}>⚠</span>
              <h3 className={styles.warningTitle}>Low Stock Warning</h3>
            </div>
            <p className={styles.warningText}>
              The following items exceed current stock levels. Do you want to proceed? 
              Stock will become negative.
            </p>
            <ul className={styles.warningList}>
              {stockWarnings.map((w, idx) => (
                <li key={idx}>{w}</li>
              ))}
            </ul>
            <div className={styles.warningActions}>
              <button 
                className={styles.proceedBtn} 
                onClick={() => {
                  setConfirmedWarnings(true);
                  // We don't call processPayment directly to let them click the main confirm button again, 
                  // or we can just proceed. Let's just proceed for better UX.
                  setConfirmedWarnings(true);
                  setTimeout(() => setProcessing(false), 0); // trigger re-render
                }}
              >
                Yes, Proceed anyway
              </button>
              <button className={styles.cancelWarningBtn} onClick={() => setStockWarnings([])}>
                Go back
              </button>
            </div>
          </div>
        )}

        {/* Error */}
        {error && <p className={styles.error}>{error}</p>}

        {/* Actions */}
        <div className={styles.actions}>
          {step !== 'method' && (
            <button className={styles.backBtn} onClick={() => { setStep('method'); setError(''); }}>
              ← Back
            </button>
          )}

          {step !== 'method' && (
            <button
              className={styles.confirmBtn}
              onClick={processPayment}
              disabled={processing || !canComplete() || (step === 'credit' && !customerId)}
            >
              {processing ? (
                <span className={styles.spinner} />
              ) : (
                <>
                  Confirm Payment
                  <span className={styles.confirmAmount}>GHS {formatCurrency(total)}</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
