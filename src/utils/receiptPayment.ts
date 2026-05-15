export interface ReceiptPaymentInput {
  paymentMethod?: string;
  status?: string;
  total: number;
  amountTendered?: number;
  change?: number;
  paidAmount?: number;
  customerCreditBalanceAfter?: number;
  currency?: string;
}

export interface ReceiptPaymentLine {
  label: string;
  value: string;
  emphasize?: boolean;
}

export interface ReceiptPaymentDisplay {
  kind: 'voided' | 'reversed' | 'credit' | 'standard';
  statusBanner?: string;
  lines: ReceiptPaymentLine[];
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function getReceiptPaymentDisplay(input: ReceiptPaymentInput): ReceiptPaymentDisplay {
  const cur = input.currency || 'GH₵';
  const status = String(input.status || 'completed').toLowerCase();
  const pm = String(input.paymentMethod || '').toLowerCase().trim();
  const total = round2(Number(input.total) || 0);
  const paidAmount = round2(Number(input.paidAmount) || 0);
  const amountTendered = round2(Number(input.amountTendered) || 0);
  const change = round2(Number(input.change) || 0);
  const isCredit = pm === 'credit' || status === 'debt';

  if (status === 'voided' || status === 'reversed') {
    const banner = status === 'voided' ? 'VOIDED' : 'REVERSED';
    const lines: ReceiptPaymentLine[] = [
      { label: 'Payment', value: 'Not collected' },
      { label: 'Sale status', value: banner, emphasize: true },
    ];
    if (isCredit) {
      lines.push({ label: 'Account', value: 'Charge reversed — not owed' });
    }
    return { kind: status, statusBanner: banner, lines };
  }

  if (isCredit) {
    const balanceDue = round2(Math.max(0, total - paidAmount));
    const lines: ReceiptPaymentLine[] = [
      { label: 'Payment', value: 'Store credit (on account)' },
      { label: 'Sale amount', value: `${cur} ${total.toFixed(2)}` },
    ];
    if (paidAmount > 0.001) {
      lines.push({ label: 'Paid on this sale', value: `${cur} ${paidAmount.toFixed(2)}` });
    }
    if (balanceDue > 0.001) {
      lines.push({ label: 'Balance due', value: `${cur} ${balanceDue.toFixed(2)}`, emphasize: true });
    } else {
      lines.push({ label: 'Status', value: 'Settled in full' });
    }
    if (
      input.customerCreditBalanceAfter != null &&
      Number.isFinite(Number(input.customerCreditBalanceAfter))
    ) {
      lines.push({
        label: 'Account balance',
        value: `${cur} ${Number(input.customerCreditBalanceAfter).toFixed(2)}`,
      });
    }
    lines.push({ label: 'Cash received', value: `${cur} 0.00` });
    return { kind: 'credit', lines };
  }

  const methodLabel = (input.paymentMethod || 'cash').toUpperCase();
  const lines: ReceiptPaymentLine[] = [
    {
      label: `Paid via ${methodLabel}`,
      value: `${cur} ${(amountTendered > 0 ? amountTendered : total).toFixed(2)}`,
    },
  ];
  if (change > 0.001) {
    lines.push({ label: 'Change given', value: `${cur} ${change.toFixed(2)}` });
  }
  return { kind: 'standard', lines };
}
