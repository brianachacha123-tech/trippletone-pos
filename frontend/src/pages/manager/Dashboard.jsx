import { useState, useEffect } from 'react';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import api from '../../utils/api';

const COLORS = ['#0f3460', '#e94560', '#27ae60', '#f39c12', '#9b59b6', '#1abc9c', '#e74c3c', '#3498db'];

export default function Dashboard() {
  const [kpis, setKpis] = useState(null);
  const [weekly, setWeekly] = useState(null);
  const [funds, setFunds] = useState(null);
  const [kegFunds, setKegFunds] = useState(null);
  const [salesByDay, setSalesByDay] = useState([]);
  const [topProducts, setTopProducts] = useState([]);
  const [categorySales, setCategorySales] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      const [kpisRes, weeklyRes, fundsRes, kegFundsRes, salesRes, topRes, catRes, alertsRes] = await Promise.all([
        api.get('/dashboard/kpis'),
        api.get('/dashboard/weekly'),
        api.get('/dashboard/funds'),
        api.get('/dashboard/keg-funds'),
        api.get('/sales/charts/by-day?days=30'),
        api.get('/sales/charts/top-products'),
        api.get('/sales/charts/by-category'),
        api.get('/dashboard/alerts'),
      ]);
      setKpis(kpisRes.data);
      setWeekly(weeklyRes.data);
      setFunds(fundsRes.data);
      setKegFunds(kegFundsRes.data);
      setSalesByDay(salesRes.data);
      setTopProducts(topRes.data);
      setCategorySales(catRes.data);
      setAlerts(alertsRes.data);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  if (loading) return <div style={{ padding: '40px', textAlign: 'center' }}>Loading dashboard...</div>;

  const fmt = (n) => `KSh ${parseFloat(n || 0).toLocaleString()}`;

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString('en-US', { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric' 
    });
  };

  return (
    <div>
      <div className="page-header">
        <h1>📊 Dashboard</h1>
        <p>Business performance overview - Weekly summary with reset</p>
      </div>

      {/* Today's KPIs */}
      {kpis && (
        <div className="kpi-grid">
          <div className="kpi-card">
            <div className="label">Today's Revenue</div>
            <div className="value">{fmt(kpis.today_revenue)}</div>
          </div>
          <div className="kpi-card profit">
            <div className="label">Today's Gross Profit</div>
            <div className="value">{fmt(kpis.today_gross_profit)}</div>
          </div>
          <div className="kpi-card expense">
            <div className="label">Today's Expenses</div>
            <div className="value">{fmt(kpis.today_expenses)}</div>
          </div>
          <div className="kpi-card profit">
            <div className="label">Today's Net Profit</div>
            <div className="value">{fmt(kpis.today_net_profit)}</div>
          </div>
          <div className="kpi-card info">
            <div className="label">Transactions</div>
            <div className="value">{kpis.today_transactions}</div>
          </div>
          <div className="kpi-card info">
            <div className="label">Average Sale</div>
            <div className="value">{fmt(kpis.today_avg_sale)}</div>
          </div>
          <div className="kpi-card">
            <div className="label">Stock Value</div>
            <div className="value">{fmt(kpis.stock_value)}</div>
          </div>
          <div className="kpi-card warning">
            <div className="label">Low Stock Items</div>
            <div className="value">{kpis.low_stock_count}</div>
          </div>
          <div className="kpi-card" style={{ borderLeftColor: kpis.out_of_stock_count > 0 ? '#e74c3c' : '#27ae60' }}>
            <div className="label">Out of Stock</div>
            <div className="value">{kpis.out_of_stock_count}</div>
          </div>
          <div className="kpi-card" style={{ borderLeftColor: '#9b59b6' }}>
            <div className="label">Active Kegs</div>
            <div className="value">{kpis.active_kegs}</div>
          </div>
          <div className="kpi-card" style={{ borderLeftColor: '#e94560' }}>
            <div className="label">Today's Keg Revenue</div>
            <div className="value">{fmt(kpis.today_keg_revenue)}</div>
          </div>
        </div>
      )}

      {/* Weekly Summary */}
      {weekly && (
        <div style={{ marginBottom: '24px' }}>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            marginBottom: '16px',
            padding: '16px',
            backgroundColor: '#f8f9fa',
            borderRadius: '8px',
            borderLeft: '4px solid #0f3460'
          }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '18px', color: '#333' }}>📅 Weekly Summary</h3>
              <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#666' }}>
                {formatDate(weekly.week_start)} - {formatDate(weekly.week_end)}
              </p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '24px', fontWeight: '700', color: '#0f3460' }}>
                {fmt(weekly.revenue)}
              </div>
              <div style={{ fontSize: '13px', color: '#666' }}>Weekly Revenue</div>
            </div>
          </div>
          
          <div className="kpi-grid">
            <div className="kpi-card" style={{ borderLeftColor: '#9b59b6' }}>
              <div className="label">Weekly Revenue</div>
              <div className="value">{fmt(weekly.revenue)}</div>
            </div>
            <div className="kpi-card profit">
              <div className="label">Weekly Profit</div>
              <div className="value">{fmt(weekly.profit)}</div>
            </div>
            <div className="kpi-card expense">
              <div className="label">Weekly Expenses</div>
              <div className="value">{fmt(weekly.expenses)}</div>
            </div>
            <div className="kpi-card profit">
              <div className="label">Weekly Net Profit</div>
              <div className="value">{fmt(weekly.net_profit)}</div>
            </div>
            <div className="kpi-card" style={{ borderLeftColor: '#e94560' }}>
              <div className="label">Weekly Keg Revenue</div>
              <div className="value">{fmt(weekly.keg_revenue)}</div>
            </div>
            <div className="kpi-card" style={{ borderLeftColor: '#e74c3c' }}>
              <div className="label">Weekly Keg Profit</div>
              <div className="value">{fmt(weekly.keg_profit)}</div>
            </div>
          </div>
        </div>
      )}

      {/* Money Available Section */}
      {funds && kegFunds && (
        <div style={{ marginBottom: '24px' }}>
          <h3 style={{ marginBottom: '16px', fontSize: '18px' }}>💰 Money Available</h3>
          <div className="kpi-grid">
            <div className="kpi-card" style={{ borderLeftColor: '#27ae60', backgroundColor: '#f0fff4' }}>
              <div className="label" style={{ color: '#27ae60' }}>Money Available for Purchases</div>
              <div className="value" style={{ color: '#27ae60', fontSize: '24px' }}>{fmt(funds.available_for_purchase)}</div>
              <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                Week: {formatDate(funds.week_start)} - {formatDate(funds.week_end)}
              </div>
            </div>
            <div className="kpi-card" style={{ borderLeftColor: '#e94560', backgroundColor: '#fff5f5' }}>
              <div className="label" style={{ color: '#e94560' }}>Money Available for Keg Purchase</div>
              <div className="value" style={{ color: '#e94560', fontSize: '24px' }}>{fmt(kegFunds.money_available_for_keg_purchase)}</div>
              <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                Net Profit: {fmt(kegFunds.net_profit)} | Purchases: {fmt(kegFunds.purchases_made)}
              </div>
            </div>
            <div className="kpi-card profit">
              <div className="label">Business Net Profit (Weekly)</div>
              <div className="value">{fmt(kegFunds.net_profit)}</div>
            </div>
            <div className="kpi-card expense">
              <div className="label">Purchases Made (Weekly)</div>
              <div className="value">{fmt(kegFunds.purchases_made)}</div>
            </div>
          </div>
        </div>
      )}

      {/* Charts */}
      <div className="charts-grid">
        {/* Sales by Day */}
        <div className="card">
          <h3 style={{ marginBottom: '16px', fontSize: '16px' }}>Sales & Profit (Last 30 Days)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={salesByDay}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="day" tickFormatter={(d) => new Date(d).toLocaleDateString('en', { month: 'short', day: 'numeric' })} />
              <YAxis />
              <Tooltip formatter={(v) => fmt(v)} />
              <Legend />
              <Bar dataKey="revenue" fill="#0f3460" name="Revenue" />
              <Bar dataKey="profit" fill="#27ae60" name="Profit" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Top Products */}
        <div className="card">
          <h3 style={{ marginBottom: '16px', fontSize: '16px' }}>Top Selling Products</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={topProducts} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis type="category" dataKey="product" width={120} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v) => fmt(v)} />
              <Bar dataKey="revenue" fill="#e94560" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Sales by Category */}
        <div className="card">
          <h3 style={{ marginBottom: '16px', fontSize: '16px' }}>Sales by Category</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={categorySales} dataKey="revenue" nameKey="category" cx="50%" cy="50%" outerRadius={100} label={({ category, percent }) => `${category} (${(percent * 100).toFixed(0)}%)`}>
                {categorySales.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v) => fmt(v)} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Top Products Table */}
        <div className="card">
          <h3 style={{ marginBottom: '16px', fontSize: '16px' }}>Product Performance</h3>
          <div style={{ overflow: 'auto', maxHeight: '280px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ padding: '8px', textAlign: 'left', fontSize: '12px' }}>Product</th>
                  <th style={{ padding: '8px', textAlign: 'right', fontSize: '12px' }}>Qty Sold</th>
                  <th style={{ padding: '8px', textAlign: 'right', fontSize: '12px' }}>Revenue</th>
                  <th style={{ padding: '8px', textAlign: 'right', fontSize: '12px' }}>Profit</th>
                </tr>
              </thead>
              <tbody>
                {topProducts.map((p, i) => (
                  <tr key={i}>
                    <td style={{ padding: '8px', fontSize: '13px' }}>{p.product}</td>
                    <td style={{ padding: '8px', textAlign: 'right', fontSize: '13px' }}>{parseFloat(p.quantity_sold).toLocaleString()}</td>
                    <td style={{ padding: '8px', textAlign: 'right', fontSize: '13px' }}>{fmt(p.revenue)}</td>
                    <td style={{ padding: '8px', textAlign: 'right', fontSize: '13px', color: '#27ae60', fontWeight: 600 }}>{fmt(p.profit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="card" style={{ marginTop: '16px' }}>
          <h3 style={{ marginBottom: '12px', fontSize: '16px' }}>⚠️ Alerts</h3>
          <div className="alert-list">
            {alerts.map((alert, i) => (
              <div key={i} className={`alert-item ${alert.type}`}>
                {alert.message}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
