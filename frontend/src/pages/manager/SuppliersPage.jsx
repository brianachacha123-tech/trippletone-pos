import { useState, useEffect } from 'react';
import api from '../../utils/api';

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', phone: '', email: '', location: '', notes: '' });

  useEffect(() => { loadSuppliers(); }, []);

  const loadSuppliers = async () => {
    try { const res = await api.get('/suppliers'); setSuppliers(res.data); } catch (err) { console.error(err); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editing) {
        await api.put(`/suppliers/${editing.id}`, form);
      } else {
        await api.post('/suppliers', form);
      }
      setShowModal(false);
      setEditing(null);
      setForm({ name: '', phone: '', email: '', location: '', notes: '' });
      loadSuppliers();
    } catch (err) { alert(err.response?.data?.error || 'Error saving supplier'); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this supplier?')) return;
    try { await api.delete(`/suppliers/${id}`); loadSuppliers(); } catch (err) { alert('Error deleting'); }
  };

  const fmt = (n) => `KSh ${parseFloat(n || 0).toLocaleString()}`;

  return (
    <div>
      <div className="page-header page-header-flex" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1>🤝 Suppliers</h1>
          <p>Manage your product suppliers</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditing(null); setForm({ name: '', phone: '', email: '', location: '', notes: '' }); setShowModal(true); }}>+ Add Supplier</button>
      </div>

      <div className="table-container">
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <table style={{ minWidth: '700px' }}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>Email</th>
                <th>Location</th>
                <th>Purchases</th>
                <th>Total Value</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {suppliers.map(s => (
                <tr key={s.id}>
                  <td style={{ fontWeight: 600 }}>{s.name}</td>
                  <td>{s.phone || '-'}</td>
                  <td>{s.email || '-'}</td>
                  <td>{s.location || '-'}</td>
                  <td>{s.purchase_count}</td>
                  <td>{fmt(s.total_purchases)}</td>
                  <td>
                    <button className="btn btn-sm btn-outline" onClick={() => { setEditing(s); setForm({ name: s.name, phone: s.phone || '', email: s.email || '', location: s.location || '', notes: s.notes || '' }); setShowModal(true); }} style={{ marginRight: '4px' }}>Edit</button>
                    <button className="btn btn-sm btn-danger" onClick={() => handleDelete(s.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>{editing ? 'Edit Supplier' : 'Add Supplier'}</h2>
            <form onSubmit={handleSubmit}>
              <div className="form-group"><label>Supplier Name</label><input type="text" value={form.name} onChange={e => setForm({...form, name: e.target.value})} required /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }} className="form-grid-2">
                <div className="form-group"><label>Phone</label><input type="text" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} /></div>
                <div className="form-group"><label>Email</label><input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} /></div>
              </div>
              <div className="form-group"><label>Location</label><input type="text" value={form.location} onChange={e => setForm({...form, location: e.target.value})} /></div>
              <div className="form-group"><label>Notes</label><input type="text" value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} /></div>
              <div className="modal-actions">
                <button type="button" className="btn btn-outline" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">{editing ? 'Update' : 'Add'} Supplier</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
