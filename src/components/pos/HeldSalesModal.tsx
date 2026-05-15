import React, { useEffect, useState } from 'react';
import styles from './HeldSalesModal.module.css';
import { useCartStore } from '../../store/cart';
import { showAlert } from '../../store/dialogStore';

interface HeldSale {
  id: number;
  payload: string;
  customer_name: string;
  created_at: string;
}

interface Props {
  onClose: () => void;
}

export default function HeldSalesModal({ onClose }: Props) {
  const [heldSales, setHeldSales] = useState<HeldSale[]>([]);
  const loadCart = useCartStore(state => state.loadCart);

  useEffect(() => {
    loadHeldSales();
  }, []);

  const loadHeldSales = async () => {
    if (!window.sikapos) return;
    const sales = await window.sikapos.sales.getHeld();
    setHeldSales(sales);
  };

  const handleResume = async (sale: HeldSale) => {
    if (!window.sikapos) return;
    
    try {
      const cartData = JSON.parse(sale.payload);
      loadCart(cartData);
      await window.sikapos.sales.deleteHeld(sale.id);
      onClose();
    } catch (err) {
      console.error('Failed to resume sale:', err);
      await showAlert('Failed to resume sale. Data might be corrupted.');
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>Held Sales</h2>
          <button className={styles.closeBtn} onClick={onClose}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className={styles.list}>
          {heldSales.length === 0 ? (
            <div className={styles.empty}>No held sales found.</div>
          ) : (
            heldSales.map(sale => (
              <div key={sale.id} className={styles.heldItem}>
                <div className={styles.info}>
                  <span className={styles.customer}>{sale.customer_name}</span>
                  <span className={styles.meta}>
                    {new Date(sale.created_at).toLocaleString('en-GH')}
                  </span>
                </div>
                <button 
                  className={styles.resumeBtn}
                  onClick={() => handleResume(sale)}
                >
                  Resume
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
