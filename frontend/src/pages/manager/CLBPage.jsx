import { useState, useEffect } from 'react';
import api from '../../utils/api';

export default function CLBPage() {
  const [transactions, setTransactions] = useState([]);
  const [dailyTransactions, setDailyTransactions] = useState([]);
  const [summary, setSummary] = useState(null);
  const [clbProducts, setClbProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTransaction, setNewTransaction] = useState({ 
    type: 'purchase', 
    description: '', 
    amount: '', 
    date: new Date().toISOString().split('T')[0] 
  });
  const [view, setView] = useState('daily');
  const [period, setPeriod] = useState('all');

  useEffect(() => { loadCLBData(); }, [view, period]);

  const loadCLBData = async () => {
    setLoading(true);
    try {
      if (view === 'daily') {
        const res = await api.get('/clb/daily');
        setDailyTransactions(res.data);
      } else {
        const res = await api.get('/clb');
        setTransactions(res.data);
      }
      
      const summaryRes = await api.get('/clb/summary', { params: { period } });
      setSummary(summaryRes.data);
      
      const productsRes = await api.get('/clb/products');
      setClbProducts(productsRes.data);
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  const addTransaction = async () => {
    try {
      await api.post('/clb', newTransaction);
      setShowAddModal(false);
      setNewTransaction({ 
        type: 'purchase', 
        description: '', 
        amount: '', 
        date: new Date().toISOString().split('T')[0] 
      });
      loadCLBData();
    } catch (err) { console.error(err); }
  };

  const fmt = (n) => `KSh ${parseFloat(n || 0).toLocaleString()}`;

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  return (
    <div>
      <div className="page-header">
        <h1>🍻 CLB Management</h1>
        <p>CLB transactions synced with POS sales - sold first in POS, not directly from back office</p>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="kpi-grid" style={{ marginBottom: '24px' }}>
          <div className="kpi-card" style={{ borderLeftColor: '#0f3460' }}>
            <div className="label">Total Sales (Revenue)</div>
            <div className="value">{fmt(summary.total_sales)}</div>
          </div>
          <div className="kpi-card expense">
            <div className="label">Total Purchases (Cost)</div>
            <div className="value">{fmt(summary.total_purchases)}</div>
          </div>
          <div className="kpi-card profit">
            <div className="label">CLB Profit</div>
            <div className="value">{fmt(summary.profit)}</div>
          </div>
          <div className="kpi-card info">
            <div className="label">Transactions</div>
            <div className="value">{summary.transaction_count}</div>
          </div>
        </div>
      )}

      {/* Sync Notice */}
      <div style={{ 
        padding: '16px', 
        backgroundColor: '#e3f2fd', 
        borderRadius: '8px', 
        marginBottom: '24px',
        borderLeft: '4px solid #2196f3'
      }}>
        <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#1565c0' }}>
          🔄 POS Sync Active
        </h4>
        <p style={{ margin: 0, fontSize: '13px', color: '#333' }}>
          CLB products are automatically synced when sold through the POS. 
          Sales are recorded when products are sold, not directly from the back office. 
          This ensures accurate tracking and prevents duplicate entries.
        </p>
      </div>

      {/* CLB Products */}
      {clbProducts.length > 0 && (
        <div className="card" style={{ marginBottom: '24px' }}>
          <h3 style={{ padding: '16px', borderBottom: '1px solid #eee', fontSize: '16px' }}>
            🍺 CLB Products (Sold via POS)
          </h3>
          <div style={{ padding: '16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
              {clbProducts.map(product => (
                <div key={product.id} style={{ 
                  padding: '12px', 
                  backgroundColor: '#f8f9fa', 
                  borderRadius: '6px',
                  border: '1px solid #eee'
                }}>
                  <div style={{ fontWeight: '600', fontSize: '14px', marginBottom: '4px' }}>
                    {product.name}
                  </div>
                  <div style={{ fontSize: '12px', color: '#666' }}>
                    Sold: {product.total_sold} units
                  </div>
                  <div style={{ fontSize: '12px', color: '#27ae60' }}>
                    Revenue: {fmt(product.total_revenue)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="filters-bar" style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <label style={{ fontSize: '13px', fontWeight: '500' }}>View:</label>
          <select 
            value={view} 
            onChange={e => setView(e.target.value)}
            style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #ddd' }}
          >
            <option value="daily">By Day (Recommended)</option>
            <option value="all">All Transactions</option>
          </select>
        </div>
        
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <label style={{ fontSize: '13px', fontWeight: '500' }}>Period:</label>
          <select 
            value={period} 
            onChange={e => setPeriod(e.target.value)}
            style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #ddd' }}
          >
            <option value="all">All Time</option>
            <option value="today">Today</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
          </select>
        </div>
        
        <button 
          className="btn btn-primary" 
          onClick={() => setShowAddModal(true)}
        >
          + Add Manual Transaction
        </button>
      </div>

      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center' }}>Loading CLB data...</div>
      ) : view === 'daily' ? (
        // Daily grouped view
        <div className="daily-clb-container">
          {dailyTransactions.length === 0 ? (
            <div className="card" style={{ padding: '40px', textAlign: 'center' }}>
              <p style={{ color: '#666', margin: 0 }}>No CLB transactions found</p>
            </div>
          ) : (
            dailyTransactions.map((dayData, idx) => (
              <div key={idx} className="card" style={{ marginBottom: '16px' }}>
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  padding: '16px',
                  borderBottom: '2px solid #f0f0f0'
                }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '16px', color: '#333' }}>
                      📅 {formatDate(dayData.day)}
                    </h3>
                    <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#666' }}>
                      {dayData.transactions.length} transaction{dayData.transactions.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '20px', fontWeight: '700', color: '#0f3460' }}>
                      {fmt(dayData.sales)}
                    </div>
                    <div style={{ fontSize: '13px', color: '#27ae60' }}>
                      Profit: {fmt(dayData.profit)}
                    </div>
                  </div>
                </div>
                
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#f8f9fa' }}>
                        <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600' }}>Time</th>
                        <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600' }}>Type</th>
                        <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600' }}>Description</th>
                        <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: '12px', fontWeight: '600' }}>Amount</th>
                        <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600' }}>Created By</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dayData.transactions.map(tx => (
                        <tr key={tx.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                          <td style={{ padding: '12px 16px', fontSize: '13px' }}>
                            {new Date(tx.date).toLocaleTimeString()}
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            <span className={`badge badge-${tx.type === 'sale' ? 'success' : 'warning'}`}>
                              {tx.type}
                            </span>
                          </td>
                          <td style={{ padding: '12px 16px', fontSize: '13px' }}>
                            {tx.description}
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '600' }}>
                            {fmt(tx.amount)}
                          </td>
                          <td style={{ padding: '12px 16px', fontSize: '13px', color: '#666' }}>
                            {tx.created_by_name}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                
                {/* Day Summary */}
                <div style={{ 
                  padding: '12px 16px', 
                  backgroundColor: '#f8f9fa', 
                  borderTop: '1px solid #eee',
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '24px'
                }}>
                  <div style={{ fontSize: '13px' }}>
                    <span style={{ color: '#666' }}>Purchases:</span>{' '}
                    <strong>{fmt(dayData.purchases)}</strong>
                  </div>
                  <div style={{ fontSize: '13px' }}>
                    <span style={{ color: '#666' }}>Sales:</span>{' '}
                    <strong>{fmt(dayData.sales)}</strong>
                  </div>
                  <div style={{ fontSize: '13px', color: '#27ae60' }}>
                    <span>Profit:</span>{' '}
                    <strong>{fmt(dayData.profit)}</strong>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        // All transactions view
        <div className="table-container">
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <table style={{ minWidth: '700px' }}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Description</th>
                  <th>Amount</th>
                  <th>Created By</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map(tx => (
                  <tr key={tx.id}>
                    <td>{new Date(tx.date).toLocaleString()}</td>
                    <td><span className={`badge badge-${tx.type === 'sale' ? 'success' : 'warning'}`}>{tx.type}</span></td>
                    <td>{tx.description}</td>
                    <td style={{ fontWeight: 600 }}>{fmt(tx.amount)}</td>
                    <td style={{ color: '#666' }}>{tx.created_by_name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Transaction Modal */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>Add Manual CLB Transaction</h2>
            <p style={{ color: '#666', marginBottom: '16px', fontSize: '13px' }}>
              Note: Most CLB transactions are automatically synced from POS sales. 
              Use this for manual adjustments only.
            </p>
            
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: '500' }}>Transaction Type</label>
              <select 
                value={newTransaction.type} 
                onChange={e => setNewTransaction({...newTransaction, type: e.target.value})}
                style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #ddd' }}
              >
                <option value="purchase">Purchase (Cost)</option>
                <option value="sale">Sale (Revenue)</option>
              </select>
            </div>
            
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: '500' }}>Description</label>
              <input 
                type="text" 
                value={newTransaction.description} 
                onChange={e => setNewTransaction({...newTransaction, description: e.target.value})}
                style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #ddd' }}
                placeholder="e.g., Manual adjustment, etc."
              />
            </div>
            
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: '500' }}>Amount (KSh)</label>
              <input 
                type="number" 
                value={newTransaction.amount} 
                onChange={e => setNewTransaction({...newTransaction, amount: e.target.value})}
                style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #ddd' }}
                placeholder="0"
              />
            </div>
            
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: '500' }}>Date</label>
              <input 
                type="date" 
                value={newTransaction.date} 
                onChange={e => setNewTransaction({...newTransaction, date: e.target.value})}
                style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #ddd' }}
              />
            </div>
            
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setShowAddModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={addTransaction}>Add Transaction</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
