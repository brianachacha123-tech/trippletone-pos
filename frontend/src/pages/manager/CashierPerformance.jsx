import { useState, useEffect } from 'react';
import api from '../../utils/api';

export default function CashierPerformance() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const res = await api.get('/sales/charts/cashier-performance');
      setData(res.data);
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  if (loading) return <div style={{ padding: '40px', textAlign: 'center' }}>Loading...</div>;

  const fmt = (n) => `KSh ${parseFloat(n || 0).toLocaleString()}`;

  return (
    <div>
      <div className="page-header">
        <h1>👥 Cashier Performance</h1>
        <p>Compare cashier sales performance (last 30 days)</p>
      </div>

      <div className="table-container">
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <table style={{ minWidth: '650px' }}>
            <thead>
              <tr>
                <th>Cashier</th>
                <th>Transactions</th>
                <th>Revenue</th>
                <th>Profit</th>
                <th>Avg Sale</th>
                <th>Revenue %</th>
              </tr>
            </thead>
            <tbody>
              {data.map((c, i) => {
                const totalRevenue = data.reduce((sum, item) => sum + parseFloat(item.revenue), 0);
                const pct = totalRevenue > 0 ? ((parseFloat(c.revenue) / totalRevenue) * 100).toFixed(1) : 0;
                return (
                  <tr key={i}>
                    <td style={{ fontWeight: 600 }}>{c.cashier}</td>
                    <td>{c.transactions}</td>
                    <td style={{ fontWeight: 600 }}>{fmt(c.revenue)}</td>
                    <td style={{ color: '#27ae60', fontWeight: 600 }}>{fmt(c.profit)}</td>
                    <td>{fmt(c.avg_transaction)}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: '80px', height: '8px', background: '#eee', borderRadius: '4px' }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: '#0f3460', borderRadius: '4px' }} />
                        </div>
                        <span style={{ fontSize: '13px' }}>{pct}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
