import { create } from 'zustand';

export interface User {
  id: number;
  name: string;
  role: string;
}

interface AuthState {
  isAuthenticated: boolean;
  isActivated: boolean;
  isSetupComplete: boolean;
  user: User | null;
  businessName: string;
  businessLogo: string | null;
  receiptFooter: string;
  login: (user: User) => void;
  logout: () => void;
  setBusinessInfo: (businessName: string) => void;
  setBusinessLogo: (logo: string | null) => void;
  setReceiptFooter: (footer: string) => void;
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

  setActivated: (isActivated: boolean) =>
    set({ isActivated }),

  setSetupComplete: (isSetupComplete: boolean) =>
    set({ isSetupComplete }),
}));
