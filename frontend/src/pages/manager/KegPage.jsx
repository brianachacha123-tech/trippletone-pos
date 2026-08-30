import { useState, useEffect } from 'react';
import api from '../../utils/api';

export default function KegPage() {
  const [kegs, setKegs] = useState([]);
  const [activeKegs, setActiveKegs] = useState([]);
  const [kegSummary, setKegSummary] = useState(null);
  const [selectedKeg, setSelectedKeg] = useState(null);
  const [kegTransactions, setKegTransactions] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showTransactionModal, setShowTransactionModal] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [newKeg, setNewKeg] = useState({ product_name: '', buying_price: '' });
  const [newTransaction, setNewTransaction] = useState({ amount: '', till: '', daily_total: '', notes: '' });
  const [filter, setFilter] = useState('active');

  useEffect(() => { loadKegs(); }, [filter]);

  const loadKegs = async () => {
    setLoading(true);
    try {
      if (filter === 'active') {
        const res = await api.get('/kegs/active');
        setActiveKegs(res.data);
      } else {
        const res = await api.get('/kegs', { params: filter !== 'all' ? { status: filter } : {} });
        setKegs(res.data);
      }
      
      // Load summary
      const summaryRes = await api.get('/kegs/summary');
      setKegSummary(summaryRes.data);
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  const openKeg = async () => {
    try {
      await api.post('/kegs', newKeg);
      setShowAddModal(false);
      setNewKeg({ product_name: '', buying_price: '' });
      loadKegs();
    } catch (err) { console.error(err); }
  };

  const addTransaction = async () => {
    try {
      await api.post(`/kegs/${selectedKeg.id}/transactions`, newTransaction);
      setShowTransactionModal(false);
      setNewTransaction({ amount: '', till: '', daily_total: '', notes: '' });
      loadKegs();
    } catch (err) { console.error(err); }
  };

  const closeKeg = async () => {
    try {
      await api.put(`/kegs/${selectedKeg.id}/close`);
      setShowCloseModal(false);
      loadKegs();
    } catch (err) { console.error(err); }
  };

  const viewTransactions = async (keg) => {
    setSelectedKeg(keg);
    try {
      const res = await api.get(`/kegs/${keg.id}/transactions`, { params: { group_by_day: 'true' } });
      setKegTransactions(res.data);
    } catch (err) { console.error(err); }
  };

  const fmt = (n) => `KSh ${parseFloat(n || 0).toLocaleString()}`;

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString('en-US', { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric' 
    });
  };

  const getProfitStatusColor = (status) => {
    switch (status) {
      case 'limit_reached': return '#27ae60';
      case 'approaching_limit': return '#f39c12';
      case 'on_track': return '#3498db';
      case 'early': return '#9b59b6';
      default: return '#666';
    }
  };

  const getProfitStatusText = (status) => {
    switch (status) {
      case 'limit_reached': return '✅ Limit Reached';
      case 'approaching_limit': return '⚠️ Approaching Limit';
      case 'on_track': return '📈 On Track';
      case 'early': return '🌱 Early Stage';
      default: return status;
    }
  };

  const displayKegs = filter === 'active' ? activeKegs : kegs;

  return (
    <div>
      <div className="page-header">
        <h1>🍺 Keg Management</h1>
        <p>Track keg sales and profit with limits and highlighting</p>
      </div>

      {/* Summary Cards */}
      {kegSummary && (
        <div className="kpi-grid" style={{ marginBottom: '24px' }}>
          <div className="kpi-card" style={{ borderLeftColor: '#0f3460' }}>
            <div className="label">Active Kegs</div>
            <div className="value">{kegSummary.active_count}</div>
          </div>
          <div className="kpi-card profit">
            <div className="label">Active Revenue</div>
            <div className="value">{fmt(kegSummary.active_revenue)}</div>
          </div>
          <div className="kpi-card expense">
            <div className="label">Total Cost</div>
            <div className="value">{fmt(kegSummary.active_cost)}</div>
          </div>
          <div className="kpi-card" style={{ borderLeftColor: '#27ae60' }}>
            <div className="label">Closed Kegs</div>
            <div className="value">{kegSummary.closed_count}</div>
          </div>
          <div className="kpi-card profit">
            <div className="label">Closed Profit</div>
            <div className="value">{fmt(kegSummary.closed_profit)}</div>
          </div>
          <div className="kpi-card" style={{ borderLeftColor: '#e94560' }}>
            <div className="label">Kegs at Profit Limit</div>
            <div className="value">{kegSummary.kegs_at_limit}</div>
          </div>
          <div className="kpi-card" style={{ borderLeftColor: '#f39c12' }}>
            <div className="label">Profit Limit per Keg</div>
            <div className="value">{fmt(kegSummary.profit_limit)}</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="filters-bar" style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <label style={{ fontSize: '13px', fontWeight: '500' }}>View:</label>
          <select 
            value={filter} 
            onChange={e => setFilter(e.target.value)}
            style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #ddd' }}
          >
            <option value="active">Active Kegs</option>
            <option value="closed">Closed Kegs</option>
            <option value="all">All Kegs</option>
          </select>
        </div>
        
        <button 
          className="btn btn-primary" 
          onClick={() => setShowAddModal(true)}
        >
          + Open New Keg
        </button>
      </div>

      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center' }}>Loading kegs...</div>
      ) : (
        <div className="kegs-container">
          {displayKegs.length === 0 ? (
            <div className="card" style={{ padding: '40px', textAlign: 'center' }}>
              <p style={{ color: '#666', margin: 0 }}>No kegs found</p>
            </div>
          ) : (
            displayKegs.map(keg => (
              <div 
                key={keg.id} 
                className="card" 
                style={{ 
                  marginBottom: '16px',
                  borderLeft: `4px solid ${getProfitStatusColor(keg.profit_status)}`,
                  backgroundColor: keg.profit_status === 'limit_reached' ? '#f0fff4' : 
                                  keg.profit_status === 'approaching_limit' ? '#fffff0' : 
                                  '#fff'
                }}
              >
                <div style={{ padding: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <h3 style={{ margin: '0 0 8px 0', fontSize: '18px' }}>
                        🍺 {keg.keg_id}
                      </h3>
                      <p style={{ margin: '0 0 4px 0', fontSize: '14px', color: '#666' }}>
                        {keg.product_name}
                      </p>
                      <p style={{ margin: '0', fontSize: '12px', color: '#999' }}>
                        Opened: {new Date(keg.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ 
                        fontSize: '12px', 
                        fontWeight: '600',
                        color: getProfitStatusColor(keg.profit_status),
                        padding: '4px 8px',
                        borderRadius: '4px',
                        backgroundColor: `${getProfitStatusColor(keg.profit_status)}15`
                      }}>
                        {getProfitStatusText(keg.profit_status)}
                      </div>
                    </div>
                  </div>
                  
                  {/* Profit Progress */}
                  <div style={{ marginTop: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px' }}>
                      <span>Profit Progress</span>
                      <span style={{ fontWeight: '600' }}>
                        {fmt(keg.current_profit)} / {fmt(keg.profit_limit)}
                      </span>
                    </div>
                    <div style={{ 
                      width: '100%', 
                      height: '8px', 
                      backgroundColor: '#f0f0f0', 
                      borderRadius: '4px',
                      overflow: 'hidden'
                    }}>
                      <div style={{
                        width: `${Math.min(keg.profit_percentage, 100)}%`,
                        height: '100%',
                        backgroundColor: getProfitStatusColor(keg.profit_status),
                        transition: 'width 0.3s ease'
                      }} />
                    </div>
                    <div style={{ 
                      fontSize: '12px', 
                      color: '#666', 
                      marginTop: '4px',
                      textAlign: 'right'
                    }}>
                      {keg.profit_percentage.toFixed(1)}% of limit
                    </div>
                  </div>
                  
                  {/* Stats Grid */}
                  <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', 
                    gap: '16px',
                    marginTop: '16px',
                    padding: '16px',
                    backgroundColor: '#f8f9fa',
                    borderRadius: '8px'
                  }}>
                    <div>
                      <div style={{ fontSize: '12px', color: '#666' }}>Buying Price</div>
                      <div style={{ fontSize: '16px', fontWeight: '600' }}>{fmt(keg.buying_price)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '12px', color: '#666' }}>Total Revenue</div>
                      <div style={{ fontSize: '16px', fontWeight: '600', color: '#0f3460' }}>{fmt(keg.total_revenue)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '12px', color: '#666' }}>Current Profit</div>
                      <div style={{ fontSize: '16px', fontWeight: '600', color: '#27ae60' }}>{fmt(keg.current_profit)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '12px', color: '#666' }}>Remaining to Limit</div>
                      <div style={{ fontSize: '16px', fontWeight: '600', color: '#f39c12' }}>
                        {fmt(Math.max(0, keg.profit_limit - keg.current_profit))}
                      </div>
                    </div>
                  </div>
                  
                  {/* Actions */}
                  <div style={{ marginTop: '16px', display: 'flex', gap: '8px' }}>
                    <button 
                      className="btn btn-primary btn-sm"
                      onClick={() => {
                        setSelectedKeg(keg);
                        setShowTransactionModal(true);
                      }}
                    >
                      + Add Daily Revenue
                    </button>
                    <button 
                      className="btn btn-outline btn-sm"
                      onClick={() => viewTransactions(keg)}
                    >
                      📊 View History
                    </button>
                    {keg.status === 'active' && (
                      <button 
                        className="btn btn-danger btn-sm"
                        onClick={() => {
                          setSelectedKeg(keg);
                          setShowCloseModal(true);
                        }}
                      >
                        🏁 Close Keg
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Add Keg Modal */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>Open New Keg</h2>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: '500' }}>Product Name</label>
              <input 
                type="text" 
                value={newKeg.product_name} 
                onChange={e => setNewKeg({...newKeg, product_name: e.target.value})}
                style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #ddd' }}
                placeholder="e.g., Tusker Beer, etc."
              />
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: '500' }}>Buying Price (KSh)</label>
              <input 
                type="number" 
                value={newKeg.buying_price} 
                onChange={e => setNewKeg({...newKeg, buying_price: e.target.value})}
                style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #ddd' }}
                placeholder="0"
              />
            </div>
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setShowAddModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={openKeg}>Open Keg</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Transaction Modal */}
      {showTransactionModal && (
        <div className="modal-overlay" onClick={() => setShowTransactionModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>Add Daily Revenue</h2>
            <p style={{ color: '#666', marginBottom: '16px', fontSize: '13px' }}>
              Keg: {selectedKeg?.keg_id} ({selectedKeg?.product_name})
            </p>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: '500' }}>Amount Sold (KSh)</label>
              <input 
                type="number" 
                value={newTransaction.amount} 
                onChange={e => setNewTransaction({...newTransaction, amount: e.target.value})}
                style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #ddd' }}
                placeholder="0"
              />
            </div>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: '500' }}>Till Number</label>
              <input 
                type="text" 
                value={newTransaction.till} 
                onChange={e => setNewTransaction({...newTransaction, till: e.target.value})}
                style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #ddd' }}
                placeholder="Till number"
              />
            </div>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: '500' }}>Daily Total Revenue (KSh)</label>
              <input 
                type="number" 
                value={newTransaction.daily_total} 
                onChange={e => setNewTransaction({...newTransaction, daily_total: e.target.value})}
                style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #ddd' }}
                placeholder="0"
              />
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: '500' }}>Notes</label>
              <textarea 
                value={newTransaction.notes} 
                onChange={e => setNewTransaction({...newTransaction, notes: e.target.value})}
                style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #ddd', minHeight: '60px' }}
                placeholder="Optional notes"
              />
            </div>
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setShowTransactionModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={addTransaction}>Add Revenue</button>
            </div>
          </div>
        </div>
      )}

      {/* Close Keg Modal */}
      {showCloseModal && (
        <div className="modal-overlay" onClick={() => setShowCloseModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>Close Keg</h2>
            <p style={{ color: '#666', marginBottom: '16px' }}>
              Are you sure you want to close keg <strong>{selectedKeg?.keg_id}</strong>?
            </p>
            <div style={{ padding: '16px', backgroundColor: '#f8f9fa', borderRadius: '8px', marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span>Product:</span>
                <strong>{selectedKeg?.product_name}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span>Buying Price:</span>
                <strong>{fmt(selectedKeg?.buying_price)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span>Total Revenue:</span>
                <strong>{fmt(selectedKeg?.total_revenue)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#27ae60', fontSize: '18px' }}>
                <span>Profit:</span>
                <strong>{fmt(selectedKeg?.current_profit)}</strong>
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setShowCloseModal(false)}>Cancel</button>
              <button className="btn btn-danger" onClick={closeKeg}>Close Keg</button>
            </div>
          </div>
        </div>
      )}

      {/* Keg Transactions Modal */}
      {selectedKeg && !showTransactionModal && !showCloseModal && (
        <div className="modal-overlay" onClick={() => setSelectedKeg(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
            <h2>Keg History: {selectedKeg?.keg_id}</h2>
            <p style={{ color: '#666', marginBottom: '16px', fontSize: '13px' }}>
              {selectedKeg?.product_name} • Status: {selectedKeg?.status}
            </p>
            
            {kegTransactions.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
                No transactions recorded yet
              </div>
            ) : (
              <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                {kegTransactions.map((dayData, idx) => (
                  <div key={idx} style={{ marginBottom: '16px' }}>
                    <div style={{ 
                      padding: '8px 12px', 
                      backgroundColor: '#f8f9fa', 
                      borderRadius: '4px',
                      marginBottom: '8px',
                      fontSize: '13px',
                      fontWeight: '600'
                    }}>
                      📅 {formatDate(dayData.day)} - Revenue: {fmt(dayData.daily_revenue)}
                    </div>
                    {dayData.transactions.map((tx, txIdx) => (
                      <div key={txIdx} style={{ 
                        padding: '8px 12px', 
                        borderBottom: '1px solid #f0f0f0',
                        fontSize: '13px'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>Amount: {fmt(tx.amount)}</span>
                          <span>Daily Total: {fmt(tx.daily_total)}</span>
                        </div>
                        {tx.till && <div style={{ color: '#666', fontSize: '12px' }}>Till: {tx.till}</div>}
                        {tx.notes && <div style={{ color: '#666', fontSize: '12px' }}>Notes: {tx.notes}</div>}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
            
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setSelectedKeg(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
