import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useCartStore } from '../../store/cart';
import { useAuthStore } from '../../store/auth';
import ProductGrid from '../../components/pos/ProductGrid';
import CartPanel from '../../components/pos/CartPanel';
import PaymentModal from '../../components/pos/PaymentModal';
import ReceiptModal from '../../components/pos/ReceiptModal';
import styles from './POS.module.css';
import { isTypingInEditableField } from '../../utils/keyboard';

const CATEGORY_COLORS: Record<string, string> = {
  'Beverages': '#3B82F6',
  'Food & Snacks': '#22C55E',
  'Personal Care': '#EC4899',
  'Household': '#8B5CF6',
  'Pharmacy': '#06B6D4',
  'General': '#6B7280',
};

export function getCategoryColor(category: string): string {
  return CATEGORY_COLORS[category] || '#6B7280';
}

export default function POSScreen() {
  const location = useLocation();
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>(['All']);
  const [activeCategory, setActiveCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [showPayment, setShowPayment] = useState(false);
  const [receipt, setReceipt] = useState<TransactionResult | null>(null);
  const [showClockInWarning, setShowClockInWarning] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const addItem = useCartStore(state => state.addItem);
  const { user } = useAuthStore();

  // Check if the user is clocked in before allowing a sale
  const checkClockedIn = useCallback(async (): Promise<boolean> => {
    if (!window.sikapos || !user) return false;
    try {
      const status = await window.sikapos.attendance.getStatus(user.id);
      if (status && status.type === 'in') {
        return true;
      }
      setShowClockInWarning(true);
      return false;
    } catch {
      // If attendance check fails, allow the sale (don't block business)
      return true;
    }
  }, [user]);

  const handleCharge = useCallback(async () => {
    const { items, refreshStockLevels } = useCartStore.getState();
    if (items.length === 0) return;
    const ok = await checkClockedIn();
    if (!ok) return;
    await refreshStockLevels();
    setShowPayment(true);
  }, [checkClockedIn]);

  useEffect(() => {
    if (location.pathname.endsWith('/pos') && useCartStore.getState().items.length > 0) {
      void useCartStore.getState().refreshStockLevels();
    }
  }, [location.pathname]);

  // Load products
  const loadProducts = useCallback(async () => {
    if (!window.sikapos) return;
    setLoading(true);
    try {
      const [prods, cats] = await Promise.all([
        window.sikapos.inventory.getAll({
          search: searchQuery,
          category: activeCategory,
          limit: 100
        }),
        window.sikapos.inventory.getCategories(),
      ]);
      setProducts(prods);
      setFilteredProducts(prods);
      setCategories(['All', ...cats]);
      if (useCartStore.getState().items.length > 0) {
        void useCartStore.getState().refreshStockLevels();
      }
    } finally {
      setLoading(false);
    }
  }, [searchQuery, activeCategory]);

  useEffect(() => {
    const timer = setTimeout(loadProducts, 300);
    return () => clearTimeout(timer);
  }, [loadProducts]);



  // Backend already handles filtering via loadProducts effect
  useEffect(() => {
    setFilteredProducts(products);
  }, [products]);

  // Keyboard shortcuts (do not steal focus / intercept keys while typing in other inputs, e.g. payment modal)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const typing = isTypingInEditableField(e.target);
      const inProductSearch = e.target === searchRef.current;

      if ((e.ctrlKey && e.key === 'f') || e.key === 'F3') {
        if (typing && !inProductSearch) return;
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }

      // F10 = charge (with clock-in check)
      if (e.key === 'F10') {
        if (showPayment) return;
        if (typing && !inProductSearch) return;
        e.preventDefault();
        handleCharge();
        return;
      }

      if (e.key === 'Escape') {
        if (typing && !inProductSearch) return;
        setSearchQuery('');
        searchRef.current?.blur();
        return;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleCharge, showPayment]);

  // Native hardware barcode scanner
  useEffect(() => {
    if (!window.sikapos?.scanner) return;
    
    const cleanup = window.sikapos.scanner.onScan(async (barcode) => {
      const product = await window.sikapos.inventory.getByBarcode(barcode);
      if (product && product.stock_qty > 0) {
        useCartStore.getState().addItem(product);
      }
    });
    
    return cleanup;
  }, []);

  const handlePaymentComplete = (result: TransactionResult) => {
    setShowPayment(false);
    // Payment is complete; return to POS immediately (no receipt preview).
    // Cart is cleared here so the cashier can start the next sale right away.
    setReceipt(null);
    useCartStore.getState().clearCart();
    loadProducts();
  };

  return (
    <div className={styles.pos}>
      {/* Left: Product area */}
      <div className={styles.productArea}>
        {/* Search + Category bar */}
        <div className={styles.toolbar}>
          <div className={styles.searchWrap}>
            <svg className={styles.searchIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              ref={searchRef}
              className={styles.searchInput}
              placeholder="Search products or scan barcode... (Ctrl+F)"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onFocus={() => {
                if (searchQuery) setSearchQuery('');
              }}
              onClick={() => {
                if (searchQuery) setSearchQuery('');
              }}
            />
            {searchQuery && (
              <button className={styles.clearSearch} onClick={() => setSearchQuery('')}>×</button>
            )}
          </div>
        </div>

        {/* Category tabs */}
        <div className={`${styles.catTabsScroll} categoryScrollRow`}>
          <div className={styles.catTabs}>
            {categories.map(cat => (
              <button
                key={cat}
                className={`${styles.catTab} ${activeCategory === cat ? styles.catTabActive : ''}`}
                onClick={() => setActiveCategory(cat)}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Product grid */}
        <ProductGrid
          products={filteredProducts}
          loading={loading}
          onProductClick={addItem}
        />
      </div>

      {/* Right: Cart panel */}
      <CartPanel onCharge={handleCharge} />

      {/* Payment modal */}
      {showPayment && (
        <PaymentModal
          onClose={() => setShowPayment(false)}
          onComplete={handlePaymentComplete}
        />
      )}

      {/* Receipt modal */}
      {receipt && (
        <ReceiptModal
          result={receipt}
          onClose={() => {
            setReceipt(null);
            useCartStore.getState().clearCart();
          }}
        />
      )}

      {/* Clock-in warning modal */}
      {showClockInWarning && (
        <div className={styles.clockInOverlay}>
          <div className={styles.clockInModal} onClick={e => e.stopPropagation()}>
            <div className={styles.clockInIcon}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </svg>
            </div>
            <h3 className={styles.clockInTitle}>Clock In Required</h3>
            <p className={styles.clockInMessage}>
              You need to clock in before making a sale. Use the clock-in button in the sidebar to start your shift.
            </p>
            <div className={styles.clockInActions}>
              <button 
                className={styles.clockInBtn}
                onClick={async () => {
                  if (window.sikapos && user) {
                    await window.sikapos.attendance.clockIn(user.id);
                    window.dispatchEvent(new Event('attendance-changed'));
                    setShowClockInWarning(false);
                    setShowPayment(true);
                  }
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                </svg>
                Clock In Now
              </button>
              <button className={styles.clockInDismiss} onClick={() => setShowClockInWarning(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
