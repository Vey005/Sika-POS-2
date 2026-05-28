import { create } from 'zustand';

export interface PortalStore {
  businessId: string;
  businessName: string;
  businessLogo?: string | null;
  businessAddress?: string | null;
  businessPhone?: string | null;
  status?: string;
}

interface AuthState {
  isAuthenticated: boolean;
  userRole: 'admin' | 'business' | 'owner' | null;
  businessId: string | null;
  businessName: string | null;
  businessLogo: string | null;
  businessAddress: string | null;
  businessPhone: string | null;
  userName: string | null;
  token: string | null;
  ownerToken: string | null;
  ownerName: string | null;
  stores: PortalStore[];
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
  setOwnerSession: (token: string, ownerName: string, stores: PortalStore[]) => void;
  setBusinessSession: (data: {
    token: string;
    businessId: string;
    businessName: string;
    businessLogo?: string | null;
    businessAddress?: string | null;
    businessPhone?: string | null;
    userName?: string | null;
  }) => void;
  setStores: (stores: PortalStore[]) => void;
  logout: () => void;
}

function loadStores(): PortalStore[] {
  try {
    const raw = localStorage.getItem('sika_portal_stores');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: localStorage.getItem('sika_portal_auth') === 'true',
  userRole: localStorage.getItem('sika_portal_role') as 'admin' | 'business' | 'owner' | null,
  businessId: localStorage.getItem('sika_portal_bid'),
  businessName: localStorage.getItem('sika_portal_bname'),
  businessLogo: localStorage.getItem('sika_portal_blogo'),
  businessAddress: localStorage.getItem('sika_portal_baddr'),
  businessPhone: localStorage.getItem('sika_portal_bphone'),
  userName: localStorage.getItem('sika_portal_uname'),
  token: localStorage.getItem('sika_portal_token'),
  ownerToken: localStorage.getItem('sika_portal_owner_token'),
  ownerName: localStorage.getItem('sika_portal_owner_name'),
  stores: loadStores(),

  login: (role, businessId, businessName, token, businessLogo, userName, businessAddress, businessPhone) => {
    localStorage.setItem('sika_portal_auth', 'true');
    localStorage.setItem('sika_portal_role', role);
    if (businessId) localStorage.setItem('sika_portal_bid', businessId);
    if (businessName) localStorage.setItem('sika_portal_bname', businessName);
    if (businessLogo) localStorage.setItem('sika_portal_blogo', businessLogo);
    else localStorage.removeItem('sika_portal_blogo');
    if (businessAddress) localStorage.setItem('sika_portal_baddr', businessAddress);
    else localStorage.removeItem('sika_portal_baddr');
    if (businessPhone) localStorage.setItem('sika_portal_bphone', businessPhone);
    else localStorage.removeItem('sika_portal_bphone');
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
      token: token || null,
    });
  },

  setOwnerSession: (token, ownerName, stores) => {
    localStorage.setItem('sika_portal_auth', 'true');
    localStorage.setItem('sika_portal_role', 'owner');
    localStorage.setItem('sika_portal_owner_token', token);
    localStorage.setItem('sika_portal_owner_name', ownerName);
    localStorage.setItem('sika_portal_stores', JSON.stringify(stores));
    localStorage.removeItem('sika_portal_bid');
    localStorage.removeItem('sika_portal_bname');
    localStorage.removeItem('sika_portal_token');

    set({
      isAuthenticated: true,
      userRole: 'owner',
      ownerToken: token,
      ownerName,
      stores,
      token: null,
      businessId: null,
      businessName: null,
      businessLogo: null,
      businessAddress: null,
      businessPhone: null,
      userName: ownerName,
    });
  },

  setBusinessSession: (data) => {
    localStorage.setItem('sika_portal_auth', 'true');
    localStorage.setItem('sika_portal_role', 'business');
    localStorage.setItem('sika_portal_bid', data.businessId);
    localStorage.setItem('sika_portal_bname', data.businessName);
    localStorage.setItem('sika_portal_token', data.token);
    // Keep ownerToken + stores when an owner switches into a store
    if (data.businessLogo) localStorage.setItem('sika_portal_blogo', data.businessLogo);
    else localStorage.removeItem('sika_portal_blogo');
    if (data.businessAddress) localStorage.setItem('sika_portal_baddr', data.businessAddress);
    else localStorage.removeItem('sika_portal_baddr');
    if (data.businessPhone) localStorage.setItem('sika_portal_bphone', data.businessPhone);
    else localStorage.removeItem('sika_portal_bphone');
    if (data.userName) localStorage.setItem('sika_portal_uname', data.userName);

    set((state) => ({
      isAuthenticated: true,
      userRole: 'business',
      token: data.token,
      businessId: data.businessId,
      businessName: data.businessName,
      businessLogo: data.businessLogo ?? null,
      businessAddress: data.businessAddress ?? null,
      businessPhone: data.businessPhone ?? null,
      userName: data.userName ?? null,
      ownerToken: state.ownerToken,
      ownerName: state.ownerName,
      stores: state.stores,
    }));
  },

  setStores: (stores) => {
    localStorage.setItem('sika_portal_stores', JSON.stringify(stores));
    set({ stores });
  },

  logout: () => {
    [
      'sika_portal_auth',
      'sika_portal_role',
      'sika_portal_bid',
      'sika_portal_bname',
      'sika_portal_blogo',
      'sika_portal_baddr',
      'sika_portal_bphone',
      'sika_portal_uname',
      'sika_portal_token',
      'sika_portal_owner_token',
      'sika_portal_owner_name',
      'sika_portal_stores',
    ].forEach((k) => localStorage.removeItem(k));
    set({
      isAuthenticated: false,
      userRole: null,
      businessId: null,
      businessName: null,
      businessLogo: null,
      businessAddress: null,
      businessPhone: null,
      userName: null,
      token: null,
      ownerToken: null,
      ownerName: null,
      stores: [],
    });
  },
}));
