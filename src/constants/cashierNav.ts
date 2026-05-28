/** Sidebar tabs that can be shown or hidden for cashier accounts (POS is always on). */
export const CASHIER_NAV_TAB_IDS = [
  'pos',
  'inventory',
  'restock',
  'customers',
  'dashboard',
  'reports',
  'settings',
] as const;

export type CashierNavTabId = (typeof CASHIER_NAV_TAB_IDS)[number];

/** Defaults when no saved settings exist yet (matches prior hard-coded cashier experience). */
export const DEFAULT_CASHIER_NAV_VISIBILITY: Record<CashierNavTabId, boolean> = {
  pos: true,
  inventory: false,
  restock: false,
  customers: true,
  dashboard: true,
  reports: false,
  settings: false,
};

export function mergeCashierNavVisibility(json: string | null | undefined): Record<CashierNavTabId, boolean> {
  const out = { ...DEFAULT_CASHIER_NAV_VISIBILITY };
  if (!json) return out;
  try {
    const parsed = JSON.parse(json) as Record<string, unknown>;
    for (const key of CASHIER_NAV_TAB_IDS) {
      if (typeof parsed[key] === 'boolean') {
        out[key] = parsed[key] as boolean;
      }
    }
  } catch {
    /* keep defaults */
  }
  out.pos = true;
  return out;
}

/** Shop defaults merged with optional per-user JSON (boolean keys override). User JSON null/empty = shop only. */
export function resolveCashierNavForUser(
  shopNavJson: string | null | undefined,
  userOverrideJson: string | null | undefined,
): Record<CashierNavTabId, boolean> {
  const base = mergeCashierNavVisibility(shopNavJson);
  if (userOverrideJson == null || String(userOverrideJson).trim() === '') return base;
  try {
    const u = JSON.parse(userOverrideJson) as Record<string, unknown>;
    const out = { ...base };
    for (const key of CASHIER_NAV_TAB_IDS) {
      if (typeof u[key] === 'boolean') {
        out[key] = u[key] as boolean;
      }
    }
    out.pos = true;
    return out;
  } catch {
    return base;
  }
}
