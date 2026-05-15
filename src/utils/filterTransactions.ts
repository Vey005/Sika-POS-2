/** Client-side filter for transaction lists (receipt, cashier, customer, payment, status, amount, date). */
export function filterTransactionsBySearch<
  T extends {
    receipt_number?: string;
    cashier_name?: string;
    customer_name?: string;
    payment_method?: string;
    status?: string;
    grand_total?: number;
    created_at?: string;
  },
>(transactions: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return transactions;

  return transactions.filter(tx => {
    const statusLabel = tx.status === 'debt' ? 'owes credit' : tx.status || '';
    const haystack = [
      tx.receipt_number,
      tx.cashier_name,
      tx.customer_name,
      tx.payment_method,
      statusLabel,
      tx.grand_total != null ? String(tx.grand_total) : '',
      tx.created_at ? new Date(tx.created_at).toLocaleString('en-GH') : '',
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return haystack.includes(q);
  });
}
