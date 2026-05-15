import React, { useState, useEffect } from 'react';
import styles from './CustomerModal.module.css';
import { useCartStore } from '../../store/cart';

interface Props {
  onClose: () => void;
}

export default function CustomerModal({ onClose }: Props) {
  const [query, setQuery] = useState('');
  const [customers, setCustomers] = useState<any[]>([]);
<<<<<<< HEAD
  const setCustomer = useCartStore(state => state.setCustomer);
=======
  const { setCustomer, customerName: currentName } = useCartStore();
>>>>>>> 3f9ceb5465a3e53b5e5300921300cc3a0983f1cf

  useEffect(() => {
    if (query.length > 1) {
      searchCustomers();
    } else {
      setCustomers([]);
    }
  }, [query]);

  const searchCustomers = async () => {
    if (!window.sikapos) return;
    const results = await window.sikapos.customers.search(query);
    setCustomers(results);
  };

  const handleSelect = (c: any) => {
<<<<<<< HEAD
    setCustomer(c.id, c.name, Number(c.credit_balance) || 0);
    onClose();
  };

  const handleManualEntry = async () => {
    if (!query.trim() || !window.sikapos) return;
    const name = query.trim();
    const res = await window.sikapos.customers.save({ name });
    if (res.id) {
      setCustomer(res.id, name, 0);
      onClose();
    }
=======
    setCustomer(c.id, c.name, c.credit_limit - (c.current_credit || 0)); // Note: existing logic used creditBalance differently but this matches store setCustomer signature roughly
    onClose();
  };

  const handleManualEntry = () => {
    if (!query.trim()) return;
    // Set customer with 0 ID to indicate manual name
    setCustomer(0, query, 0);
    onClose();
>>>>>>> 3f9ceb5465a3e53b5e5300921300cc3a0983f1cf
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>Assign Customer</h2>
          <button className={styles.closeBtn} onClick={onClose}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className={styles.body}>
          <div className={styles.inputGroup}>
            <label className={styles.label}>Search or Enter Name</label>
            <input
              autoFocus
              className={styles.input}
              placeholder="Start typing customer name..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleManualEntry()}
            />
          </div>

          {customers.length > 0 && (
            <div className={styles.searchList}>
              {customers.map(c => (
                <div key={c.id} className={styles.customerItem} onClick={() => handleSelect(c)}>
                  <span className={styles.customerName}>{c.name}</span>
                  <span className={styles.customerPhone}>{c.phone || 'No phone'}</span>
                </div>
              ))}
            </div>
          )}

          {query.trim() && customers.length === 0 && (
            <p style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
              Press Enter to use "<b>{query}</b>" as a one-time customer name.
            </p>
          )}
        </div>

        <div className={styles.actions}>
          <button className={styles.cancelBtn} onClick={onClose}>Cancel</button>
          <button className={styles.saveBtn} onClick={handleManualEntry} disabled={!query.trim()}>
            Use Name
          </button>
        </div>
      </div>
    </div>
  );
}
