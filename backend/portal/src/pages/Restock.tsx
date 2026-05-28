import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useAuthStore } from '../store/auth';
import { getApiUrl, API_CONFIG } from '../config/api';
import {
  Truck,
  Plus,
  Search,
  Trash2,
  X,
  FileText,
  CheckCircle,
  Clock,
  ShoppingCart
} from 'lucide-react';

interface RestockItem {
  product_local_id?: number;
  name: string;
  barcode?: string;
  category?: string;
  unit_price?: number;
  quantity: number;
  cost_price: number;
  expiry_date?: string;
  batch_number?: string;
  is_new?: boolean;
  tax_category?: string;
}

interface RestockOrder {
  id: number;
  invoice_number: string;
  supplier_name?: string;
  notes?: string;
  is_paid: boolean;
  created_by: string;
  status: 'pending' | 'applied' | 'failed';
  total_items: number;
  total_cost: number;
  created_at: string;
  applied_at?: string;
  items: any[];
  new_products?: any[];
}

interface ProductSearchResult {
  local_id: number;
  name: string;
  barcode?: string;
  category: string;
  unit_price: number;
  cost_price: number;
  stock_qty: number;
  is_pharmacy: boolean;
}

export default function Restock() {
  const { token } = useAuthStore();
  const [orders, setOrders] = useState<RestockOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedOrder, setSelectedOrder] = useState<RestockOrder | null>(null);

  // New Restock Form State
  const [supplierName, setSupplierName] = useState('');
  const [notes, setNotes] = useState('');
  const [isPaid, setIsPaid] = useState(false);
  const [items, setItems] = useState<RestockItem[]>([]);

  // Product Search / Selection State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ProductSearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  // New Product Modal/Section State
  const [showNewProductForm, setShowNewProductForm] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);
  const [newProdName, setNewProdName] = useState('');
  const [newProdBarcode, setNewProdBarcode] = useState('');
  const [newProdCategory, setNewProdCategory] = useState('');
  const [newProdUnitPrice, setNewProdUnitPrice] = useState('');
  const [newProdCostPrice, setNewProdCostPrice] = useState('');
  const [newProdQty, setNewProdQty] = useState('');
  const [newProdExpiry, setNewProdExpiry] = useState('');
  const [newProdBatch, setNewProdBatch] = useState('');
  const [newProdIsTaxable, setNewProdIsTaxable] = useState(true);

  // Item Detail Editor State
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null);
  const [editQty, setEditQty] = useState<string>('');
  const [editCostPrice, setEditCostPrice] = useState<string>('');
  const [editExpiryDate, setEditExpiryDate] = useState<string>('');
  const [editBatchNumber, setEditBatchNumber] = useState<string>('');
  const [editUnitPrice, setEditUnitPrice] = useState<string>('');
  const [editBarcode, setEditBarcode] = useState<string>('');
  const [editCategory, setEditCategory] = useState<string>('');
  const [editIsTaxable, setEditIsTaxable] = useState<boolean>(true);

  // Submissions State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const openItemEditor = (index: number) => {
    const item = items[index];
    setEditingItemIndex(index);
    setEditQty(item.quantity.toString());
    setEditCostPrice(item.cost_price.toString());
    setEditExpiryDate(item.expiry_date || '');
    setEditBatchNumber(item.batch_number || '');
    if (item.is_new) {
      setEditUnitPrice((item.unit_price || 0).toString());
      setEditBarcode(item.barcode || '');
      setEditCategory(item.category || 'General');
      setEditIsTaxable(item.tax_category !== 'exempt');
    }
  };

  const saveItemEdits = () => {
    if (editingItemIndex === null) return;
    const newItems = [...items];
    const item = newItems[editingItemIndex];
    
    const qty = parseInt(editQty);
    const cost = parseFloat(editCostPrice);
    
    if (isNaN(qty) || qty <= 0) {
      alert('Please enter a valid quantity');
      return;
    }
    if (isNaN(cost) || cost < 0) {
      alert('Please enter a valid cost price');
      return;
    }
    
    item.quantity = qty;
    item.cost_price = cost;
    item.expiry_date = editExpiryDate || undefined;
    item.batch_number = editBatchNumber || undefined;
    
    if (item.is_new) {
      const unit = parseFloat(editUnitPrice);
      if (isNaN(unit) || unit <= 0) {
        alert('Please enter a valid retail price');
        return;
      }
      item.unit_price = unit;
      item.barcode = editBarcode || undefined;
      item.category = editCategory || 'General';
      item.tax_category = editIsTaxable ? 'standard' : 'exempt';
    }
    
    setItems(newItems);
    setEditingItemIndex(null);
  };

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(getApiUrl(API_CONFIG.ENDPOINTS.RESTOCK), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch restocks');
      const data = await res.json();
      setOrders(data.orders || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  const fetchCategories = useCallback(async () => {
    try {
      const res = await fetch(getApiUrl(API_CONFIG.ENDPOINTS.INVENTORY_CATEGORIES), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setCategories(data.categories || []);
        if (data.categories && data.categories.length > 0) {
          setNewProdCategory(data.categories[0]);
        }
      }
    } catch (err) {
      console.error(err);
    }
  }, [token]);

  useEffect(() => {
    fetchOrders();
    fetchCategories();
  }, [fetchOrders, fetchCategories]);

  useEffect(() => {
    const portalContent = document.querySelector('.portal-content') as HTMLElement;
    if (isModalOpen || selectedOrder) {
      document.body.style.overflow = 'hidden';
      if (portalContent) {
        portalContent.style.overflow = 'hidden';
      }
      window.scrollTo(0, 0);
    } else {
      document.body.style.overflow = '';
      if (portalContent) {
        portalContent.style.overflow = '';
      }
    }
    return () => {
      document.body.style.overflow = '';
      if (portalContent) {
        portalContent.style.overflow = '';
      }
    };
  }, [isModalOpen, selectedOrder]);

  // Handle product search
  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    const delayDebounce = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          getApiUrl(`${API_CONFIG.ENDPOINTS.INVENTORY_SEARCH}?q=${encodeURIComponent(searchQuery)}`),
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data.products || []);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => clearTimeout(delayDebounce);
  }, [searchQuery, token]);

  const addExistingProduct = (prod: ProductSearchResult) => {
    // Check if already added
    if (items.some(i => i.product_local_id === prod.local_id)) {
      alert('Product already added to list');
      return;
    }
    setItems([
      ...items,
      {
        product_local_id: prod.local_id,
        name: prod.name,
        barcode: prod.barcode,
        quantity: 1,
        cost_price: prod.cost_price,
        expiry_date: '',
        batch_number: '',
        is_new: false
      }
    ]);
    setSearchQuery('');
    setSearchResults([]);
  };

  const addNewProductToItems = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newProdName.trim()) return alert('Product Name is required');
    if (!newProdUnitPrice || parseFloat(newProdUnitPrice) <= 0) return alert('Valid Retail Price is required');
    if (!newProdCostPrice || parseFloat(newProdCostPrice) <= 0) return alert('Valid Cost Price is required');
    if (!newProdQty || parseInt(newProdQty) <= 0) return alert('Valid Quantity is required');

    const newItem: RestockItem = {
      name: newProdName,
      barcode: newProdBarcode || undefined,
      category: newProdCategory || 'General',
      unit_price: parseFloat(newProdUnitPrice),
      quantity: parseInt(newProdQty),
      cost_price: parseFloat(newProdCostPrice),
      expiry_date: newProdExpiry || undefined,
      batch_number: newProdBatch || undefined,
      is_new: true,
      tax_category: newProdIsTaxable ? 'standard' : 'exempt'
    };

    setItems([...items, newItem]);
    // Reset Form
    setNewProdName('');
    setNewProdBarcode('');
    setNewProdUnitPrice('');
    setNewProdCostPrice('');
    setNewProdQty('');
    setNewProdExpiry('');
    setNewProdBatch('');
    setNewProdIsTaxable(true);
    setShowNewProductForm(false);
  };


  // const updateItemCost = (index: number, cost: number) => {
  //   const newItems = [...items];
  //   newItems[index].cost_price = Math.max(0, cost);
  //   setItems(newItems);
  // };

  // const updateItemExpiry = (index: number, val: string) => {
  //   const newItems = [...items];
  //   newItems[index].expiry_date = val;
  //   setItems(newItems);
  // };

  // const updateItemBatch = (index: number, val: string) => {
  //   const newItems = [...items];
  //   newItems[index].batch_number = val;
  //   setItems(newItems);
  // };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (items.length === 0) return alert('Please add at least one item');

    const payload = {
      supplier_name: supplierName,
      notes,
      is_paid: isPaid,
      items: items.filter(i => !i.is_new).map(i => ({
        product_local_id: i.product_local_id,
        name: i.name,
        quantity: i.quantity,
        cost_price: i.cost_price,
        expiry_date: i.expiry_date || null,
        batch_number: i.batch_number || null
      })),
      new_products: items.filter(i => i.is_new).map(i => ({
        name: i.name,
        barcode: i.barcode || null,
        category: i.category || 'General',
        unit_price: i.unit_price,
        quantity: i.quantity,
        cost_price: i.cost_price,
        expiry_date: i.expiry_date || null,
        batch_number: i.batch_number || null,
        tax_category: i.tax_category || 'standard'
      }))
    };

    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(getApiUrl(API_CONFIG.ENDPOINTS.RESTOCK), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to create restock');
      }
      
      setSubmitSuccess(true);
      fetchOrders();
    } catch (err: any) {
      console.error(err);
      setSubmitError(err?.message || 'Error submitting restock order');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatCurrency = (val: number) =>
    `GHS ${(val || 0).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 'clamp(16px, 4vw, 24px)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: 'clamp(20px, 5vw, 28px)', marginBottom: '4px' }}>Restock Orders</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 'clamp(12px, 3vw, 14px)' }}>
            Enter new inventory stock and sync automatically with the desktop app.
          </p>
        </div>
        <button className="btn-primary" onClick={() => { setCurrentStep(1); setSubmitSuccess(false); setSubmitError(null); setIsModalOpen(true); }} style={{ padding: '8px 16px', fontSize: '13px', height: '36px', display: 'flex', alignItems: 'center', gap: '6px', borderRadius: '10px' }}>
          <Plus size={16} /> New Restock
        </button>
      </div>

      {/* Orders List */}
      <div className="glass-panel" style={{ padding: '0', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center' }}>
            <div className="spin" style={{ display: 'inline-block' }}><Truck size={32} style={{ opacity: 0.5 }} /></div>
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hide-mobile" style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.02)' }}>
                    <th style={{ padding: '16px', textAlign: 'left', fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)' }}>Date & Invoice</th>
                    <th style={{ padding: '16px', textAlign: 'left', fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)' }}>Supplier</th>
                    <th style={{ padding: '16px', textAlign: 'center', fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)' }}>Items</th>
                    <th style={{ padding: '16px', textAlign: 'right', fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)' }}>Total Cost</th>
                    <th style={{ padding: '16px', textAlign: 'center', fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)' }}>Payment</th>
                    <th style={{ padding: '16px', textAlign: 'center', fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr 
                      key={o.id} 
                      style={{ 
                        borderTop: '1px solid var(--border-light)',
                        cursor: 'pointer',
                        transition: 'background 0.2s'
                      }}
                      onClick={() => setSelectedOrder(o)}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(212, 160, 23, 0.03)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      <td style={{ padding: '16px' }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{o.invoice_number}</div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                          {new Date(o.created_at).toLocaleString()} by {o.created_by}
                        </div>
                      </td>
                      <td style={{ padding: '16px' }}>
                        <div style={{ fontWeight: 500 }}>{o.supplier_name || 'Generic Supplier'}</div>
                        {o.notes && <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{o.notes}</div>}
                      </td>
                      <td style={{ padding: '16px', textAlign: 'center', fontWeight: 500 }}>{o.total_items} items</td>
                      <td style={{ padding: '16px', textAlign: 'right', fontWeight: 600, color: 'var(--primary)' }}>
                        {formatCurrency(o.total_cost)}
                      </td>
                      <td style={{ padding: '16px', textAlign: 'center' }}>
                        <span style={{
                          padding: '4px 8px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 600,
                          background: o.is_paid ? 'rgba(34, 197, 94, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                          color: o.is_paid ? 'var(--success)' : 'var(--warning)'
                        }}>
                          {o.is_paid ? 'Paid' : 'Pending Payment'}
                        </span>
                      </td>
                      <td style={{ padding: '16px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                          {o.status === 'applied' ? (
                            <>
                              <CheckCircle size={16} color="var(--success)" />
                              <span style={{ fontSize: '13px', color: 'var(--success)', fontWeight: 500 }}>Synced</span>
                            </>
                          ) : (
                            <>
                              <Clock size={16} color="var(--warning)" />
                              <span style={{ fontSize: '13px', color: 'var(--warning)', fontWeight: 500 }}>Pending Sync</span>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {orders.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                        <FileText size={48} style={{ marginBottom: '12px', opacity: 0.3 }} />
                        <p>No restock orders created yet.</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile Card List View */}
            <div className="hide-desktop portal-card-list">
              {orders.map((o) => {
                const paidClass = o.is_paid ? 'paid' : 'pending';
                return (
                  <div 
                    key={o.id} 
                    className="data-card animate-fade-in"
                    onClick={() => setSelectedOrder(o)}
                    style={{ marginBottom: '6px' }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: '16px', color: 'var(--text-main)', fontFamily: 'monospace' }}>{o.invoice_number}</div>
                      </div>
                      <span className={`status-pill status-${paidClass}`}>
                        {o.is_paid ? 'Paid' : 'Pending'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px', alignItems: 'center' }}>
                      <span>Supplier: <strong style={{ color: 'var(--text-main)', fontWeight: 600 }}>{o.supplier_name || 'Generic Supplier'}</strong></span>
                      <span style={{ color: 'var(--border-strong)' }}>|</span>
                      <span>{o.total_items} items</span>
                      <span style={{ color: 'var(--border-strong)' }}>|</span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: o.status === 'applied' ? 'var(--success)' : 'var(--warning)', fontWeight: 600 }}>
                        {o.status === 'applied' ? (
                          <>
                            <CheckCircle size={12} /> Synced
                          </>
                        ) : (
                          <>
                            <Clock size={12} /> Pending
                          </>
                        )}
                      </span>
                    </div>

                    <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>
                          {new Date(o.created_at).toLocaleDateString()} · by {o.created_by}
                        </span>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ fontWeight: 800, color: 'var(--primary)', fontSize: '20px', letterSpacing: '-0.02em' }}>
                          {formatCurrency(o.total_cost)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
              {orders.length === 0 && (
                <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <FileText size={40} style={{ opacity: 0.3, marginBottom: '8px' }} />
                  <p>No restock orders created yet.</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* New Restock Modal */}
      {isModalOpen && createPortal(
        <div className="modal-overlay">
          <div className="glass-panel modal-panel" style={{
            maxWidth: '1000px',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            padding: '0',
            position: 'relative'
          }}>
            {/* Modal Header */}
            {!submitSuccess && (
              <div style={{ padding: '20px', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Truck size={22} color="var(--primary)" />
                  <h2 style={{ fontSize: '20px', margin: 0 }}>New Restock Order</h2>
                </div>
                <button onClick={() => setIsModalOpen(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                  <X size={20} />
                </button>
              </div>
            )}

            {submitSuccess ? (
              <div className="animate-fade-in" style={{ padding: '40px 24px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px', background: 'var(--bg-base)' }}>
                <div style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '50%',
                  background: 'rgba(34, 197, 94, 0.1)',
                  color: 'var(--success)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '2px solid var(--success)',
                  margin: '0 auto'
                }}>
                  <CheckCircle size={36} />
                </div>
                <div>
                  <h3 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 8px 0', color: 'var(--text-main)' }}>Invoice Submitted</h3>
                  <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                    Your restock order has been saved successfully.<br />It will sync to the desktop POS shortly.
                  </p>
                </div>
                
                <div style={{
                  background: 'rgba(255,255,255,0.01)',
                  padding: '16px',
                  borderRadius: '12px',
                  border: '1px solid var(--border-light)',
                  width: '100%',
                  maxWidth: '360px',
                  fontSize: '13px',
                  textAlign: 'left',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  marginTop: '8px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Supplier:</span>
                    <strong style={{ color: 'var(--text-main)' }}>{supplierName || 'Generic Supplier'}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Total Cost:</span>
                    <strong style={{ color: 'var(--primary)' }}>{formatCurrency(items.reduce((s, i) => s + (i.quantity * i.cost_price), 0))}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Total Items:</span>
                    <strong style={{ color: 'var(--text-main)' }}>{items.length} products ({items.reduce((s, i) => s + i.quantity, 0)} units)</strong>
                  </div>
                </div>

                <button 
                  className="btn-primary" 
                  onClick={() => {
                    setIsModalOpen(false);
                    setSupplierName('');
                    setNotes('');
                    setIsPaid(false);
                    setItems([]);
                    setSubmitSuccess(false);
                  }}
                  style={{ width: '100%', maxWidth: '360px', minHeight: '44px', borderRadius: '10px', marginTop: '12px' }}
                >
                  Done
                </button>
              </div>
            ) : (
              <>
                {/* Step Indicator */}
                <div style={{ padding: '12px 20px', background: 'rgba(255,255,255,0.01)', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                  {[
                    { number: 1, label: 'Supplier' },
                    { number: 2, label: 'Products' },
                    { number: 3, label: 'Review' }
                  ].map((step, idx) => (
                    <React.Fragment key={step.number}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '50%',
                          background: currentStep === step.number ? 'var(--primary)' : currentStep > step.number ? 'var(--success)' : 'rgba(255,255,255,0.05)',
                          color: currentStep === step.number ? '#000' : currentStep > step.number ? '#000' : 'var(--text-muted)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '11px',
                          fontWeight: 700,
                          transition: 'all 0.3s'
                        }}>
                          {currentStep > step.number ? '✓' : step.number}
                        </div>
                        <span style={{
                          fontSize: '12px',
                          fontWeight: 600,
                          color: currentStep === step.number ? 'var(--text-main)' : 'var(--text-muted)',
                          transition: 'color 0.3s'
                        }}>
                          {step.label}
                        </span>
                      </div>
                      {idx < 2 && (
                        <div style={{
                          flex: 1,
                          height: '2px',
                          background: currentStep > step.number ? 'var(--success)' : 'var(--border-light)',
                          transition: 'background 0.3s'
                        }}></div>
                      )}
                    </React.Fragment>
                  ))}
                </div>

                {/* Modal Body */}
                <div style={{
                  flex: 1,
                  overflowY: 'auto',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '20px',
                  background: 'var(--bg-base)'
                }}>
                  {/* Submission Error message */}
                  {submitError && (
                    <div style={{ 
                      background: 'rgba(239, 68, 68, 0.1)', 
                      border: '1px solid var(--danger)', 
                      color: 'var(--danger)', 
                      padding: '12px 16px', 
                      borderRadius: '12px', 
                      fontSize: '13px',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      marginBottom: '4px'
                    }}>
                      <X size={16} />
                      <span>{submitError}</span>
                    </div>
                  )}

                  {/* Step 1: Supplier & Status */}
                  {currentStep === 1 && (
                    <div className="glass-panel animate-fade-in" style={{ padding: '20px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-light)', borderRadius: '16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                        <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'var(--primary-glow)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <FileText size={18} style={{ color: 'var(--primary)' }} />
                        </div>
                        <h3 style={{ fontSize: '15px', fontWeight: 700, margin: 0, color: 'var(--text-main)' }}>Supplier Details</h3>
                      </div>
                      
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Supplier Name</label>
                          <input
                            type="text"
                            placeholder="e.g. Sika Wholesale"
                            value={supplierName}
                            onChange={(e) => setSupplierName(e.target.value)}
                            className="input-field"
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Invoice Notes</label>
                          <input
                            type="text"
                            placeholder="Internal reference / notes"
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            className="input-field"
                          />
                        </div>
                        <div
                          onClick={() => setIsPaid(!isPaid)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '12px',
                            padding: '14px', background: 'rgba(255,255,255,0.03)',
                            borderRadius: '12px', cursor: 'pointer',
                            border: isPaid ? '1px solid var(--success)' : '1px solid var(--border-light)',
                            transition: 'all 0.2s',
                            marginTop: '4px'
                          }}
                        >
                          <div style={{
                            width: '24px', height: '24px', borderRadius: '6px',
                            border: '2px solid', borderColor: isPaid ? 'var(--success)' : 'var(--border-strong)',
                            background: isPaid ? 'var(--success)' : 'transparent',
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                          }}>
                            {isPaid && <CheckCircle size={16} color="#000" />}
                          </div>
                          <span style={{ fontSize: '14px', fontWeight: 600, color: isPaid ? 'var(--success)' : 'var(--text-main)' }}>Invoice is Fully Paid</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Step 2: Add Items */}
                  {currentStep === 2 && (
                    <div className="glass-panel animate-fade-in" style={{ padding: '20px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-light)', borderRadius: '16px', position: 'relative' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'var(--primary-glow)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Plus size={18} style={{ color: 'var(--primary)' }} />
                          </div>
                          <h3 style={{ fontSize: '15px', fontWeight: 700, margin: 0, color: 'var(--text-main)' }}>Add Products</h3>
                        </div>

                        <button
                          className="btn-secondary"
                          style={{ padding: '6px 12px', fontSize: '12px', minHeight: '36px', borderRadius: '8px' }}
                          onClick={() => {
                            setNewProdName('');
                            setNewProdBarcode('');
                            setNewProdUnitPrice('');
                            setNewProdCostPrice('');
                            setNewProdQty('');
                            setNewProdExpiry('');
                            setNewProdBatch('');
                            setNewProdIsTaxable(true);
                            setShowNewProductForm(true);
                          }}
                        >
                          + New Profile
                        </button>
                      </div>

                      <div style={{ position: 'relative', marginBottom: searchResults.length > 0 ? '0' : '16px' }}>
                        <Search size={18} style={{ position: 'absolute', left: '14px', top: '15px', color: 'var(--text-muted)' }} />
                        <input
                          type="text"
                          placeholder={searching ? "Searching inventory..." : "Search product name or barcode..."}
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="input-field"
                          style={{ paddingLeft: '44px' }}
                        />
                      </div>

                      {/* Results List (Inline, in flow) */}
                      {searchResults.length > 0 ? (
                        <div className="animate-fade-in" style={{
                          background: 'rgba(255,255,255,0.01)',
                          border: '1px solid var(--border-light)',
                          borderRadius: '14px',
                          overflow: 'hidden',
                          marginTop: '16px'
                        }}>
                          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-light)', fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}>
                            <span>Search Results</span>
                            <button onClick={() => { setSearchQuery(''); setSearchResults([]); }} style={{ border: 'none', background: 'transparent', color: 'var(--primary)', cursor: 'pointer', padding: 0, fontSize: '11px', fontWeight: 600 }}>Clear</button>
                          </div>
                          <div style={{ maxHeight: '240px', overflowY: 'auto' }}>
                            {searchResults.map(prod => (
                              <div
                                key={prod.local_id}
                                onClick={() => addExistingProduct(prod)}
                                style={{
                                  padding: '12px 16px', cursor: 'pointer',
                                  borderBottom: '1px solid var(--border-light)',
                                  display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                                }}
                              >
                                <div>
                                  <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-main)' }}>{prod.name}</div>
                                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{prod.category} · Stock: {prod.stock_qty}</div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                  <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--primary)' }}>{formatCurrency(prod.unit_price)}</div>
                                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600, marginTop: '2px' }}>TAP TO ADD</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <>
                          {/* Real-time Added Items inside Step 2 */}
                          {items.length > 0 ? (
                            <div style={{ marginTop: '20px', borderTop: '1px solid var(--border-light)', paddingTop: '16px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                <h4 style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0, fontWeight: 600 }}>Invoice Items ({items.length})</h4>
                                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Tap item to edit details</span>
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '320px', overflowY: 'auto' }}>
                                {items.map((item, idx) => (
                                  <div 
                                    key={idx} 
                                    onClick={() => openItemEditor(idx)}
                                    className="data-card animate-fade-in"
                                    style={{ 
                                      display: 'flex', 
                                      justifyContent: 'space-between', 
                                      alignItems: 'center', 
                                      padding: '12px 14px', 
                                      cursor: 'pointer',
                                      border: '1px solid var(--border-light)',
                                      margin: 0
                                    }}
                                  >
                                    <div style={{ flex: 1, minWidth: 0, marginRight: '12px' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                        <span style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>{item.name}</span>
                                        {item.is_new && (
                                          <span style={{ fontSize: '9px', fontWeight: 600, color: 'var(--primary)', background: 'rgba(212, 160, 23, 0.1)', padding: '1px 5px', borderRadius: '4px', border: '0.5px solid var(--primary)' }}>New</span>
                                        )}
                                      </div>
                                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                                        <span>{item.quantity} pcs @ {formatCurrency(item.cost_price)}</span>
                                        {item.expiry_date && <span>· Exp: {item.expiry_date}</span>}
                                        {item.batch_number && <span>· Batch: {item.batch_number}</span>}
                                      </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                      <div style={{ textAlign: 'right' }}>
                                        <span style={{ fontWeight: 700, color: 'var(--text-main)', fontSize: '14px' }}>{formatCurrency(item.quantity * item.cost_price)}</span>
                                      </div>
                                      <button 
                                        onClick={(e) => { e.stopPropagation(); removeItem(idx); }} 
                                        style={{ border: 'none', background: 'rgba(239, 68, 68, 0.08)', color: 'var(--danger)', cursor: 'pointer', padding: '6px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                      >
                                        <Trash2 size={14} />
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)', marginTop: '20px', border: '1px dashed var(--border-light)', borderRadius: '12px' }}>
                              <ShoppingCart size={32} style={{ opacity: 0.3, marginBottom: '8px' }} />
                              <p style={{ margin: 0, fontSize: '13px' }}>Your restock invoice is empty. Search products above or create a new profile to get started.</p>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  {/* Step 3: Review Items */}
                  {currentStep === 3 && (
                    <div className="glass-panel animate-fade-in" style={{ padding: '20px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-light)', borderRadius: '16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                        <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'var(--primary-glow)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <ShoppingCart size={18} style={{ color: 'var(--primary)' }} />
                        </div>
                        <h3 style={{ fontSize: '15px', fontWeight: 700, margin: 0, color: 'var(--text-main)' }}>Review & Submit</h3>
                      </div>

                      {/* Form Summary Card */}
                      <div style={{ 
                        background: 'rgba(255,255,255,0.02)', 
                        padding: '16px', 
                        borderRadius: '12px', 
                        marginBottom: '20px', 
                        fontSize: '13px', 
                        display: 'flex', 
                        flexDirection: 'column', 
                        gap: '10px',
                        border: '1px solid var(--border-light)'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>Supplier:</span>
                          <strong style={{ color: 'var(--text-main)' }}>{supplierName || 'Generic Supplier'}</strong>
                        </div>
                        {notes && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <span style={{ color: 'var(--text-secondary)' }}>Invoice Notes:</span>
                            <span style={{ color: 'var(--text-main)', textAlign: 'right', maxWidth: '70%' }}>{notes}</span>
                          </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>Payment Status:</span>
                          <span className={`status-pill status-${isPaid ? 'paid' : 'pending'}`}>
                            {isPaid ? 'Fully Paid' : 'Pending Payment'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>Total Unique Items:</span>
                          <strong style={{ color: 'var(--text-main)' }}>{items.length} products</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>Total Qty:</span>
                          <strong style={{ color: 'var(--text-main)' }}>{items.reduce((acc, curr) => acc + curr.quantity, 0)} units</strong>
                        </div>
                      </div>

                      {/* Read-Only Items List */}
                      <h4 style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '10px', fontWeight: 600 }}>Invoice Items</h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '240px', overflowY: 'auto' }}>
                        {items.map((item, index) => (
                          <div key={index} style={{ padding: '12px', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-light)', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ minWidth: 0, flex: 1, marginRight: '10px' }}>
                              <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                                {item.quantity} × {formatCurrency(item.cost_price)}
                              </div>
                            </div>
                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                              <span style={{ fontWeight: 700, color: 'var(--text-main)', fontSize: '13px' }}>
                                {formatCurrency(item.quantity * item.cost_price)}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Modal Footer */}
                <div style={{ padding: '20px', borderTop: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: '15px', fontWeight: 600 }}>
                    Total: <span style={{ color: 'var(--primary)', fontWeight: 700 }}>{formatCurrency(items.reduce((s, i) => s + (i.quantity * i.cost_price), 0))}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    {currentStep === 1 && (
                      <>
                        <button className="btn-secondary" onClick={() => setIsModalOpen(false)} style={{ padding: '8px 16px', fontSize: '13px', height: '36px', borderRadius: '10px' }}>Cancel</button>
                        <button className="btn-primary" onClick={() => setCurrentStep(2)} style={{ padding: '8px 16px', fontSize: '13px', height: '36px', borderRadius: '10px' }}>Next: Products</button>
                      </>
                    )}
                    {currentStep === 2 && (
                      <>
                        <button className="btn-secondary" onClick={() => setCurrentStep(1)} style={{ padding: '8px 16px', fontSize: '13px', height: '36px', borderRadius: '10px' }}>Back</button>
                        <button className="btn-primary" onClick={() => setCurrentStep(3)} disabled={items.length === 0} style={{ padding: '8px 16px', fontSize: '13px', height: '36px', borderRadius: '10px', opacity: items.length === 0 ? 0.5 : 1 }}>Next: Review</button>
                      </>
                    )}
                    {currentStep === 3 && (
                      <>
                        <button className="btn-secondary" onClick={() => setCurrentStep(2)} style={{ padding: '8px 16px', fontSize: '13px', height: '36px', borderRadius: '10px' }}>Back</button>
                        <button className="btn-primary" onClick={handleSubmit} disabled={items.length === 0} style={{ padding: '8px 16px', fontSize: '13px', height: '36px', borderRadius: '10px' }}>Submit Invoice</button>
                      </>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* Item Detail Editor Overlay */}
            {editingItemIndex !== null && (
              <div style={{
                position: 'absolute',
                inset: 0,
                background: 'rgba(18, 20, 24, 0.96)',
                backdropFilter: 'blur(10px)',
                zIndex: 110,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden'
              }}>
                {/* Editor Header */}
                <div style={{ padding: '20px', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px' }}>Edit Item Details</span>
                    <h3 style={{ fontSize: '16px', margin: '2px 0 0 0', fontWeight: 700, color: 'var(--text-main)' }}>
                      {items[editingItemIndex]?.name}
                    </h3>
                  </div>
                  <button 
                    onClick={() => setEditingItemIndex(null)} 
                    style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}
                  >
                    <X size={20} />
                  </button>
                </div>

                {/* Editor Body */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  
                  {/* Quantity Counter */}
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '8px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Quantity</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'rgba(255,255,255,0.02)', padding: '6px', borderRadius: '14px', border: '1px solid var(--border-light)' }}>
                      <button 
                        type="button"
                        onClick={() => setEditQty(q => Math.max(1, (parseInt(q) || 0) - 1).toString())}
                        style={{ width: '40px', height: '40px', borderRadius: '10px', border: 'none', background: 'rgba(255,255,255,0.05)', color: 'var(--text-main)', fontSize: '18px', fontWeight: 700, cursor: 'pointer' }}
                      >
                        -
                      </button>
                      <input 
                        type="number"
                        value={editQty}
                        onChange={(e) => setEditQty(e.target.value)}
                        style={{ flex: 1, textAlign: 'center', border: 'none', background: 'transparent', color: 'var(--text-main)', fontSize: '18px', fontWeight: 700, outline: 'none' }}
                      />
                      <button 
                        type="button"
                        onClick={() => setEditQty(q => ((parseInt(q) || 0) + 1).toString())}
                        style={{ width: '40px', height: '40px', borderRadius: '10px', border: 'none', background: 'var(--primary)', color: '#000', fontSize: '18px', fontWeight: 700, cursor: 'pointer' }}
                      >
                        +
                      </button>
                    </div>
                  </div>

                  {/* Cost Price */}
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Supplier Cost Price (GHS)</label>
                    <input 
                      type="number"
                      step="0.01"
                      value={editCostPrice}
                      onChange={(e) => setEditCostPrice(e.target.value)}
                      className="input-field"
                    />
                  </div>

                  {/* Expiry Date */}
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Expiry Date</label>
                    <input 
                      type="date"
                      value={editExpiryDate}
                      onChange={(e) => setEditExpiryDate(e.target.value)}
                      className="input-field"
                    />
                  </div>

                  {/* Batch Number */}
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Batch Number</label>
                    <input 
                      type="text"
                      placeholder="e.g. B12-X"
                      value={editBatchNumber}
                      onChange={(e) => setEditBatchNumber(e.target.value)}
                      className="input-field"
                    />
                  </div>

                  {/* Extra profile settings for new products */}
                  {items[editingItemIndex]?.is_new && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', borderTop: '1px solid var(--border-light)', paddingTop: '16px', marginTop: '8px' }}>
                      <h4 style={{ fontSize: '13px', color: 'var(--text-main)', margin: '0 0 4px 0', fontWeight: 700 }}>New Product Profile Details</h4>
                      
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Retail Unit Price (GHS)</label>
                        <input 
                          type="number"
                          step="0.01"
                          value={editUnitPrice}
                          onChange={(e) => setEditUnitPrice(e.target.value)}
                          className="input-field"
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Barcode</label>
                        <input 
                          type="text"
                          value={editBarcode}
                          onChange={(e) => setEditBarcode(e.target.value)}
                          className="input-field"
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Category</label>
                        <select 
                          value={editCategory} 
                          onChange={(e) => setEditCategory(e.target.value)} 
                          className="input-field"
                        >
                          {categories.map(c => <option key={c} value={c}>{c}</option>)}
                          <option value="General">General</option>
                        </select>
                      </div>

                      <div
                        onClick={() => setEditIsTaxable(!editIsTaxable)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '10px',
                          padding: '10px 14px', background: 'rgba(255,255,255,0.02)',
                          borderRadius: '8px', cursor: 'pointer',
                          border: '1px solid var(--border-light)'
                        }}
                      >
                        <div style={{
                          width: '20px', height: '20px', borderRadius: '4px',
                          border: '2px solid', borderColor: editIsTaxable ? 'var(--primary)' : 'var(--border-strong)',
                          background: editIsTaxable ? 'var(--primary)' : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                          {editIsTaxable && <CheckCircle size={14} color="#000" />}
                        </div>
                        <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-main)' }}>Product is Taxable (Standard Rate)</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Editor Footer */}
                <div style={{ padding: '20px', borderTop: '1px solid var(--border-light)', display: 'flex', gap: '12px', background: 'rgba(0,0,0,0.2)' }}>
                  <button 
                    type="button"
                    className="btn-secondary" 
                    onClick={() => setEditingItemIndex(null)}
                    style={{ flex: 1 }}
                  >
                    Cancel
                  </button>
                  <button 
                    type="button"
                    className="btn-primary" 
                    onClick={saveItemEdits}
                    style={{ flex: 2 }}
                  >
                    Save Changes
                  </button>
                </div>
              </div>
            )}

            {/* New Product Profile Overlay */}
            {showNewProductForm && (
              <div style={{
                position: 'absolute',
                inset: 0,
                background: 'rgba(18, 20, 24, 0.96)',
                backdropFilter: 'blur(10px)',
                zIndex: 110,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden'
              }}>
                {/* Header */}
                <div style={{ padding: '20px', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px' }}>Create Profile</span>
                    <h3 style={{ fontSize: '16px', margin: '2px 0 0 0', fontWeight: 700, color: 'var(--text-main)' }}>
                      New Product Profile
                    </h3>
                  </div>
                  <button 
                    onClick={() => setShowNewProductForm(false)} 
                    style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}
                  >
                    <X size={20} />
                  </button>
                </div>

                {/* Body */}
                <form onSubmit={addNewProductToItems} style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                  <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    
                    {/* Name */}
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Product Name *</label>
                      <input 
                        type="text"
                        placeholder="e.g. Paracetamol 500mg"
                        value={newProdName}
                        onChange={(e) => setNewProdName(e.target.value)}
                        className="input-field"
                        required
                      />
                    </div>

                    {/* Barcode & Category */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Barcode</label>
                        <input 
                          type="text"
                          placeholder="Optional"
                          value={newProdBarcode}
                          onChange={(e) => setNewProdBarcode(e.target.value)}
                          className="input-field"
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Category</label>
                        <select 
                          value={newProdCategory} 
                          onChange={(e) => setNewProdCategory(e.target.value)} 
                          className="input-field"
                        >
                          {categories.map(c => <option key={c} value={c}>{c}</option>)}
                          <option value="General">General</option>
                        </select>
                      </div>
                    </div>

                    {/* Prices */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Supplier Cost (GHS) *</label>
                        <input 
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={newProdCostPrice}
                          onChange={(e) => setNewProdCostPrice(e.target.value)}
                          className="input-field"
                          required
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Retail Price (GHS) *</label>
                        <input 
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={newProdUnitPrice}
                          onChange={(e) => setNewProdUnitPrice(e.target.value)}
                          className="input-field"
                          required
                        />
                      </div>
                    </div>

                    {/* Initial Quantity */}
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Restock Quantity *</label>
                      <input 
                        type="number"
                        placeholder="1"
                        value={newProdQty}
                        onChange={(e) => setNewProdQty(e.target.value)}
                        className="input-field"
                        required
                      />
                    </div>

                    {/* Expiry & Batch */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Expiry Date</label>
                        <input 
                          type="date"
                          value={newProdExpiry}
                          onChange={(e) => setNewProdExpiry(e.target.value)}
                          className="input-field"
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Batch Number</label>
                        <input 
                          type="text"
                          placeholder="Optional"
                          value={newProdBatch}
                          onChange={(e) => setNewProdBatch(e.target.value)}
                          className="input-field"
                        />
                      </div>
                    </div>

                    {/* Taxable */}
                    <div
                      onClick={() => setNewProdIsTaxable(!newProdIsTaxable)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '10px',
                        padding: '12px 14px', background: 'rgba(255,255,255,0.02)',
                        borderRadius: '10px', cursor: 'pointer',
                        border: '1px solid var(--border-light)',
                        marginTop: '4px'
                      }}
                    >
                      <div style={{
                        width: '20px', height: '20px', borderRadius: '4px',
                        border: '2px solid', borderColor: newProdIsTaxable ? 'var(--primary)' : 'var(--border-strong)',
                        background: newProdIsTaxable ? 'var(--primary)' : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                      }}>
                        {newProdIsTaxable && <CheckCircle size={14} color="#000" />}
                      </div>
                      <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-main)' }}>Product is Taxable (Standard Rate)</span>
                    </div>

                  </div>

                  {/* Footer */}
                  <div style={{ padding: '20px', borderTop: '1px solid var(--border-light)', display: 'flex', gap: '12px', background: 'rgba(0,0,0,0.2)' }}>
                    <button 
                      type="button"
                      className="btn-secondary" 
                      onClick={() => setShowNewProductForm(false)}
                      style={{ flex: 1 }}
                    >
                      Cancel
                    </button>
                    <button 
                      type="submit"
                      className="btn-primary" 
                      style={{ flex: 2 }}
                    >
                      Add Product to Invoice
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Submitting Loading Overlay */}
            {isSubmitting && (
              <div style={{
                position: 'absolute',
                inset: 0,
                background: 'rgba(18, 20, 24, 0.85)',
                backdropFilter: 'blur(4px)',
                zIndex: 120,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'column',
                gap: '16px'
              }}>
                <div className="spin"><Truck size={36} color="var(--primary)" /></div>
                <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-main)' }}>Saving restock invoice...</span>
              </div>
            )}

          </div>
        </div>,
        document.body
      )}

      {/* Restock Invoice Details Modal */}
      {selectedOrder && createPortal(
        <div className="modal-overlay" onClick={() => setSelectedOrder(null)}>
          <div className="glass-panel modal-panel" style={{
            maxWidth: '750px',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            padding: '0',
          }} onClick={e => e.stopPropagation()}>
            {/* Modal Header */}
            <div style={{ padding: '20px', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <FileText size={22} color="var(--primary)" />
                <h2 style={{ fontSize: '20px', margin: 0, color: 'var(--text-main)' }}>Restock Invoice Details</h2>
              </div>
              <button onClick={() => setSelectedOrder(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
              
              {/* Invoice Info Grid */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '16px',
                background: 'rgba(255,255,255,0.01)',
                padding: '16px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-light)'
              }}>
                <div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Invoice Number</div>
                  <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text-main)', marginTop: '4px', fontFamily: 'monospace' }}>
                    {selectedOrder.invoice_number}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Supplier</div>
                  <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-main)', marginTop: '4px' }}>
                    {selectedOrder.supplier_name || 'Generic Supplier'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Date Created</div>
                  <div style={{ fontWeight: 500, fontSize: '13px', color: 'var(--text-main)', marginTop: '4px' }}>
                    {new Date(selectedOrder.created_at).toLocaleString()}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Created By</div>
                  <div style={{ fontWeight: 500, fontSize: '13px', color: 'var(--text-main)', marginTop: '4px' }}>
                    {selectedOrder.created_by}
                  </div>
                </div>
              </div>

              {/* Status Badges */}
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Payment Status:</span>
                  <span style={{
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: 600,
                    background: selectedOrder.is_paid ? 'rgba(34, 197, 94, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                    color: selectedOrder.is_paid ? 'var(--success)' : 'var(--warning)'
                  }}>
                    {selectedOrder.is_paid ? 'Fully Paid' : 'Pending Payment'}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Sync Status:</span>
                  <span style={{
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: 600,
                    background: selectedOrder.status === 'applied' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                    color: selectedOrder.status === 'applied' ? 'var(--success)' : 'var(--warning)'
                  }}>
                    {selectedOrder.status === 'applied' ? 'Synced (Applied)' : 'Pending Sync'}
                  </span>
                </div>
              </div>

              {/* Notes */}
              {selectedOrder.notes && (
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '6px' }}>Invoice Notes</div>
                  <div style={{
                    background: 'rgba(0,0,0,0.15)',
                    padding: '12px',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '13px',
                    color: 'var(--text-muted)',
                    borderLeft: '3px solid var(--primary)'
                  }}>
                    {selectedOrder.notes}
                  </div>
                </div>
              )}

              {/* Items List */}
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '12px', color: 'var(--text-main)' }}>
                  Invoice Items ({selectedOrder.items ? selectedOrder.items.length : 0})
                </h3>

                {/* Desktop View */}
                <div className="hide-mobile" style={{ overflowX: 'auto', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--border-light)' }}>
                        <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>Product Name</th>
                        <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 600, color: 'var(--text-muted)' }}>Quantity</th>
                        <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: 'var(--text-muted)' }}>Cost Price</th>
                        <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: 'var(--text-muted)' }}>Total Cost</th>
                        <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 600, color: 'var(--text-muted)' }}>Expiry Date</th>
                        <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 600, color: 'var(--text-muted)' }}>Batch No</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedOrder.items && selectedOrder.items.map((item: any, idx: number) => (
                        <tr key={idx} style={{ borderBottom: idx < selectedOrder.items.length - 1 ? '1px solid var(--border-light)' : 'none' }}>
                          <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-main)' }}>
                            <div>{item.name}</div>
                            {item.barcode && <div style={{ fontSize: '11px', fontWeight: 'normal', color: 'var(--text-muted)', marginTop: '2px' }}>Barcode: {item.barcode}</div>}
                            {item.is_new && (
                              <span style={{
                                fontSize: '9px',
                                fontWeight: 600,
                                color: 'var(--primary)',
                                background: 'rgba(212, 160, 23, 0.1)',
                                border: '1px solid var(--primary)',
                                padding: '2px 6px',
                                borderRadius: '3px',
                                marginTop: '4px',
                                display: 'inline-block'
                              }}>
                                New Product Profile
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 500 }}>
                            {item.quantity}
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 500 }}>
                            GHS {formatCurrency(item.cost_price)}
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: 'var(--text-main)' }}>
                            GHS {formatCurrency(item.quantity * item.cost_price)}
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>
                            {item.expiry_date || '---'}
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>
                            {item.batch_number || '---'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile View */}
                <div className="hide-desktop" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {selectedOrder.items && selectedOrder.items.map((item: any, idx: number) => (
                    <div key={idx} className="data-card" style={{ padding: '12px 14px' }}>
                      <div style={{ fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>{item.name}</div>
                      {item.barcode && <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Barcode: {item.barcode}</div>}
                      {item.is_new && (
                        <span style={{
                          fontSize: '9px',
                          fontWeight: 600,
                          color: 'var(--primary)',
                          background: 'rgba(212, 160, 23, 0.1)',
                          border: '1px solid var(--primary)',
                          padding: '2px 6px',
                          borderRadius: '3px',
                          margin: '4px 0 8px 0',
                          display: 'inline-block'
                        }}>
                          New Product Profile
                        </span>
                      )}

                      <div className="data-card-row">
                        <span className="data-card-label">Quantity</span>
                        <span>{item.quantity}</span>
                      </div>
                      <div className="data-card-row">
                        <span className="data-card-label">Cost Price</span>
                        <span>GHS {formatCurrency(item.cost_price)}</span>
                      </div>
                      <div className="data-card-row">
                        <span className="data-card-label">Total Cost</span>
                        <span style={{ fontWeight: 600 }}>GHS {formatCurrency(item.quantity * item.cost_price)}</span>
                      </div>
                      <div className="data-card-row">
                        <span className="data-card-label">Expiry / Batch</span>
                        <span>{item.expiry_date || 'N/A'} / {item.batch_number || 'N/A'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>

            {/* Modal Footer */}
            <div style={{ padding: '20px', borderTop: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.1)' }}>
              <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-main)' }}>
                Total Invoice Cost: <span style={{ color: 'var(--primary)', fontSize: '18px', fontWeight: 700 }}>GHS {formatCurrency(selectedOrder.total_cost)}</span>
              </div>
              <button className="btn-secondary" onClick={() => setSelectedOrder(null)} style={{ padding: '10px 20px' }}>Close</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
