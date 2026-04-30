import { useState, useEffect, useCallback } from 'react';
import { formatCurrency } from '../../utils/format';
import styles from './Customers.module.css';

export default function CustomersScreen() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editCustomer, setEditCustomer] = useState<Partial<Customer> | null>(null);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<CustomerWithHistory | null>(null);

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
          <p className={`${styles.statValue} ${totalDebt > 0 ? styles.danger : ''}`}>GHS {formatCurrency(totalDebt)}</p>
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
                <td className={styles.monoCell}>GHS {formatCurrency(c.total_spent)}</td>
                <td>
                  {c.credit_balance > 0 ? (
                    <span className={styles.creditBadge}>GHS {formatCurrency(c.credit_balance)}</span>
                  ) : (
                    <span className={styles.noneText}>None</span>
                  )}
                </td>
                <td className={styles.monoCell}>{c.loyalty_points} pts</td>
                <td>
                  <button className={styles.viewBtn} onClick={() => openProfile(c.id)}>View</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add/Edit form */}
      {showForm && editCustomer && (
        <div className={styles.overlay} onClick={e => e.target === e.currentTarget && setShowForm(false)}>
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
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.cancelBtn} onClick={() => setShowForm(false)}>Cancel</button>
              <button className={styles.saveBtn} onClick={handleSave} disabled={saving || !editCustomer.name}>
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Profile view */}
      {selected && (
        <div className={styles.overlay} onClick={e => e.target === e.currentTarget && setSelected(null)}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <h2>{selected.name}</h2>
              <button className={styles.closeBtn} onClick={() => setSelected(null)}>×</button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.profileStats}>
                <div>
                  <p className={styles.statLabel}>Total Spent</p>
                  <p className={styles.statBig}>GHS {formatCurrency(selected.total_spent)}</p>
                </div>
                <div>
                  <p className={styles.statLabel}>Credit Balance</p>
                  <p className={`${styles.statBig} ${selected.credit_balance > 0 ? styles.danger : ''}`}>
                    GHS {formatCurrency(selected.credit_balance)}
                  </p>
                </div>
                <div>
                  <p className={styles.statLabel}>Loyalty Points</p>
                  <p className={styles.statBig}>{selected.loyalty_points} pts</p>
                </div>
              </div>
              <p className={styles.sectionLabel}>Recent Sales</p>
              {selected.recentSales.length === 0 ? (
                <p style={{ color: 'var(--color-text-muted)', fontSize: '13px' }}>No sales yet</p>
              ) : selected.recentSales.map(tx => (
                <div key={tx.id} className={styles.txRow}>
                  <div>
                    <p className={styles.txRef}>{tx.receipt_number}</p>
                    <p className={styles.txDate}>{new Date(tx.created_at).toLocaleDateString('en-GH')}</p>
                  </div>
                  <p className={styles.txAmount}>GHS {formatCurrency(tx.grand_total)}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
