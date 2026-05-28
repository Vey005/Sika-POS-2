import { useEffect, useState, useCallback } from 'react';
import { useAuthStore } from '../store/auth';
import { getApiUrl, API_CONFIG } from '../config/api';
import {
  Package,
  Search,
  RefreshCw,
  Filter,
  Download,
  ChevronLeft,
  ChevronRight,
  Barcode,
} from 'lucide-react';
import { productToExportRow, rowsToCsv } from '../utils/inventoryImportExport';

interface Product {
  id: number;
  name: string;
  barcode?: string;
  category: string;
  unit_price: number;
  cost_price: number;
  stock_qty: number;
  low_stock_threshold: number;
  is_active: boolean;
  created_at: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export default function Inventory() {
  const { token } = useAuthStore();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [stockFilter, setStockFilter] = useState<'all' | 'low' | 'out'>('all');
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, pages: 0 });
  const [categories, setCategories] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);

  // Debounce search query changes by 400ms
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
      setPagination((p) => ({ ...p, page: 1 }));
    }, 400);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(pagination.page),
        limit: String(pagination.limit),
      });
      if (debouncedSearchQuery) params.set('search', debouncedSearchQuery);
      if (categoryFilter) params.set('category', categoryFilter);
      if (stockFilter !== 'all') params.set('stock', stockFilter);

      const res = await fetch(getApiUrl(`${API_CONFIG.ENDPOINTS.INVENTORY}?${params}`), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch inventory');
      const data = await res.json();
      setProducts(data.products || []);
      setPagination(data.pagination || pagination);
      setCategories(data.categories || []);
    } catch (err: any) {
      console.error('Dashboard fetch error:', err);
      if (err?.message?.includes('401')) {
        const { logout } = useAuthStore.getState();
        logout();
      }
    } finally {
      setLoading(false);
    }
  }, [token, pagination.page, pagination.limit, debouncedSearchQuery, categoryFilter, stockFilter]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPagination((p) => ({ ...p, page: 1 }));
    setDebouncedSearchQuery(searchQuery);
  };

  const fetchAllProductsForExport = async (): Promise<Record<string, unknown>[]> => {
    const all: Record<string, unknown>[] = [];
    let page = 1;
    let pages = 1;
    const limit = 100;

    do {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      });
      if (debouncedSearchQuery) params.set('search', debouncedSearchQuery);
      if (categoryFilter) params.set('category', categoryFilter);
      if (stockFilter !== 'all') params.set('stock', stockFilter);

      const res = await fetch(getApiUrl(`${API_CONFIG.ENDPOINTS.INVENTORY}?${params}`), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch inventory for export');
      const data = await res.json();
      const batch = (data.products || []) as Record<string, unknown>[];
      all.push(...batch);
      pages = data.pagination?.pages || 1;
      page += 1;
    } while (page <= pages);

    return all;
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const allProducts = await fetchAllProductsForExport();
      if (!allProducts.length) {
        alert('No products found to export.');
        return;
      }

      const rows = allProducts.map((p) => productToExportRow(p));
      const csv = '\uFEFF' + rowsToCsv(rows);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sikapos_inventory_${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export error:', err);
      alert('Export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const stockStatus = (product: Product) => {
    if (product.stock_qty <= 0) return { label: 'Out of Stock', color: 'var(--danger)' };
    if (product.stock_qty <= product.low_stock_threshold) return { label: 'Low Stock', color: 'var(--warning)' };
    return { label: 'In Stock', color: 'var(--success)' };
  };

  const formatCurrency = (val: number) =>
    `GHS ${(val || 0).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Inventory</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
            {pagination.total} products synced from your POS
          </p>
        </div>
        <div className="page-actions">
          <button onClick={handleExport} disabled={exporting} className="btn-secondary">
            <Download size={16} />
            {exporting ? 'Exporting…' : 'Export'}
          </button>
          <button onClick={fetchProducts} className="btn-secondary">
            <RefreshCw size={16} /> Refresh
          </button>
        </div>
      </div>

      <div className="glass-panel" style={{ padding: 16, marginBottom: 16 }}>
        <form onSubmit={handleSearch} className="filter-form">
          <div className="filter-search">
            <Search
              size={18}
              style={{
                position: 'absolute',
                left: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)',
                pointerEvents: 'none',
              }}
            />
            <input
              type="search"
              className="portal-input"
              placeholder="Search name or barcode…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <select
            className="filter-select"
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value);
              setPagination((p) => ({ ...p, page: 1 }));
            }}
          >
            <option value="">All Categories</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
          <select
            className="filter-select"
            value={stockFilter}
            onChange={(e) => {
              setStockFilter(e.target.value as 'all' | 'low' | 'out');
              setPagination((p) => ({ ...p, page: 1 }));
            }}
          >
            <option value="all">All Stock</option>
            <option value="low">Low Stock</option>
            <option value="out">Out of Stock</option>
          </select>
          <button type="submit" className="btn-primary filter-apply">
            <Filter size={16} /> Apply
          </button>
        </form>
      </div>

      <div className="glass-panel" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 60, textAlign: 'center' }}>
            <RefreshCw size={32} className="spin" style={{ opacity: 0.5 }} />
          </div>
        ) : (
          <>
            <div className="portal-card-list">
              {products.map((product) => {
                const status = stockStatus(product);
                const statusClass = product.stock_qty <= 0 ? 'failed' : product.stock_qty <= product.low_stock_threshold ? 'warning' : 'completed';
                return (
                  <div key={product.id} className="data-card animate-fade-in" style={{ marginBottom: '4px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '12px' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: '16px', color: 'var(--text-main)', marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{product.name}</div>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ padding: '2px 8px', border: '1px solid var(--border-light)', borderRadius: '6px', fontSize: '11px', fontWeight: 500 }}>{product.category}</span>
                          {product.barcode && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: 'var(--text-muted)' }}>
                              <Barcode size={13} /> {product.barcode}
                            </span>
                          )}
                        </div>
                      </div>
                      <span className={`status-pill status-${statusClass}`}>
                        {status.label}
                      </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', paddingTop: '12px', borderTop: '1px solid var(--border-light)' }}>
                      <div>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px', fontWeight: 600 }}>Price</span>
                        <span style={{ fontWeight: 700, fontSize: '16px', color: 'var(--primary)' }}>{formatCurrency(product.unit_price)}</span>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px', fontWeight: 600 }}>In Stock</span>
                        <span style={{ fontWeight: 800, fontSize: '18px', color: 'var(--text-main)' }}>{product.stock_qty}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
              {products.length === 0 && (
                <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>
                  <Package size={40} style={{ opacity: 0.3, marginBottom: 8 }} />
                  <p>No products found</p>
                </div>
              )}
            </div>

            <div className="portal-table-wrap table-scroll">
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.02)' }}>
                    <th style={{ padding: '16px', textAlign: 'left', fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)' }}>Product</th>
                    <th style={{ padding: '16px', textAlign: 'left', fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)' }}>Barcode</th>
                    <th style={{ padding: '16px', textAlign: 'left', fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)' }}>Category</th>
                    <th style={{ padding: '16px', textAlign: 'right', fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)' }}>Price</th>
                    <th style={{ padding: '16px', textAlign: 'center', fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)' }}>Stock</th>
                    <th style={{ padding: '16px', textAlign: 'center', fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((product) => {
                    const status = stockStatus(product);
                    return (
                      <tr key={product.id} style={{ borderTop: '1px solid var(--border-light)' }}>
                        <td style={{ padding: '16px' }}>
                          <div style={{ fontWeight: 500 }}>{product.name}</div>
                          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                            Cost: {formatCurrency(product.cost_price)}
                          </div>
                        </td>
                        <td style={{ padding: '16px', fontFamily: 'monospace', fontSize: '13px' }}>
                          {product.barcode ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <Barcode size={14} color="var(--text-muted)" />
                              {product.barcode}
                            </div>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td style={{ padding: '16px' }}>
                          <span
                            style={{
                              padding: '4px 10px',
                              background: 'rgba(255,255,255,0.05)',
                              borderRadius: '4px',
                              fontSize: '12px',
                            }}
                          >
                            {product.category}
                          </span>
                        </td>
                        <td style={{ padding: '16px', textAlign: 'right', fontWeight: 600 }}>
                          {formatCurrency(product.unit_price)}
                        </td>
                        <td style={{ padding: '16px', textAlign: 'center' }}>
                          <span
                            style={{
                              fontWeight: 600,
                              color: product.stock_qty <= product.low_stock_threshold ? 'var(--warning)' : 'var(--text-main)',
                            }}
                          >
                            {product.stock_qty}
                          </span>
                        </td>
                        <td style={{ padding: '16px', textAlign: 'center' }}>
                          <span
                            style={{
                              padding: '4px 10px',
                              borderRadius: '4px',
                              fontSize: '11px',
                              fontWeight: 600,
                              background: status.color + '20',
                              color: status.color,
                            }}
                          >
                            {status.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  {products.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                        <Package size={48} style={{ marginBottom: '12px', opacity: 0.3 }} />
                        <p>No products found matching your filters</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="pagination-bar">
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
    </div>
  );
}
