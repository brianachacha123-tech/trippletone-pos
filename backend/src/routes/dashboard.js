const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { getWeekRange, getSettings, calculateAvailableFunds, round2 } = require('../utils/helpers');

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
      FROM products WHERE status = 'active' AND deleted_at IS NULL
    `);

    // Low stock
    const lowStock = await pool.query(`
      SELECT COUNT(*) as count FROM products
      WHERE current_stock > 0 AND current_stock <= minimum_stock AND status = 'active' AND deleted_at IS NULL
    `);

    // Out of stock
    const outOfStock = await pool.query(`
      SELECT COUNT(*) as count FROM products
      WHERE current_stock = 0 AND status = 'active' AND deleted_at IS NULL
    `);

    // Active kegs count
    const activeKegs = await pool.query(`
      SELECT COUNT(*) as count FROM kegs WHERE status = 'active'
    `);

    // Today's keg revenue
    const todayKegRevenue = await pool.query(`
      SELECT COALESCE(SUM(daily_total), 0) as total
      FROM keg_transactions WHERE date::date = $1
    `, [today]);

    const todayData = todaySales.rows[0];
    const expenses = parseFloat(todayExpenses.rows[0].total);
    const grossProfit = parseFloat(todayData.profit);
    const netProfit = grossProfit - expenses;

    res.json({
      today_revenue: todayData.revenue,
      today_cost: todayData.cost,
      today_gross_profit: grossProfit,
      today_expenses: expenses,
      today_net_profit: round2(netProfit),
      today_transactions: todayData.transactions,
      today_avg_sale: todayData.avg_sale,
      stock_value: stockValue.rows[0].total_value,
      low_stock_count: lowStock.rows[0].count,
      out_of_stock_count: outOfStock.rows[0].count,
      active_kegs: activeKegs.rows[0].count,
      today_keg_revenue: todayKegRevenue.rows[0].total
    });
  } catch (err) {
    console.error('Dashboard KPIs error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Weekly KPIs
router.get('/weekly', authenticate, authorize('manager'), async (req, res) => {
  try {
    const { weekStart, weekEnd } = await getWeekRange();
    
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

    // Keg revenue this week
    const kegRevenue = await pool.query(`
      SELECT COALESCE(SUM(daily_total), 0) as total
      FROM keg_transactions WHERE date >= $1 AND date <= $2
    `, [weekStart, weekEnd]);

    // Keg profit this week (from closed kegs)
    const kegProfit = await pool.query(`
      SELECT COALESCE(SUM(profit), 0) as total
      FROM kegs WHERE close_date >= $1 AND close_date <= $2 AND status = 'closed'
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

    const totalProfit = parseFloat(sales.rows[0].profit);
    const totalExpenses = parseFloat(expenses.rows[0].total);
    const totalKegRevenue = parseFloat(kegRevenue.rows[0].total);
    const totalKegProfit = parseFloat(kegProfit.rows[0].total);
    
    // Net profit = Sales profit - Expenses + Keg profit
    const netProfit = totalProfit - totalExpenses + totalKegProfit;

    res.json({
      week_start: weekStart,
      week_end: weekEnd,
      revenue: sales.rows[0].revenue,
      cost: sales.rows[0].cost,
      profit: sales.rows[0].profit,
      expenses: expenses.rows[0].total,
      net_profit: round2(netProfit),
      transactions: sales.rows[0].transactions,
      sales_by_day: salesByDay.rows,
      keg_revenue: totalKegRevenue,
      keg_profit: round2(totalKegProfit)
    });
  } catch (err) {
    console.error('Weekly KPIs error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Weekly report (end of week summary)
router.get('/weekly-report', authenticate, authorize('manager'), async (req, res) => {
  try {
    const { weekStart, weekEnd } = await getWeekRange();
    const settings = await getSettings();
    
    // Get all sales for the week
    const sales = await pool.query(`
      SELECT 
        COALESCE(SUM(total_revenue), 0) as revenue,
        COALESCE(SUM(total_cost), 0) as cost,
        COALESCE(SUM(total_profit), 0) as profit,
        COUNT(*) as transactions
      FROM sales WHERE date >= $1 AND date <= $2
    `, [weekStart, weekEnd]);

    // Get expenses for the week
    const expenses = await pool.query(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM expenses WHERE date >= $1 AND date <= $2
    `, [weekStart, weekEnd]);

    // Get keg data for the week
    const kegRevenue = await pool.query(`
      SELECT COALESCE(SUM(daily_total), 0) as total
      FROM keg_transactions WHERE date >= $1 AND date <= $2
    `, [weekStart, weekEnd]);

    const kegProfit = await pool.query(`
      SELECT COALESCE(SUM(profit), 0) as total
      FROM kegs WHERE close_date >= $1 AND close_date <= $2 AND status = 'closed'
    `, [weekStart, weekEnd]);

    // Get purchases for the week
    const purchases = await pool.query(`
      SELECT COALESCE(SUM(total_cost), 0) as total
      FROM purchases WHERE date >= $1 AND date <= $2
    `, [weekStart, weekEnd]);

    // Calculate funds available for keg purchase
    const totalProfit = parseFloat(sales.rows[0].profit);
    const totalExpenses = parseFloat(expenses.rows[0].total);
    const totalKegProfit = parseFloat(kegProfit.rows[0].total);
    const totalPurchases = parseFloat(purchases.rows[0].total);
    
    const businessNetProfit = totalProfit - totalExpenses;
    const moneyAvailableForKegPurchase = Math.max(0, businessNetProfit - totalPurchases);

    res.json({
      week_start: weekStart,
      week_end: weekEnd,
      settings: settings,
      sales_summary: {
        revenue: sales.rows[0].revenue,
        cost: sales.rows[0].cost,
        profit: sales.rows[0].profit,
        transactions: sales.rows[0].transactions
      },
      expenses_total: expenses.rows[0].total,
      keg_summary: {
        revenue: kegRevenue.rows[0].total,
        profit: round2(totalKegProfit)
      },
      purchases_total: purchases.rows[0].total,
      business_net_profit: round2(businessNetProfit),
      money_available_for_keg_purchase: round2(moneyAvailableForKegPurchase),
      total_profit: round2(businessNetProfit + totalKegProfit)
    });
  } catch (err) {
    console.error('Weekly report error:', err);
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
      FROM products WHERE status = 'active' AND deleted_at IS NULL
    `);

    // Keg profit
    const kegProfit = await pool.query(`
      SELECT COALESCE(SUM(profit), 0) as total
      FROM kegs WHERE close_date >= $1 AND close_date <= $2 AND status = 'closed'
    `, [startDate, endDate]);

    const s = sales.rows[0];
    const expensesTotal = parseFloat(expenses.rows[0].total);
    const kegProfitTotal = parseFloat(kegProfit.rows[0].total);
    
    res.json({
      month: m,
      year: y,
      revenue: s.revenue,
      cost: s.cost,
      gross_profit: s.profit,
      expenses: expenses.rows[0].total,
      net_profit: round2(parseFloat(s.profit) - expensesTotal + kegProfitTotal),
      transactions: s.transactions,
      purchases_total: purchases.rows[0].total,
      stock_value: stockValue.rows[0].total_value,
      keg_profit: round2(kegProfitTotal)
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
    const expensesTotal = parseFloat(expenses.rows[0].total);
    
    res.json({
      year: y,
      revenue: s.revenue,
      cost: s.cost,
      gross_profit: s.profit,
      expenses: expenses.rows[0].total,
      net_profit: round2(parseFloat(s.profit) - expensesTotal),
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

// Money available for purchases (weekly based)
router.get('/funds', authenticate, authorize('manager'), async (req, res) => {
  try {
    const { weekStart, weekEnd } = await getWeekRange();
    const funds = await calculateAvailableFunds(weekStart, weekEnd);

    res.json({
      ...funds,
      week_start: weekStart,
      week_end: weekEnd,
      period_type: 'weekly'
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Money available for keg purchase
router.get('/keg-funds', authenticate, authorize('manager'), async (req, res) => {
  try {
    const { weekStart, weekEnd } = await getWeekRange();
    
    // Get weekly business profit (sales profit - expenses)
    const sales = await pool.query(`
      SELECT COALESCE(SUM(total_profit), 0) as profit
      FROM sales WHERE date >= $1 AND date <= $2
    `, [weekStart, weekEnd]);

    const expenses = await pool.query(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM expenses WHERE date >= $1 AND date <= $2
    `, [weekStart, weekEnd]);

    const purchases = await pool.query(`
      SELECT COALESCE(SUM(total_cost), 0) as total
      FROM purchases WHERE date >= $1 AND date <= $2
    `, [weekStart, weekEnd]);

    const businessProfit = parseFloat(sales.rows[0].profit);
    const totalExpenses = parseFloat(expenses.rows[0].total);
    const totalPurchases = parseFloat(purchases.rows[0].total);
    
    const netProfit = businessProfit - totalExpenses;
    const moneyAvailableForKeg = Math.max(0, netProfit - totalPurchases);

    res.json({
      business_profit: round2(businessProfit),
      expenses: round2(totalExpenses),
      net_profit: round2(netProfit),
      purchases_made: round2(totalPurchases),
      money_available_for_keg_purchase: round2(moneyAvailableForKeg),
      week_start: weekStart,
      week_end: weekEnd
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
      WHERE p.status = 'active' AND p.deleted_at IS NULL
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
      WHERE current_stock > 0 AND current_stock <= minimum_stock AND status = 'active' AND deleted_at IS NULL
    `);
    lowStock.rows.forEach(p => {
      alerts.push({ type: 'warning', message: `Low stock: ${p.name} (${p.current_stock} remaining)`, category: 'low_stock' });
    });

    // Out of stock
    const outOfStock = await pool.query(`
      SELECT name FROM products WHERE current_stock = 0 AND status = 'active' AND deleted_at IS NULL
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

    // Active kegs nearing profit limit
    const settings = await getSettings();
    const kegProfitLimit = settings.keg_profit_limit || 5000;
    
    const activeKegs = await pool.query(`
      SELECT keg_id, product_name, total_revenue, buying_price,
             (total_revenue - buying_price) as current_profit
      FROM kegs WHERE status = 'active'
    `);
    
    activeKegs.rows.forEach(k => {
      const profit = parseFloat(k.current_profit);
      if (profit >= kegProfitLimit) {
        alerts.push({ 
          type: 'success', 
          message: `Keg ${k.keg_id} reached profit limit! Current profit: KSh ${profit.toFixed(2)}`, 
          category: 'keg_limit_reached' 
        });
      } else {
        const percentage = (profit / kegProfitLimit * 100).toFixed(0);
        alerts.push({ 
          type: 'info', 
          message: `Keg ${k.keg_id} (${k.product_name}): KSh ${profit.toFixed(0)} / ${kegProfitLimit} (${percentage}%)`, 
          category: 'keg_progress' 
        });
      }
    });

    res.json(alerts);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
