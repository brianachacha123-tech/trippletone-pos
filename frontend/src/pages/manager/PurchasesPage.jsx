import { useState, useEffect } from 'react';
import api from '../../utils/api';

export default function PurchasesPage() {
  const [purchases, setPurchases] = useState([]);
  const [products, setProducts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ supplier_id: '', product_id: '', quantity: '', buying_price: '', invoice_number: '', notes: '' });
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadPurchases(); loadProducts(); loadSuppliers(); }, []);

  const loadPurchases = async () => {
    setLoading(true);
    try { const res = await api.get('/purchases'); setPurchases(res.data); } catch (err) { console.error(err); }
    setLoading(false);
  };

  const loadProducts = async () => {
    try { const res = await api.get('/products'); setProducts(res.data); } catch (err) { console.error(err); }
  };

  const loadSuppliers = async () => {
    try { const res = await api.get('/suppliers'); setSuppliers(res.data); } catch (err) { console.error(err); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/purchases', form);
      setShowModal(false);
      setForm({ supplier_id: '', product_id: '', quantity: '', buying_price: '', invoice_number: '', notes: '' });
      loadPurchases();
      loadProducts();
    } catch (err) {
      alert(err.response?.data?.error || 'Error recording purchase');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this purchase? Stock will be reversed.')) return;
    try { await api.delete(`/purchases/${id}`); loadPurchases(); loadProducts(); } catch (err) { alert('Error deleting'); }
  };

  const fmt = (n) => `KSh ${parseFloat(n || 0).toLocaleString()}`;

  return (
    <div>
      <div className="page-header page-header-flex" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1>📦 Purchases</h1>
          <p>Record and track stock purchases from suppliers</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ Record Purchase</button>
      </div>

      <div className="table-container">
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <table style={{ minWidth: '900px' }}>
            <thead>
              <tr>
                <th>Purchase ID</th>
                <th>Date</th>
                <th>Supplier</th>
                <th>Product</th>
                <th>Quantity</th>
                <th>Buying Price</th>
                <th>Total Cost</th>
                <th>Invoice</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {purchases.map(p => (
                <tr key={p.id}>
                  <td style={{ fontFamily: 'monospace', fontSize: '13px' }}>{p.purchase_id}</td>
                  <td>{new Date(p.date).toLocaleDateString()}</td>
                  <td>{p.supplier_name}</td>
                  <td>{p.product_name}</td>
                  <td>{p.quantity}</td>
                  <td>{fmt(p.buying_price)}</td>
                  <td style={{ fontWeight: 600 }}>{fmt(p.total_cost)}</td>
                  <td>{p.invoice_number || '-'}</td>
                  <td><button className="btn btn-sm btn-danger" onClick={() => handleDelete(p.id)}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>Record Purchase</h2>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Supplier</label>
                <select value={form.supplier_id} onChange={e => setForm({...form, supplier_id: e.target.value})} required>
                  <option value="">Select supplier</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Product</label>
                <select value={form.product_id} onChange={e => {
                  const prod = products.find(p => p.id === parseInt(e.target.value));
                  setForm({...form, product_id: e.target.value, buying_price: prod?.buying_price || ''});
                }} required>
                  <option value="">Select product</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }} className="form-grid-2">
                <div className="form-group">
                  <label>Quantity</label>
                  <input type="number" step="0.01" value={form.quantity} onChange={e => setForm({...form, quantity: e.target.value})} required />
                </div>
                <div className="form-group">
                  <label>Buying Price (KSh)</label>
                  <input type="number" step="0.01" value={form.buying_price} onChange={e => setForm({...form, buying_price: e.target.value})} required />
                </div>
              </div>
              <div className="form-group">
                <label>Invoice Number</label>
                <input type="text" value={form.invoice_number} onChange={e => setForm({...form, invoice_number: e.target.value})} />
              </div>
              <div className="form-group">
                <label>Notes</label>
                <input type="text" value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-outline" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-success">Record Purchase</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
