import { useEffect, useState, useCallback } from 'react';
import { useAuthStore } from '../store/auth';
import {
  Users,
  Search,
  RefreshCw,
  Phone,
  CreditCard,
  CheckCircle2,
  X
} from 'lucide-react';

interface Customer {
  id: number;
  local_id: number;
  name: string;
  phone?: string;
  email?: string;
  credit_balance: number;
  loyalty_points: number;
  total_spent: number;
  notes?: string;
  created_at: string;
}

export default function Customers() {
  const { token } = useAuthStore();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Payment Modal State
  const [showPayModal, setShowPayModal] = useState(false);
  const [payCustomer, setPayCustomer] = useState<Customer | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<'cash' | 'momo' | 'card'>('cash');
  const [payNote, setPayNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/portal/customers', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch customers');
      const data = await res.json();
      setCustomers(data || []);
    } catch (err: any) {
      console.error('Customer fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  const handlePayment = async () => {
    if (!payCustomer || !payAmount) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/portal/customers/${payCustomer.id}/pay`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({
          amount: parseFloat(payAmount),
          method: payMethod,
          note: payNote
        })
      });

      if (res.ok) {
        setShowPayModal(false);
        setPayAmount('');
        setPayNote('');
        fetchCustomers(); // Refresh list
      } else {
        alert('Failed to record payment');
      }
    } catch (err) {
      console.error(err);
      alert('Error recording payment');
    } finally {
      setSubmitting(false);
    }
  };

  const filtered = customers.filter(c => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    (c.phone || '').includes(searchQuery)
  );

  const formatCurrency = (val: number) =>
    `GHS ${(val || 0).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const totalDebt = customers.reduce((s, c) => s + (c.credit_balance || 0), 0);

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 'clamp(16px, 4vw, 24px)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'clamp(16px, 4vw, 20px)', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h1 style={{ fontSize: 'clamp(20px, 5vw, 28px)', marginBottom: '4px' }}>Customers</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: 'clamp(12px, 3vw, 14px)' }}>
              Manage your customers and track debts
            </p>
          </div>
          <button onClick={fetchCustomers} className="btn-secondary">
            <RefreshCw size={16} /> Refresh
          </button>
        </div>

        {/* Debt Summary Card */}
        <div className="glass-panel" style={{ 
          padding: '20px', 
          marginBottom: '24px', 
          background: 'linear-gradient(135deg, rgba(212, 160, 23, 0.1) 0%, rgba(0,0,0,0) 100%)',
          borderLeft: '4px solid var(--primary)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ padding: '10px', background: 'rgba(212, 160, 23, 0.2)', borderRadius: '12px', color: 'var(--primary)' }}>
              <CreditCard size={24} />
            </div>
            <div>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Total Outstanding Debt</p>
              <p style={{ fontSize: '24px', fontWeight: '700', color: 'var(--text-main)' }}>{formatCurrency(totalDebt)}</p>
            </div>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="glass-panel" style={{ padding: 'clamp(12px, 3vw, 16px)' }}>
          <div style={{ position: 'relative', maxWidth: '400px' }}>
            <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Search by name or phone..."
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
        </div>
      </div>

      {/* Customers Table */}
      <div className="glass-panel" style={{ padding: '0', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center' }}>
            <RefreshCw size={32} className="spin" style={{ opacity: 0.5 }} />
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.02)' }}>
                  <th style={{ padding: '16px', textAlign: 'left', fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)' }}>Customer</th>
                  <th style={{ padding: '16px', textAlign: 'left', fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)' }}>Contact</th>
                  <th style={{ padding: '16px', textAlign: 'right', fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)' }}>Debt</th>
                  <th style={{ padding: '16px', textAlign: 'right', fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)' }}>Total Spent</th>
                  <th style={{ padding: '16px', textAlign: 'center', fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((customer) => (
                  <tr key={customer.id} style={{ borderTop: '1px solid var(--border-light)' }}>
                    <td style={{ padding: '16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ 
                          width: '36px', 
                          height: '36px', 
                          borderRadius: '10px', 
                          background: 'rgba(255,255,255,0.05)', 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'center',
                          fontWeight: 700,
                          color: 'var(--primary)',
                          fontSize: '16px'
                        }}>
                          {customer.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight: 500 }}>{customer.name}</div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>ID: {customer.local_id || customer.id}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '16px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {customer.phone && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
                            <Phone size={14} style={{ color: 'var(--text-muted)' }} />
                            {customer.phone}
                          </div>
                        )}
                        {customer.email && (
                          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{customer.email}</div>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '16px', textAlign: 'right' }}>
                      {customer.credit_balance > 0 ? (
                        <span style={{ color: 'var(--danger)', fontWeight: 600 }}>{formatCurrency(customer.credit_balance)}</span>
                      ) : (
                        <span style={{ color: 'var(--success)', opacity: 0.6 }}>Cleared</span>
                      )}
                    </td>
                    <td style={{ padding: '16px', textAlign: 'right', fontWeight: 500 }}>
                      {formatCurrency(customer.total_spent)}
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center' }}>
                      {customer.credit_balance > 0 ? (
                        <button 
                          className="btn-primary" 
                          style={{ fontSize: '12px', padding: '6px 12px' }}
                          onClick={() => {
                            setPayCustomer(customer);
                            setPayAmount(customer.credit_balance.toString());
                            setShowPayModal(true);
                          }}
                        >
                          Pay Debt
                        </button>
                      ) : (
                        <CheckCircle2 size={20} style={{ color: 'var(--success)', opacity: 0.5 }} />
                      )}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      <Users size={48} style={{ marginBottom: '12px', opacity: 0.3 }} />
                      <p>No customers found</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pay Debt Modal */}
      {showPayModal && payCustomer && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px'
        }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '400px', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '18px', margin: 0 }}>Record Payment</h2>
              <button onClick={() => setShowPayModal(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ background: 'rgba(212, 160, 23, 0.1)', padding: '16px', borderRadius: '12px', marginBottom: '20px', textAlign: 'center' }}>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Outstanding Debt for {payCustomer.name}</p>
              <p style={{ fontSize: '24px', fontWeight: '700', color: 'var(--primary)' }}>{formatCurrency(payCustomer.credit_balance)}</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-muted)', marginBottom: '6px' }}>Amount to Pay (GHS)</label>
                <input 
                  type="number" 
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px',
                    background: 'rgba(0,0,0,0.2)',
                    border: '1px solid var(--border-light)',
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--text-main)',
                    fontSize: '16px'
                  }}
                  autoFocus
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-muted)', marginBottom: '6px' }}>Payment Method</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {['cash', 'momo', 'card'].map((m) => (
                    <button
                      key={m}
                      onClick={() => setPayMethod(m as any)}
                      style={{
                        flex: 1,
                        padding: '10px',
                        background: payMethod === m ? 'var(--primary)' : 'rgba(255,255,255,0.05)',
                        border: 'none',
                        borderRadius: 'var(--radius-md)',
                        color: payMethod === m ? '#000' : 'var(--text-muted)',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                    >
                      {m.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-muted)', marginBottom: '6px' }}>Note (Optional)</label>
                <input 
                  type="text" 
                  value={payNote}
                  onChange={(e) => setPayNote(e.target.value)}
                  placeholder="e.g. Paid in person"
                  style={{
                    width: '100%',
                    padding: '10px',
                    background: 'rgba(0,0,0,0.2)',
                    border: '1px solid var(--border-light)',
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--text-main)',
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                <button onClick={() => setShowPayModal(false)} className="btn-secondary" style={{ flex: 1 }}>Cancel</button>
                <button 
                  onClick={handlePayment} 
                  className="btn-primary" 
                  style={{ flex: 1 }}
                  disabled={submitting || !payAmount || parseFloat(payAmount) <= 0}
                >
                  {submitting ? 'Recording...' : 'Record Payment'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
