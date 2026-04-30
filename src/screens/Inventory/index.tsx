import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { formatCurrency } from '../../utils/format';
import styles from './Inventory.module.css';

const EMPTY_PRODUCT: Partial<Product> = {
  name: '', barcode: '', category: 'General', unit_price: 0,
  cost_price: 0, stock_qty: 0, low_stock_threshold: 5,
  tax_category: 'standard', unit: 'each', size: '', image_path: '', is_pharmacy: 0, is_inventory: 1,
};

export default function InventoryScreen() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editProduct, setEditProduct] = useState<Partial<Product> | null>(null);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [activeCategory, setActiveCategory] = useState('All');
  const [categories, setCategories] = useState<string[]>(['All']);
  const [showLowStock, setShowLowStock] = useState(searchParams.get('filter') === 'low');

  // Initial load for categories only
  useEffect(() => {
    if (!window.sikapos) return;
    window.sikapos.inventory.getCategories().then(cats => {
      setCategories(['All', ...cats]);
    });
  }, []);

  const load = useCallback(async () => {
    if (!window.sikapos) return;
    setLoading(true);
    try {
      const prods = await window.sikapos.inventory.getAll({
        search: search,
        category: activeCategory,
        lowStock: showLowStock,
        limit: showLowStock ? 500 : 150 // Show all low stock items
      });
      setProducts(prods);
    } finally {
      setLoading(false);
    }
  }, [search, activeCategory, showLowStock]);

  useEffect(() => {
    const timer = setTimeout(load, 300);
    return () => clearTimeout(timer);
  }, [load]);

  // Sync state with URL but don't force re-renders if not needed
  useEffect(() => {
    const filter = searchParams.get('filter');
    if (filter === 'low' && !showLowStock) {
      setShowLowStock(true);
    } else if (!filter && showLowStock) {
      setShowLowStock(false);
    }
  }, [searchParams]);

  const toggleLowStock = () => {
    if (showLowStock) {
      searchParams.delete('filter');
    } else {
      searchParams.set('filter', 'low');
    }
    setSearchParams(searchParams);
    setShowLowStock(!showLowStock);
  };

  const filtered = products; // Already filtered by backend

  const handleSave = async () => {
    if (!window.sikapos) return;
    if (!editProduct?.name?.trim()) {
      alert('Please enter a product name before saving.');
      return;
    }
    setSaving(true);
    try {
      const result = await window.sikapos.inventory.save(editProduct);
      if (result.success) {
        await load();
        setShowForm(false);
        setEditProduct(null);
        window.sikapos.notifications.show('Success', 'Product saved successfully.');
      } else {
        alert('Failed to save product: ' + (result.message || 'Unknown error'));
      }
    } catch (err: any) {
      console.error('Save Error:', err);
      alert('Error saving product: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.sikapos) return;
    if (!confirm('Delete this product?')) return;
    await window.sikapos.inventory.delete(id);
    await load();
  };

  const openAdd = () => { setEditProduct({ ...EMPTY_PRODUCT }); setShowForm(true); };
  const openEdit = (p: Product) => { setEditProduct({ ...p }); setShowForm(true); };

  const handleImport = async () => {
    if (!window.sikapos) return;
    const result = await window.sikapos.inventory.importFromExcel();
    if (result.success) {
      alert(`Successfully imported ${result.count} items.`);
      await load();
    } else if (result.message !== 'Import cancelled') {
      alert(`Import failed: ${result.message}`);
    }
  };

  const handleDownloadTemplate = async () => {
    if (!window.sikapos) return;
    const result = await window.sikapos.inventory.downloadTemplate();
    if (result.success) {
      alert('Template downloaded successfully.');
    }
  };

  return (
    <div className={styles.screen}>
      {/* Header */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Inventory</h1>
          <p className={styles.subtitle}>{products.length} products</p>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.secondaryBtn} onClick={handleDownloadTemplate}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Template
          </button>
          <button className={styles.secondaryBtn} onClick={handleImport}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            Import
          </button>
          <button className={styles.secondaryBtn} onClick={openAdd}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Add Product
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className={styles.filters}>
        <input
          className={styles.searchInput}
          placeholder="Search products..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div className={styles.catPills}>
          {categories.map(cat => (
            <button
              key={cat}
              className={`${styles.catPill} ${activeCategory === cat ? styles.catPillActive : ''}`}
              onClick={() => { setActiveCategory(cat); setShowLowStock(false); searchParams.delete('filter'); setSearchParams(searchParams); }}
            >{cat}</button>
          ))}
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <button 
            className={`${styles.lowStockBtn} ${showLowStock ? styles.lowStockBtnActive : ''}`}
            onClick={toggleLowStock}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            Low Stock
          </button>
        </div>
      </div>

      {/* Table */}
      <div className={styles.tableWrap}>
        {loading ? (
          <div className={styles.loadingRows}>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className={`${styles.skeletonRow} skeleton`} />
            ))}
          </div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Product</th>
                <th>Category</th>
                <th>Price</th>
                <th>Cost</th>
                <th>Stock</th>
                <th>Tax</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className={styles.emptyRow}>No products found</td>
                </tr>
              ) : filtered.map(p => {
                const lowStock = p.stock_qty <= p.low_stock_threshold && p.stock_qty > 0;
                const outOfStock = p.stock_qty === 0;
                return (
                  <tr key={p.id} className={styles.tableRow} onClick={() => openEdit(p)}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {p.image_path ? (
                          <img src={p.image_path} alt={p.name} style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--color-border)', flexShrink: 0 }} />
                        ) : (
                          <div style={{ width: 36, height: 36, borderRadius: 6, background: 'var(--color-elevated)', border: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-text-muted)' }}><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                          </div>
                        )}
                        <div>
                          <p className={styles.productName}>{p.name}</p>
                          {p.size && <p className={styles.barcode}>{p.size}</p>}
                          {p.barcode && <p className={styles.barcode}>{p.barcode}</p>}
                        </div>
                      </div>
                    </td>
                    <td><span className={styles.catTag}>{p.category}</span></td>
                    <td className={styles.monoCell}>GHS {formatCurrency(p.unit_price)}</td>
                    <td className={styles.monoCell}>GHS {formatCurrency(p.cost_price)}</td>
                    <td>
                      {p.is_inventory === 1 ? (
                        <span className={`
                          ${styles.stockBadge} 
                          ${p.stock_qty < 0 ? styles.stockNegative : 
                            p.stock_qty === 0 ? styles.stockOut : 
                            p.stock_qty <= p.low_stock_threshold ? styles.stockLow : 
                            styles.stockOk}
                        `}>
                          {p.stock_qty} {p.unit}
                        </span>
                      ) : (
                        <span className={styles.serviceBadge}>Service</span>
                      )}
                    </td>
                    <td>
                      <span className={styles.taxTag}>{p.tax_category === 'zero_rated' ? 'Zero' : p.tax_category === 'exempt' ? 'Exempt' : 'STD'}</span>
                    </td>
                    <td onClick={e => e.stopPropagation()}>
                      <button className={styles.deleteBtn} onClick={() => handleDelete(p.id)}>Delete</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Add/Edit panel */}
      {showForm && editProduct && (
        <div className={styles.formOverlay} onClick={e => e.target === e.currentTarget && setShowForm(false)}>
          <div className={styles.formPanel}>
            <div className={styles.formHeader}>
              <h2>{editProduct.id ? 'Edit Product' : 'Add Product'}</h2>
              <button className={styles.closePanel} onClick={() => setShowForm(false)}>×</button>
            </div>
            <div className={styles.formBody}>

              {/* Image uploader */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px', padding: '16px', background: 'var(--color-elevated)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                <div style={{ width: 80, height: 80, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--color-border)', background: 'var(--color-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {editProduct.image_path ? (
                    <img src={editProduct.image_path} alt="Product" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-text-muted)' }}><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', margin: 0 }}>Product Image</p>
                  <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: 0 }}>Shows on the POS grid tile</p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: 'var(--color-surface)', border: '1px solid var(--color-border-strong)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: 12, color: 'var(--color-text-secondary)' }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                      Upload Image
                      <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = (ev) => {
                            setEditProduct(p => ({ ...p!, image_path: ev.target?.result as string }));
                          };
                          reader.readAsDataURL(file);
                        }
                      }} />
                    </label>
                    {editProduct.image_path && (
                      <button style={{ padding: '6px 12px', background: 'transparent', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 'var(--radius-sm)', color: '#ef4444', fontSize: 12, cursor: 'pointer' }}
                        onClick={() => setEditProduct(p => ({ ...p!, image_path: '' }))}>
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className={styles.formGrid}>
                <div className={styles.formField}>
                  <label>Product Name *</label>
                  <input value={editProduct.name || ''} onChange={e => setEditProduct(p => ({ ...p!, name: e.target.value }))} placeholder="e.g. Coca-Cola 500ml" />
                </div>
                <div className={styles.formField}>
                  <label>Barcode</label>
                  <input value={editProduct.barcode || ''} onChange={e => setEditProduct(p => ({ ...p!, barcode: e.target.value }))} placeholder="e.g. 5449000000996" />
                </div>
                <div className={styles.formField}>
                  <label>Category</label>
                  <input value={editProduct.category || 'General'} onChange={e => setEditProduct(p => ({ ...p!, category: e.target.value }))} placeholder="e.g. Beverages" />
                </div>
                <div className={styles.formField}>
                  <label>Unit</label>
                  <input value={editProduct.unit || 'each'} onChange={e => setEditProduct(p => ({ ...p!, unit: e.target.value }))} placeholder="each, bottle, bag..." />
                </div>
                <div className={styles.formField}>
                  <label>Size / Volume</label>
                  <input value={editProduct.size || ''} onChange={e => setEditProduct(p => ({ ...p!, size: e.target.value }))} placeholder="e.g. 500ml, 1kg, Large" />
                </div>
                <div className={styles.formField}>
                  <label>Selling Price (GHS) *</label>
                  <input type="number" min={0} step={0.01} value={editProduct.unit_price || 0} onChange={e => setEditProduct(p => ({ ...p!, unit_price: parseFloat(e.target.value) || 0 }))} />
                </div>
                <div className={styles.formField}>
                  <label>Cost Price (GHS)</label>
                  <input type="number" min={0} step={0.01} value={editProduct.cost_price || 0} onChange={e => setEditProduct(p => ({ ...p!, cost_price: parseFloat(e.target.value) || 0 }))} />
                </div>
                <div className={`${styles.formField} ${styles.fullWidth}`}>
                  <label>Tax Category</label>
                  <select value={editProduct.tax_category || 'standard'} onChange={e => setEditProduct(p => ({ ...p!, tax_category: e.target.value as Product['tax_category'] }))}>
                    <option value="standard">Standard (VAT 12.5% + NHIL + GETFund + COVID)</option>
                    <option value="zero_rated">Zero-Rated (Food, water, medicine)</option>
                    <option value="exempt">Exempt (No tax)</option>
                  </select>
                </div>
              </div>

              {/* Inventory vs Service toggle */}
              <div className={styles.pharmacyToggle}>
                <label className={styles.toggleLabel}>
                  <input
                    type="checkbox"
                    checked={editProduct.is_inventory === 1}
                    onChange={e => setEditProduct(p => ({ ...p!, is_inventory: e.target.checked ? 1 : 0 }))}
                  />
                  <span>Track stock level (Inventory item)</span>
                </label>
              </div>

              {editProduct.is_inventory === 1 && (
                <div className={styles.formGrid}>
                  <div className={styles.formField}>
                    <label>Stock Quantity</label>
                    <input type="number" value={editProduct.stock_qty || 0} onChange={e => setEditProduct(p => ({ ...p!, stock_qty: parseInt(e.target.value) || 0 }))} />
                  </div>
                  <div className={styles.formField}>
                    <label>Low Stock Alert At</label>
                    <input type="number" min={0} value={editProduct.low_stock_threshold || 5} onChange={e => setEditProduct(p => ({ ...p!, low_stock_threshold: parseInt(e.target.value) || 5 }))} />
                  </div>
                </div>
              )}

              {/* Pharmacy toggle */}
              <div className={styles.pharmacyToggle}>
                <label className={styles.toggleLabel}>
                  <input
                    type="checkbox"
                    checked={!!editProduct.is_pharmacy}
                    onChange={e => setEditProduct(p => ({ ...p!, is_pharmacy: e.target.checked ? 1 : 0 }))}
                  />
                  <span>Pharmacy product</span>
                </label>
              </div>
              {editProduct.is_pharmacy === 1 && (
                <div className={styles.formGrid}>
                  <div className={styles.formField}>
                    <label>Expiry Date</label>
                    <input type="date" value={editProduct.expiry_date || ''} onChange={e => setEditProduct(p => ({ ...p!, expiry_date: e.target.value }))} />
                  </div>
                  <div className={styles.formField}>
                    <label>Batch Number</label>
                    <input value={editProduct.batch_number || ''} onChange={e => setEditProduct(p => ({ ...p!, batch_number: e.target.value }))} />
                  </div>
                  <div className={styles.formField}>
                    <label>NAFDAC Number</label>
                    <input value={editProduct.nafdac_number || ''} onChange={e => setEditProduct(p => ({ ...p!, nafdac_number: e.target.value }))} />
                  </div>
                </div>
              )}
            </div>
            <div className={styles.formFooter}>
              <button className={styles.cancelBtn} onClick={() => setShowForm(false)}>Cancel</button>
              <button className={styles.saveBtn} onClick={handleSave} disabled={saving || !editProduct.name}>
                {saving ? 'Saving...' : 'Save Product'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
