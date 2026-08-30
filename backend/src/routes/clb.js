const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { logAudit, round2 } = require('../utils/helpers');

// Get all CLB transactions
router.get('/', authenticate, authorize('manager'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT ct.*, u.full_name as created_by_name
      FROM clb_transactions ct
      LEFT JOIN users u ON ct.created_by = u.id
      ORDER BY ct.date DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get CLB transactions grouped by day
router.get('/daily', authenticate, authorize('manager'), async (req, res) => {
  try {
    const { date_from, date_to } = req.query;
    let query = `
      SELECT 
        ct.id, ct.type, ct.description, ct.amount, ct.date, ct.created_by,
        u.full_name as created_by_name,
        DATE_TRUNC('day', ct.date) as day
      FROM clb_transactions ct
      LEFT JOIN users u ON ct.created_by = u.id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (date_from) {
      query += ` AND ct.date >= $${paramIndex}`;
      params.push(date_from);
      paramIndex++;
    }
    if (date_to) {
      query += ` AND ct.date <= $${paramIndex}::date + INTERVAL '1 day'`;
      params.push(date_to);
      paramIndex++;
    }

    query += ' ORDER BY ct.date DESC';
    const result = await pool.query(query, params);
    
    // Group by day
    const grouped = {};
    result.rows.forEach(row => {
      const day = row.day.toISOString().split('T')[0];
      if (!grouped[day]) {
        grouped[day] = { day, transactions: [], purchases: 0, sales: 0 };
      }
      grouped[day].transactions.push(row);
      if (row.type === 'purchase') {
        grouped[day].purchases += parseFloat(row.amount);
      } else {
        grouped[day].sales += parseFloat(row.amount);
      }
    });

    // Convert to array and add profit
    const dailyData = Object.values(grouped).map(d => ({
      ...d,
      profit: round2(d.sales - d.purchases)
    }));

    res.json(dailyData);
  } catch (err) {
    console.error('CLB daily error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Add CLB transaction (for POS sync, this is called automatically when CLB products are sold)
router.post('/', authenticate, authorize('manager'), async (req, res) => {
  try {
    const { type, description, amount, date, product_id, quantity } = req.body;
    const result = await pool.query(
      'INSERT INTO clb_transactions (type, description, amount, created_by, date) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [type, description, amount, req.user.id, date || new Date()]
    );
    
    // Log audit with details
    const details = `CLB ${type}: ${description}, Amount: ${amount}`;
    if (product_id) {
      details += `, Product ID: ${product_id}, Qty: ${quantity}`;
    }
    await logAudit(req.user.id, 'CLB transaction recorded', details);
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('CLB add error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Sync CLB with POS sale (called when a sale is made)
router.post('/sync-sale', authenticate, async (req, res) => {
  try {
    const { sale_id, items, total_amount, payment_method } = req.body;
    
    // Check if any items are CLB products
    for (const item of items) {
      if (item.is_clb || item.product_type === 'clb') {
        // Record CLB sale
        const description = `POS Sale: ${item.product_name} x${item.quantity}`;
        await pool.query(
          'INSERT INTO clb_transactions (type, description, amount, created_by, date) VALUES ($1, $2, $3, $4, $5)',
          ['sale', description, item.total_price, req.user.id, new Date()]
        );
      }
    }
    
    res.json({ message: 'CLB synced with POS sale' });
  } catch (err) {
    console.error('CLB sync error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// CLB summary (updated with better calculations)
router.get('/summary', authenticate, authorize('manager'), async (req, res) => {
  try {
    const { period } = req.query;
    let dateFilter = '';
    const params = [];
    
    if (period === 'today') {
      dateFilter = 'AND ct.date::date = CURRENT_DATE';
    } else if (period === 'week') {
      dateFilter = 'AND ct.date >= date_trunc(\'week\', CURRENT_DATE)';
    } else if (period === 'month') {
      dateFilter = 'AND ct.date >= date_trunc(\'month\', CURRENT_DATE)';
    }

    const purchases = await pool.query(`
      SELECT COALESCE(SUM(amount), 0) as total 
      FROM clb_transactions ct 
      WHERE type = 'purchase' ${dateFilter}
    `, params);
    
    const sales = await pool.query(`
      SELECT COALESCE(SUM(amount), 0) as total 
      FROM clb_transactions ct 
      WHERE type = 'sale' ${dateFilter}
    `, params);
    
    // Transaction count
    const transactionCount = await pool.query(`
      SELECT COUNT(*) as count 
      FROM clb_transactions ct 
      WHERE 1=1 ${dateFilter}
    `, params);
    
    const totalPurchases = parseFloat(purchases.rows[0].total);
    const totalSales = parseFloat(sales.rows[0].total);
    
    res.json({
      total_purchases: totalPurchases,
      total_sales: totalSales,
      revenue: totalSales,
      cost: totalPurchases,
      profit: round2(totalSales - totalPurchases),
      available: round2(totalSales - totalPurchases),
      transaction_count: parseInt(transactionCount.rows[0].count),
      period: period || 'all'
    });
  } catch (err) {
    console.error('CLB summary error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get CLB products (products that should be sold through CLB)
router.get('/products', authenticate, authorize('manager'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT p.*, 
             COALESCE(SUM(si.quantity), 0) as total_sold,
             COALESCE(SUM(si.total_price), 0) as total_revenue
      FROM products p
      LEFT JOIN sale_items si ON p.id = si.product_id
      WHERE p.clb_managed = true AND p.status = 'active' AND p.deleted_at IS NULL
      GROUP BY p.id
      ORDER BY p.name
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
