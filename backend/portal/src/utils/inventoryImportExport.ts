/**
 * Portal inventory export columns — must match POS template
 * (electron/utils/inventory-import-export.ts).
 */

export const INVENTORY_COLUMN_ORDER = [
  'Product Name',
  'Barcode',
  'Category',
  'Unit',
  'Product has packs (0 or 1)',
  'Pack Label',
  'Pack Size',
  'Size',
  'Selling Price',
  'Pack Price',
  'Cost Price',
  'Stock Quantity',
  'Low Stock Threshold',
  'Tax Category (standard/zero_rated/exempt)',
  'Expiry product (0 or 1)',
  'Expiry Date (YYYY-MM-DD)',
  'Expiry alert months',
  'Batch Number',
  'NAFDAC Number',
  'Track Stock (0 or 1)',
  'Stock Unit (single/pack)',
] as const;

export type InventoryColumnKey = (typeof INVENTORY_COLUMN_ORDER)[number];

function inferProductHasPacks(product: Record<string, unknown>): boolean {
  if (product.pack_size != null && Number(product.pack_size) > 1) return true;
  if (product.pack_price != null && product.pack_price !== '' && Number(product.pack_price) > 0) return true;
  if (product.stock_unit === 'pack') return true;
  return false;
}

export function productToExportRow(product: Record<string, unknown>): Record<InventoryColumnKey, string | number> {
  const hasPack = inferProductHasPacks(product);

  return {
    'Product Name': String(product.name ?? ''),
    'Barcode': String(product.barcode ?? ''),
    'Category': String(product.category ?? 'General'),
    'Unit': String(product.unit ?? 'each'),
    'Product has packs (0 or 1)': hasPack ? 1 : 0,
    'Pack Label': hasPack ? String(product.pack_label ?? 'Box') : '',
    'Pack Size': hasPack ? Math.max(1, Number(product.pack_size) || 1) : '',
    'Size': String(product.size ?? ''),
    'Selling Price': Number(product.unit_price ?? 0),
    'Pack Price': hasPack && product.pack_price != null && product.pack_price !== ''
      ? Number(product.pack_price)
      : '',
    'Cost Price': Number(product.cost_price ?? 0),
    'Stock Quantity': Number(product.stock_qty ?? 0),
    'Low Stock Threshold': Number(product.low_stock_threshold ?? 5),
    'Tax Category (standard/zero_rated/exempt)': String(product.tax_category ?? 'standard'),
    'Expiry product (0 or 1)': product.is_pharmacy ? 1 : 0,
    'Expiry Date (YYYY-MM-DD)': product.expiry_date
      ? String(product.expiry_date).slice(0, 10)
      : '',
    'Expiry alert months':
      product.expiry_alert_months === null || product.expiry_alert_months === undefined
        ? ''
        : Number(product.expiry_alert_months),
    'Batch Number': String(product.batch_number ?? ''),
    'NAFDAC Number': String(product.nafdac_number ?? ''),
    'Track Stock (0 or 1)': 1,
    'Stock Unit (single/pack)': String(product.stock_unit ?? 'single'),
  };
}

export function rowsToCsv(rows: Record<InventoryColumnKey, string | number>[]): string {
  const escape = (val: string | number) => {
    const s = String(val ?? '');
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  return [
    INVENTORY_COLUMN_ORDER.join(','),
    ...rows.map((row) => INVENTORY_COLUMN_ORDER.map((h) => escape(row[h])).join(',')),
  ].join('\n');
}
