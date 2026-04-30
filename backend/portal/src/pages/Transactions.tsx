import { useEffect, useState, useCallback } from 'react';
import { useAuthStore } from '../store/auth';
import {
  Receipt,
  Search,
  RefreshCw,
  Calendar,
  Filter,
  ChevronLeft,
  ChevronRight,
  Eye,
  X,
} from 'lucide-react';

interface Transaction {
  id: number;
  receipt_number: string;
  cashier_name: string;
  customer_name?: string;
  payment_method: string;
  subtotal: number;
  discount_amount: number;
  total_tax: number;
  grand_total: number;
  amount_tendered: number;
  change_given: number;
  status: string;
  created_at: string;
  items?: TransactionItem[];
}

interface TransactionItem {
  id: number;
  product_name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export default function Transactions() {
  const { token } = useAuthStore();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  // Helper to get date range for quick filters
  const getPeriodDates = (period: 'today' | 'yesterday' | 'week') => {
    const today = new Date();
    const formatDate = (d: Date) => d.toISOString().split('T')[0];
    
    if (period === 'today') {
      return { from: formatDate(today), to: formatDate(today) };
    }
    if (period === 'yesterday') {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      return { from: formatDate(yesterday), to: formatDate(yesterday) };
    }
    if (period === 'week') {
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - today.getDay()); // Sunday
      return { from: formatDate(startOfWeek), to: formatDate(today) };
    }
    return { from: '', to: '' };
  };
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('');
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, pages: 0 });
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);

  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(pagination.page),
        limit: String(pagination.limit),
      });
      if (searchQuery) params.set('search', searchQuery);
      if (dateFrom) params.set('from', dateFrom);
      if (dateTo) params.set('to', dateTo);
      if (paymentFilter) params.set('payment', paymentFilter);

      const res = await fetch(`/api/portal/sales?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch transactions');
      const data = await res.json();
      setTransactions(data.sales || data.transactions || []);
      setPagination(data.pagination || pagination);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [token, pagination.page, pagination.limit, searchQuery, dateFrom, dateTo, paymentFilter]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPagination((p) => ({ ...p, page: 1 }));
    fetchTransactions();
  };

  const viewTransactionDetails = async (tx: Transaction) => {
    // Show details from the list data (backend doesn't have single transaction endpoint)
    setSelectedTransaction(tx);
  };

  const formatCurrency = (val: number) =>
    `GHS ${(val || 0).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleString('en-GH', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  const paymentBadge = (method: string) => {
    const styles: Record<string, { bg: string; color: string }> = {
      cash: { bg: 'rgba(16,185,129,0.1)', color: '#10B981' },
      momo: { bg: 'rgba(139,92,246,0.1)', color: '#8B5CF6' },
      card: { bg: 'rgba(59,130,246,0.1)', color: '#3B82F6' },
      credit: { bg: 'rgba(245,158,11,0.1)', color: '#F59E0B' },
    };
    const style = styles[method] || { bg: 'rgba(255,255,255,0.1)', color: 'var(--text-muted)' };
    return (
      <span
        style={{
          padding: '4px 10px',
          borderRadius: '4px',
          fontSize: '11px',
          fontWeight: 600,
          textTransform: 'uppercase',
          background: style.bg,
          color: style.color,
        }}
      >
        {method}
      </span>
    );
  };

  return (
    <div>
      {/* Header & Filters */}
      <div style={{ marginBottom: '24px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '20px',
            flexWrap: 'wrap',
            gap: '16px',
          }}
        >
          <div>
            <h1 style={{ fontSize: '28px', marginBottom: '4px' }}>Transactions</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
              {pagination.total} transactions synced from your POS
            </p>
          </div>
          <button onClick={fetchTransactions} className="btn-secondary" style={{ padding: '10px 16px' }}>
            <RefreshCw size={16} /> Refresh
          </button>
        </div>

        {/* Filter Bar */}
        <div className="glass-panel" style={{ padding: '16px' }}>
          <form onSubmit={handleSearch} style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
              <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder="Search receipt # or customer..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px 10px 40px',
                  background: 'rgba(0,0,0,0.2)',
                  border: '1px solid var(--border-light)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--text-main)',
                  outline: 'none',
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              {/* Quick date filters */}
              <div style={{ display: 'flex', gap: '4px' }}>
                {(['today', 'yesterday', 'week'] as const).map((period) => {
                  const labels = { today: 'Today', yesterday: 'Yesterday', week: 'This Week' };
                  const isActive = dateFrom === getPeriodDates(period).from && dateTo === getPeriodDates(period).to;
                  return (
                    <button
                      key={period}
                      type="button"
                      onClick={() => {
                        const { from, to } = getPeriodDates(period);
                        setDateFrom(from);
                        setDateTo(to);
                        setPagination((p) => ({ ...p, page: 1 }));
                      }}
                      style={{
                        padding: '8px 12px',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--border-light)',
                        background: isActive ? 'var(--color-primary)' : 'rgba(0,0,0,0.2)',
                        color: isActive ? '#000' : 'var(--text-main)',
                        fontSize: '12px',
                        cursor: 'pointer',
                      }}
                    >
                      {labels[period]}
                    </button>
                  );
                })}
              </div>
              
              <Calendar size={16} color="var(--text-muted)" />
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setPagination((p) => ({ ...p, page: 1 }));
                }}
                style={{
                  padding: '10px 12px',
                  background: 'rgba(0,0,0,0.2)',
                  border: '1px solid var(--border-light)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--text-main)',
                  outline: 'none',
                }}
              />
              <span style={{ color: 'var(--text-muted)' }}>to</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setPagination((p) => ({ ...p, page: 1 }));
                }}
                style={{
                  padding: '10px 12px',
                  background: 'rgba(0,0,0,0.2)',
                  border: '1px solid var(--border-light)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--text-main)',
                  outline: 'none',
                }}
              />
            </div>

            <select
              value={paymentFilter}
              onChange={(e) => {
                setPaymentFilter(e.target.value);
                setPagination((p) => ({ ...p, page: 1 }));
              }}
              style={{
                padding: '10px 16px',
                background: 'rgba(0,0,0,0.2)',
                border: '1px solid var(--border-light)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--text-main)',
                outline: 'none',
                minWidth: '140px',
              }}
            >
              <option value="">All Payments</option>
              <option value="cash">Cash</option>
              <option value="momo">Mobile Money</option>
              <option value="card">Card</option>
              <option value="credit">Credit</option>
            </select>

            <button type="submit" className="btn-primary" style={{ padding: '10px 20px' }}>
              <Filter size={16} /> Filter
            </button>
          </form>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="glass-panel" style={{ padding: '0', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center' }}>
            <RefreshCw size={32} className="spin" style={{ opacity: 0.5 }} />
          </div>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.02)' }}>
                    <th style={{ padding: '16px', textAlign: 'left', fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)' }}>Receipt</th>
                    <th style={{ padding: '16px', textAlign: 'left', fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)' }}>Date</th>
                    <th style={{ padding: '16px', textAlign: 'left', fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)' }}>Cashier</th>
                    <th style={{ padding: '16px', textAlign: 'center', fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)' }}>Payment</th>
                    <th style={{ padding: '16px', textAlign: 'right', fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)' }}>Total</th>
                    <th style={{ padding: '16px', textAlign: 'center', fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx) => (
                    <tr key={tx.id} style={{ borderTop: '1px solid var(--border-light)' }}>
                      <td style={{ padding: '16px' }}>
                        <div style={{ fontFamily: 'monospace', fontWeight: 500 }}>{tx.receipt_number}</div>
                        {tx.customer_name && (
                          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{tx.customer_name}</div>
                        )}
                      </td>
                      <td style={{ padding: '16px', fontSize: '14px' }}>{formatDate(tx.created_at)}</td>
                      <td style={{ padding: '16px' }}>{tx.cashier_name}</td>
                      <td style={{ padding: '16px', textAlign: 'center' }}>{paymentBadge(tx.payment_method)}</td>
                      <td style={{ padding: '16px', textAlign: 'right', fontWeight: 600, color: 'var(--success)' }}>
                        {formatCurrency(tx.grand_total)}
                      </td>
                      <td style={{ padding: '16px', textAlign: 'center' }}>
                        <button
                          onClick={() => viewTransactionDetails(tx)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--primary)',
                            cursor: 'pointer',
                            padding: '8px',
                            borderRadius: '6px',
                            transition: 'background 0.2s',
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(139,92,246,0.1)')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                        >
                          <Eye size={18} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {transactions.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                        <Receipt size={48} style={{ marginBottom: '12px', opacity: 0.3 }} />
                        <p>No transactions found matching your filters</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '16px 20px',
                borderTop: '1px solid var(--border-light)',
              }}
            >
              <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
                Page {pagination.page} of {pagination.pages || 1}
              </span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => setPagination((p) => ({ ...p, page: Math.max(1, p.page - 1) }))}
                  disabled={pagination.page <= 1}
                  className="btn-secondary"
                  style={{ padding: '8px 12px' }}
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  onClick={() => setPagination((p) => ({ ...p, page: Math.min(pagination.pages, p.page + 1) }))}
                  disabled={pagination.page >= pagination.pages}
                  className="btn-secondary"
                  style={{ padding: '8px 12px' }}
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Transaction Detail Modal */}
      {selectedTransaction && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: '20px',
          }}
          onClick={() => setSelectedTransaction(null)}
        >
          <div
            className="glass-panel"
            style={{
              maxWidth: '500px',
              width: '100%',
              maxHeight: '80vh',
              overflow: 'auto',
              padding: '32px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ margin: 0 }}>Transaction Details</h2>
              <button
                onClick={() => setSelectedTransaction(null)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={24} />
              </button>
            </div>

            <div style={{ marginBottom: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Receipt:</span>
                <span style={{ fontFamily: 'monospace' }}>{selectedTransaction.receipt_number}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Date:</span>
                <span>{formatDate(selectedTransaction.created_at)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Cashier:</span>
                <span>{selectedTransaction.cashier_name}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Payment:</span>
                {paymentBadge(selectedTransaction.payment_method)}
              </div>
              {selectedTransaction.customer_name && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Customer:</span>
                  <span>{selectedTransaction.customer_name}</span>
                </div>
              )}
            </div>

            {selectedTransaction.items && selectedTransaction.items.length > 0 && (
              <div style={{ marginBottom: '24px' }}>
                <h3 style={{ fontSize: '16px', marginBottom: '12px' }}>Items</h3>
                <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '8px', padding: '12px' }}>
                  {selectedTransaction.items.map((item) => (
                    <div
                      key={item.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        padding: '8px 0',
                        borderBottom: '1px solid rgba(255,255,255,0.05)',
                      }}
                    >
                      <div>
                        <div>{item.product_name}</div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                          {item.quantity} × {formatCurrency(item.unit_price)}
                        </div>
                      </div>
                      <div style={{ fontWeight: 500 }}>{formatCurrency(item.line_total)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Subtotal:</span>
                <span>{formatCurrency(selectedTransaction.subtotal)}</span>
              </div>
              {selectedTransaction.discount_amount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Discount:</span>
                  <span style={{ color: 'var(--success)' }}>-{formatCurrency(selectedTransaction.discount_amount)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Tax:</span>
                <span>{formatCurrency(selectedTransaction.total_tax)}</span>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginTop: '8px',
                  paddingTop: '8px',
                  borderTop: '1px solid rgba(255,255,255,0.1)',
                }}
              >
                <span style={{ fontWeight: 600 }}>Total:</span>
                <span style={{ fontWeight: 700, fontSize: '18px', color: 'var(--success)' }}>
                  {formatCurrency(selectedTransaction.grand_total)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
