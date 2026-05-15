import styles from './ProductGrid.module.css';
import { getCategoryColor } from '../../screens/POS';
import { useAuthStore } from '../../store/auth';

interface Props {
  products: Product[];
  loading: boolean;
  onProductClick: (product: Product, saleUnit?: 'single' | 'pack') => void;
}

import React from 'react';

export default React.memo(function ProductGrid({ products, loading, onProductClick }: Props) {
  if (loading) {
    return (
      <div className={styles.grid}>
        {Array.from({ length: 16 }).map((_, i) => (
          <div key={i} className={`${styles.tile} skeleton`} style={{ height: 100 }} />
        ))}
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className={styles.empty}>
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-text-muted)' }}>
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
        </svg>
        <p>No products found</p>
        <p style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Try a different search or category</p>
      </div>
    );
  }

  return (
    <div className={styles.grid}>
      {products.map(product => {
        const catColor = getCategoryColor(product.category);
        const stock = product.stock_qty;
        const isNegative = stock < 0;
        const isOut = stock === 0 && product.is_inventory === 1;
        const isLow = product.is_inventory === 1 && stock > 0 && stock <= product.low_stock_threshold;

        return (
          <div
            key={product.id}
            className={`${styles.tile} ${isOut ? styles.outOfStock : ''} ${product.image_path ? styles.withImage : ''}`}
            onClick={() => onProductClick(product, 'single')}
            title={isOut ? `Out of stock (${stock})` : product.name}
          >
            {/* Image or category color bar */}
            {product.image_path ? (
              <div className={styles.imageWrap}>
                <img src={product.image_path} alt={product.name} className={styles.productImage} />
                <div className={styles.catBarOverlay} style={{ background: catColor }} />
              </div>
            ) : (
              <div className={styles.catBar} style={{ background: catColor }} />
            )}

            {/* Stock badge */}
            {product.is_inventory === 1 && (
              <div className={`
                ${styles.stockBadge} 
                ${isNegative ? styles.stockNegative : 
                  isOut ? styles.stockOut : 
                  isLow ? styles.stockLow : 
                  styles.stockOk}
              `}>
                {isNegative ? stock : 
                 isOut ? 'Out' : 
                 isLow ? `${stock} left` : 
                 stock}
              </div>
            )}

            <div className={styles.tileContent}>
              <p className={styles.productName}>{product.name}</p>
              {product.size && <p className={styles.productCategory} style={{ color: 'var(--color-gold)', fontWeight: 600 }}>{product.size}</p>}
              <p className={styles.productCategory}>{product.category}</p>
              <p className={styles.productPrice}>
                {useAuthStore.getState().receiptConfig.currency} <span>{product.unit_price.toFixed(2)}</span>
              </p>
              {product.pack_size && product.pack_size > 1 && (
                <div className={styles.packActions} onClick={(e) => e.stopPropagation()}>
                  <button className={styles.packBtn} onClick={() => onProductClick(product, 'single')}>
                    Single
                  </button>
                  <button className={styles.packBtn} onClick={() => onProductClick(product, 'pack')}>
                    {product.pack_label || 'Box'} ({useAuthStore.getState().receiptConfig.currency} {(Number(product.pack_price ?? product.unit_price * product.pack_size)).toFixed(2)})
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
});
