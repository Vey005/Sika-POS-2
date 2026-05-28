// API Configuration for SikaPOS Portal
// This should match your deployed API server

export const API_CONFIG = {
  BASE_URL: import.meta.env.VITE_API_BASE_URL || 'https://sikapos-api-production.up.railway.app',
  ENDPOINTS: {
    LOGIN: '/api/portal/login',
    DASHBOARD_SUMMARY: '/api/portal/dashboard/summary',
    INVENTORY: '/api/portal/inventory',
    SALES: '/api/portal/sales',
    ADMIN_LICENSES: '/api/portal/admin/licenses',
    ADMIN_GENERATE_LICENSE: '/api/portal/admin/licenses/generate',
    ADMIN_PURGE_DUPLICATES: '/api/portal/admin/purge-duplicates',
    ADMIN_SUPER_ADMINS: '/api/portal/admin/super-admins',
    ADMIN_RELEASES: '/api/portal/admin/releases',
    OWNER_REGISTER: '/api/portal/owners/register',
    OWNER_LOGIN: '/api/portal/owners/login',
    OWNER_STORES: '/api/portal/owners/stores',
    OWNER_LINK_STORE: '/api/portal/owners/link-store',
    OWNER_SWITCH_STORE: '/api/portal/owners/switch-store',
    ADMIN_OWNER_LINK_LICENSE: '/api/portal/admin/owners/link-license',
    RESTOCK: '/api/portal/restock',
    INVENTORY_SEARCH: '/api/portal/inventory/search',
    INVENTORY_CATEGORIES: '/api/portal/inventory/categories',
  }
};

// Helper function to get full API URL
export const getApiUrl = (endpoint: string): string => {
  return `${API_CONFIG.BASE_URL}${endpoint}`;
};