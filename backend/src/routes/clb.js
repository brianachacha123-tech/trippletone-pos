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

// Add CLB transaction
router.post('/', authenticate, authorize('manager'), async (req, res) => {
  try {
    const { type, description, amount, date } = req.body;
    const result = await pool.query(
      'INSERT INTO clb_transactions (type, description, amount, created_by, date) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [type, description, amount, req.user.id, date || new Date()]
    );
    await logAudit(req.user.id, `CLB ${type} recorded`, `Amount: ${amount}`);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// CLB summary
router.get('/summary', authenticate, authorize('manager'), async (req, res) => {
  try {
    const purchases = await pool.query(`
      SELECT COALESCE(SUM(amount), 0) as total FROM clb_transactions WHERE type = 'purchase'
    `);
    const sales = await pool.query(`
      SELECT COALESCE(SUM(amount), 0) as total FROM clb_transactions WHERE type = 'sale'
    `);
    
    const totalPurchases = parseFloat(purchases.rows[0].total);
    const totalSales = parseFloat(sales.rows[0].total);
    
    res.json({
      total_purchases: totalPurchases,
      total_sales: totalSales,
      revenue: totalSales,
      cost: totalPurchases,
      profit: round2(totalSales - totalPurchases),
      available: round2(totalSales - totalPurchases)
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
