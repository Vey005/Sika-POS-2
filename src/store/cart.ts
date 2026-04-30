import { create } from 'zustand';

// Ghana Tax Rates 2024
const VAT = 0.125;
const NHIL = 0.025;
const GETFUND = 0.025;
const COVID = 0.01;

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function calcTax(subtotal: number, taxCategory: string): TaxBreakdown {
  if (taxCategory !== 'standard' || subtotal <= 0) {
    return { subtotal, vat: 0, nhil: 0, getfund: 0, covid: 0, totalTax: 0, grandTotal: subtotal };
  }
  const vat = subtotal * VAT;
  const nhil = subtotal * NHIL;
  const getfund = subtotal * GETFUND;
  const covid = subtotal * COVID;
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
  addItem: (product: Product) => void;
  removeItem: (productId: number) => void;
  setQuantity: (productId: number, qty: number) => void;
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

  addItem: (product: Product) => {
    set(state => {
      const existing = state.items.find(i => i.product_id === product.id);
      if (existing) {
        return {
          items: state.items.map(i =>
            i.product_id === product.id
              ? { ...i, quantity: i.quantity + 1 }
              : i
          ),
        };
      }
      const newItem: CartItem = {
        product_id: product.id,
        product_name: product.name,
        product_barcode: product.barcode,
        product_size: product.size,
        category: product.category,
        quantity: 1,
        unit_price: product.unit_price,
        cost_price: product.cost_price,
        stock_qty: product.stock_qty,
        is_inventory: product.is_inventory,
        tax_category: product.tax_category,
      };
      return { items: [...state.items, newItem] };
    });
  },

  removeItem: (productId: number) => {
    set(state => ({ items: state.items.filter(i => i.product_id !== productId) }));
  },

  setQuantity: (productId: number, qty: number) => {
    if (qty <= 0) {
      get().removeItem(productId);
      return;
    }
    set(state => ({
      items: state.items.map(i =>
        i.product_id === productId ? { ...i, quantity: qty } : i
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
    set({
      items: data.items || [],
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
