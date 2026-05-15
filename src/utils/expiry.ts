export type ExpiryStatus = 'expired' | 'expiring' | 'ok' | 'none';

export function getExpiryStatus(
  expiryDate: string | null | undefined,
  alertMonths: number
): ExpiryStatus {
  if (!expiryDate || !String(expiryDate).trim()) return 'none';
  const exp = new Date(String(expiryDate).slice(0, 10));
  if (Number.isNaN(exp.getTime())) return 'none';

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  exp.setHours(0, 0, 0, 0);

  if (exp.getTime() < today.getTime()) return 'expired';

  const limit = new Date(today);
  limit.setMonth(limit.getMonth() + Math.max(0, alertMonths));
  if (exp.getTime() <= limit.getTime()) return 'expiring';

  return 'ok';
}

export function formatExpiryDate(expiryDate: string): string {
  const d = new Date(String(expiryDate).slice(0, 10));
  if (Number.isNaN(d.getTime())) return expiryDate;
  return d.toLocaleDateString('en-GH', { year: 'numeric', month: 'short', day: 'numeric' });
}
