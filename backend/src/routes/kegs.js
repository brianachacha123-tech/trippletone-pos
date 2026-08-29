const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { logAudit, generateKegId, round2 } = require('../utils/helpers');

// Get all kegs
router.get('/', authenticate, authorize('manager'), async (req, res) => {
  try {
    const { status } = req.query;
    let query = 'SELECT * FROM kegs';
    const params = [];
    if (status) {
      query += ' WHERE status = $1';
      params.push(status);
    }
    query += ' ORDER BY created_at DESC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Open a new keg
router.post('/', authenticate, authorize('manager'), async (req, res) => {
  try {
    const { product_name, buying_price } = req.body;
    const kegId = generateKegId();
    const result = await pool.query(
      'INSERT INTO kegs (keg_id, product_name, buying_price) VALUES ($1, $2, $3) RETURNING *',
      [kegId, product_name, buying_price || 0]
    );
    await logAudit(req.user.id, 'Keg opened', `Keg: ${kegId}`);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Add daily keg transaction
router.post('/:id/transactions', authenticate, authorize('manager'), async (req, res) => {
  try {
    const { amount, till, daily_total, notes, date } = req.body;
    const result = await pool.query(
      'INSERT INTO keg_transactions (keg_id, amount, till, daily_total, notes, date) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [req.params.id, amount || 0, till || 0, daily_total || 0, notes, date || new Date()]
    );

    // Update keg total
    await pool.query(
      'UPDATE kegs SET total_revenue = total_revenue + $1 WHERE id = $2',
      [daily_total || 0, req.params.id]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get keg transactions
router.get('/:id/transactions', authenticate, authorize('manager'), async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM keg_transactions WHERE keg_id = $1 ORDER BY date DESC',
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Close a keg
router.put('/:id/close', authenticate, authorize('manager'), async (req, res) => {
  try {
    const keg = await pool.query('SELECT * FROM kegs WHERE id = $1', [req.params.id]);
    if (keg.rows.length === 0) {
      return res.status(404).json({ error: 'Keg not found' });
    }
    const k = keg.rows[0];
    const profit = round2(parseFloat(k.total_revenue) - parseFloat(k.buying_price));
    
    const result = await pool.query(
      'UPDATE kegs SET status = $1, close_date = NOW(), profit = $2 WHERE id = $3 RETURNING *',
      ['closed', profit, req.params.id]
    );
    
    await logAudit(req.user.id, 'Keg closed', `Keg: ${k.keg_id}, Profit: ${profit}`);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
