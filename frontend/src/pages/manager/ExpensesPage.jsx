import { useState, useEffect } from 'react';
import api from '../../utils/api';

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [filters, setFilters] = useState({ period: '', category: '' });
  const [form, setForm] = useState({ category_id: '', description: '', amount: '', payment_method: 'cash', person_vendor: '', notes: '', date: new Date().toISOString().split('T')[0] });
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadExpenses(); loadCategories(); }, [filters]);

  const loadExpenses = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filters.period) params.period = filters.period;
      if (filters.category) params.category = filters.category;
      const res = await api.get('/expenses', { params });
      setExpenses(res.data);
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  const loadCategories = async () => {
    try {
      const res = await api.get('/expenses/categories');
      setCategories(res.data);
    } catch (err) { console.error(err); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editing) {
        await api.put(`/expenses/${editing.id}`, form);
      } else {
        await api.post('/expenses', form);
      }
      setShowModal(false);
      setEditing(null);
      setForm({ category_id: '', description: '', amount: '', payment_method: 'cash', person_vendor: '', notes: '', date: new Date().toISOString().split('T')[0] });
      loadExpenses();
    } catch (err) {
      alert(err.response?.data?.error || 'Error saving expense');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this expense?')) return;
    try {
      await api.delete(`/expenses/${id}`);
      loadExpenses();
    } catch (err) { alert('Error deleting'); }
  };

  const startEdit = (expense) => {
    setEditing(expense);
    setForm({
      category_id: expense.category_id,
      description: expense.description,
      amount: expense.amount,
      payment_method: expense.payment_method,
      person_vendor: expense.person_vendor,
      notes: expense.notes,
      date: new Date(expense.date).toISOString().split('T')[0]
    });
    setShowModal(true);
  };

  const totalExpenses = expenses.reduce((sum, e) => sum + parseFloat(e.amount), 0);
  const fmt = (n) => `KSh ${parseFloat(n || 0).toLocaleString()}`;

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1>💸 Expenses Management</h1>
          <p>Track and manage business operating expenses</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditing(null); setForm({ category_id: '', description: '', amount: '', payment_method: 'cash', person_vendor: '', notes: '', date: new Date().toISOString().split('T')[0] }); setShowModal(true); }}>+ Add Expense</button>
      </div>

      <div className="kpi-grid">
        <div className="kpi-card expense">
          <div className="label">Total Expenses</div>
          <div className="value">{fmt(totalExpenses)}</div>
        </div>
        <div className="kpi-card">
          <div className="label">Number of Expenses</div>
          <div className="value">{expenses.length}</div>
        </div>
      </div>

      <div className="filters-bar">
        <select value={filters.period} onChange={e => setFilters({...filters, period: e.target.value})}>
          <option value="">All Time</option>
          <option value="today">Today</option>
          <option value="week">This Week</option>
          <option value="month">This Month</option>
          <option value="year">This Year</option>
        </select>
        <select value={filters.category} onChange={e => setFilters({...filters, category: e.target.value})}>
          <option value="">All Categories</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Expense ID</th>
              <th>Date</th>
              <th>Category</th>
              <th>Description</th>
              <th>Amount</th>
              <th>Payment</th>
              <th>Person/Vendor</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {expenses.map(exp => (
              <tr key={exp.id}>
                <td style={{ fontFamily: 'monospace', fontSize: '13px' }}>{exp.expense_id}</td>
                <td>{new Date(exp.date).toLocaleDateString()}</td>
                <td><span className="badge badge-info">{exp.category_name}</span></td>
                <td>{exp.description}</td>
                <td style={{ fontWeight: 600, color: '#e74c3c' }}>{fmt(exp.amount)}</td>
                <td>{exp.payment_method}</td>
                <td>{exp.person_vendor}</td>
                <td>
                  <button className="btn btn-sm btn-outline" onClick={() => startEdit(exp)} style={{ marginRight: '4px' }}>Edit</button>
                  <button className="btn btn-sm btn-danger" onClick={() => handleDelete(exp.id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>{editing ? 'Edit Expense' : 'Add Expense'}</h2>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Category</label>
                <select value={form.category_id} onChange={e => setForm({...form, category_id: e.target.value})} required>
                  <option value="">Select category</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Description</label>
                <input type="text" value={form.description} onChange={e => setForm({...form, description: e.target.value})} required />
              </div>
              <div className="form-group">
                <label>Amount (KSh)</label>
                <input type="number" step="0.01" value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} required />
              </div>
              <div className="form-group">
                <label>Payment Method</label>
                <select value={form.payment_method} onChange={e => setForm({...form, payment_method: e.target.value})}>
                  <option value="cash">Cash</option>
                  <option value="mpesa">M-Pesa</option>
                  <option value="card">Card</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="form-group">
                <label>Person/Vendor</label>
                <input type="text" value={form.person_vendor} onChange={e => setForm({...form, person_vendor: e.target.value})} />
              </div>
              <div className="form-group">
                <label>Date</label>
                <input type="date" value={form.date} onChange={e => setForm({...form, date: e.target.value})} />
              </div>
              <div className="form-group">
                <label>Notes</label>
                <input type="text" value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-outline" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">{editing ? 'Update' : 'Add'} Expense</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
