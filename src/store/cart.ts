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
<<<<<<< HEAD
  addItem: (product: Product, saleUnit?: 'single' | 'pack') => void;
  removeItem: (cartKey: string) => void;
  setQuantity: (cartKey: string, qty: number) => void;
=======
  addItem: (product: Product) => void;
  removeItem: (productId: number) => void;
  setQuantity: (productId: number, qty: number) => void;
>>>>>>> 3f9ceb5465a3e53b5e5300921300cc3a0983f1cf
  applyDiscount: (amount: number, type: 'percentage' | 'fixed') => void;
  setCustomer: (id: number, name: string, creditBalance: number) => void;
  clearCustomer: () => void;
  clearCart: () => void;
  clearDiscount: () => void;
  setOrderType: (type: 'dine-in' | 'takeaway' | 'retail') => void;
  setOrderNote: (note: string) => void;
  loadCart: (data: any) => void;
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
    return round2(get().items.reduce((s, i) => s + i.unit_price * i.quantity, 0));
  },

  taxBreakdown: () => {
    const { items, discountAmount, discountType } = get();
    const rawSubtotal = items.reduce((s, i) => s + i.unit_price * i.quantity, 0);
    const discAmt = discountType === 'percentage'
      ? rawSubtotal * (discountAmount / 100)
      : discountAmount;
    const discountedSubtotal = Math.max(0, rawSubtotal - discAmt);

    // Only apply tax to standard items proportionally
    const standardSubtotal = items
      .filter(i => i.tax_category === 'standard')
      .reduce((s, i) => s + i.unit_price * i.quantity, 0);

    const ratio = rawSubtotal > 0 ? discountedSubtotal / rawSubtotal : 1;
    const adjustedStandard = round2(standardSubtotal * ratio);

    return calcTax(adjustedStandard, 'standard');
  },

  grandTotal: () => {
    const { items, discountAmount, discountType } = get();
    const rawSubtotal = items.reduce((s, i) => s + i.unit_price * i.quantity, 0);
    const discAmt = discountType === 'percentage'
      ? rawSubtotal * (discountAmount / 100)
      : discountAmount;
    const discountedSubtotal = Math.max(0, rawSubtotal - discAmt);
    const tax = get().taxBreakdown();
    return round2(discountedSubtotal + tax.totalTax);
  },

  itemCount: () => get().items.reduce((s, i) => s + i.quantity, 0),

<<<<<<< HEAD
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
=======
  addItem: (product: Product) => {
    set(state => {
      const existing = state.items.find(i => i.product_id === product.id);
      if (existing) {
        return {
          items: state.items.map(i =>
            i.product_id === product.id
>>>>>>> 3f9ceb5465a3e53b5e5300921300cc3a0983f1cf
              ? { ...i, quantity: i.quantity + 1 }
              : i
          ),
        };
      }
      const newItem: CartItem = {
<<<<<<< HEAD
        cart_key: cartKey,
=======
>>>>>>> 3f9ceb5465a3e53b5e5300921300cc3a0983f1cf
        product_id: product.id,
        product_name: product.name,
        product_barcode: product.barcode,
        product_size: product.size,
        category: product.category,
        quantity: 1,
<<<<<<< HEAD
        sale_unit: saleUnit,
        stock_unit: product.stock_unit || 'single',
        unit_multiplier: multiplier,
        unit_price: unitPrice,
=======
        unit_price: product.unit_price,
>>>>>>> 3f9ceb5465a3e53b5e5300921300cc3a0983f1cf
        cost_price: product.cost_price,
        stock_qty: product.stock_qty,
        is_inventory: product.is_inventory,
        tax_category: product.tax_category,
      };
      return { items: [...state.items, newItem] };
    });
  },

<<<<<<< HEAD
  removeItem: (cartKey: string) => {
    set(state => ({ items: state.items.filter(i => i.cart_key !== cartKey) }));
  },

  setQuantity: (cartKey: string, qty: number) => {
    if (qty <= 0) {
      get().removeItem(cartKey);
=======
  removeItem: (productId: number) => {
    set(state => ({ items: state.items.filter(i => i.product_id !== productId) }));
  },

  setQuantity: (productId: number, qty: number) => {
    if (qty <= 0) {
      get().removeItem(productId);
>>>>>>> 3f9ceb5465a3e53b5e5300921300cc3a0983f1cf
      return;
    }
    set(state => ({
      items: state.items.map(i =>
<<<<<<< HEAD
        i.cart_key === cartKey ? { ...i, quantity: qty } : i
=======
        i.product_id === productId ? { ...i, quantity: qty } : i
>>>>>>> 3f9ceb5465a3e53b5e5300921300cc3a0983f1cf
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
<<<<<<< HEAD
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
=======
    set({
      items: data.items || [],
>>>>>>> 3f9ceb5465a3e53b5e5300921300cc3a0983f1cf
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
}));
