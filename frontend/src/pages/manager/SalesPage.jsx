import { useState, useEffect } from 'react';
import api from '../../utils/api';

export default function SalesPage() {
  const [sales, setSales] = useState([]);
  const [selectedSale, setSelectedSale] = useState(null);
  const [filters, setFilters] = useState({ date_from: '', date_to: '', payment_method: '' });
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadSales(); }, [filters]);

  const loadSales = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filters.date_from) params.date_from = filters.date_from;
      if (filters.date_to) params.date_to = filters.date_to;
      if (filters.payment_method) params.payment_method = filters.payment_method;
      const res = await api.get('/sales', { params });
      setSales(res.data);
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  const viewSale = async (id) => {
    try {
      const res = await api.get(`/sales/${id}`);
      setSelectedSale(res.data);
    } catch (err) { console.error(err); }
  };

  const fmt = (n) => `KSh ${parseFloat(n || 0).toLocaleString()}`;

  return (
    <div>
      <div className="page-header">
        <h1>💰 Sales Management</h1>
        <p>View and manage all sales transactions</p>
      </div>

      <div className="filters-bar">
        <input type="date" value={filters.date_from} onChange={e => setFilters({...filters, date_from: e.target.value})} placeholder="From" />
        <input type="date" value={filters.date_to} onChange={e => setFilters({...filters, date_to: e.target.value})} placeholder="To" />
        <select value={filters.payment_method} onChange={e => setFilters({...filters, payment_method: e.target.value})}>
          <option value="">All Payment Methods</option>
          <option value="cash">Cash</option>
          <option value="mpesa">M-Pesa</option>
          <option value="card">Card</option>
          <option value="other">Other</option>
        </select>
        <button className="btn btn-outline" onClick={() => setFilters({ date_from: '', date_to: '', payment_method: '' })}>Clear</button>
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Sale ID</th>
              <th>Date</th>
              <th>Time</th>
              <th>Cashier</th>
              <th>Payment</th>
              <th>Revenue</th>
              <th>Cost</th>
              <th>Profit</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {sales.map(sale => (
              <tr key={sale.id}>
                <td style={{ fontFamily: 'monospace', fontSize: '13px' }}>{sale.sale_id}</td>
                <td>{new Date(sale.date).toLocaleDateString()}</td>
                <td>{new Date(sale.date).toLocaleTimeString()}</td>
                <td>{sale.cashier_name}</td>
                <td><span className={`badge badge-${sale.payment_method === 'cash' ? 'success' : sale.payment_method === 'mpesa' ? 'info' : 'warning'}`}>{sale.payment_method}</span></td>
                <td style={{ fontWeight: 600 }}>{fmt(sale.total_revenue)}</td>
                <td>{fmt(sale.total_cost)}</td>
                <td style={{ color: '#27ae60', fontWeight: 600 }}>{fmt(sale.total_profit)}</td>
                <td><button className="btn btn-sm btn-outline" onClick={() => viewSale(sale.id)}>View</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Sale Detail Modal */}
      {selectedSale && (
        <div className="modal-overlay" onClick={() => setSelectedSale(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>Sale: {selectedSale.sale_id}</h2>
            <p style={{ color: '#666', marginBottom: '12px' }}>
              {new Date(selectedSale.date).toLocaleString()} • {selectedSale.cashier_name} • {selectedSale.payment_method}
            </p>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '16px' }}>
              <thead>
                <tr>
                  <th style={{ padding: '8px', textAlign: 'left', borderBottom: '2px solid #eee', fontSize: '12px' }}>Product</th>
                  <th style={{ padding: '8px', textAlign: 'right', borderBottom: '2px solid #eee', fontSize: '12px' }}>Qty</th>
                  <th style={{ padding: '8px', textAlign: 'right', borderBottom: '2px solid #eee', fontSize: '12px' }}>Price</th>
                  <th style={{ padding: '8px', textAlign: 'right', borderBottom: '2px solid #eee', fontSize: '12px' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {selectedSale.items?.map((item, i) => (
                  <tr key={i}>
                    <td style={{ padding: '8px', borderBottom: '1px solid #f0f0f0' }}>{item.product_name}</td>
                    <td style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid #f0f0f0' }}>{item.quantity}</td>
                    <td style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid #f0f0f0' }}>{fmt(item.unit_price)}</td>
                    <td style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid #f0f0f0', fontWeight: 600 }}>{fmt(item.total_price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ borderTop: '2px solid #eee', paddingTop: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}><span>Revenue:</span><strong>{fmt(selectedSale.total_revenue)}</strong></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}><span>Cost:</span><strong>{fmt(selectedSale.total_cost)}</strong></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#27ae60', fontSize: '18px' }}><span>Profit:</span><strong>{fmt(selectedSale.total_profit)}</strong></div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setSelectedSale(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
