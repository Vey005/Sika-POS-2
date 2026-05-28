import { useState, useEffect, useCallback } from 'react';
import { formatCurrency } from '../../utils/format';
import { showAlert, showConfirm } from '../../store/dialogStore';
import { useAuthStore } from '../../store/auth';
import { useCartStore } from '../../store/cart';
import styles from './Restock.module.css';

interface NewItem {
  product_id: number;
  product_name: string;
  quantity: number;
  cost_price: number;
  expiry_date: string;
  batch_number: string;
}

export default function RestockScreen() {
  const [invoices, setInvoices] = useState<RestockInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showNewModal, setShowNewModal] = useState(false);
  const [viewInvoice, setViewInvoice] = useState<RestockInvoiceWithItems | null>(null);
  const currency = useAuthStore.getState().receiptConfig.currency;

  const load = useCallback(async () => {
    if (!window.sikapos?.restock) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await window.sikapos.restock.getAll({ search });
      setInvoices(data);
    } catch (err) {
      console.error('[Restock] Failed to load invoices:', err);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const timer = setTimeout(load, 300);
    return () => clearTimeout(timer);
  }, [load]);

  const handleDelete = async (id: number) => {
    if (!window.sikapos?.restock) return;
    const ok = await showConfirm('Delete this restock record? Stock added by this invoice will be reversed.');
    if (!ok) return;
    const res = await window.sikapos.restock.delete(id);
    if (res.success) {
      void useCartStore.getState().refreshStockLevels();
      await load();
    } else await showAlert(res.message || 'Failed to delete.');
  };

  const handleTogglePaid = async (id: number) => {
    if (!window.sikapos?.restock) return;
    await window.sikapos.restock.togglePaid(id);
    await load();
  };

  const handleViewInvoice = async (id: number) => {
    if (!window.sikapos?.restock) return;
    const data = await window.sikapos.restock.getById(id);
    if (data) setViewInvoice(data);
  };

  const formatDate = (dt: string) => {
    try { return new Date(dt).toLocaleString('en-GH', { dateStyle: 'medium', timeStyle: 'short' }); }
    catch { return dt; }
  };

  return (
    <div className={styles.screen}>
      {/* Header */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Restock</h1>
          <p className={styles.subtitle}>{invoices.length} restock invoice{invoices.length !== 1 ? 's' : ''}</p>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.primaryBtn} onClick={() => setShowNewModal(true)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            New Stock
          </button>
        </div>
      </div>

      {/* Search */}
      <div className={styles.filters}>
        <input
          className={styles.searchInput}
          placeholder="Search invoices..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Invoice list */}
      <div className={styles.tableWrap}>
        {loading ? (
          <div className={styles.loadingRows}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className={`${styles.skeletonRow} skeleton`} />
            ))}
          </div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Invoice #</th>
                <th>Supplier</th>
                <th>Items</th>
                <th>Total Cost</th>
                <th>Status</th>
                <th>Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {invoices.length === 0 ? (
                <tr><td colSpan={7} className={styles.emptyRow}>No restock invoices yet. Click "New Stock" to get started.</td></tr>
              ) : invoices.map(inv => (
                <tr key={inv.id} className={styles.tableRow} onClick={() => handleViewInvoice(inv.id)}>
                  <td className={styles.monoCell}>{inv.invoice_number}</td>
                  <td>{inv.supplier_name || '—'}</td>
                  <td className={styles.monoCell}>{inv.total_items}</td>
                  <td className={styles.monoCell}>{currency} {formatCurrency(inv.total_cost)}</td>
                  <td>
                    <span
                      className={`${styles.paidBadge} ${inv.is_paid ? styles.paidYes : styles.paidNo}`}
                      onClick={e => { e.stopPropagation(); handleTogglePaid(inv.id); }}
                      style={{ cursor: 'pointer' }}
                      title="Click to toggle"
                    >
                      {inv.is_paid ? 'Paid' : 'Unpaid'}
                    </span>
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{formatDate(inv.created_at)}</td>
                  <td onClick={e => e.stopPropagation()}>
                    <button className={styles.deleteBtn} onClick={() => handleDelete(inv.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* New Stock Modal */}
      {showNewModal && (
        <NewStockModal
          onClose={() => setShowNewModal(false)}
          onSaved={() => { setShowNewModal(false); load(); }}
          currency={currency}
        />
      )}

      {/* View Invoice Detail */}
      {viewInvoice && (
        <InvoiceDetail
          invoice={viewInvoice}
          currency={currency}
          onClose={() => setViewInvoice(null)}
        />
      )}
    </div>
  );
}

/* =============== NEW STOCK MODAL =============== */
function NewStockModal({ onClose, onSaved, currency }: {
  onClose: () => void;
  onSaved: () => void;
  currency: string;
}) {
  const [supplierName, setSupplierName] = useState('');
  const [notes, setNotes] = useState('');
  const [isPaid, setIsPaid] = useState(false);
  const [items, setItems] = useState<NewItem[]>([]);
  const [saving, setSaving] = useState(false);

  // Product search state
  const [productQuery, setProductQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);

  const cashierName = useAuthStore.getState().user?.name || '';

  // Search for products as user types
  useEffect(() => {
    if (!productQuery.trim() || !window.sikapos) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      const results = await window.sikapos.inventory.search(productQuery);
      setSearchResults(results);
      setShowDropdown(true);
    }, 200);
    return () => clearTimeout(timer);
  }, [productQuery]);

  const addProduct = (p: Product) => {
    // Don't add duplicates
    if (items.some(it => it.product_id === p.id)) {
      setProductQuery('');
      setShowDropdown(false);
      return;
    }
    setItems(prev => [...prev, {
      product_id: p.id,
      product_name: p.name,
      quantity: 1,
      cost_price: p.cost_price || 0,
      expiry_date: p.expiry_date || '',
      batch_number: p.batch_number || '',
    }]);
    setProductQuery('');
    setShowDropdown(false);
  };

  const updateItem = (idx: number, field: keyof NewItem, value: any) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it));
  };

  const removeItem = (idx: number) => {
    setItems(prev => prev.filter((_, i) => i !== idx));
  };

  const totalCost = items.reduce((sum, it) => sum + (it.quantity * it.cost_price), 0);
  const totalQty = items.reduce((sum, it) => sum + it.quantity, 0);

  const handleSave = async () => {
    if (items.length === 0) {
      await showAlert('Add at least one product to the invoice.');
      return;
    }
    for (const it of items) {
      if (it.quantity <= 0) {
        await showAlert(`"${it.product_name}" needs a quantity greater than 0.`);
        return;
      }
    }

    setSaving(true);
    try {
      const result = await window.sikapos.restock.create({
        supplier_name: supplierName || undefined,
        notes: notes || undefined,
        is_paid: isPaid ? 1 : 0,
        created_by: cashierName || undefined,
        items: items.map(it => ({
          product_id: it.product_id,
          product_name: it.product_name,
          quantity: it.quantity,
          cost_price: it.cost_price,
          expiry_date: it.expiry_date || undefined,
          batch_number: it.batch_number || undefined,
        })),
      });

      if (result.success) {
        void useCartStore.getState().refreshStockLevels();
        window.sikapos.notifications.show('Restock Saved', `Invoice ${result.invoice_number} — ${totalQty} units added to stock.`);
        onSaved();
      } else {
        await showAlert(result.message || 'Failed to save restock.');
      }
    } catch (err: any) {
      await showAlert(err?.message || 'An error occurred.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalPanel}>
        <div className={styles.modalHeader}>
          <h2>New Stock</h2>
          <button className={styles.closePanel} onClick={onClose}>×</button>
        </div>

        <div className={styles.modalBody}>
          {/* Supplier / Notes / Paid */}
          <div className={styles.formRow}>
            <div className={styles.formField}>
              <label>Supplier Name</label>
              <input value={supplierName} onChange={e => setSupplierName(e.target.value)} placeholder="e.g. ABC Distributors" />
            </div>
            <div className={styles.formField}>
              <label>Notes</label>
              <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes..." />
            </div>
          </div>

          <div className={styles.toggleRow}>
            <label className={styles.toggleLabel}>
              <input type="checkbox" checked={isPaid} onChange={e => setIsPaid(e.target.checked)} />
              <span>Invoice is paid</span>
            </label>
          </div>

          {/* Product search */}
          <div className={styles.formField}>
            <label>Add Product</label>
            <div className={styles.productSearch}>
              <input
                className={styles.productSearchInput}
                placeholder="Search by product name or barcode..."
                value={productQuery}
                onChange={e => setProductQuery(e.target.value)}
                onFocus={() => searchResults.length > 0 && setShowDropdown(true)}
                onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
              />
              {showDropdown && searchResults.length > 0 && (
                <div className={styles.productDropdown}>
                  {searchResults.map(p => (
                    <div key={p.id} className={styles.productOption} onMouseDown={() => addProduct(p)}>
                      <span className={styles.productOptionName}>
                        {p.name}
                        {p.size ? ` (${p.size})` : ''}
                      </span>
                      <span className={styles.productOptionMeta}>
                        Stock: {p.stock_qty} · {currency} {formatCurrency(p.cost_price)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Items table */}
          {items.length > 0 && (
            <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
              <table className={styles.itemsTable}>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th style={{ width: 70 }}>Qty</th>
                    <th style={{ width: 100 }}>Cost Price</th>
                    <th style={{ width: 120 }}>Expiry Date</th>
                    <th style={{ width: 100 }}>Batch #</th>
                    <th style={{ width: 80 }}>Line Total</th>
                    <th style={{ width: 30 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => (
                    <tr key={item.product_id}>
                      <td style={{ fontWeight: 500, color: 'var(--color-text-primary)', fontSize: 12 }}>
                        {item.product_name}
                      </td>
                      <td>
                        <input
                          type="number" min={1}
                          className={styles.itemInput}
                          value={item.quantity || ''}
                          onChange={e => updateItem(idx, 'quantity', parseInt(e.target.value) || 0)}
                        />
                      </td>
                      <td>
                        <input
                          type="number" min={0} step={0.01}
                          className={styles.itemInput}
                          value={item.cost_price || ''}
                          onChange={e => updateItem(idx, 'cost_price', parseFloat(e.target.value) || 0)}
                        />
                      </td>
                      <td>
                        <input
                          type="date"
                          className={styles.itemInput}
                          value={item.expiry_date || ''}
                          onChange={e => updateItem(idx, 'expiry_date', e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          className={styles.itemInput}
                          value={item.batch_number || ''}
                          placeholder="—"
                          onChange={e => updateItem(idx, 'batch_number', e.target.value)}
                        />
                      </td>
                      <td className={styles.monoCell} style={{ fontSize: 12, fontWeight: 600 }}>
                        {currency} {formatCurrency(item.quantity * item.cost_price)}
                      </td>
                      <td>
                        <button className={styles.removeItemBtn} onClick={() => removeItem(idx)} title="Remove">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Summary */}
          {items.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 24, padding: '8px 0', fontSize: 14 }}>
              <span style={{ color: 'var(--color-text-muted)' }}>
                {items.length} product{items.length !== 1 ? 's' : ''} · {totalQty} units
              </span>
              <span style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--color-gold)' }}>
                Total: {currency} {formatCurrency(totalCost)}
              </span>
            </div>
          )}
        </div>

        <div className={styles.modalFooter}>
          <button className={styles.cancelBtn} onClick={onClose}>Cancel</button>
          <button className={styles.saveBtn} onClick={handleSave} disabled={saving || items.length === 0}>
            {saving ? 'Saving...' : 'Save & Apply Stock'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* =============== INVOICE DETAIL VIEW =============== */
function InvoiceDetail({ invoice, currency, onClose }: {
  invoice: RestockInvoiceWithItems;
  currency: string;
  onClose: () => void;
}) {
  const formatDate = (dt: string) => {
    try { return new Date(dt).toLocaleString('en-GH', { dateStyle: 'medium', timeStyle: 'short' }); }
    catch { return dt; }
  };

  return (
    <div className={styles.detailOverlay}>
      <div className={styles.detailPanel}>
        <div className={styles.modalHeader}>
          <h2>Invoice {invoice.invoice_number}</h2>
          <button className={styles.closePanel} onClick={onClose}>×</button>
        </div>

        <div className={styles.detailBody}>
          <div className={styles.detailMeta}>
            <div className={styles.detailMetaItem}>
              <span className={styles.detailMetaLabel}>Supplier</span>
              <span className={styles.detailMetaValue}>{invoice.supplier_name || '—'}</span>
            </div>
            <div className={styles.detailMetaItem}>
              <span className={styles.detailMetaLabel}>Status</span>
              <span className={`${styles.paidBadge} ${invoice.is_paid ? styles.paidYes : styles.paidNo}`}>
                {invoice.is_paid ? 'Paid' : 'Unpaid'}
              </span>
            </div>
            <div className={styles.detailMetaItem}>
              <span className={styles.detailMetaLabel}>Created By</span>
              <span className={styles.detailMetaValue}>{invoice.created_by || '—'}</span>
            </div>
            <div className={styles.detailMetaItem}>
              <span className={styles.detailMetaLabel}>Date</span>
              <span className={styles.detailMetaValue}>{formatDate(invoice.created_at)}</span>
            </div>
            <div className={styles.detailMetaItem}>
              <span className={styles.detailMetaLabel}>Total Items</span>
              <span className={styles.detailMetaValue}>{invoice.total_items} units</span>
            </div>
            <div className={styles.detailMetaItem}>
              <span className={styles.detailMetaLabel}>Total Cost</span>
              <span className={styles.totalCostValue}>{currency} {formatCurrency(invoice.total_cost)}</span>
            </div>
          </div>

          {invoice.notes && (
            <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 16, padding: '10px 14px', background: 'var(--color-surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
              {invoice.notes}
            </p>
          )}

          <table className={styles.itemsTable}>
            <thead>
              <tr>
                <th>Product</th>
                <th>Qty</th>
                <th>Cost Price</th>
                <th>Line Total</th>
                <th>Expiry</th>
                <th>Batch #</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items.map(item => (
                <tr key={item.id}>
                  <td style={{ fontWeight: 500, color: 'var(--color-text-primary)' }}>{item.product_name}</td>
                  <td className={styles.monoCell}>{item.quantity}</td>
                  <td className={styles.monoCell}>{currency} {formatCurrency(item.cost_price)}</td>
                  <td className={styles.monoCell} style={{ fontWeight: 600 }}>{currency} {formatCurrency(item.quantity * item.cost_price)}</td>
                  <td style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                    {item.expiry_date ? new Date(item.expiry_date).toLocaleDateString('en-GH') : '—'}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
                    {item.batch_number || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
