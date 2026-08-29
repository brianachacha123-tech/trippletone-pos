const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { logAudit, generateExpenseId, round2 } = require('../utils/helpers');

// Get all expenses
router.get('/', authenticate, authorize('manager'), async (req, res) => {
  try {
    const { date_from, date_to, category, period } = req.query;
    let query = `
      SELECT e.*, ec.name as category_name, u.full_name as created_by_name
      FROM expenses e
      LEFT JOIN expense_categories ec ON e.category_id = ec.id
      LEFT JOIN users u ON e.created_by = u.id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (date_from) {
      query += ` AND e.date >= $${paramIndex}`;
      params.push(date_from);
      paramIndex++;
    }
    if (date_to) {
      query += ` AND e.date <= $${paramIndex}::date + INTERVAL '1 day'`;
      params.push(date_to);
      paramIndex++;
    }
    if (category) {
      query += ` AND e.category_id = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }
    if (period === 'today') {
      query += ` AND e.date::date = CURRENT_DATE`;
    } else if (period === 'week') {
      query += ` AND e.date >= date_trunc('week', CURRENT_DATE)`;
    } else if (period === 'month') {
      query += ` AND e.date >= date_trunc('month', CURRENT_DATE)`;
    } else if (period === 'year') {
      query += ` AND e.date >= date_trunc('year', CURRENT_DATE)`;
    }

    query += ' ORDER BY e.date DESC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get today's expenses total
router.get('/today-total', authenticate, authorize('manager'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM expenses WHERE date::date = CURRENT_DATE
    `);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Add expense
router.post('/', authenticate, authorize('manager'), async (req, res) => {
  try {
    const { category_id, description, amount, payment_method, person_vendor, notes, date } = req.body;
    const expenseId = generateExpenseId();
    
    const result = await pool.query(
      `INSERT INTO expenses (expense_id, category_id, description, amount, payment_method, person_vendor, notes, created_by, date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [expenseId, category_id, description, round2(amount), payment_method || 'cash', person_vendor, notes, req.user.id, date || new Date()]
    );
    
    await logAudit(req.user.id, 'Expense recorded', `Expense: ${expenseId}, Amount: ${amount}`);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Expense error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update expense
router.put('/:id', authenticate, authorize('manager'), async (req, res) => {
  try {
    const { category_id, description, amount, payment_method, person_vendor, notes, date } = req.body;
    const result = await pool.query(
      `UPDATE expenses SET category_id=$1, description=$2, amount=$3, payment_method=$4, person_vendor=$5, notes=$6, date=$7
       WHERE id=$8 RETURNING *`,
      [category_id, description, amount, payment_method, person_vendor, notes, date, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Expense not found' });
    }
    await logAudit(req.user.id, 'Expense edited', `Expense ID: ${req.params.id}`);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete expense
router.delete('/:id', authenticate, authorize('manager'), async (req, res) => {
  try {
    const expense = await pool.query('SELECT expense_id FROM expenses WHERE id = $1', [req.params.id]);
    if (expense.rows.length === 0) {
      return res.status(404).json({ error: 'Expense not found' });
    }
    await pool.query('DELETE FROM expenses WHERE id = $1', [req.params.id]);
    await logAudit(req.user.id, 'Expense deleted', `Expense: ${expense.rows[0].expense_id}`);
    res.json({ message: 'Expense deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get expense categories
router.get('/categories', authenticate, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM expense_categories ORDER BY name');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Add expense category
router.post('/categories', authenticate, authorize('manager'), async (req, res) => {
  try {
    const { name } = req.body;
    const result = await pool.query(
      'INSERT INTO expense_categories (name) VALUES ($1) RETURNING *',
      [name]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'Category already exists' });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

// Expenses by day chart
router.get('/charts/by-day', authenticate, authorize('manager'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT date::date as day, SUM(amount) as total
      FROM expenses
      WHERE date >= NOW() - INTERVAL '30 days'
      GROUP BY date::date
      ORDER BY day
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
