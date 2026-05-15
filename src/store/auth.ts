import { create } from 'zustand';
import {
  mergeCashierNavVisibility,
  type CashierNavTabId,
  DEFAULT_CASHIER_NAV_VISIBILITY,
} from '../constants/cashierNav';

export interface User {
  id: number;
  name: string;
  role: string;
}

export interface TaxConfig {
  id: string;
  name: string;
  rate: number;
}

export interface ReceiptConfig {
  showLogo: boolean;
  showCashier: boolean;
  showCustomer: boolean;
  showTaxBreakdown: boolean;
  showOrderType: boolean;
  showOrderNote: boolean;
  showPoweredBy: boolean;
  showAddress: boolean;
  showPhone: boolean;
  showTIN: boolean;
  showBarcode: boolean;
  currency: string;
  paperSize?: string;
}

interface AuthState {
  isAuthenticated: boolean;
  isActivated: boolean;
  isSetupComplete: boolean;
  user: User | null;
  businessName: string;
  businessLogo: string | null;
  receiptFooter: string;
  taxConfig: TaxConfig[];
  receiptConfig: ReceiptConfig;
  /** Effective visibility for sidebar tabs when logged in as cashier (POS always true). */
  cashierNavVisibility: Record<CashierNavTabId, boolean>;
  login: (user: User) => void;
  logout: () => void;
  setBusinessInfo: (businessName: string) => void;
  setBusinessLogo: (logo: string | null) => void;
  setReceiptFooter: (footer: string) => void;
  setTaxConfig: (config: TaxConfig[]) => void;
  setReceiptConfig: (config: Partial<ReceiptConfig>) => void;
  setCashierNavVisibility: (jsonOrMerged: string | Record<CashierNavTabId, boolean> | null | undefined) => void;
  setActivated: (activated: boolean) => void;
  setSetupComplete: (complete: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: false,
  isActivated: false,
  isSetupComplete: false,
  user: null,
  businessName: 'My Shop',
  businessLogo: null,
  receiptFooter: 'Thank you for shopping with us!',
  taxConfig: [
    { id: 'vat', name: 'VAT', rate: 12.5 },
    { id: 'nhil', name: 'NHIL', rate: 2.5 },
    { id: 'getfund', name: 'GETFund', rate: 2.5 },
    { id: 'covid', name: 'COVID Levy', rate: 1.0 }
  ],
  cashierNavVisibility: { ...DEFAULT_CASHIER_NAV_VISIBILITY },

  receiptConfig: {
    showLogo: true,
    showCashier: true,
    showCustomer: true,
    showTaxBreakdown: true,
    showOrderType: true,
    showOrderNote: true,
    showPoweredBy: true,
    showAddress: true,
    showPhone: true,
    showTIN: true,
    showBarcode: true,
    currency: 'GH₵',
  },

  login: (user: User) => {
    set({ isAuthenticated: true, user });
  },

  logout: () => set({ isAuthenticated: false, user: null }),

  setBusinessInfo: (businessName: string) =>
    set({ businessName }),

  setBusinessLogo: (businessLogo: string | null) =>
    set({ businessLogo }),

  setReceiptFooter: (receiptFooter: string) =>
    set({ receiptFooter }),

  setTaxConfig: (taxConfig: TaxConfig[]) =>
    set({ taxConfig }),

  setReceiptConfig: (receiptConfig: Partial<ReceiptConfig>) =>
    set((state) => ({ receiptConfig: { ...state.receiptConfig, ...receiptConfig } })),

  setCashierNavVisibility: (input) =>
    set(() => ({
      cashierNavVisibility:
        typeof input === 'string' || input == null
          ? mergeCashierNavVisibility(typeof input === 'string' ? input : undefined)
          : { ...mergeCashierNavVisibility(undefined), ...input, pos: true },
    })),

  setActivated: (isActivated: boolean) =>
    set({ isActivated }),

  setSetupComplete: (isSetupComplete: boolean) =>
    set({ isSetupComplete }),
}));
