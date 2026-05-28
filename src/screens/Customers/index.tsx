import { useState, useEffect, useCallback } from 'react';
import { formatCurrency } from '../../utils/format';
import { useAuthStore } from '../../store/auth';
import { showConfirm } from '../../store/dialogStore';
import { formatErrorMsg } from '../../utils/errorFormatter';
import styles from './Customers.module.css';

export default function CustomersScreen() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editCustomer, setEditCustomer] = useState<Partial<Customer> | null>(null);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<CustomerWithHistory | null>(null);

  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<'cash' | 'momo' | 'card'>('cash');
  const [payNote, setPayNote] = useState('');
  const [showPayModal, setShowPayModal] = useState(false);
  const [payCustomer, setPayCustomer] = useState<Customer | null>(null);

  const load = useCallback(async () => {
    if (!window.sikapos) return;
    setLoading(true);
    try {
      const data = await window.sikapos.customers.getAll();
      setCustomers(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = customers.filter(c => {
    const q = search.toLowerCase();
    return !q || c.name.toLowerCase().includes(q) || (c.phone || '').includes(q);
  });

  const handleSave = async () => {
    if (!editCustomer?.name || !window.sikapos) return;
    setSaving(true);
    try {
      await window.sikapos.customers.save(editCustomer);
      await load();
      setShowForm(false);
      setEditCustomer(null);
    } finally {
      setSaving(false);
    }
  };

  const openProfile = async (id: number) => {
    if (!window.sikapos) return;
    const data = await window.sikapos.customers.getById(id);
    setSelected(data);
  };

  const totalDebt = customers.reduce((s, c) => s + c.credit_balance, 0);
  const totalLoyalty = customers.reduce((s, c) => s + c.loyalty_points, 0);

  const handlePayment = async () => {
    if (!payCustomer || !payAmount || !window.sikapos) return;

    const amount = parseFloat(payAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      alert('Enter a valid payment amount greater than zero.');
      return;
    }

    // Overpayment warning
    if (amount > payCustomer.credit_balance) {
      const confirmed = await showConfirm(
        `Payment amount (${useAuthStore.getState().receiptConfig.currency} ${amount.toFixed(2)}) exceeds outstanding balance (${useAuthStore.getState().receiptConfig.currency} ${payCustomer.credit_balance.toFixed(2)}).\n\nContinue anyway?`
      );
      if (!confirmed) return;
    }

    setSaving(true);
    try {
      const res = await window.sikapos.customers.addCreditPayment(payCustomer.id, amount, payNote, payMethod);
      if (!res.success) {
        alert(formatErrorMsg(res.message, 'Payment failed. Please try again.'));
        return;
      }
      if ((res as { duplicate?: boolean }).duplicate) {
        alert(res.message || 'This payment was already recorded.');
      }
      const updatedCustomer = res.customer;
      if (updatedCustomer) {
        setPayCustomer(updatedCustomer);
        setCustomers(prev => prev.map(c => c.id === updatedCustomer.id ? updatedCustomer : c));
        if (selected && selected.id === updatedCustomer.id) {
          setSelected({ ...selected, ...updatedCustomer });
        }
      }
      await load();
      setShowPayModal(false);
      setPayAmount('');
      setPayNote('');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.sikapos) return;
    const confirmed = await showConfirm('Are you sure you want to permanently delete this customer? All their credit history will be erased. This cannot be undone.');
    if (!confirmed) return;

    const res = await window.sikapos.customers.delete(id);
    if (res.success) {
      setShowForm(false);
      setEditCustomer(null);
      load();
    } else {
      alert(formatErrorMsg(res.message, 'Failed to delete customer.'));
    }
  };

  return (
    <div className={styles.screen}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Customers</h1>
          <p className={styles.subtitle}>{customers.length} registered</p>
        </div>
        <button className={styles.addBtn} onClick={() => { setEditCustomer({ name: '', phone: '' }); setShowForm(true); }}>
          + Add Customer
        </button>
      </div>

      {/* Stats */}
      <div className={styles.stats}>
        <div className={styles.statCard}>
          <p className={styles.statLabel}>Total Customers</p>
          <p className={styles.statValue}>{customers.length}</p>
        </div>
        <div className={styles.statCard}>
          <p className={styles.statLabel}>Total Outstanding Credit</p>
          <p className={`${styles.statValue} ${totalDebt > 0 ? styles.danger : ''}`}>{useAuthStore.getState().receiptConfig.currency} {formatCurrency(totalDebt)}</p>
        </div>
        <div className={styles.statCard}>
          <p className={styles.statLabel}>Total Loyalty Points</p>
          <p className={styles.statValue}>{totalLoyalty.toLocaleString()} pts</p>
        </div>
      </div>

      <div className={styles.searchBar}>
        <input
          className={styles.searchInput}
          placeholder="Search by name or phone..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Customer</th>
              <th>Phone</th>
              <th>Total Spent</th>
              <th>Credit Balance</th>
              <th>Loyalty Points</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className={styles.loadingRow}>Loading...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} className={styles.emptyRow}>No customers found</td></tr>
            ) : filtered.map(c => (
              <tr key={c.id} className={styles.tableRow}>
                <td>
                  <div className={styles.customerName}>
                    <div className={styles.avatar}>{c.name.charAt(0).toUpperCase()}</div>
                    <div>
                      <p className={styles.nameText}>{c.name}</p>
                      <p className={styles.joinDate}>Since {new Date(c.created_at).toLocaleDateString('en-GH')}</p>
                    </div>
                  </div>
                </td>
                <td className={styles.monoCell}>{c.phone || '—'}</td>
                <td className={styles.monoCell}>{useAuthStore.getState().receiptConfig.currency} {formatCurrency(c.total_spent)}</td>
                <td>
                  {c.credit_balance > 0 ? (
                    <span className={styles.creditBadge}>{useAuthStore.getState().receiptConfig.currency} {formatCurrency(c.credit_balance)}</span>
                  ) : (
                    <span className={styles.noneText}>None</span>
                  )}
                </td>
                <td className={styles.monoCell}>{c.loyalty_points} pts</td>
                <td>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button className={styles.viewBtn} onClick={() => openProfile(c.id)}>View</button>
                    {c.credit_balance > 0 && (
                      <button 
                        className={styles.payBtn} 
                        style={{ background: 'var(--color-success)', color: '#000', border: 'none', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
                        onClick={() => { setPayCustomer(c); setPayAmount(c.credit_balance.toString()); setShowPayModal(true); }}
                      >
                        Pay Debt
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Payment Modal */}
      {showPayModal && payCustomer && (
        <div className={styles.overlay}>
          <div className={styles.modal} style={{ maxWidth: '400px' }}>
            <div className={styles.modalHeader}>
              <h2>Record Payment: {payCustomer.name}</h2>
              <button className={styles.closeBtn} onClick={() => setShowPayModal(false)}>×</button>
            </div>
            <div className={styles.modalBody}>
              <div style={{ background: 'rgba(255,255,255,0.05)', padding: '12px', borderRadius: '8px', marginBottom: '16px', textAlign: 'center' }}>
                <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '4px' }}>Outstanding Balance</p>
                <p style={{ fontSize: '24px', fontWeight: '700', color: 'var(--color-danger)' }}>{useAuthStore.getState().receiptConfig.currency} {formatCurrency(payCustomer.credit_balance)}</p>
              </div>
              <div className={styles.formField}>
                <label>Amount to Pay ({useAuthStore.getState().receiptConfig.currency}) *</label>
                <input 
                  type="number" 
                  step="0.01" 
                  value={payAmount} 
                  onChange={e => setPayAmount(e.target.value)} 
                  placeholder="0.00" 
                  autoFocus
                />
              </div>
              <div className={styles.formField}>
                <label>Payment Method</label>
                <select value={payMethod} onChange={e => setPayMethod(e.target.value as any)}>
                  <option value="cash">Cash</option>
                  <option value="momo">MoMo</option>
                  <option value="card">Card</option>
                </select>
              </div>
              <div className={styles.formField}>
                <label>Notes (optional)</label>
                <input value={payNote} onChange={e => setPayNote(e.target.value)} placeholder="e.g. Partial payment for receipt #..." />
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.cancelBtn} onClick={() => setShowPayModal(false)}>Cancel</button>
              <button 
                className={styles.saveBtn} 
                style={{ background: 'var(--color-success)', color: '#000' }}
                onClick={handlePayment} 
                disabled={saving || !payAmount || parseFloat(payAmount) <= 0}
              >
                {saving ? 'Processing...' : 'Confirm Payment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit form */}
      {showForm && editCustomer && (
        <div className={styles.overlay}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <h2>{editCustomer.id ? 'Edit Customer' : 'Add Customer'}</h2>
              <button className={styles.closeBtn} onClick={() => setShowForm(false)}>×</button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.formField}>
                <label>Full Name *</label>
                <input value={editCustomer.name || ''} onChange={e => setEditCustomer(p => ({ ...p!, name: e.target.value }))} placeholder="e.g. Kofi Mensah" />
              </div>
              <div className={styles.formField}>
                <label>Phone Number</label>
                <input value={editCustomer.phone || ''} onChange={e => setEditCustomer(p => ({ ...p!, phone: e.target.value }))} placeholder="024 000 0000" />
              </div>
              <div className={styles.formField}>
                <label>Email (optional)</label>
                <input type="email" value={editCustomer.email || ''} onChange={e => setEditCustomer(p => ({ ...p!, email: e.target.value }))} placeholder="kofi@example.com" />
              </div>
              <div className={styles.formField}>
                <label>Notes</label>
                <input value={editCustomer.notes || ''} onChange={e => setEditCustomer(p => ({ ...p!, notes: e.target.value }))} placeholder="Any notes about this customer" />
              </div>
              <div className={styles.formField}>
                <label>Credit Limit ({useAuthStore.getState().receiptConfig.currency}) <span style={{ color: 'var(--color-text-muted)', fontSize: '12px' }}>0 = No limit</span></label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={editCustomer.credit_limit ?? 0}
                  onChange={e => setEditCustomer(p => ({ ...p!, credit_limit: parseFloat(e.target.value) || 0 }))}
                  placeholder="0.00"
                />
              </div>
            </div>
            <div className={styles.modalFooter} style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
              <div>
                {editCustomer.id && (
                  <button className={styles.cancelBtn} style={{ color: 'var(--color-danger)', borderColor: 'var(--color-danger)' }} onClick={() => handleDelete(editCustomer.id!)}>Delete</button>
                )}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className={styles.cancelBtn} onClick={() => setShowForm(false)}>Cancel</button>
                <button className={styles.saveBtn} onClick={handleSave} disabled={saving || !editCustomer.name}>
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Profile view */}
      {selected && (
        <div className={styles.overlay}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <h2>{selected.name}</h2>
              <button className={styles.closeBtn} onClick={() => setSelected(null)}>×</button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.profileStats}>
                <div>
                  <p className={styles.statLabel}>Total Spent</p>
                  <p className={styles.statBig}>{useAuthStore.getState().receiptConfig.currency} {formatCurrency(selected.total_spent)}</p>
                </div>
                <div>
                  <p className={styles.statLabel}>Credit Balance</p>
                  <p className={`${styles.statBig} ${selected.credit_balance > 0 ? styles.danger : ''}`}>
                    {useAuthStore.getState().receiptConfig.currency} {formatCurrency(selected.credit_balance)}
                  </p>
                </div>
                <div>
                  <p className={styles.statLabel}>Credit Limit</p>
                  <p className={styles.statBig}>
                    {selected.credit_limit && selected.credit_limit > 0 
                      ? `${useAuthStore.getState().receiptConfig.currency} ${formatCurrency(selected.credit_limit)}`
                      : 'No Limit'}
                  </p>
                </div>
                <div>
                  <p className={styles.statLabel}>Loyalty Points</p>
                  <p className={styles.statBig}>{selected.loyalty_points} pts</p>
                </div>
              </div>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <p className={styles.sectionLabel}>Recent Transactions</p>
                {selected.credit_balance > 0 && (
                  <button 
                    style={{ background: 'var(--color-success)', color: '#000', border: 'none', padding: '6px 12px', borderRadius: '6px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}
                    onClick={() => { setPayCustomer(selected); setPayAmount(selected.credit_balance.toString()); setShowPayModal(true); }}
                  >
                    Pay Debt
                  </button>
                )}
              </div>

              {selected.recentSales.length === 0 ? (
                <p style={{ color: 'var(--color-text-muted)', fontSize: '13px' }}>No transactions yet</p>
              ) : selected.recentSales.map(tx => (
                <div key={tx.id} className={styles.txRow}>
                  <div>
                    <p className={styles.txRef}>{tx.receipt_number}</p>
                    <p className={styles.txDate}>{new Date(tx.created_at).toLocaleDateString('en-GH')}</p>
                  </div>
                  <p className={styles.txAmount}>{useAuthStore.getState().receiptConfig.currency} {formatCurrency(tx.grand_total)}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

