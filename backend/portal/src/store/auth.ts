import { create } from 'zustand';

interface AuthState {
  isAuthenticated: boolean;
  userRole: 'admin' | 'business' | null;
  businessId: string | null;
  businessName: string | null;
  token: string | null;
  login: (role: 'admin' | 'business', businessId?: string, businessName?: string, token?: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: localStorage.getItem('sika_portal_auth') === 'true',
  userRole: localStorage.getItem('sika_portal_role') as 'admin' | 'business' | null,
  businessId: localStorage.getItem('sika_portal_bid'),
  businessName: localStorage.getItem('sika_portal_bname'),
  token: localStorage.getItem('sika_portal_token'),

  login: (role, businessId, businessName, token) => {
    localStorage.setItem('sika_portal_auth', 'true');
    localStorage.setItem('sika_portal_role', role);
    if (businessId) localStorage.setItem('sika_portal_bid', businessId);
    if (businessName) localStorage.setItem('sika_portal_bname', businessName);
    if (token) localStorage.setItem('sika_portal_token', token);

    set({ isAuthenticated: true, userRole: role, businessId: businessId || null, businessName: businessName || null, token: token || null });
  },

  logout: () => {
    localStorage.removeItem('sika_portal_auth');
    localStorage.removeItem('sika_portal_role');
    localStorage.removeItem('sika_portal_bid');
    localStorage.removeItem('sika_portal_bname');
    localStorage.removeItem('sika_portal_token');
    set({ isAuthenticated: false, userRole: null, businessId: null, businessName: null, token: null });
  }
}));
