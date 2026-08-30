import { useState, useEffect } from 'react';
import api from '../../utils/api';

export default function KegPage() {
  const [kegs, setKegs] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [showTxModal, setShowTxModal] = useState(null);
  const [form, setForm] = useState({ product_name: '', buying_price: '' });
  const [txForm, setTxForm] = useState({ amount: '', till: '', daily_total: '', notes: '', date: new Date().toISOString().split('T')[0] });
  const [activeKeg, setActiveKeg] = useState(null);
  const [txList, setTxList] = useState([]);

  useEffect(() => { loadKegs(); }, []);

  const loadKegs = async () => {
    try { const res = await api.get('/kegs'); setKegs(res.data); } catch (err) { console.error(err); }
  };

  const handleOpenKeg = async (e) => {
    e.preventDefault();
    try {
      await api.post('/kegs', form);
      setShowModal(false);
      setForm({ product_name: '', buying_price: '' });
      loadKegs();
    } catch (err) { alert('Error opening keg'); }
  };

  const handleAddTransaction = async (e) => {
    e.preventDefault();
    try {
      await api.post(`/kegs/${showTxModal.id}/transactions`, txForm);
      setShowTxModal(null);
      setTxForm({ amount: '', till: '', daily_total: '', notes: '', date: new Date().toISOString().split('T')[0] });
      loadKegs();
    } catch (err) { alert('Error adding transaction'); }
  };

  const handleCloseKeg = async (id) => {
    if (!confirm('Close this keg? Profit will be calculated.')) return;
    try { await api.put(`/kegs/${id}/close`); loadKegs(); } catch (err) { alert('Error closing keg'); }
  };

  const viewTransactions = async (keg) => {
    setActiveKeg(keg);
    try { const res = await api.get(`/kegs/${keg.id}/transactions`); setTxList(res.data); } catch (err) { console.error(err); }
  };

  const fmt = (n) => `KSh ${parseFloat(n || 0).toLocaleString()}`;

  return (
    <div>
      <div className="page-header page-header-flex" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1>🍺 Keg Management</h1>
          <p>Track keg sales and profitability</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ Open Keg</button>
      </div>

      <div className="table-container">
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <table style={{ minWidth: '850px' }}>
            <thead>
              <tr>
                <th>Keg ID</th>
                <th>Product</th>
                <th>Buy Price</th>
                <th>Revenue</th>
                <th>Profit</th>
                <th>Status</th>
                <th>Opened</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {kegs.map(k => (
                <tr key={k.id}>
                  <td style={{ fontFamily: 'monospace' }}>{k.keg_id}</td>
                  <td style={{ fontWeight: 600 }}>{k.product_name}</td>
                  <td>{fmt(k.buying_price)}</td>
                  <td style={{ fontWeight: 600 }}>{fmt(k.total_revenue)}</td>
                  <td style={{ color: '#27ae60', fontWeight: 600 }}>{k.status === 'closed' ? fmt(k.profit) : '-'}</td>
                  <td><span className={`badge badge-${k.status === 'open' ? 'success' : 'warning'}`}>{k.status}</span></td>
                  <td>{new Date(k.open_date).toLocaleDateString()}</td>
                  <td>
                    {k.status === 'open' && (
                      <>
                        <button className="btn btn-sm btn-primary" onClick={() => setShowTxModal(k)} style={{ marginRight: '4px' }}>+ Daily</button>
                        <button className="btn btn-sm btn-warning" onClick={() => handleCloseKeg(k.id)} style={{ marginRight: '4px' }}>Close</button>
                      </>
                    )}
                    <button className="btn btn-sm btn-outline" onClick={() => viewTransactions(k)}>View</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Open Keg Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>Open New Keg</h2>
            <form onSubmit={handleOpenKeg}>
              <div className="form-group"><label>Product Name</label><input type="text" value={form.product_name} onChange={e => setForm({...form, product_name: e.target.value})} required placeholder="e.g. Tusker Keg 50L" /></div>
              <div className="form-group"><label>Buying Price (KSh)</label><input type="number" step="0.01" value={form.buying_price} onChange={e => setForm({...form, buying_price: e.target.value})} required /></div>
              <div className="modal-actions">
                <button type="button" className="btn btn-outline" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-success">Open Keg</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Daily Transaction Modal */}
      {showTxModal && (
        <div className="modal-overlay" onClick={() => setShowTxModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>Daily Record - {showTxModal.product_name}</h2>
            <form onSubmit={handleAddTransaction}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }} className="form-grid-2">
                <div className="form-group"><label>Amount (KSh)</label><input type="number" step="0.01" value={txForm.amount} onChange={e => setTxForm({...txForm, amount: e.target.value})} /></div>
                <div className="form-group"><label>Till (KSh)</label><input type="number" step="0.01" value={txForm.till} onChange={e => setTxForm({...txForm, till: e.target.value})} /></div>
              </div>
              <div className="form-group"><label>Daily Total (KSh)</label><input type="number" step="0.01" value={txForm.daily_total} onChange={e => setTxForm({...txForm, daily_total: e.target.value})} required /></div>
              <div className="form-group"><label>Date</label><input type="date" value={txForm.date} onChange={e => setTxForm({...txForm, date: e.target.value})} /></div>
              <div className="form-group"><label>Notes</label><input type="text" value={txForm.notes} onChange={e => setTxForm({...txForm, notes: e.target.value})} /></div>
              <div className="modal-actions">
                <button type="button" className="btn btn-outline" onClick={() => setShowTxModal(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Transaction History Modal */}
      {activeKeg && (
        <div className="modal-overlay" onClick={() => setActiveKeg(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: '18px' }}>Keg: {activeKeg.product_name}</h2>
            <p style={{ marginBottom: '16px', color: '#666', fontSize: '13px' }}>Revenue: {fmt(activeKeg.total_revenue)} | Profit: {fmt(activeKeg.profit)}</p>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '350px' }}>
                <thead>
                  <tr>
                    <th style={{ padding: '8px', textAlign: 'left', borderBottom: '2px solid #eee', fontSize: '12px' }}>Date</th>
                    <th style={{ padding: '8px', textAlign: 'right', borderBottom: '2px solid #eee', fontSize: '12px' }}>Amount</th>
                    <th style={{ padding: '8px', textAlign: 'right', borderBottom: '2px solid #eee', fontSize: '12px' }}>Till</th>
                    <th style={{ padding: '8px', textAlign: 'right', borderBottom: '2px solid #eee', fontSize: '12px' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {txList.map(tx => (
                    <tr key={tx.id}>
                      <td style={{ padding: '8px', borderBottom: '1px solid #f0f0f0' }}>{new Date(tx.date).toLocaleDateString()}</td>
                      <td style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid #f0f0f0' }}>{fmt(tx.amount)}</td>
                      <td style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid #f0f0f0' }}>{fmt(tx.till)}</td>
                      <td style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid #f0f0f0', fontWeight: 600 }}>{fmt(tx.daily_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setActiveKeg(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
