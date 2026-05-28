import { getApiUrl, API_CONFIG } from '../config/api';
import type { PortalStore } from '../store/auth';

export async function switchOwnerStore(
  businessId: string,
  authToken: string
): Promise<{
  token: string;
  businessId: string;
  businessName: string;
  businessLogo?: string | null;
  businessAddress?: string | null;
  businessPhone?: string | null;
  userName?: string | null;
}> {
  const res = await fetch(getApiUrl(API_CONFIG.ENDPOINTS.OWNER_SWITCH_STORE), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({ businessId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Could not switch store');
  return data;
}

export async function linkOwnerStore(
  licenseKey: string,
  adminPin: string,
  ownerToken: string
): Promise<PortalStore[]> {
  const res = await fetch(getApiUrl(API_CONFIG.ENDPOINTS.OWNER_LINK_STORE), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ownerToken}`,
    },
    body: JSON.stringify({ licenseKey, adminPin }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Could not link store');
  return data.stores || [];
}
