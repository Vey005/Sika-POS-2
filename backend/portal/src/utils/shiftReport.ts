/** Build shift report payloads for portal print / Save-as-PDF. */

export interface ShiftLogLike {
  user_name: string;
  clock_in: string;
  clock_out?: string | null;
}

export interface ShiftSummaryLike {
  total_revenue?: number;
  transaction_count?: number;
  cash_total?: number;
  momo_total?: number;
  card_total?: number;
  credit_total?: number;
  debt_recovered?: number;
}

export interface ShiftTransactionLike {
  receipt_number?: string;
  created_at: string;
  grand_total: number | string;
  payment_method?: string;
  status?: string;
  items?: Array<{
    product_name?: string;
    quantity?: number;
    line_total?: number;
    product_size?: string | null;
    sale_unit?: string | null;
    unit_multiplier?: number | null;
  }>;
}

export function formatShiftDuration(clockIn: string, clockOut?: string | null): string {
  const start = new Date(clockIn);
  const end = clockOut ? new Date(clockOut) : new Date();
  const mins = Math.max(0, Math.round((end.getTime() - start.getTime()) / (1000 * 60)));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}m`;
}

export function formatShiftReportFileDate(clockIn: string): string {
  const d = new Date(clockIn);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function formatShiftReportDateLabel(clockIn: string, clockOut?: string | null): string {
  const inDay = new Date(clockIn).toLocaleDateString('en-GH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  if (!clockOut) return inDay;
  const outDay = new Date(clockOut).toLocaleDateString('en-GH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  return inDay === outDay ? inDay : `${inDay} – ${outDay}`;
}

export function formatShiftTimeRange(clockIn: string, clockOut?: string | null): string {
  const inTime = new Date(clockIn).toLocaleString('en-GH');
  if (!clockOut) return `${inTime} — still on shift`;
  return `${inTime} — ${new Date(clockOut).toLocaleString('en-GH')}`;
}

export function buildItemSummaryFromTransactions(
  transactions: ShiftTransactionLike[]
): Array<{ product_name: string; total_qty: number; product_size?: string }> {
  const map = new Map<string, { product_name: string; total_qty: number; product_size?: string }>();

  for (const tx of transactions) {
    if (!tx.items?.length) continue;
    for (const item of tx.items) {
      const name = item.product_name || 'Unknown';
      const mult = Math.max(1, Number(item.unit_multiplier ?? 1));
      const qty =
        String(item.sale_unit || '').toLowerCase() === 'pack'
          ? (Number(item.quantity) || 0) * mult
          : Number(item.quantity) || 0;
      const key = `${name}|${item.product_size || ''}`;
      const prev = map.get(key);
      if (prev) {
        prev.total_qty += qty;
      } else {
        map.set(key, {
          product_name: name,
          total_qty: qty,
          product_size: item.product_size || undefined,
        });
      }
    }
  }

  return [...map.values()].sort((a, b) => b.total_qty - a.total_qty);
}

export function normalizeShiftSummary(summary: ShiftSummaryLike | null | undefined) {
  return {
    total_revenue: Number(summary?.total_revenue) || 0,
    transaction_count: Number(summary?.transaction_count) || 0,
    cash_total: Number(summary?.cash_total) || 0,
    momo_total: Number(summary?.momo_total) || 0,
    card_total: Number(summary?.card_total) || 0,
    credit_total: Number(summary?.credit_total) || 0,
    debt_recovered: Number(summary?.debt_recovered) || 0,
  };
}

export function buildShiftReportPayload(opts: {
  log: ShiftLogLike;
  summary: ShiftSummaryLike | null | undefined;
  transactions: ShiftTransactionLike[];
  businessName: string;
  businessLogo?: string;
  currency?: string;
  itemSummary?: Array<{ product_name: string; total_qty: number; product_size?: string }>;
}) {
  const { log, summary, transactions, businessName, businessLogo, currency, itemSummary } = opts;
  const normalized = normalizeShiftSummary(summary);
  const builtItemSummary = itemSummary?.length
    ? itemSummary
    : buildItemSummaryFromTransactions(transactions);

  return {
    businessName,
    businessLogo,
    currency: currency || 'GHS',
    date: formatShiftReportDateLabel(log.clock_in, log.clock_out),
    reportFileDate: formatShiftReportFileDate(log.clock_in),
    cashierName: log.user_name,
    shiftDuration: formatShiftDuration(log.clock_in, log.clock_out),
    shiftTimeRange: formatShiftTimeRange(log.clock_in, log.clock_out),
    clockIn: log.clock_in,
    clockOut: log.clock_out || undefined,
    summary: normalized,
    transactions: transactions.map((tx) => ({
      ...tx,
      grand_total: Number(tx.grand_total) || 0,
      payment_method: tx.payment_method || 'cash',
      receipt_number: tx.receipt_number || 'N/A',
    })),
    itemSummary: builtItemSummary,
  };
}
