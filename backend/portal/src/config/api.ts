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
    ADMIN_PURGE_DUPLICATES: '/api/portal/admin/purge-duplicates'
  }
};

// Helper function to get full API URL
export const getApiUrl = (endpoint: string): string => {
  return `${API_CONFIG.BASE_URL}${endpoint}`;
};