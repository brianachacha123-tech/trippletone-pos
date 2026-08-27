const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { getWeekRange } = require('../utils/helpers');

// Dashboard KPIs
router.get('/kpis', authenticate, authorize('manager'), async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    // Today's sales
    const todaySales = await pool.query(`
      SELECT 
        COALESCE(SUM(total_revenue), 0) as revenue,
        COALESCE(SUM(total_cost), 0) as cost,
        COALESCE(SUM(total_profit), 0) as profit,
        COUNT(*) as transactions,
        COALESCE(AVG(total_revenue), 0) as avg_sale
      FROM sales WHERE date::date = $1
    `, [today]);

    // Today's expenses
    const todayExpenses = await pool.query(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM expenses WHERE date::date = $1
    `, [today]);

    // Stock value
    const stockValue = await pool.query(`
      SELECT COALESCE(SUM(current_stock * buying_price), 0) as total_value
      FROM products WHERE status = 'active'
    `);

    // Low stock
    const lowStock = await pool.query(`
      SELECT COUNT(*) as count FROM products
      WHERE current_stock > 0 AND current_stock <= minimum_stock AND status = 'active'
    `);

    // Out of stock
    const outOfStock = await pool.query(`
      SELECT COUNT(*) as count FROM products
      WHERE current_stock = 0 AND status = 'active'
    `);

    const todayData = todaySales.rows[0];
    const expenses = parseFloat(todayExpenses.rows[0].total);
    const grossProfit = parseFloat(todayData.profit);
    const netProfit = grossProfit - expenses;

    res.json({
      today_revenue: todayData.revenue,
      today_cost: todayData.cost,
      today_gross_profit: grossProfit,
      today_expenses: expenses,
      today_net_profit: netProfit,
      today_transactions: todayData.transactions,
      today_avg_sale: todayData.avg_sale,
      stock_value: stockValue.rows[0].total_value,
      low_stock_count: lowStock.rows[0].count,
      out_of_stock_count: outOfStock.rows[0].count
    });
  } catch (err) {
    console.error('Dashboard KPIs error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Weekly KPIs
router.get('/weekly', authenticate, authorize('manager'), async (req, res) => {
  try {
    const { weekStart, weekEnd } = getWeekRange();
    
    const sales = await pool.query(`
      SELECT 
        COALESCE(SUM(total_revenue), 0) as revenue,
        COALESCE(SUM(total_cost), 0) as cost,
        COALESCE(SUM(total_profit), 0) as profit,
        COUNT(*) as transactions
      FROM sales WHERE date >= $1 AND date <= $2
    `, [weekStart, weekEnd]);

    const expenses = await pool.query(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM expenses WHERE date >= $1 AND date <= $2
    `, [weekStart, weekEnd]);

    const salesByDay = await pool.query(`
      SELECT 
        date::date as day,
        SUM(total_revenue) as revenue,
        SUM(total_profit) as profit,
        COUNT(*) as transactions
      FROM sales
      WHERE date >= $1 AND date <= $2
      GROUP BY date::date
      ORDER BY day
    `, [weekStart, weekEnd]);

    res.json({
      week_start: weekStart,
      week_end: weekEnd,
      revenue: sales.rows[0].revenue,
      cost: sales.rows[0].cost,
      profit: sales.rows[0].profit,
      expenses: expenses.rows[0].total,
      net_profit: parseFloat(sales.rows[0].profit) - parseFloat(expenses.rows[0].total),
      transactions: sales.rows[0].transactions,
      sales_by_day: salesByDay.rows
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Monthly summary
router.get('/monthly', authenticate, authorize('manager'), async (req, res) => {
  try {
    const { month, year } = req.query;
    const m = parseInt(month) || new Date().getMonth() + 1;
    const y = parseInt(year) || new Date().getFullYear();

    const startDate = `${y}-${String(m).padStart(2, '0')}-01`;
    const endDate = `${y}-${String(m).padStart(2, '0')}-31`;

    const sales = await pool.query(`
      SELECT 
        COALESCE(SUM(total_revenue), 0) as revenue,
        COALESCE(SUM(total_cost), 0) as cost,
        COALESCE(SUM(total_profit), 0) as profit,
        COUNT(*) as transactions
      FROM sales WHERE date >= $1 AND date <= $2
    `, [startDate, endDate]);

    const expenses = await pool.query(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM expenses WHERE date >= $1 AND date <= $2
    `, [startDate, endDate]);

    const purchases = await pool.query(`
      SELECT COALESCE(SUM(total_cost), 0) as total
      FROM purchases WHERE date >= $1 AND date <= $2
    `, [startDate, endDate]);

    const stockValue = await pool.query(`
      SELECT COALESCE(SUM(current_stock * buying_price), 0) as total_value
      FROM products WHERE status = 'active'
    `);

    const s = sales.rows[0];
    res.json({
      month: m,
      year: y,
      revenue: s.revenue,
      cost: s.cost,
      gross_profit: s.profit,
      expenses: expenses.rows[0].total,
      net_profit: parseFloat(s.profit) - parseFloat(expenses.rows[0].total),
      transactions: s.transactions,
      purchases_total: purchases.rows[0].total,
      stock_value: stockValue.rows[0].total_value
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Yearly summary
router.get('/yearly', authenticate, authorize('manager'), async (req, res) => {
  try {
    const y = parseInt(req.query.year) || new Date().getFullYear();
    const startDate = `${y}-01-01`;
    const endDate = `${y}-12-31`;

    const sales = await pool.query(`
      SELECT 
        COALESCE(SUM(total_revenue), 0) as revenue,
        COALESCE(SUM(total_cost), 0) as cost,
        COALESCE(SUM(total_profit), 0) as profit,
        COUNT(*) as transactions
      FROM sales WHERE date >= $1 AND date <= $2
    `, [startDate, endDate]);

    const expenses = await pool.query(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM expenses WHERE date >= $1 AND date <= $2
    `, [startDate, endDate]);

    const purchases = await pool.query(`
      SELECT COALESCE(SUM(total_cost), 0) as total
      FROM purchases WHERE date >= $1 AND date <= $2
    `, [startDate, endDate]);

    const s = sales.rows[0];
    res.json({
      year: y,
      revenue: s.revenue,
      cost: s.cost,
      gross_profit: s.profit,
      expenses: expenses.rows[0].total,
      net_profit: parseFloat(s.profit) - parseFloat(expenses.rows[0].total),
      transactions: s.transactions,
      purchases_total: purchases.rows[0].total
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Cash management summary
router.get('/cash', authenticate, authorize('manager'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        payment_method,
        COALESCE(SUM(total_revenue), 0) as total,
        COUNT(*) as transactions
      FROM sales
      WHERE date::date = CURRENT_DATE
      GROUP BY payment_method
    `);

    const cashData = { cash: 0, mpesa: 0, card: 0, other: 0 };
    result.rows.forEach(row => {
      cashData[row.payment_method] = parseFloat(row.total);
    });

    const totalSales = Object.values(cashData).reduce((a, b) => a + b, 0);

    res.json({
      ...cashData,
      total: totalSales,
      date: new Date().toISOString().split('T')[0]
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Money available for purchases
router.get('/funds', authenticate, authorize('manager'), async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const startDate = new Date().toISOString().split('T')[0].slice(0, 7) + '-01';

    const revenue = await pool.query(`
      SELECT COALESCE(SUM(total_revenue), 0) as total FROM sales WHERE date >= $1
    `, [startDate]);

    const productCosts = await pool.query(`
      SELECT COALESCE(SUM(total_cost), 0) as total FROM sales WHERE date >= $1
    `, [startDate]);

    const purchases = await pool.query(`
      SELECT COALESCE(SUM(total_cost), 0) as total FROM purchases WHERE date >= $1
    `, [startDate]);

    const expenses = await pool.query(`
      SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE date >= $1
    `, [startDate]);

    const totalRevenue = parseFloat(revenue.rows[0].total);
    const totalProductCosts = parseFloat(productCosts.rows[0].total);
    const totalPurchases = parseFloat(purchases.rows[0].total);
    const totalExpenses = parseFloat(expenses.rows[0].total);
    const availableCash = totalRevenue - totalProductCosts - totalExpenses;
    const purchaseFunds = totalRevenue - totalProductCosts - totalExpenses - totalPurchases;

    res.json({
      revenue: totalRevenue,
      cost_of_goods: totalProductCosts,
      purchases: totalPurchases,
      expenses: totalExpenses,
      available_cash: availableCash,
      purchase_funds: Math.max(0, purchaseFunds),
      period_start: startDate
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Product profitability
router.get('/product-profitability', authenticate, authorize('manager'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        p.name as product,
        p.buying_price,
        p.selling_price,
        (p.selling_price - p.buying_price) as unit_profit,
        COALESCE(SUM(si.quantity), 0) as units_sold,
        COALESCE(SUM(si.total_price), 0) as revenue,
        COALESCE(SUM(si.quantity * p.buying_price), 0) as cost,
        COALESCE(SUM(si.profit), 0) as profit
      FROM products p
      LEFT JOIN sale_items si ON p.id = si.product_id
      LEFT JOIN sales s ON si.sale_id = s.id
      WHERE p.status = 'active'
      GROUP BY p.id, p.name, p.buying_price, p.selling_price
      ORDER BY profit DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Alerts
router.get('/alerts', authenticate, authorize('manager'), async (req, res) => {
  try {
    const alerts = [];

    // Low stock
    const lowStock = await pool.query(`
      SELECT name, current_stock, minimum_stock FROM products
      WHERE current_stock > 0 AND current_stock <= minimum_stock AND status = 'active'
    `);
    lowStock.rows.forEach(p => {
      alerts.push({ type: 'warning', message: `Low stock: ${p.name} (${p.current_stock} remaining)`, category: 'low_stock' });
    });

    // Out of stock
    const outOfStock = await pool.query(`
      SELECT name FROM products WHERE current_stock = 0 AND status = 'active'
    `);
    outOfStock.rows.forEach(p => {
      alerts.push({ type: 'danger', message: `Out of stock: ${p.name}`, category: 'out_of_stock' });
    });

    // Large expenses today
    const largeExpenses = await pool.query(`
      SELECT description, amount FROM expenses
      WHERE date::date = CURRENT_DATE AND amount > 10000
    `);
    largeExpenses.rows.forEach(e => {
      alerts.push({ type: 'warning', message: `Large expense: ${e.description} - KSh ${e.amount}`, category: 'large_expense' });
    });

    res.json(alerts);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
