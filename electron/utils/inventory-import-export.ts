/**
 * Canonical inventory import template / export columns (matches Add Product form).
 * Keep portal export headers in sync (backend/portal/src/utils/inventoryImportExport.ts).
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

export const INVENTORY_TEMPLATE_SAMPLE: Record<InventoryColumnKey, string | number> = {
  'Product Name': 'Demo Product',
  'Barcode': '1234567890',
  'Category': 'General',
  'Unit': 'each',
  'Product has packs (0 or 1)': 1,
  'Pack Label': 'Box',
  'Pack Size': 10,
  'Size': '500ml',
  'Selling Price': 10.0,
  'Pack Price': 90.0,
  'Cost Price': 7.0,
  'Stock Quantity': 100,
  'Low Stock Threshold': 5,
  'Tax Category (standard/zero_rated/exempt)': 'standard',
  'Expiry product (0 or 1)': 0,
  'Expiry Date (YYYY-MM-DD)': '',
  'Expiry alert months': '',
  'Batch Number': '',
  'NAFDAC Number': '',
  'Track Stock (0 or 1)': 1,
  'Stock Unit (single/pack)': 'single',
};

/** Matches Add Product → “Product has packs (for bulk / box sales)” checkbox. */
export function inferProductHasPacks(product: Record<string, unknown>): boolean {
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
    'Selling Price': Number(product.unit_price ?? product.price ?? 0),
    'Pack Price': hasPack && product.pack_price != null && product.pack_price !== ''
      ? Number(product.pack_price)
      : '',
    'Cost Price': Number(product.cost_price ?? 0),
    'Stock Quantity': Number(product.stock_qty ?? product.stock ?? 0),
    'Low Stock Threshold': Number(product.low_stock_threshold ?? 5),
    'Tax Category (standard/zero_rated/exempt)': String(product.tax_category ?? 'standard'),
    'Expiry product (0 or 1)': product.is_pharmacy ? 1 : 0,
    'Expiry Date (YYYY-MM-DD)': product.expiry_date ? String(product.expiry_date).slice(0, 10) : '',
    'Expiry alert months':
      product.expiry_alert_months === null || product.expiry_alert_months === undefined
        ? ''
        : Number(product.expiry_alert_months),
    'Batch Number': String(product.batch_number ?? ''),
    'NAFDAC Number': String(product.nafdac_number ?? ''),
    'Track Stock (0 or 1)': product.is_inventory !== undefined && product.is_inventory !== null
      ? product.is_inventory ? 1 : 0
      : 1,
    'Stock Unit (single/pack)': String(product.stock_unit ?? 'single'),
  };
}

/** Read import row with canonical + legacy header aliases. */
export function parseImportItem(item: Record<string, unknown>) {
  const str = (keys: string[]) => {
    for (const k of keys) {
      const v = item[k];
      if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
    }
    return '';
  };
  const num = (keys: string[], fallback = 0) => {
    for (const k of keys) {
      const v = item[k];
      if (v !== undefined && v !== null && v !== '') {
        const n = parseFloat(String(v));
        if (Number.isFinite(n)) return n;
      }
    }
    return fallback;
  };
  const int = (keys: string[], fallback = 0) => {
    for (const k of keys) {
      const v = item[k];
      if (v !== undefined && v !== null && v !== '') {
        const n = parseInt(String(v), 10);
        if (Number.isFinite(n)) return n;
      }
    }
    return fallback;
  };
  const intOrNull = (keys: string[]) => {
    for (const k of keys) {
      const v = item[k];
      if (v === undefined || v === null || v === '') continue;
      const n = parseInt(String(v), 10);
      if (Number.isFinite(n)) return n;
    }
    return null;
  };
  const packPriceRaw = item['Pack Price'] ?? item['pack_price'];
  let packPrice: number | null = null;
  if (packPriceRaw !== undefined && packPriceRaw !== null && packPriceRaw !== '') {
    const parsed = parseFloat(String(packPriceRaw));
    if (Number.isFinite(parsed)) packPrice = parsed;
  }

  const hasPacksRaw = item['Product has packs (0 or 1)'] ?? item['has_packs'] ?? item['has_pack'];
  let hasPacks: boolean;
  if (hasPacksRaw !== undefined && hasPacksRaw !== null && String(hasPacksRaw).trim() !== '') {
    hasPacks = int(['Product has packs (0 or 1)', 'has_packs', 'has_pack'], 0) === 1;
  } else {
    hasPacks =
      Math.max(1, int(['Pack Size', 'pack_size'], 1)) > 1 ||
      (packPrice != null && packPrice > 0) ||
      str(['Stock Unit (single/pack)', 'stock_unit']) === 'pack';
  }

  const packLabel = str(['Pack Label', 'pack_label']) || 'Box';
  const packSize = Math.max(1, int(['Pack Size', 'pack_size'], 1));
  let stockUnit = str(['Stock Unit (single/pack)', 'stock_unit']) || 'single';

  if (!hasPacks) {
    return {
      name: str(['Product Name', 'Name', 'name']) || 'Unknown Item',
      barcode: str(['Barcode', 'barcode']) || null,
      category: str(['Category', 'category']) || 'General',
      unit_price: num(['Selling Price', 'Unit Price', 'Price', 'unit_price']),
      cost_price: num(['Cost Price', 'Cost', 'cost_price']),
      stock_qty: int(['Stock Quantity', 'Stock Qty', 'Stock', 'stock_qty']),
      low_stock_threshold: int(['Low Stock Threshold', 'low_stock_threshold'], 5),
      tax_category: str(['Tax Category (standard/zero_rated/exempt)', 'Tax Category', 'tax_category']) || 'standard',
      is_pharmacy: int(['Expiry product (0 or 1)', 'Pharmacy (0 or 1)', 'is_pharmacy']),
      is_inventory: (() => {
        const raw = item['Track Stock (0 or 1)'] ?? item['is_inventory'];
        if (raw === undefined || raw === null || raw === '') return 1;
        return int(['Track Stock (0 or 1)', 'is_inventory'], 1);
      })(),
      unit: str(['Unit', 'unit']) || 'each',
      pack_label: 'Box',
      pack_size: 1,
      pack_price: null,
      size: str(['Size', 'size']) || null,
      stock_unit: 'single',
      expiry_date: str(['Expiry Date (YYYY-MM-DD)', 'Expiry Date', 'expiry_date']) || null,
      expiry_alert_months: intOrNull(['Expiry alert months', 'expiry_alert_months']),
      batch_number: str(['Batch Number', 'batch_number']) || null,
      nafdac_number: str(['NAFDAC Number', 'nafdac_number']) || null,
    };
  }

  return {
    name: str(['Product Name', 'Name', 'name']) || 'Unknown Item',
    barcode: str(['Barcode', 'barcode']) || null,
    category: str(['Category', 'category']) || 'General',
    unit_price: num(['Selling Price', 'Unit Price', 'Price', 'unit_price']),
    cost_price: num(['Cost Price', 'Cost', 'cost_price']),
    stock_qty: int(['Stock Quantity', 'Stock Qty', 'Stock', 'stock_qty']),
    low_stock_threshold: int(['Low Stock Threshold', 'low_stock_threshold'], 5),
    tax_category: str(['Tax Category (standard/zero_rated/exempt)', 'Tax Category', 'tax_category']) || 'standard',
    is_pharmacy: int(['Expiry product (0 or 1)', 'Pharmacy (0 or 1)', 'is_pharmacy']),
    is_inventory: (() => {
      const raw = item['Track Stock (0 or 1)'] ?? item['is_inventory'];
      if (raw === undefined || raw === null || raw === '') return 1;
      return int(['Track Stock (0 or 1)', 'is_inventory'], 1);
    })(),
    unit: str(['Unit', 'unit']) || 'each',
    pack_label: packLabel,
    pack_size: packSize,
    pack_price: packPrice,
    size: str(['Size', 'size']) || null,
    stock_unit: stockUnit === 'pack' ? 'pack' : 'single',
    expiry_date: str(['Expiry Date (YYYY-MM-DD)', 'Expiry Date', 'expiry_date']) || null,
    expiry_alert_months: intOrNull(['Expiry alert months', 'expiry_alert_months']),
    batch_number: str(['Batch Number', 'batch_number']) || null,
    nafdac_number: str(['NAFDAC Number', 'nafdac_number']) || null,
  };
}

export function rowsToCsv(rows: Record<InventoryColumnKey, string | number>[]): string {
  const escape = (val: string | number) => {
    const s = String(val ?? '');
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [
    INVENTORY_COLUMN_ORDER.join(','),
    ...rows.map((row) => INVENTORY_COLUMN_ORDER.map((h) => escape(row[h])).join(',')),
  ];
  return lines.join('\n');
}
