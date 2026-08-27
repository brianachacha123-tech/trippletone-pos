import { useState, useEffect } from 'react';
import api from '../../utils/api';

export default function InventoryPage() {
  const [products, setProducts] = useState([]);
  const [lowStock, setLowStock] = useState([]);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('all');
  const [adjustModal, setAdjustModal] = useState(null);
  const [adjustQty, setAdjustQty] = useState('');
  const [adjustNotes, setAdjustNotes] = useState('');

  useEffect(() => { loadProducts(); loadLowStock(); }, []);

  const loadProducts = async () => {
    try { const res = await api.get('/products'); setProducts(res.data); } catch (err) { console.error(err); }
  };

  const loadLowStock = async () => {
    try { const res = await api.get('/products/low-stock'); setLowStock(res.data); } catch (err) { console.error(err); }
  };

  const handleAdjust = async () => {
    try {
      await api.post(`/products/${adjustModal.id}/adjust-stock`, { quantity: parseFloat(adjustQty), notes: adjustNotes });
      setAdjustModal(null);
      setAdjustQty('');
      setAdjustNotes('');
      loadProducts();
      loadLowStock();
    } catch (err) { alert(err.response?.data?.error || 'Error adjusting stock'); }
  };

  const filteredProducts = products.filter(p => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase());
    if (tab === 'low') return matchSearch && p.current_stock > 0 && p.current_stock <= p.minimum_stock;
    if (tab === 'out') return matchSearch && p.current_stock === 0;
    return matchSearch;
  });

  const fmt = (n) => `KSh ${parseFloat(n || 0).toLocaleString()}`;

  return (
    <div>
      <div className="page-header">
        <h1>🏪 Inventory Management</h1>
        <p>Monitor stock levels and inventory transactions</p>
      </div>

      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="label">Total Products</div>
          <div className="value">{products.length}</div>
        </div>
        <div className="kpi-card warning">
          <div className="label">Low Stock Items</div>
          <div className="value">{lowStock.filter(l => l.stock_status === 'LOW STOCK').length}</div>
        </div>
        <div className="kpi-card expense">
          <div className="label">Out of Stock</div>
          <div className="value">{lowStock.filter(l => l.stock_status === 'OUT OF STOCK').length}</div>
        </div>
        <div className="kpi-card">
          <div className="label">Total Stock Value</div>
          <div className="value">{fmt(products.reduce((sum, p) => sum + parseFloat(p.current_stock) * parseFloat(p.buying_price), 0))}</div>
        </div>
      </div>

      <div className="tabs">
        <button className={`tab ${tab === 'all' ? 'active' : ''}`} onClick={() => setTab('all')}>All Products</button>
        <button className={`tab ${tab === 'low' ? 'active' : ''}`} onClick={() => setTab('low')}>Low Stock</button>
        <button className={`tab ${tab === 'out' ? 'active' : ''}`} onClick={() => setTab('out')}>Out of Stock</button>
      </div>

      <div className="filters-bar">
        <input type="text" placeholder="🔍 Search products..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th>Category</th>
              <th>Current Stock</th>
              <th>Min Stock</th>
              <th>Buying Price</th>
              <th>Stock Value</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredProducts.map(p => {
              const stockStatus = p.current_stock === 0 ? 'OUT OF STOCK' : p.current_stock <= p.minimum_stock ? 'LOW STOCK' : 'OK';
              const stockVal = parseFloat(p.current_stock) * parseFloat(p.buying_price);
              return (
                <tr key={p.id}>
                  <td style={{ fontWeight: 600 }}>{p.name}</td>
                  <td><span className="badge badge-info">{p.category_name}</span></td>
                  <td style={{ fontWeight: 600 }}>{parseFloat(p.current_stock).toLocaleString()} {p.unit}</td>
                  <td>{parseFloat(p.minimum_stock).toLocaleString()}</td>
                  <td>{fmt(p.buying_price)}</td>
                  <td>{fmt(stockVal)}</td>
                  <td>
                    <span className={`badge badge-${stockStatus === 'OK' ? 'success' : stockStatus === 'LOW STOCK' ? 'warning' : 'danger'}`}>
                      {stockStatus}
                    </span>
                  </td>
                  <td><button className="btn btn-sm btn-primary" onClick={() => setAdjustModal(p)}>Adjust</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {adjustModal && (
        <div className="modal-overlay" onClick={() => setAdjustModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>Adjust Stock: {adjustModal.name}</h2>
            <p style={{ marginBottom: '16px', color: '#666' }}>Current stock: {adjustModal.current_stock} {adjustModal.unit}</p>
            <div className="form-group">
              <label>Adjustment (positive to add, negative to subtract)</label>
              <input type="number" step="0.01" value={adjustQty} onChange={e => setAdjustQty(e.target.value)} placeholder="e.g. 10 or -5" />
            </div>
            <div className="form-group">
              <label>Notes</label>
              <input type="text" value={adjustNotes} onChange={e => setAdjustNotes(e.target.value)} placeholder="Reason for adjustment" />
            </div>
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setAdjustModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAdjust}>Apply Adjustment</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
