import { useState, useEffect } from 'react';
import api from '../../utils/api';

export default function CashManagement() {
  const [cashData, setCashData] = useState(null);
  const [funds, setFunds] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [cashRes, fundsRes] = await Promise.all([
        api.get('/dashboard/cash'),
        api.get('/dashboard/funds'),
      ]);
      setCashData(cashRes.data);
      setFunds(fundsRes.data);
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  if (loading) return <div style={{ padding: '40px', textAlign: 'center' }}>Loading...</div>;

  const fmt = (n) => `KSh ${parseFloat(n || 0).toLocaleString()}`;

  return (
    <div>
      <div className="page-header">
        <h1>💵 Cash Management</h1>
        <p>Track money by payment method and available funds</p>
      </div>

      {cashData && (
        <>
          <h3 style={{ marginBottom: '12px' }}>Today's Sales by Payment Method</h3>
          <div className="kpi-grid">
            <div className="kpi-card" style={{ borderLeftColor: '#27ae60' }}>
              <div className="label">💵 Cash Sales</div>
              <div className="value">{fmt(cashData.cash)}</div>
            </div>
            <div className="kpi-card info">
              <div className="label">📱 M-Pesa Sales</div>
              <div className="value">{fmt(cashData.mpesa)}</div>
            </div>
            <div className="kpi-card" style={{ borderLeftColor: '#9b59b6' }}>
              <div className="label">💳 Card Sales</div>
              <div className="value">{fmt(cashData.card)}</div>
            </div>
            <div className="kpi-card">
              <div className="label">🔄 Other Payments</div>
              <div className="value">{fmt(cashData.other)}</div>
            </div>
            <div className="kpi-card">
              <div className="label">📊 Total Today</div>
              <div className="value">{fmt(cashData.total)}</div>
            </div>
          </div>
        </>
      )}

      {funds && (
        <>
          <h3 style={{ marginBottom: '12px', marginTop: '24px' }}>Money Available (Month to Date)</h3>
          <div className="kpi-grid">
            <div className="kpi-card">
              <div className="label">Total Revenue</div>
              <div className="value">{fmt(funds.revenue)}</div>
            </div>
            <div className="kpi-card expense">
              <div className="label">Cost of Goods Sold</div>
              <div className="value">{fmt(funds.cost_of_goods)}</div>
            </div>
            <div className="kpi-card">
              <div className="label">Purchases Made</div>
              <div className="value">{fmt(funds.purchases)}</div>
            </div>
            <div className="kpi-card expense">
              <div className="label">Operating Expenses</div>
              <div className="value">{fmt(funds.expenses)}</div>
            </div>
            <div className="kpi-card profit">
              <div className="label">Available Cash</div>
              <div className="value">{fmt(funds.available_cash)}</div>
            </div>
            <div className="kpi-card info">
              <div className="label">Funds for Purchases</div>
              <div className="value">{fmt(funds.purchase_funds)}</div>
            </div>
          </div>

          <div className="card" style={{ marginTop: '20px' }}>
            <h3 style={{ marginBottom: '12px' }}>Financial Breakdown</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {[
                  ['Revenue (Sales)', funds.revenue, '#27ae60'],
                  ['Cost of Goods Sold', -funds.cost_of_goods, '#e74c3c'],
                  ['Gross Profit', funds.revenue - funds.cost_of_goods, '#0f3460'],
                  ['Operating Expenses', -funds.expenses, '#e74c3c'],
                  ['Net Profit', funds.revenue - funds.cost_of_goods - funds.expenses, '#27ae60'],
                  ['Money Spent on Purchases', -funds.purchases, '#e74c3c'],
                  ['Available Cash', funds.available_cash, '#0f3460'],
                ].map(([label, value, color], i) => (
                  <tr key={i} style={{ borderBottom: i === 4 || i === 6 ? '2px solid #eee' : '1px solid #f5f5f5' }}>
                    <td style={{ padding: '12px', fontWeight: i === 2 || i === 4 || i === 6 ? 700 : 400 }}>{label}</td>
                    <td style={{ padding: '12px', textAlign: 'right', fontWeight: 700, color, fontSize: '16px' }}>{fmt(Math.abs(value))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
