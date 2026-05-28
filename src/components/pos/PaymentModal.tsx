import { useState, useRef, useEffect } from 'react';
import { useCartStore } from '../../store/cart';
import { useAuthStore } from '../../store/auth';
import { formatCurrency } from '../../utils/format';
import { formatErrorMsg } from '../../utils/errorFormatter';
import styles from './PaymentModal.module.css';

interface Props {
  onClose: () => void;
  onComplete: (result: TransactionResult) => void;
}

type PaymentMethod = 'cash' | 'momo' | 'split' | 'credit';
type Step = 'method' | 'cash' | 'momo' | 'split' | 'credit' | 'processing';

const QUICK_AMOUNTS = [50, 100, 200, 500];

export default function PaymentModal({ onClose, onComplete }: Props) {
  const [step, setStep] = useState<Step>('method');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [amountTendered, setAmountTendered] = useState('');
  const [momoPhone, setMomoPhone] = useState('');
  const [splitCash, setSplitCash] = useState('');
  const [splitMomo, setSplitMomo] = useState('');

  const handleSplitCashChange = (val: string) => {
    setSplitCash(val);
    if (val === '') {
      setSplitMomo('');
      return;
    }
    const cashVal = parseFloat(val);
    if (isNaN(cashVal)) return;
    const remaining = total - cashVal;
    if (remaining > 0) {
      setSplitMomo(parseFloat(remaining.toFixed(2)).toString());
    } else {
      setSplitMomo('0');
    }
  };

  const handleSplitMomoChange = (val: string) => {
    setSplitMomo(val);
    if (val === '') {
      setSplitCash('');
      return;
    }
    const momoVal = parseFloat(val);
    if (isNaN(momoVal)) return;
    const remaining = total - momoVal;
    if (remaining > 0) {
      setSplitCash(parseFloat(remaining.toFixed(2)).toString());
    } else {
      setSplitCash('0');
    }
  };

  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [stockWarnings, setStockWarnings] = useState<string[]>([]);
  const [confirmedWarnings, setConfirmedWarnings] = useState(false);
  const [customerInfo, setCustomerInfo] = useState<any>(null);
  const [creditCustomerQuery, setCreditCustomerQuery] = useState('');
  const [creditCustomerResults, setCreditCustomerResults] = useState<any[]>([]);
  const [pendingPrint, setPendingPrint] = useState(false);

  const { 
    items, customerId, customerName, discountAmount, discountType, grandTotal, taxBreakdown,
    orderType, orderNote 
  } = useCartStore();

  useEffect(() => {
    void useCartStore.getState().refreshStockLevels();
  }, []);

  // Load customer details when needed
  useEffect(() => {
    if (method === 'credit' && customerId) {
      (async () => {
        try {
          const data = await window.sikapos.customers.getById(customerId);
          setCustomerInfo(data);
        } catch (e) {
          console.error('Failed to fetch customer info', e);
          setCustomerInfo(null);
        }
      })();
    } else {
      setCustomerInfo(null);
    }
  }, [method, customerId]);
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
      processPayment(pendingPrint);
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

  const ensureCreditCustomer = async (): Promise<number | null> => {
    const { customerId, customerName } = useCartStore.getState();
    if (customerId && customerId > 0) return customerId;
    const name = customerName?.trim();
    if (!name || !window.sikapos) return null;
    const res = await window.sikapos.customers.save({ name });
    if (res.id) {
      useCartStore.getState().setCustomer(res.id, name, 0);
      return res.id;
    }
    return null;
  };

  const processPayment = async (shouldPrint: boolean) => {
    if (processing) return;

    // Check for negative stock — only for inventory-tracked items
    const warnings = items
      .filter(i => {
        if (i.is_inventory !== 1) return false;
        const deductQty = i.stock_unit === 'pack' 
          ? (i.sale_unit === 'pack' ? i.quantity : 0) 
          : i.quantity * Math.max(1, Number(i.unit_multiplier || 1));
        return deductQty > i.stock_qty;
      })
      .map(i => {
        const deductQty = i.stock_unit === 'pack' 
          ? (i.sale_unit === 'pack' ? i.quantity : 0) 
          : i.quantity * Math.max(1, Number(i.unit_multiplier || 1));
        return `${i.product_name}: Only ${i.stock_qty} left (selling ${deductQty})`;
      });

    if (warnings.length > 0 && !confirmedWarnings) {
      setStockWarnings(warnings);
      return;
    }

    let resolvedCustomerId: number | undefined = customerId;
    if (method === 'credit') {
      const creditCustomerId = await ensureCreditCustomer();
      if (!creditCustomerId) {
        setError('Please select or create a registered customer for credit sales.');
        return;
      }
      resolvedCustomerId = creditCustomerId;

      let info = customerInfo;
      if (!info || info.id !== resolvedCustomerId) {
        try {
          info = await window.sikapos.customers.getById(resolvedCustomerId);
          setCustomerInfo(info);
        } catch {
          info = null;
        }
      }

      if (info) {
        const limit = Number(info.credit_limit) || 0;
        const balance = Number(info.credit_balance) || 0;
        if (limit > 0 && balance + total > limit + 0.001) {
          setError(
            `Credit limit exceeded. Limit ${useAuthStore.getState().receiptConfig.currency} ${limit.toFixed(2)}, current balance ${useAuthStore.getState().receiptConfig.currency} ${balance.toFixed(2)}, this sale ${useAuthStore.getState().receiptConfig.currency} ${total.toFixed(2)} would exceed limit.`
          );
          return;
        }
      }
    }

    setProcessing(true);
    setError('');

    try {
      // Snapshot receipt context before we complete the sale.
      // (We immediately return to POS after confirm, which clears the cart.)
      const receiptSnapshot = {
        items: items.map(i => ({ ...i })),
        customerName,
        discountAmount,
        discountType,
        orderType,
        orderNote,
      };

      const result = await window.sikapos.sales.create({
        items,
        customer_id: method === 'credit' ? resolvedCustomerId : customerId,
        customer_name: customerName,
        cashier_name: user?.name || 'Cashier',
        payment_method: method,
        discount_amount: discountAmount,
        discount_type: discountType,
        amount_tendered: method === 'cash' ? tendered : method === 'split' ? ((parseFloat(splitCash) || 0) + (parseFloat(splitMomo) || 0)) : method === 'credit' ? 0 : total,
        split_cash: method === 'split' ? (parseFloat(splitCash) || 0) : undefined,
        split_momo: method === 'split' ? (parseFloat(splitMomo) || 0) : undefined,
        momo_reference: (method === 'momo' || method === 'split') ? `MOMO-${Date.now()}` : undefined,
        order_type: orderType,
        order_note: orderNote,
      });

      // Payment confirmation message disabled per user request

      // Return to POS immediately (no receipt preview)
      onComplete(result);

      // Optional direct print (no preview)
      if (shouldPrint) {
        try {
          const receiptData = await buildReceiptData(result, receiptSnapshot);
          await window.sikapos?.printer?.printReceipt(receiptData);
        } catch (e) {
          console.error('Failed to print receipt:', e);
          await window.sikapos?.notifications?.show('Print failed', 'Could not print receipt. Check printer connection.');
        }
      }
    } catch (err: unknown) {
      setError(formatErrorMsg(err, 'Payment failed. Please try again.'));
      setProcessing(false);
    }
  };

  const buildReceiptData = async (
    result: TransactionResult,
    receiptSnapshot: {
      items: any[];
      customerName?: string;
      discountAmount: number;
      discountType?: string;
      orderType?: string;
      orderNote?: string;
    }
  ) => {
    const { businessName, businessLogo, user, receiptFooter, receiptConfig } = useAuthStore.getState();
    const rc = receiptConfig;
    const cur = rc.currency || 'GH₵';

    const now = new Date();
    const dateStr = now.toLocaleDateString('en-GH', { year: 'numeric', month: 'long', day: 'numeric' });
    const timeStr = now.toLocaleTimeString('en-GH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    let bizDetails = { address: '', phone: '', tin: '' };
    try {
      if (window.sikapos?.settings) {
        const biz: any = await window.sikapos.settings.getBusiness();
        bizDetails = {
          address: biz.business_address || '',
          phone: biz.business_phone || '',
          tin: biz.tin || '',
        };
      }
    } catch {
      // non-blocking: receipt can still print without extra business fields
    }

    const sub = receiptSnapshot.items.reduce((s, i) => s + i.unit_price * i.quantity, 0);
    const effectiveDiscount = receiptSnapshot.discountType === 'percentage'
      ? sub * ((receiptSnapshot.discountAmount || 0) / 100)
      : (receiptSnapshot.discountAmount || 0);

    return {
      businessName,
      businessLogo,
      businessAddress: bizDetails.address,
      businessPhone: bizDetails.phone,
      tin: bizDetails.tin,
      cashier: user?.name || 'Cashier',
      date: dateStr,
      time: timeStr,
      receiptNumber: result.receiptNumber,
      items: receiptSnapshot.items.map(i => ({
        name: i.product_name,
        size: i.product_size,
        quantity: i.quantity,
        saleUnit: i.sale_unit || 'single',
        unitMultiplier: Math.max(1, Number(i.unit_multiplier || 1)),
        saleUnitLabel: i.sale_unit === 'pack'
          ? `Box x${Math.max(1, Number(i.unit_multiplier || 1))}`
          : (i.unit_multiplier && Number(i.unit_multiplier) > 1 ? `Single x${Number(i.unit_multiplier)}` : 'Single'),
        unitPrice: i.unit_price,
        subtotal: i.quantity * i.unit_price,
      })),
      subtotal: result.grandTotal - result.tax.totalTax,
      tax: result.tax.totalTax,
      taxBreakdown: useAuthStore.getState().taxConfig.map(t => ({
        name: t.name,
        rate: t.rate,
        amount: (result.tax as any)[t.id] || 0,
      })).filter(t => t.amount > 0),
      discount: effectiveDiscount,
      total: result.grandTotal,
      paymentMethod: result.paymentMethod,
      status: result.status ?? (result.paymentMethod === 'credit' ? 'debt' : 'completed'),
      paidAmount: result.paidAmount ?? 0,
      amountTendered: result.amountTendered,
      change: result.changeGiven,
      customerCreditBalanceAfter: result.customerCreditBalanceAfter,
      customerName: result.customerName || receiptSnapshot.customerName,
      orderType: receiptSnapshot.orderType,
      orderNote: receiptSnapshot.orderNote,
      footerMessage: receiptFooter || 'Thank you for shopping with us!',
      currency: cur,
      config: rc,
    };
  };

  const completeAndMaybePrint = async (shouldPrint: boolean) => {
    if (processing) return;
    setPendingPrint(shouldPrint);
    await processPayment(shouldPrint);
  };

  const hasCreditCustomer = () => {
    const { customerId: id, customerName: name } = useCartStore.getState();
    return (id != null && id > 0) || Boolean(name?.trim());
  };

  const canComplete = () => {
    if (method === 'cash') return tendered >= total;
    if (method === 'split') {
      const sc = parseFloat(splitCash) || 0;
      const sm = parseFloat(splitMomo) || 0;
      return (sc + sm) >= total;
    }
    if (method === 'credit') return hasCreditCustomer();
    return true;
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        {/* Header */}
        <div className={styles.header}>
          <div>
            <h2 className={styles.title}>Payment</h2>
            <p className={styles.subtitle}>
              Total: <span className={styles.totalAmount}>{useAuthStore.getState().receiptConfig.currency} {formatCurrency(total)}</span>
            </p>
          </div>
          <button className={styles.closeBtn} onClick={onClose}>×</button>
        </div>

        {step !== 'method' && (
          <div className={styles.topActions}>
            <button className={styles.backBtn} onClick={() => { setStep('method'); setError(''); }}>
              ← Back
            </button>
          </div>
        )}

        {/* Method selection */}
        {step === 'method' && (
          <div className={styles.methodGrid}>
            {[
              { id: 'cash', label: 'Cash', icon: '💵', desc: 'Physical currency' },
              { id: 'momo', label: 'Mobile Money', icon: '📱', desc: 'MTN, Telecel, AirtelTigo' },
              { id: 'split', label: 'Both (Cash & MoMo)', icon: '💵📱', desc: 'Split payment' },
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
              <p className={styles.totalBig}>{useAuthStore.getState().receiptConfig.currency} {formatCurrency(total)}</p>
            </div>

            <div className={styles.inputGroup}>
              <label className={styles.inputLabel}>Amount Received</label>
              <div className={styles.inputWrap}>
                <span className={styles.inputPrefix}>{useAuthStore.getState().receiptConfig.currency}</span>
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
                  {useAuthStore.getState().receiptConfig.currency} {amt}
                </button>
              ))}
            </div>

            {tendered > 0 && (
              <div className={`${styles.changeDisplay} ${change > 0 ? styles.changePositive : ''}`}>
                <span>{change > 0 ? 'Give Change:' : tendered === total ? '✓ Exact amount' : 'Insufficient'}</span>
                {change > 0 && <span className={styles.changeAmount}>{useAuthStore.getState().receiptConfig.currency} {formatCurrency(change)}</span>}
              </div>
            )}
          </div>
        )}

        {/* MoMo */}
        {step === 'momo' && (
          <div className={styles.momoStep}>
            <div className={styles.momoIcon}>📱</div>
            <p className={styles.momoTitle}>Mobile Money Payment</p>
            <p className={styles.momoSubtitle}>Amount: {useAuthStore.getState().receiptConfig.currency} {formatCurrency(total)}</p>
            <div className={styles.cardInstructions}>
              <p>1. Collect payment from customer via MoMo</p>
              <p>2. Verify that the correct amount has been received</p>
              <p>3. Click <strong>Confirm Payment</strong> below to complete</p>
            </div>
          </div>
        )}

        {/* Split */}
        {step === 'split' && (
          <div className={styles.cashStep}>
            <div className={styles.momoIcon}>💵📱</div>
            <p className={styles.momoTitle}>Both (Cash & MoMo)</p>
            <p className={styles.momoSubtitle}>Total Due: {useAuthStore.getState().receiptConfig.currency} {formatCurrency(total)}</p>
            
            <div className={styles.inputGroup} style={{ marginTop: '20px' }}>
              <label className={styles.inputLabel}>Cash Amount Received</label>
              <div className={styles.inputWrap}>
                <span className={styles.inputPrefix}>{useAuthStore.getState().receiptConfig.currency}</span>
                <input
                  autoFocus
                  className={styles.amountInput}
                  type="number"
                  placeholder="0.00"
                  value={splitCash}
                  onChange={e => handleSplitCashChange(e.target.value)}
                  min={0}
                  step={0.01}
                />
              </div>
            </div>
            
            <div className={styles.inputGroup} style={{ marginTop: '16px' }}>
              <label className={styles.inputLabel}>MoMo Amount Received</label>
              <div className={styles.inputWrap}>
                <span className={styles.inputPrefix}>{useAuthStore.getState().receiptConfig.currency}</span>
                <input
                  className={styles.amountInput}
                  type="number"
                  placeholder="0.00"
                  value={splitMomo}
                  onChange={e => handleSplitMomoChange(e.target.value)}
                  min={0}
                  step={0.01}
                />
              </div>
            </div>
            
            {((parseFloat(splitCash) || 0) + (parseFloat(splitMomo) || 0)) > 0 && (
              <div className={`${styles.changeDisplay} ${((parseFloat(splitCash) || 0) + (parseFloat(splitMomo) || 0) - total) > 0 ? styles.changePositive : ''}`} style={{ marginTop: '24px' }}>
                <span>{((parseFloat(splitCash) || 0) + (parseFloat(splitMomo) || 0) - total) > 0 ? 'Give Change (Cash):' : ((parseFloat(splitCash) || 0) + (parseFloat(splitMomo) || 0)) >= total ? '✓ Exact amount' : 'Insufficient'}</span>
                {((parseFloat(splitCash) || 0) + (parseFloat(splitMomo) || 0) - total) > 0 && <span className={styles.changeAmount}>{useAuthStore.getState().receiptConfig.currency} {formatCurrency(((parseFloat(splitCash) || 0) + (parseFloat(splitMomo) || 0) - total))}</span>}
              </div>
            )}
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
                {(() => {
                  // Check if customer has outstanding credit balance
                  const creditBalance = useCartStore.getState().customerCreditBalance;
                  if (creditBalance && creditBalance > 0) {
                    return (
                      <div className={styles.warningBox} style={{ marginBottom: '16px' }}>
                        <div className={styles.warningHeader}>
                          <span className={styles.warningIcon}>⚠</span>
                          <h3 className={styles.warningTitle}>Outstanding Credit</h3>
                        </div>
                        <p className={styles.warningText}>
                          This customer already has <strong>{useAuthStore.getState().receiptConfig.currency} {formatCurrency(creditBalance)}</strong> in outstanding credit.
                        </p>
                      </div>
                    );
                  }
                  return null;
                })()}
                <div className={styles.creditInfo}>
                  <div className={styles.creditRow}>
                    <span>Customer</span>
                    <span>{customerName}</span>
                  </div>
                  <div className={styles.creditRow}>
                    <span>Amount to credit</span>
                    <span>{useAuthStore.getState().receiptConfig.currency} {formatCurrency(total)}</span>
                  </div>
                </div>
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: '12px 0' }}>
                <p style={{ color: 'var(--color-text-secondary)', marginBottom: '16px', fontSize: '13px' }}>
                  A customer must be selected for credit sales.
                </p>

                {/* Inline customer search */}
                <div style={{ textAlign: 'left', marginBottom: '12px' }}>
                  <input
                    autoFocus
                    placeholder="Search customer name..."
                    value={creditCustomerQuery}
                    onChange={e => {
                      setCreditCustomerQuery(e.target.value);
                      if (e.target.value.length > 1) {
                        window.sikapos?.customers.search(e.target.value).then(setCreditCustomerResults);
                      } else {
                        setCreditCustomerResults([]);
                      }
                    }}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      background: 'var(--color-surface)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--color-text-primary)',
                      fontSize: '14px',
                    }}
                  />
                </div>

                {creditCustomerResults.length > 0 && (
                  <div style={{
                    maxHeight: '160px',
                    overflowY: 'auto',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--color-border)',
                    marginBottom: '12px',
                  }}>
                    {creditCustomerResults.map((c: any) => (
                      <div
                        key={c.id}
                        onClick={() => {
                          useCartStore.getState().setCustomer(c.id, c.name, c.credit_balance || 0);
                          setCreditCustomerQuery('');
                          setCreditCustomerResults([]);
                        }}
                        style={{
                          padding: '10px 14px',
                          cursor: 'pointer',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          borderBottom: '1px solid var(--color-border)',
                          transition: 'background 0.15s',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-elevated)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <span style={{ fontWeight: 500, color: 'var(--color-text-primary)' }}>{c.name}</span>
                        <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{c.phone || ''}</span>
                      </div>
                    ))}
                  </div>
                )}

                {creditCustomerQuery.trim() && creditCustomerResults.length === 0 && (
                  <button
                    onClick={async () => {
                      const name = creditCustomerQuery.trim();
                      if (!window.sikapos) return;
                      const res = await window.sikapos.customers.save({ name });
                      if (res.id) {
                        useCartStore.getState().setCustomer(res.id, name, 0);
                        setCreditCustomerQuery('');
                        setCreditCustomerResults([]);
                      }
                    }}
                    style={{
                      width: '100%',
                      padding: '10px',
                      background: 'var(--color-surface)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--color-gold)',
                      cursor: 'pointer',
                      fontSize: '13px',
                      marginBottom: '8px',
                    }}
                  >
                    + Use "<strong>{creditCustomerQuery}</strong>" as customer
                  </button>
                )}
              </div>
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
                  setStockWarnings([]);
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
            <>
              <button
                className={styles.confirmBtn}
                onClick={() => completeAndMaybePrint(true)}
                disabled={processing || !canComplete()}
              >
                {processing ? (
                  <span className={styles.spinner} />
                ) : (
                  <>
                    Confirm & Print
                    <span className={styles.confirmAmount}>{useAuthStore.getState().receiptConfig.currency} {formatCurrency(total)}</span>
                  </>
                )}
              </button>
              <button
                className={styles.confirmBtn}
                onClick={() => completeAndMaybePrint(false)}
                disabled={processing || !canComplete()}
                style={{ opacity: 0.9 }}
              >
                {processing ? (
                  <span className={styles.spinner} />
                ) : (
                  <>
                    Confirm
                    <span className={styles.confirmAmount}>{useAuthStore.getState().receiptConfig.currency} {formatCurrency(total)}</span>
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
