import { useEffect, useState, useCallback } from 'react';
import { useAuthStore } from '../store/auth';
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
  const [categoryFilter, setCategoryFilter] = useState('');
  const [stockFilter, setStockFilter] = useState<'all' | 'low' | 'out'>('all');
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, pages: 0 });
  const [categories, setCategories] = useState<string[]>([]);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(pagination.page),
        limit: String(pagination.limit),
      });
      if (searchQuery) params.set('search', searchQuery);
      if (categoryFilter) params.set('category', categoryFilter);
      if (stockFilter !== 'all') params.set('stock', stockFilter);

      const res = await fetch(`/api/portal/inventory?${params}`, {
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
  }, [token, pagination.page, pagination.limit, searchQuery, categoryFilter, stockFilter]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPagination((p) => ({ ...p, page: 1 }));
    fetchProducts();
  };

  const handleExport = () => {
    const csv = [
      ['Name', 'Barcode', 'Category', 'Price', 'Cost', 'Stock', 'Status'].join(','),
      ...products.map((p) =>
        [
          `"${p.name}"`,
          p.barcode || '',
          p.category,
          p.unit_price,
          p.cost_price,
          p.stock_qty,
          p.is_active ? 'Active' : 'Inactive',
        ].join(',')
      ),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inventory-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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
      {/* Header & Filters */}
      <div style={{ marginBottom: 'clamp(16px, 4vw, 24px)' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 'clamp(16px, 4vw, 20px)',
            flexWrap: 'wrap',
            gap: 'clamp(12px, 3vw, 16px)',
          }}
        >
          <div>
            <h1 style={{ fontSize: 'clamp(20px, 5vw, 28px)', marginBottom: '4px' }}>Inventory</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: 'clamp(12px, 3vw, 14px)' }}>
              {pagination.total} products synced from your POS
            </p>
          </div>
          <div style={{ display: 'flex', gap: 'clamp(8px, 2vw, 12px)', flexWrap: 'wrap' }}>
            <button onClick={handleExport} className="btn-secondary" style={{ padding: 'clamp(8px, 2vw, 10px) clamp(12px, 3vw, 16px)' }}>
              <Download size={16} /> <span style={{ display: 'inline' }}>Export CSV</span>
            </button>
            <button onClick={fetchProducts} className="btn-secondary" style={{ padding: 'clamp(8px, 2vw, 10px) clamp(12px, 3vw, 16px)' }}>
              <RefreshCw size={16} /> <span style={{ display: 'inline' }}>Refresh</span>
            </button>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="glass-panel" style={{ padding: 'clamp(12px, 3vw, 16px)' }}>
          <form onSubmit={handleSearch} style={{ display: 'flex', gap: 'clamp(8px, 2vw, 12px)', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
              <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder="Search by name or barcode..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: 'clamp(8px, 2vw, 10px) clamp(12px, 3vw, 40px) clamp(8px, 2vw, 10px) clamp(12px, 3vw, 16px)',
                  background: 'rgba(0,0,0,0.2)',
                  border: '1px solid var(--border-light)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--text-main)',
                  outline: 'none',
                }}
              />
            </div>

            <select
              value={categoryFilter}
              onChange={(e) => {
                setCategoryFilter(e.target.value);
                setPagination((p) => ({ ...p, page: 1 }));
              }}
              style={{
                padding: '10px 16px',
                background: 'rgba(0,0,0,0.2)',
                border: '1px solid var(--border-light)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--text-main)',
                outline: 'none',
                minWidth: '140px',
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
              value={stockFilter}
              onChange={(e) => {
                setStockFilter(e.target.value as any);
                setPagination((p) => ({ ...p, page: 1 }));
              }}
              style={{
                padding: '10px 16px',
                background: 'rgba(0,0,0,0.2)',
                border: '1px solid var(--border-light)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--text-main)',
                outline: 'none',
                minWidth: '140px',
              }}
            >
              <option value="all">All Stock</option>
              <option value="low">Low Stock</option>
              <option value="out">Out of Stock</option>
            </select>

            <button type="submit" className="btn-primary" style={{ padding: '10px 20px' }}>
              <Filter size={16} /> Apply
            </button>
          </form>
        </div>
      </div>

      {/* Products Table */}
      <div className="glass-panel" style={{ padding: '0', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center' }}>
            <RefreshCw size={32} className="spin" style={{ opacity: 0.5 }} />
          </div>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
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

            {/* Pagination */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '16px 20px',
                borderTop: '1px solid var(--border-light)',
              }}
            >
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
