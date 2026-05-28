import { create } from 'zustand';

import { useAuthStore } from './auth';

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function calcTax(subtotal: number, taxCategory: string): TaxBreakdown {
  if (taxCategory !== 'standard' || subtotal <= 0) {
    return { subtotal, vat: 0, nhil: 0, getfund: 0, covid: 0, totalTax: 0, grandTotal: subtotal };
  }
  
  const taxConfig = useAuthStore.getState().taxConfig;
  const getRate = (id: string) => {
    const t = taxConfig.find(x => x.id === id);
    return t ? t.rate / 100 : 0;
  };

  const vat = subtotal * getRate('vat');
  const nhil = subtotal * getRate('nhil');
  const getfund = subtotal * getRate('getfund');
  const covid = subtotal * getRate('covid');
  const totalTax = vat + nhil + getfund + covid;
  
  return {
    subtotal,
    vat: round2(vat),
    nhil: round2(nhil),
    getfund: round2(getfund),
    covid: round2(covid),
    totalTax: round2(totalTax),
    grandTotal: round2(subtotal + totalTax),
  };
}

interface CartState {
  items: CartItem[];
  customerId?: number;
  customerName?: string;
  customerCreditBalance?: number;
  discountAmount: number;
  discountType: 'percentage' | 'fixed';
  orderType: 'dine-in' | 'takeaway' | 'retail';
  orderNote: string;

  // Computed
  subtotal: () => number;
  taxBreakdown: () => TaxBreakdown;
  grandTotal: () => number;
  itemCount: () => number;

  // Actions
  addItem: (product: Product, saleUnit?: 'single' | 'pack') => void;
  removeItem: (cartKey: string) => void;
  setQuantity: (cartKey: string, qty: number) => void;
  applyDiscount: (amount: number, type: 'percentage' | 'fixed') => void;
  setCustomer: (id: number, name: string, creditBalance: number) => void;
  clearCustomer: () => void;
  clearCart: () => void;
  clearDiscount: () => void;
  setOrderType: (type: 'dine-in' | 'takeaway' | 'retail') => void;
  setOrderNote: (note: string) => void;
  loadCart: (data: any) => void;
  editItemPrice: (productId: number, saleUnit: string, newPrice: number) => void;
  refreshStockLevels: () => Promise<void>;
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  customerId: undefined,
  customerName: undefined,
  customerCreditBalance: undefined,
  discountAmount: 0,
  discountType: 'fixed',
  orderType: 'retail',
  orderNote: '',

  subtotal: () => {
    return round2(get().items.reduce((s, i) => s + (i.adjusted_price !== undefined ? i.adjusted_price : i.unit_price) * i.quantity, 0));
  },

  taxBreakdown: () => {
    const { items, discountAmount, discountType } = get();
    const rawSubtotal = items.reduce((s, i) => s + (i.adjusted_price !== undefined ? i.adjusted_price : i.unit_price) * i.quantity, 0);
    const discAmt = discountType === 'percentage'
      ? rawSubtotal * (discountAmount / 100)
      : discountAmount;
    const discountedSubtotal = Math.max(0, rawSubtotal - discAmt);

    // Check the global tax enabled setting
    const taxEnabled = useAuthStore.getState().taxEnabled;
    if (!taxEnabled) {
      return calcTax(0, 'exempt');
    }

    // When tax is globally enabled, apply tax to full discounted subtotal
    return calcTax(discountedSubtotal, 'standard');
  },

  grandTotal: () => {
    const { items, discountAmount, discountType } = get();
    const rawSubtotal = items.reduce((s, i) => s + (i.adjusted_price !== undefined ? i.adjusted_price : i.unit_price) * i.quantity, 0);
    const discAmt = discountType === 'percentage'
      ? rawSubtotal * (discountAmount / 100)
      : discountAmount;
    const discountedSubtotal = Math.max(0, rawSubtotal - discAmt);
    const tax = get().taxBreakdown();
    return round2(discountedSubtotal + tax.totalTax);
  },

  itemCount: () => get().items.reduce((s, i) => s + i.quantity, 0),

  addItem: (product: Product, saleUnit: 'single' | 'pack' = 'single') => {
    set(state => {
      const multiplier = saleUnit === 'pack' ? Math.max(1, Number(product.pack_size || 1)) : 1;
      const unitPrice = saleUnit === 'pack'
        ? Number(product.pack_price ?? (product.unit_price * multiplier))
        : product.unit_price;
      const cartKey = `${product.id}:${saleUnit}`;
      const existing = state.items.find(i => i.cart_key === cartKey);
      if (existing) {
        return {
          items: state.items.map(i =>
            i.cart_key === cartKey
              ? { ...i, quantity: i.quantity + 1, stock_qty: product.stock_qty, is_inventory: product.is_inventory ?? i.is_inventory }
              : i
          ),
        };
      }
      const newItem: CartItem = {
        cart_key: cartKey,
        product_id: product.id,
        product_name: product.name,
        product_barcode: product.barcode,
        product_size: product.size,
        category: product.category,
        quantity: 1,
        sale_unit: saleUnit,
        stock_unit: product.stock_unit || 'single',
        unit_multiplier: multiplier,
        unit_price: unitPrice,
        cost_price: product.cost_price,
        stock_qty: product.stock_qty,
        is_inventory: product.is_inventory,
        tax_category: product.tax_category,
      };
      return { items: [...state.items, newItem] };
    });
  },

  removeItem: (cartKey: string) => {
    set(state => ({ items: state.items.filter(i => i.cart_key !== cartKey) }));
  },

  setQuantity: (cartKey: string, qty: number) => {
    if (qty <= 0) {
      get().removeItem(cartKey);
      return;
    }
    set(state => ({
      items: state.items.map(i =>
        i.cart_key === cartKey ? { ...i, quantity: qty } : i
      ),
    }));
  },

  applyDiscount: (amount: number, type: 'percentage' | 'fixed') => {
    set({ discountAmount: amount, discountType: type });
  },

  setCustomer: (id: number, name: string, creditBalance: number) => {
    set({ customerId: id, customerName: name, customerCreditBalance: creditBalance });
  },

  clearCustomer: () => {
    set({ customerId: undefined, customerName: undefined, customerCreditBalance: undefined });
  },

  clearCart: () => {
    set({
      items: [],
      customerId: undefined,
      customerName: undefined,
      customerCreditBalance: undefined,
      discountAmount: 0,
      discountType: 'fixed',
      orderType: 'retail',
      orderNote: '',
    });
  },

  clearDiscount: () => set({ discountAmount: 0 }),
  
  loadCart: (data: any) => {
    const normalizedItems: CartItem[] = (data.items || []).map((i: any) => {
      const saleUnit = (i.sale_unit || i.saleUnit || 'single') as 'single' | 'pack';
      const key = i.cart_key || `${i.product_id}:${saleUnit}`;
      return {
        ...i,
        cart_key: key,
        sale_unit: saleUnit,
        unit_multiplier: Math.max(1, Number(i.unit_multiplier || i.unitMultiplier || 1)),
      };
    });
    set({
      items: normalizedItems,
      customerId: data.customerId,
      customerName: data.customerName,
      customerCreditBalance: data.customerCreditBalance,
      discountAmount: data.discountAmount || 0,
      discountType: data.discountType || 'fixed',
      orderType: data.orderType || 'retail',
      orderNote: data.orderNote || '',
    });
  },

  setOrderType: (type: 'dine-in' | 'takeaway' | 'retail') => set({ orderType: type }),
  setOrderNote: (note: string) => set({ orderNote: note }),
  
  editItemPrice: (productId: number, saleUnit: string, newPrice: number) => {
    set(state => ({
      items: state.items.map(item => {
        if (item.product_id === productId && item.sale_unit === saleUnit) {
          const origPrice = item.original_price ?? (item.sale_unit === 'pack' ? (item.unit_price * (item.unit_multiplier || 1)) : item.unit_price);
          // Wait, actually the original unit_price in cart is already the pack_price if it was added as pack.
          // Let's just use item.unit_price which represents the price at which it was added.
          return {
            ...item,
            adjusted_price: newPrice,
            original_price: item.original_price ?? item.unit_price
          };
        }
        return item;
      })
    }));
  },

  refreshStockLevels: async () => {
    const { items } = get();
    if (items.length === 0 || !window.sikapos?.inventory?.getStockLevels) return;

    const ids = [...new Set(items.map(i => i.product_id))];
    try {
      const levels = await window.sikapos.inventory.getStockLevels(ids);
      const byId = new Map(levels.map(l => [l.id, l]));
      set(state => ({
        items: state.items.map(item => {
          const live = byId.get(item.product_id);
          if (!live) return item;

          // Recalculate the correct unit_price for the sale_unit
          const isPack = item.sale_unit === 'pack';
          const packSize = Math.max(1, Number(live.pack_size || 1));
          const newUnitPrice = isPack
            ? Number(live.pack_price ?? (live.unit_price * packSize))
            : live.unit_price;

          // If the user manually edited the price AND the base price hasn't changed,
          // keep their override. If the base price changed, reset to the new price.
          const basePriceChanged = newUnitPrice !== item.unit_price;
          const adjustedPrice = basePriceChanged ? undefined : item.adjusted_price;
          const originalPrice = basePriceChanged ? undefined : item.original_price;

          return {
            ...item,
            product_name: live.name,
            product_barcode: live.barcode,
            product_size: live.size,
            category: live.category,
            unit_price: newUnitPrice,
            cost_price: live.cost_price,
            stock_qty: live.stock_qty,
            is_inventory: live.is_inventory,
            stock_unit: (live.stock_unit as 'single' | 'pack') || item.stock_unit,
            tax_category: live.tax_category,
            unit_multiplier: isPack ? packSize : 1,
            adjusted_price: adjustedPrice,
            original_price: originalPrice,
          };
        }),
      }));
    } catch (err) {
      console.error('[Cart] Failed to refresh stock levels:', err);
    }
  },
}));
