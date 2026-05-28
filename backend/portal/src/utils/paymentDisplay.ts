export interface SplitPaymentParts {
  split_cash?: number | string | null;
  split_momo?: number | string | null;
  change_given?: number | string | null;
}

export function paymentMethodLabel(
  method: string,
  tx?: SplitPaymentParts | null
): string {
  const m = (method || '').toLowerCase();
  const map: Record<string, string> = {
    cash: 'Cash',
    momo: 'MoMo',
    card: 'Card',
    credit: 'Credit',
    split: 'Split',
  };
  if (m === 'split' && tx) {
    const cash = Math.max(0, Number(tx.split_cash) || 0);
    const momo = Math.max(0, Number(tx.split_momo) || 0);
    if (cash > 0 || momo > 0) {
      return `Split · Cash ${cash.toFixed(2)} + MoMo ${momo.toFixed(2)}`;
    }
    return 'Split (Cash + MoMo)';
  }
  return map[m] || method;
}

export function paymentBadgeStyle(method: string): { bg: string; color: string } {
  const m = (method || '').toLowerCase();
  const styles: Record<string, { bg: string; color: string }> = {
    cash: { bg: 'rgba(16,185,129,0.1)', color: '#10B981' },
    momo: { bg: 'rgba(139,92,246,0.1)', color: '#8B5CF6' },
    card: { bg: 'rgba(59,130,246,0.1)', color: '#3B82F6' },
    credit: { bg: 'rgba(249, 115, 22, 0.1)', color: '#FB923C' },
    split: { bg: 'rgba(212, 160, 23, 0.15)', color: '#D4A017' },
  };
  return styles[m] || { bg: 'rgba(255,255,255,0.1)', color: 'var(--text-muted)' };
}
