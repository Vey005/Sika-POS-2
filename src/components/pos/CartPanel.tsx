import { useState, useEffect } from 'react';
import { useCartStore } from '../../store/cart';
import { useAuthStore } from '../../store/auth';
import HeldSalesModal from './HeldSalesModal';
import CustomerModal from './CustomerModal';
import { formatCurrency } from '../../utils/format';
import styles from './CartPanel.module.css';

interface Props {
  onCharge: () => void;
}

export default function CartPanel({ onCharge }: Props) {
  const [heldCount, setHeldCount] = useState(0);
  const [showHeldModal, setShowHeldModal] = useState(false);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [editingQty, setEditingQty] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  
  const { user } = useAuthStore();
  
  const {
    items, discountAmount, discountType,
    removeItem, setQuantity, clearCart, clearDiscount,
    subtotal, taxBreakdown, grandTotal, itemCount,
    customerId, customerName, customerCreditBalance, clearCustomer,
    orderType, setOrderType, orderNote, setOrderNote,
  } = useCartStore();

  const handleKitchenPrint = async () => {
    if (items.length === 0) return;
    try {
      await window.sikapos.printer.printKitchenReceipt({
        items,
        orderType,
        orderNote,
        cashier: user?.name || 'Cashier',
        businessName: 'SikaPOS Restaurant', // This could be from config
        date: new Date().toLocaleString(),
        config: useAuthStore.getState().receiptConfig,
      });
      window.sikapos.notifications.show('Kitchen Order Sent', 'The order has been sent to the kitchen printer.');
    } catch (err) {
      alert('Failed to print to kitchen');
    }
  };

  useEffect(() => {
    updateHeldCount();
  }, []);

  const updateHeldCount = async () => {
    if (!window.sikapos) return;
    const held = await window.sikapos.sales.getHeld();
    setHeldCount(held.length);
  };

  const handleHold = async () => {
    if (!window.sikapos || items.length === 0) return;

    const payload = {
      items, customerId, customerName, customerCreditBalance,
      discountAmount, discountType
    };

    try {
      await window.sikapos.sales.hold({ payload, customerName });
      clearCart();
      updateHeldCount();
      window.sikapos.notifications.show('Sale Held', 'The current transaction has been saved.');
    } catch (err) {
      alert('Failed to hold sale');
    }
  };

  const tax = taxBreakdown();
  const total = grandTotal();
  const count = itemCount();
  const sub = subtotal();

  const effectiveDiscount = discountType === 'percentage'
    ? sub * (discountAmount / 100)
    : discountAmount;

  return (
    <div className={styles.cart}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h2 className={styles.cartTitle}>CART</h2>
          {count > 0 && (
            <span className={styles.countBadge}>{count}</span>
          )}
        </div>
        <div className={styles.headerActions}>
          <button 
            className={styles.heldBtn} 
            onClick={() => setShowHeldModal(true)}
            title="View Held Sales"
          >
            Held ({heldCount})
          </button>
          {items.length > 0 && (
            <>
              <button className={styles.kitchenBtn} onClick={handleKitchenPrint} title="Print to Kitchen">Kitchen</button>
              <button className={styles.holdBtn} onClick={handleHold}>Hold</button>
              <button className={styles.clearBtn} onClick={clearCart}>Clear</button>
            </>
          )}
        </div>
      </div>

      {showHeldModal && (
        <HeldSalesModal 
          onClose={() => {
            setShowHeldModal(false);
            updateHeldCount();
          }} 
        />
      )}

      {showCustomerModal && (
        <CustomerModal onClose={() => setShowCustomerModal(false)} />
      )}

      {/* Customer chip */}
      {customerId && (
        <div className={styles.customerChip}>
          <div className={styles.customerInfo}>
            <span className={styles.customerAvatar}>
              {customerName?.charAt(0).toUpperCase()}
            </span>
            <div>
              <p className={styles.customerName}>{customerName}</p>
              {(customerCreditBalance || 0) > 0 && (
                <p className={styles.customerCredit}>
                  Owes: GHS {formatCurrency(customerCreditBalance)}
                </p>
              )}
            </div>
          </div>
          <button className={styles.removeCustomer} onClick={clearCustomer}>×</button>
        </div>
      )}

      {/* Order Details (Restaurant Mode) */}
      {items.length > 0 && (
        <div className={styles.orderDetails}>
          <div className={styles.orderTypeToggle}>
            <button 
              className={`${styles.typeBtn} ${orderType === 'dine-in' ? styles.typeBtnActive : ''}`}
              onClick={() => setOrderType('dine-in')}
            >Dine-In</button>
            <button 
              className={`${styles.typeBtn} ${orderType === 'takeaway' ? styles.typeBtnActive : ''}`}
              onClick={() => setOrderType('takeaway')}
            >Takeaway</button>
            <button 
              className={`${styles.typeBtn} ${orderType === 'retail' ? styles.typeBtnActive : ''}`}
              onClick={() => setOrderType('retail')}
            >Retail</button>
          </div>
          <input 
            className={styles.orderNoteInput}
            placeholder="Table # or special instructions..."
            value={orderNote}
            onChange={(e) => setOrderNote(e.target.value)}
          />
        </div>
      )}

      {/* Items */}
      <div className={styles.items}>
        {items.length === 0 ? (
          <div className={styles.emptyCart}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
            </svg>
            <p>Cart is empty</p>
            <p style={{ fontSize: '12px' }}>Click products to add them</p>
          </div>
        ) : (
          items.map(item => (
            <div key={item.product_id} className={styles.item}>
              <div className={styles.itemInfo}>
                <p className={styles.itemName}>{item.product_name}</p>
                {item.product_size && <p style={{ fontSize: '11px', color: 'var(--color-gold)', fontWeight: 600, marginTop: '-2px' }}>{item.product_size}</p>}
                <p className={styles.itemPrice}>
                  GHS {formatCurrency(item.unit_price)} × {item.quantity}
                </p>
              </div>
              <div className={styles.itemRight}>
                <p className={styles.itemTotal}>
                  GHS {formatCurrency(item.unit_price * item.quantity)}
                </p>
                <div className={styles.qtyControls}>
                  <button
                    className={styles.qtyBtn}
                    onClick={() => setQuantity(item.product_id, item.quantity - 1)}
                  >−</button>
                  
                  {editingQty === item.product_id ? (
                    <input
                      className={styles.qtyInput}
                      type="number"
                      min="1"
                      autoFocus
                      value={editValue}
                      onFocus={e => e.target.select()}
                      onChange={e => setEditValue(e.target.value)}
                      onBlur={() => {
                        const val = parseInt(editValue);
                        if (!isNaN(val) && val > 0) setQuantity(item.product_id, val);
                        setEditingQty(null);
                      }}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          const val = parseInt(editValue);
                          if (!isNaN(val) && val > 0) setQuantity(item.product_id, val);
                          setEditingQty(null);
                        }
                        if (e.key === 'Escape') setEditingQty(null);
                      }}
                    />
                  ) : (
                    <span 
                      className={styles.qty} 
                      onDoubleClick={() => {
                        setEditingQty(item.product_id);
                        setEditValue(item.quantity.toString());
                      }}
                      title="Double click to type amount"
                    >
                      {item.quantity}
                    </span>
                  )}

                  <button
                    className={styles.qtyBtn}
                    onClick={() => setQuantity(item.product_id, item.quantity + 1)}
                  >+</button>
                  <button
                    className={`${styles.qtyBtn} ${styles.removeBtn}`}
                    onClick={() => removeItem(item.product_id)}
                    title="Remove"
                  >×</button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      {items.length > 0 && (
        <div className={styles.footer}>
          <div className={styles.totals}>
            <div className={styles.totalRow}>
              <span>Subtotal</span>
              <span className="font-mono">GHS {formatCurrency(sub)}</span>
            </div>

            {effectiveDiscount > 0 && (
              <div className={`${styles.totalRow} ${styles.discountRow}`}>
                <span>
                  Discount {discountType === 'percentage' ? `(${discountAmount}%)` : ''}
                  <button className={styles.removeDiscountBtn} onClick={clearDiscount}>×</button>
                </span>
                <span className="font-mono">- GHS {formatCurrency(effectiveDiscount)}</span>
              </div>
            )}

            {tax.totalTax > 0 && (
              <details className={styles.taxDetails}>
                <summary className={`${styles.totalRow} ${styles.taxSummary}`}>
                  <span>Tax (Ghana)</span>
                  <span className="font-mono">GHS {formatCurrency(tax.totalTax)}</span>
                </summary>
                <div className={styles.taxBreakdown}>
                  <div className={styles.taxRow}><span>VAT 12.5%</span><span>GHS {formatCurrency(tax.vat)}</span></div>
                  <div className={styles.taxRow}><span>NHIL 2.5%</span><span>GHS {formatCurrency(tax.nhil)}</span></div>
                  <div className={styles.taxRow}><span>GETFund 2.5%</span><span>GHS {formatCurrency(tax.getfund)}</span></div>
                  <div className={styles.taxRow}><span>COVID Levy 1%</span><span>GHS {formatCurrency(tax.covid)}</span></div>
                </div>
              </details>
            )}

            <div className={`${styles.totalRow} ${styles.grandTotalRow}`}>
              <span>TOTAL</span>
              <span className={`font-mono ${styles.grandTotalAmount}`}>
                GHS {formatCurrency(total)}
              </span>
            </div>
          </div>

          <div className={styles.actionButtons}>
            {!customerId && (
              <button
                className={styles.addCustomerBtn}
                onClick={() => setShowCustomerModal(true)}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/>
                </svg>
                Customer
              </button>
            )}
            <button
              className={styles.chargeBtn}
              onClick={onCharge}
              disabled={items.length === 0}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
                <line x1="1" y1="10" x2="23" y2="10"/>
              </svg>
              Charge {items.length > 0 && <span className={styles.chargeBtnAmount}>GHS {formatCurrency(total)}</span>}
            </button>
          </div>

          <p className={styles.shortcutHint}>F10 to charge · Ctrl+F to search</p>
        </div>
      )}
    </div>
  );
}
