import { create } from 'zustand';

interface AuthState {
  isAuthenticated: boolean;
  userRole: 'admin' | 'business' | null;
  businessId: string | null;
  businessName: string | null;
  businessLogo: string | null;
  businessAddress: string | null;
  businessPhone: string | null;
  userName: string | null;
  token: string | null;
  login: (
    role: 'admin' | 'business', 
    businessId?: string, 
    businessName?: string, 
    token?: string, 
    businessLogo?: string,
    userName?: string,
    businessAddress?: string,
    businessPhone?: string
  ) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: localStorage.getItem('sika_portal_auth') === 'true',
  userRole: localStorage.getItem('sika_portal_role') as 'admin' | 'business' | null,
  businessId: localStorage.getItem('sika_portal_bid'),
  businessName: localStorage.getItem('sika_portal_bname'),
  businessLogo: localStorage.getItem('sika_portal_blogo'),
  businessAddress: localStorage.getItem('sika_portal_baddr'),
  businessPhone: localStorage.getItem('sika_portal_bphone'),
  userName: localStorage.getItem('sika_portal_uname'),
  token: localStorage.getItem('sika_portal_token'),

  login: (role, businessId, businessName, token, businessLogo, userName, businessAddress, businessPhone) => {
    localStorage.setItem('sika_portal_auth', 'true');
    localStorage.setItem('sika_portal_role', role);
    if (businessId) localStorage.setItem('sika_portal_bid', businessId);
    if (businessName) localStorage.setItem('sika_portal_bname', businessName);
    if (businessLogo) localStorage.setItem('sika_portal_blogo', businessLogo);
    if (businessAddress) localStorage.setItem('sika_portal_baddr', businessAddress);
    if (businessPhone) localStorage.setItem('sika_portal_bphone', businessPhone);
    if (userName) localStorage.setItem('sika_portal_uname', userName);
    if (token) localStorage.setItem('sika_portal_token', token);

    set({ 
      isAuthenticated: true, 
      userRole: role, 
      businessId: businessId || null, 
      businessName: businessName || null, 
      businessLogo: businessLogo || null,
      businessAddress: businessAddress || null,
      businessPhone: businessPhone || null,
      userName: userName || null,
      token: token || null 
    });
  },

  logout: () => {
    localStorage.removeItem('sika_portal_auth');
    localStorage.removeItem('sika_portal_role');
    localStorage.removeItem('sika_portal_bid');
    localStorage.removeItem('sika_portal_bname');
    localStorage.removeItem('sika_portal_blogo');
    localStorage.removeItem('sika_portal_baddr');
    localStorage.removeItem('sika_portal_bphone');
    localStorage.removeItem('sika_portal_uname');
    localStorage.removeItem('sika_portal_token');
    set({ 
      isAuthenticated: false, 
      userRole: null, 
      businessId: null, 
      businessName: null, 
      businessLogo: null, 
      businessAddress: null,
      businessPhone: null,
      userName: null,
      token: null 
    });
  }
}));
