import { useState, useEffect } from 'react';
import api from '../../utils/api';

export default function ReportsPage() {
  const [reportType, setReportType] = useState('sales');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);

  const reportTypes = [
    { id: 'sales', label: '💰 Sales' },
    { id: 'profit', label: '📈 Profit' },
    { id: 'expenses', label: '💸 Expenses' },
    { id: 'purchases', label: '📦 Purchases' },
    { id: 'product-performance', label: '🏷️ Products' },
    { id: 'cashier', label: '👥 Cashiers' },
    { id: 'monthly', label: '📅 Monthly' },
    { id: 'yearly', label: '📆 Yearly' },
    { id: 'keg', label: '🍺 Kegs' },
    { id: 'clb', label: '🍸 CLB' },
  ];

  useEffect(() => { loadReport(); }, [reportType, month, year]);

  const loadReport = async () => {
    setLoading(true);
    try {
      let res;
      const params = {};
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;

      switch (reportType) {
        case 'sales': res = await api.get('/sales', { params }); setData(res.data); break;
        case 'expenses': res = await api.get('/expenses', { params }); setData(res.data); break;
        case 'purchases': res = await api.get('/purchases', { params }); setData(res.data); break;
        case 'product-performance': res = await api.get('/dashboard/product-profitability'); setData(res.data); break;
        case 'cashier': res = await api.get('/sales/charts/cashier-performance'); setData(res.data); break;
        case 'monthly': res = await api.get(`/dashboard/monthly?month=${month}&year=${year}`); setData([res.data]); break;
        case 'yearly': res = await api.get(`/dashboard/yearly?year=${year}`); setData([res.data]); break;
        case 'keg': res = await api.get('/kegs'); setData(res.data); break;
        case 'clb': res = await api.get('/clb'); setData(res.data); break;
        case 'profit': res = await api.get('/sales/charts/by-day?days=30'); setData(res.data); break;
        default: setData([]);
      }
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  const exportCSV = () => {
    if (data.length === 0) return;
    const headers = Object.keys(data[0]);
    const csv = [headers.join(','), ...data.map(row => headers.map(h => `"${row[h] || ''}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${reportType}-report-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const fmt = (n) => `KSh ${parseFloat(n || 0).toLocaleString()}`;

  const renderTable = () => {
    if (loading) return <div style={{ padding: '40px', textAlign: 'center' }}>Loading...</div>;
    if (data.length === 0) return <div style={{ padding: '40px', textAlign: 'center', color: '#888' }}>No data for this report</div>;

    if (reportType === 'monthly' || reportType === 'yearly') {
      const d = data[0];
      return (
        <div className="kpi-grid">
          <div className="kpi-card"><div className="label">Revenue</div><div className="value">{fmt(d.revenue)}</div></div>
          <div className="kpi-card"><div className="label">Cost of Goods</div><div className="value">{fmt(d.cost)}</div></div>
          <div className="kpi-card profit"><div className="label">Gross Profit</div><div className="value">{fmt(d.gross_profit || d.profit)}</div></div>
          <div className="kpi-card expense"><div className="label">Expenses</div><div className="value">{fmt(d.expenses)}</div></div>
          <div className="kpi-card profit"><div className="label">Net Profit</div><div className="value">{fmt(d.net_profit)}</div></div>
          <div className="kpi-card info"><div className="label">Transactions</div><div className="value">{d.transactions}</div></div>
        </div>
      );
    }

    if (reportType === 'sales') {
      return (
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <table style={{ minWidth: '800px' }}>
            <thead>
              <tr><th>Sale ID</th><th>Date</th><th>Cashier</th><th>Payment</th><th>Revenue</th><th>Cost</th><th>Profit</th></tr>
            </thead>
            <tbody>
              {data.map(s => (
                <tr key={s.id}>
                  <td style={{ fontFamily: 'monospace' }}>{s.sale_id}</td>
                  <td>{new Date(s.date).toLocaleDateString()}</td>
                  <td>{s.cashier_name}</td>
                  <td><span className="badge badge-info">{s.payment_method}</span></td>
                  <td style={{ fontWeight: 600 }}>{fmt(s.total_revenue)}</td>
                  <td>{fmt(s.total_cost)}</td>
                  <td style={{ color: '#27ae60', fontWeight: 600 }}>{fmt(s.total_profit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    if (reportType === 'expenses') {
      return (
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <table style={{ minWidth: '700px' }}>
            <thead><tr><th>ID</th><th>Date</th><th>Category</th><th>Description</th><th>Amount</th><th>Payment</th></tr></thead>
            <tbody>
              {data.map(e => (
                <tr key={e.id}>
                  <td style={{ fontFamily: 'monospace' }}>{e.expense_id}</td>
                  <td>{new Date(e.date).toLocaleDateString()}</td>
                  <td><span className="badge badge-info">{e.category_name}</span></td>
                  <td>{e.description}</td>
                  <td style={{ fontWeight: 600, color: '#e74c3c' }}>{fmt(e.amount)}</td>
                  <td>{e.payment_method}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    if (reportType === 'product-performance') {
      return (
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <table style={{ minWidth: '800px' }}>
            <thead><tr><th>Product</th><th>Buy</th><th>Sell</th><th>Profit/Unit</th><th>Sold</th><th>Revenue</th><th>Profit</th></tr></thead>
            <tbody>
              {data.map((p, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 600 }}>{p.product}</td>
                  <td>{fmt(p.buying_price)}</td>
                  <td>{fmt(p.selling_price)}</td>
                  <td style={{ color: '#27ae60' }}>{fmt(p.unit_profit)}</td>
                  <td>{parseFloat(p.units_sold).toLocaleString()}</td>
                  <td>{fmt(p.revenue)}</td>
                  <td style={{ color: '#27ae60', fontWeight: 600 }}>{fmt(p.profit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    if (reportType === 'cashier') {
      return (
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <table style={{ minWidth: '600px' }}>
            <thead><tr><th>Cashier</th><th>Transactions</th><th>Revenue</th><th>Profit</th><th>Avg</th></tr></thead>
            <tbody>
              {data.map((c, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 600 }}>{c.cashier}</td>
                  <td>{c.transactions}</td>
                  <td>{fmt(c.revenue)}</td>
                  <td style={{ color: '#27ae60', fontWeight: 600 }}>{fmt(c.profit)}</td>
                  <td>{fmt(c.avg_transaction)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    if (reportType === 'keg') {
      return (
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <table style={{ minWidth: '600px' }}>
            <thead><tr><th>Keg ID</th><th>Product</th><th>Status</th><th>Revenue</th><th>Profit</th></tr></thead>
            <tbody>
              {data.map(k => (
                <tr key={k.id}>
                  <td style={{ fontFamily: 'monospace' }}>{k.keg_id}</td>
                  <td>{k.product_name}</td>
                  <td><span className={`badge badge-${k.status === 'open' ? 'success' : 'warning'}`}>{k.status}</span></td>
                  <td style={{ fontWeight: 600 }}>{fmt(k.total_revenue)}</td>
                  <td style={{ color: '#27ae60', fontWeight: 600 }}>{k.status === 'closed' ? fmt(k.profit) : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    const keys = Object.keys(data[0]);
    return (
      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <table style={{ minWidth: `${keys.length * 120}px` }}>
          <thead><tr>{keys.map(k => <th key={k}>{k}</th>)}</tr></thead>
          <tbody>
            {data.map((row, i) => (
              <tr key={i}>{keys.map(k => <td key={k}>{typeof row[k] === 'number' ? parseFloat(row[k]).toLocaleString() : row[k]}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div>
      <div className="page-header">
        <h1>📈 Reports</h1>
        <p>View and export business reports</p>
      </div>

      <div className="tabs" style={{ flexWrap: 'nowrap', overflowX: 'auto' }}>
        {reportTypes.map(r => (
          <button key={r.id} className={`tab ${reportType === r.id ? 'active' : ''}`} onClick={() => setReportType(r.id)}>{r.label}</button>
        ))}
      </div>

      <div className="filters-bar">
        {['monthly'].includes(reportType) && (
          <>
            <select value={month} onChange={e => setMonth(e.target.value)} style={{ flex: '1 1 120px' }}>
              {[...Array(12)].map((_, i) => <option key={i+1} value={i+1}>{new Date(0, i).toLocaleString('en', { month: 'long' })}</option>)}
            </select>
            <select value={year} onChange={e => setYear(e.target.value)} style={{ flex: '1 1 100px' }}>
              {[...Array(5)].map((_, i) => <option key={i} value={new Date().getFullYear() - i}>{new Date().getFullYear() - i}</option>)}
            </select>
          </>
        )}
        {reportType === 'yearly' && (
          <select value={year} onChange={e => setYear(e.target.value)} style={{ flex: '1 1 100px' }}>
            {[...Array(5)].map((_, i) => <option key={i} value={new Date().getFullYear() - i}>{new Date().getFullYear() - i}</option>)}
          </select>
        )}
        {!['monthly', 'yearly', 'cashier'].includes(reportType) && (
          <>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ flex: '1 1 130px' }} />
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ flex: '1 1 130px' }} />
            <button className="btn btn-sm btn-primary" onClick={loadReport}>Filter</button>
          </>
        )}
        <button className="btn btn-sm btn-outline" onClick={exportCSV}>📥 CSV</button>
      </div>

      <div className="table-container">
        {renderTable()}
      </div>
    </div>
  );
}
