export type ReportDateFilter =
  | 'today'
  | 'yesterday'
  | 'lastWeek'
  | 'thisMonth'
  | 'lastMonth'
  | 'allTime'
  | 'custom';

export interface ReportDateRange {
  from: string;
  to: string;
  label: string;
}

/** Local YYYY-MM-DD (avoids UTC shift from toISOString). */
export function formatDateOnly(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDisplay(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/** Same range logic as the on-screen reports list. */
export function getReportDateRange(
  dateFilter: ReportDateFilter,
  customDate: string,
  customDateTo: string
): ReportDateRange {
  const today = new Date();
  const todayStr = formatDateOnly(today);

  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const yesterdayStr = formatDateOnly(yesterday);

  let fromStr: string;
  let toStr: string;
  let label: string;

  switch (dateFilter) {
    case 'today':
      fromStr = todayStr;
      toStr = todayStr;
      label = `Today — ${formatDisplay(todayStr)}`;
      break;
    case 'yesterday':
      fromStr = yesterdayStr;
      toStr = yesterdayStr;
      label = `Yesterday — ${formatDisplay(yesterdayStr)}`;
      break;
    case 'lastWeek': {
      const weekEnd = new Date(today);
      weekEnd.setDate(today.getDate() - 1);
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - 7);
      fromStr = formatDateOnly(weekStart);
      toStr = formatDateOnly(weekEnd);
      label = `Last 7 days — ${formatDisplay(fromStr)} to ${formatDisplay(toStr)}`;
      break;
    }
    case 'thisMonth':
      fromStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
      toStr = todayStr;
      label = `This month — ${formatDisplay(fromStr)} to ${formatDisplay(toStr)}`;
      break;
    case 'lastMonth': {
      const lmStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const lmEnd = new Date(today.getFullYear(), today.getMonth(), 0);
      fromStr = formatDateOnly(lmStart);
      toStr = formatDateOnly(lmEnd);
      label = `Last month — ${formatDisplay(fromStr)} to ${formatDisplay(toStr)}`;
      break;
    }
    case 'allTime':
      fromStr = '2000-01-01';
      toStr = todayStr;
      label = `All time — through ${formatDisplay(toStr)}`;
      break;
    case 'custom':
      fromStr = customDate || todayStr;
      toStr = customDateTo || customDate || todayStr;
      if (fromStr > toStr) {
        [fromStr, toStr] = [toStr, fromStr];
      }
      label =
        fromStr === toStr
          ? formatDisplay(fromStr)
          : `${formatDisplay(fromStr)} to ${formatDisplay(toStr)}`;
      break;
    default:
      fromStr = todayStr;
      toStr = todayStr;
      label = `Today — ${formatDisplay(todayStr)}`;
  }

  return { from: fromStr, to: toStr, label };
}

export function validateCustomDateRange(
  dateFilter: ReportDateFilter,
  customDate: string
): string | null {
  if (dateFilter === 'custom' && !customDate.trim()) {
    return 'Please select a start date for the custom range.';
  }
  return null;
}
