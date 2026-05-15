/** Format aggregated stock-unit totals for EOD summaries. */
export function formatStockUnitsSold(qty: unknown): string {
  const q = Number(qty);
  if (!Number.isFinite(q)) return '0';
  return !Number.isInteger(q) ? q.toFixed(2) : String(Math.round(q));
}

/** Quantity label for EOD report transaction lines (matches receipt box wording). */
export function formatReportTransactionItemQty(item: {
  quantity: number;
  sale_unit?: string | null;
  unit_multiplier?: number | null;
}): string {
  const q = Number(item.quantity) || 0;
  const mult = Math.max(1, Number(item.unit_multiplier ?? 1));
  if (String(item.sale_unit || '').toLowerCase() === 'pack' && mult > 1) {
    return `${q} [Box ×${mult}]`;
  }
  return String(q);
}
