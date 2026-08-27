const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { logAudit } = require('../utils/helpers');

// Get all suppliers
router.get('/', authenticate, authorize('manager'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT s.*, 
        (SELECT COUNT(*) FROM purchases p WHERE p.supplier_id = s.id) as purchase_count,
        (SELECT SUM(p.total_cost) FROM purchases p WHERE p.supplier_id = s.id) as total_purchases
      FROM suppliers s
      ORDER BY s.name
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get single supplier
router.get('/:id', authenticate, authorize('manager'), async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM suppliers WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Supplier not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Add supplier
router.post('/', authenticate, authorize('manager'), async (req, res) => {
  try {
    const { name, phone, email, location, notes } = req.body;
    const result = await pool.query(
      'INSERT INTO suppliers (name, phone, email, location, notes) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [name, phone, email, location, notes]
    );
    await logAudit(req.user.id, 'Supplier added', `Supplier: ${name}`);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Update supplier
router.put('/:id', authenticate, authorize('manager'), async (req, res) => {
  try {
    const { name, phone, email, location, notes } = req.body;
    const result = await pool.query(
      'UPDATE suppliers SET name=$1, phone=$2, email=$3, location=$4, notes=$5, updated_at=NOW() WHERE id=$6 RETURNING *',
      [name, phone, email, location, notes, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Supplier not found' });
    }
    await logAudit(req.user.id, 'Supplier edited', `Supplier: ${name}`);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete supplier
router.delete('/:id', authenticate, authorize('manager'), async (req, res) => {
  try {
    const supplier = await pool.query('SELECT name FROM suppliers WHERE id = $1', [req.params.id]);
    if (supplier.rows.length === 0) {
      return res.status(404).json({ error: 'Supplier not found' });
    }
    await pool.query('DELETE FROM suppliers WHERE id = $1', [req.params.id]);
    await logAudit(req.user.id, 'Supplier deleted', `Supplier: ${supplier.rows[0].name}`);
    res.json({ message: 'Supplier deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Supplier purchase history
router.get('/:id/purchases', authenticate, authorize('manager'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT p.*, pr.name as product_name
      FROM purchases p
      LEFT JOIN products pr ON p.product_id = pr.id
      WHERE p.supplier_id = $1
      ORDER BY p.date DESC
    `, [req.params.id]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
