import { useState, useEffect } from 'react';
import api from '../../utils/api';

export default function ProductsPage() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ name: '', category_id: '', buying_price: '', selling_price: '', current_stock: '', minimum_stock: '', unit: 'piece', supplier_id: '' });

  useEffect(() => { loadProducts(); loadCategories(); loadSuppliers(); }, []);

  const loadProducts = async () => {
    try { const res = await api.get('/products'); setProducts(res.data); } catch (err) { console.error(err); }
  };

  const loadCategories = async () => {
    try { const res = await api.get('/products/meta/categories'); setCategories(res.data); } catch (err) { console.error(err); }
  };

  const loadSuppliers = async () => {
    try { const res = await api.get('/suppliers'); setSuppliers(res.data); } catch (err) { console.error(err); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editing) {
        await api.put(`/products/${editing.id}`, { ...form, status: 'active' });
      } else {
        await api.post('/products', form);
      }
      setShowModal(false);
      setEditing(null);
      setForm({ name: '', category_id: '', buying_price: '', selling_price: '', current_stock: '', minimum_stock: '', unit: 'piece', supplier_id: '' });
      loadProducts();
    } catch (err) { alert(err.response?.data?.error || 'Error saving product'); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this product?')) return;
    try { await api.delete(`/products/${id}`); loadProducts(); } catch (err) { alert('Error deleting'); }
  };

  const startEdit = (p) => {
    setEditing(p);
    setForm({ name: p.name, category_id: p.category_id || '', buying_price: p.buying_price, selling_price: p.selling_price, current_stock: p.current_stock, minimum_stock: p.minimum_stock, unit: p.unit, supplier_id: p.supplier_id || '' });
    setShowModal(true);
  };

  const filteredProducts = products.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));
  const fmt = (n) => `KSh ${parseFloat(n || 0).toLocaleString()}`;

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1>🏷️ Products Management</h1>
          <p>Add, edit, and manage your product catalog</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditing(null); setForm({ name: '', category_id: '', buying_price: '', selling_price: '', current_stock: '', minimum_stock: '', unit: 'piece', supplier_id: '' }); setShowModal(true); }}>+ Add Product</button>
      </div>

      <div className="filters-bar">
        <input type="text" placeholder="🔍 Search products..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Product Name</th>
              <th>Category</th>
              <th>Buying Price</th>
              <th>Selling Price</th>
              <th>Profit/Unit</th>
              <th>Stock</th>
              <th>Min Stock</th>
              <th>Supplier</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredProducts.map(p => (
              <tr key={p.id}>
                <td style={{ fontWeight: 600 }}>{p.name}</td>
                <td><span className="badge badge-info">{p.category_name || '-'}</span></td>
                <td>{fmt(p.buying_price)}</td>
                <td>{fmt(p.selling_price)}</td>
                <td style={{ color: '#27ae60', fontWeight: 600 }}>{fmt(parseFloat(p.selling_price) - parseFloat(p.buying_price))}</td>
                <td>{parseFloat(p.current_stock).toLocaleString()} {p.unit}</td>
                <td>{parseFloat(p.minimum_stock).toLocaleString()}</td>
                <td>{p.supplier_name || '-'}</td>
                <td>
                  <button className="btn btn-sm btn-outline" onClick={() => startEdit(p)} style={{ marginRight: '4px' }}>Edit</button>
                  <button className="btn btn-sm btn-danger" onClick={() => handleDelete(p.id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>{editing ? 'Edit Product' : 'Add Product'}</h2>
            <form onSubmit={handleSubmit}>
              <div className="form-group"><label>Product Name</label><input type="text" value={form.name} onChange={e => setForm({...form, name: e.target.value})} required /></div>
              <div className="form-group">
                <label>Category</label>
                <select value={form.category_id} onChange={e => setForm({...form, category_id: e.target.value})} required>
                  <option value="">Select category</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group"><label>Buying Price (KSh)</label><input type="number" step="0.01" value={form.buying_price} onChange={e => setForm({...form, buying_price: e.target.value})} required /></div>
                <div className="form-group"><label>Selling Price (KSh)</label><input type="number" step="0.01" value={form.selling_price} onChange={e => setForm({...form, selling_price: e.target.value})} required /></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group"><label>Current Stock</label><input type="number" step="0.01" value={form.current_stock} onChange={e => setForm({...form, current_stock: e.target.value})} required /></div>
                <div className="form-group"><label>Minimum Stock Level</label><input type="number" step="0.01" value={form.minimum_stock} onChange={e => setForm({...form, minimum_stock: e.target.value})} required /></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label>Unit</label>
                  <select value={form.unit} onChange={e => setForm({...form, unit: e.target.value})}>
                    <option value="piece">Piece</option>
                    <option value="bottle">Bottle</option>
                    <option value="crate">Crate</option>
                    <option value="carton">Carton</option>
                    <option value="kg">Kilogram</option>
                    <option value="litre">Litre</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Supplier</label>
                  <select value={form.supplier_id} onChange={e => setForm({...form, supplier_id: e.target.value})}>
                    <option value="">None</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-outline" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">{editing ? 'Update' : 'Add'} Product</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
