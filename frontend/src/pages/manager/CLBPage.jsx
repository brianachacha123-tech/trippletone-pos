import { useState, useEffect } from 'react';
import api from '../../utils/api';

export default function CLBPage() {
  const [transactions, setTransactions] = useState([]);
  const [summary, setSummary] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ type: 'sale', description: '', amount: '', date: new Date().toISOString().split('T')[0] });

  useEffect(() => { loadTransactions(); loadSummary(); }, []);

  const loadTransactions = async () => {
    try { const res = await api.get('/clb'); setTransactions(res.data); } catch (err) { console.error(err); }
  };

  const loadSummary = async () => {
    try { const res = await api.get('/clb/summary'); setSummary(res.data); } catch (err) { console.error(err); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/clb', form);
      setShowModal(false);
      setForm({ type: 'sale', description: '', amount: '', date: new Date().toISOString().split('T')[0] });
      loadTransactions();
      loadSummary();
    } catch (err) { alert('Error saving transaction'); }
  };

  const fmt = (n) => `KSh ${parseFloat(n || 0).toLocaleString()}`;

  return (
    <div>
      <div className="page-header page-header-flex" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1>🍸 CLB Management</h1>
          <p>Track CLB fund purchases and sales separately</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ Add Transaction</button>
      </div>

      {summary && (
        <div className="kpi-grid">
          <div className="kpi-card expense">
            <div className="label">Purchases</div>
            <div className="value">{fmt(summary.total_purchases)}</div>
          </div>
          <div className="kpi-card">
            <div className="label">Sales</div>
            <div className="value">{fmt(summary.total_sales)}</div>
          </div>
          <div className="kpi-card profit">
            <div className="label">Profit</div>
            <div className="value">{fmt(summary.profit)}</div>
          </div>
          <div className="kpi-card info">
            <div className="label">Available</div>
            <div className="value">{fmt(summary.available)}</div>
          </div>
        </div>
      )}

      <div className="table-container">
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <table style={{ minWidth: '600px' }}>
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Description</th>
                <th>Amount</th>
                <th>By</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map(tx => (
                <tr key={tx.id}>
                  <td>{new Date(tx.date).toLocaleDateString()}</td>
                  <td><span className={`badge badge-${tx.type === 'sale' ? 'success' : 'warning'}`}>{tx.type}</span></td>
                  <td>{tx.description}</td>
                  <td style={{ fontWeight: 600, color: tx.type === 'sale' ? '#27ae60' : '#e74c3c' }}>{fmt(tx.amount)}</td>
                  <td>{tx.created_by_name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>Add CLB Transaction</h2>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Type</label>
                <select value={form.type} onChange={e => setForm({...form, type: e.target.value})}>
                  <option value="sale">Sale (Money In)</option>
                  <option value="purchase">Purchase (Money Out)</option>
                </select>
              </div>
              <div className="form-group"><label>Description</label><input type="text" value={form.description} onChange={e => setForm({...form, description: e.target.value})} required /></div>
              <div className="form-group"><label>Amount (KSh)</label><input type="number" step="0.01" value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} required /></div>
              <div className="form-group"><label>Date</label><input type="date" value={form.date} onChange={e => setForm({...form, date: e.target.value})} /></div>
              <div className="modal-actions">
                <button type="button" className="btn btn-outline" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
