import { useState, useEffect } from 'react';
import api from '../../utils/api';

export default function InventoryPage() {
  const [products, setProducts] = useState([]);
  const [lowStock, setLowStock] = useState([]);
  const [inventoryReport, setInventoryReport] = useState(null);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('all');
  const [adjustModal, setAdjustModal] = useState(null);
  const [adjustQty, setAdjustQty] = useState('');
  const [adjustNotes, setAdjustNotes] = useState('');
  const [reportPeriod, setReportPeriod] = useState('daily');
  const [reportDateFrom, setReportDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
  });
  const [reportDateTo, setReportDateTo] = useState(() => new Date().toISOString().split('T')[0]);
  const [selectedProduct, setSelectedProduct] = useState('');
  const [showReport, setShowReport] = useState(false);

  useEffect(() => { loadProducts(); loadLowStock(); }, []);

  useEffect(() => {
    if (showReport) {
      loadInventoryReport();
    }
  }, [reportDateFrom, reportDateTo, selectedProduct, showReport]);

  const loadProducts = async () => {
    try { const res = await api.get('/products'); setProducts(res.data); } catch (err) { console.error(err); }
  };

  const loadLowStock = async () => {
    try { const res = await api.get('/products/low-stock'); setLowStock(res.data); } catch (err) { console.error(err); }
  };

  const loadInventoryReport = async () => {
    try {
      const params = {
        date_from: reportDateFrom,
        date_to: reportDateTo,
      };
      if (selectedProduct) params.product_id = selectedProduct;
      const res = await api.get('/products/inventory-report', { params });
      setInventoryReport(res.data);
    } catch (err) { console.error(err); }
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

  const handleDownload = async () => {
    try {
      const params = new URLSearchParams({
        date_from: reportDateFrom,
        date_to: reportDateTo,
      });
      if (selectedProduct) params.append('product_id', selectedProduct);

      const token = localStorage.getItem('token');
      const response = await fetch(`${api.defaults.baseURL}/products/inventory-report/download?${params}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) throw new Error('Download failed');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `inventory-report-${reportDateFrom}-to-${reportDateTo}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert('Error downloading report');
      console.error(err);
    }
  };

  const setQuickPeriod = (period) => {
    const today = new Date();
    let from;
    switch (period) {
      case 'daily':
        from = new Date(today);
        break;
      case 'weekly':
        from = new Date(today);
        from.setDate(from.getDate() - 7);
        break;
      case 'monthly':
        from = new Date(today);
        from.setMonth(from.getMonth() - 1);
        break;
      default:
        from = new Date(today);
        from.setDate(from.getDate() - 7);
    }
    setReportDateFrom(from.toISOString().split('T')[0]);
    setReportDateTo(today.toISOString().split('T')[0]);
    setReportPeriod(period);
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
        <h1>🏪 Inventory</h1>
        <p>Monitor stock levels, inventory movements, and download reports</p>
      </div>

      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="label">Total Products</div>
          <div className="value">{products.length}</div>
        </div>
        <div className="kpi-card warning">
          <div className="label">Low Stock</div>
          <div className="value">{lowStock.filter(l => l.stock_status === 'LOW STOCK').length}</div>
        </div>
        <div className="kpi-card expense">
          <div className="label">Out of Stock</div>
          <div className="value">{lowStock.filter(l => l.stock_status === 'OUT OF STOCK').length}</div>
        </div>
        <div className="kpi-card">
          <div className="label">Stock Value</div>
          <div className="value">{fmt(products.reduce((sum, p) => sum + parseFloat(p.current_stock) * parseFloat(p.buying_price), 0))}</div>
        </div>
      </div>

      <div className="tabs">
        <button className={`tab ${tab === 'all' ? 'active' : ''}`} onClick={() => setTab('all')}>All</button>
        <button className={`tab ${tab === 'low' ? 'active' : ''}`} onClick={() => setTab('low')}>Low Stock</button>
        <button className={`tab ${tab === 'out' ? 'active' : ''}`} onClick={() => setTab('out')}>Out of Stock</button>
        <button className={`tab ${tab === 'report' ? 'active' : ''}`} onClick={() => { setTab('report'); setShowReport(true); }}>Stock Report</button>
      </div>

      {tab !== 'report' ? (
        <>
          <div className="filters-bar">
            <input type="text" placeholder="🔍 Search products..." value={search} onChange={e => setSearch(e.target.value)} style={{ width: '100%' }} />
          </div>

          {/* Stock List View - Dropdown style */}
          <div className="table-container">
            <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
              <table style={{ minWidth: '750px' }}>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Category</th>
                    <th>Stock</th>
                    <th>Min</th>
                    <th>Buy Price</th>
                    <th>Value</th>
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
          </div>
        </>
      ) : (
        /* Inventory Report Section */
        <div>
          <div className="card" style={{ marginBottom: '24px' }}>
            <h3 style={{ marginBottom: '16px', fontSize: '16px' }}>📊 Stock Movement Report</h3>
            <div className="filters-bar" style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <label style={{ fontSize: '13px', fontWeight: '500' }}>Period:</label>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button
                    className={`btn btn-sm ${reportPeriod === 'daily' ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => setQuickPeriod('daily')}
                  >
                    Today
                  </button>
                  <button
                    className={`btn btn-sm ${reportPeriod === 'weekly' ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => setQuickPeriod('weekly')}
                  >
                    Weekly
                  </button>
                  <button
                    className={`btn btn-sm ${reportPeriod === 'monthly' ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => setQuickPeriod('monthly')}
                  >
                    Monthly
                  </button>
                </div>
              </div>
              <input
                type="date"
                value={reportDateFrom}
                onChange={e => setReportDateFrom(e.target.value)}
                style={{ flex: '1 1 140px' }}
              />
              <input
                type="date"
                value={reportDateTo}
                onChange={e => setReportDateTo(e.target.value)}
                style={{ flex: '1 1 140px' }}
              />
              <select
                value={selectedProduct}
                onChange={e => setSelectedProduct(e.target.value)}
                style={{ flex: '1 1 180px' }}
              >
                <option value="">All Products</option>
                {products.map(p => (
                  <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>
                ))}
              </select>
              <button className="btn btn-success" onClick={handleDownload}>
                ⬇️ Download CSV
              </button>
            </div>

            {/* Product Dropdown / Select for quick viewing */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '13px', fontWeight: '500', marginBottom: '8px', display: 'block' }}>
                Quick Select Product:
              </label>
              <select
                value={selectedProduct}
                onChange={e => setSelectedProduct(e.target.value)}
                style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '2px solid #e8e8e8', fontSize: '14px' }}
              >
                <option value="">📦 All Products - Full Stock Report</option>
                {products.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} — Current Stock: {parseFloat(p.current_stock).toLocaleString()} {p.unit}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Report Table */}
          {inventoryReport && (
            <div className="table-container">
              <div style={{ padding: '16px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '16px' }}>
                    📋 Stock Report: {reportDateFrom} to {reportDateTo}
                  </h3>
                  <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#666' }}>
                    {inventoryReport.items.length} product{inventoryReport.items.length !== 1 ? 's' : ''}
                    {selectedProduct ? ' (filtered)' : ''}
                  </p>
                </div>
                <button className="btn btn-success" onClick={handleDownload}>
                  ⬇️ Download CSV
                </button>
              </div>
              <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                <table style={{ minWidth: '800px' }}>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Unit</th>
                      <th>Buy Price</th>
                      <th style={{ backgroundColor: '#e8f5e9' }}>Opening Stock</th>
                      <th style={{ backgroundColor: '#e3f2fd' }}>Purchases</th>
                      <th style={{ backgroundColor: '#fce4ec' }}>Units Sold</th>
                      <th style={{ backgroundColor: '#fff3e0' }}>Adjustments</th>
                      <th style={{ backgroundColor: '#f3e5f5' }}>Closing Stock</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inventoryReport.items.map(item => (
                      <tr key={item.product_id}>
                        <td style={{ fontWeight: 600 }}>{item.product_name}</td>
                        <td>{item.unit}</td>
                        <td>{fmt(item.buying_price)}</td>
                        <td style={{ fontWeight: 600, color: '#2e7d32' }}>
                          {parseFloat(item.opening_stock).toLocaleString()}
                        </td>
                        <td style={{ fontWeight: 600, color: '#1565c0' }}>
                          {parseFloat(item.purchases).toLocaleString()}
                        </td>
                        <td style={{ fontWeight: 600, color: '#c62828' }}>
                          {parseFloat(item.unit_sold).toLocaleString()}
                        </td>
                        <td style={{ fontWeight: 600, color: '#e65100' }}>
                          {parseFloat(item.adjustments).toLocaleString()}
                        </td>
                        <td style={{ fontWeight: 700, color: '#4a148c' }}>
                          {parseFloat(item.closing_stock).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {inventoryReport.items.length > 0 && (
                    <tfoot>
                      <tr style={{ fontWeight: 700, backgroundColor: '#f8f9fa' }}>
                        <td colSpan={3}>TOTAL</td>
                        <td style={{ color: '#2e7d32' }}>
                          {inventoryReport.items.reduce((sum, i) => sum + parseFloat(i.opening_stock), 0).toLocaleString()}
                        </td>
                        <td style={{ color: '#1565c0' }}>
                          {inventoryReport.items.reduce((sum, i) => sum + parseFloat(i.purchases), 0).toLocaleString()}
                        </td>
                        <td style={{ color: '#c62828' }}>
                          {inventoryReport.items.reduce((sum, i) => sum + parseFloat(i.unit_sold), 0).toLocaleString()}
                        </td>
                        <td style={{ color: '#e65100' }}>
                          {inventoryReport.items.reduce((sum, i) => sum + parseFloat(i.adjustments), 0).toLocaleString()}
                        </td>
                        <td style={{ color: '#4a148c' }}>
                          {inventoryReport.items.reduce((sum, i) => sum + parseFloat(i.closing_stock), 0).toLocaleString()}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
              {inventoryReport.items.length === 0 && (
                <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
                  No inventory data found for this period
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Adjust Stock Modal */}
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
              <button className="btn btn-primary" onClick={handleAdjust}>Apply</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
