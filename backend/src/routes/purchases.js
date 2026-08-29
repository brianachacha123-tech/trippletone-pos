const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { logAudit, generatePurchaseId, round2 } = require('../utils/helpers');

// Get all purchases
router.get('/', authenticate, authorize('manager'), async (req, res) => {
  try {
    const { date_from, date_to, supplier_id } = req.query;
    let query = `
      SELECT p.*, s.name as supplier_name, pr.name as product_name
      FROM purchases p
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      LEFT JOIN products pr ON p.product_id = pr.id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (date_from) {
      query += ` AND p.date >= $${paramIndex}`;
      params.push(date_from);
      paramIndex++;
    }
    if (date_to) {
      query += ` AND p.date <= $${paramIndex}::date + INTERVAL '1 day'`;
      params.push(date_to);
      paramIndex++;
    }
    if (supplier_id) {
      query += ` AND p.supplier_id = $${paramIndex}`;
      params.push(supplier_id);
      paramIndex++;
    }

    query += ' ORDER BY p.date DESC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Record a purchase
router.post('/', authenticate, authorize('manager'), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    const { supplier_id, product_id, quantity, buying_price, invoice_number, notes } = req.body;
    
    const totalCost = round2(parseFloat(quantity) * parseFloat(buying_price));
    const purchaseId = generatePurchaseId();

    // Insert purchase
    const result = await client.query(
      `INSERT INTO purchases (purchase_id, supplier_id, product_id, quantity, buying_price, total_cost, invoice_number, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [purchaseId, supplier_id, product_id, quantity, buying_price, totalCost, invoice_number, notes]
    );

    // Update product stock
    const product = await client.query('SELECT current_stock FROM products WHERE id = $1 AND deleted_at IS NULL', [product_id]);
    if (product.rows.length > 0) {
      const newStock = parseFloat(product.rows[0].current_stock) + parseFloat(quantity);
      await client.query('UPDATE products SET current_stock = $1, updated_at = NOW() WHERE id = $2', [newStock, product_id]);
      
      // Record inventory transaction
      await client.query(
        'INSERT INTO inventory_transactions (product_id, type, quantity, reference_id, reference_type) VALUES ($1, $2, $3, $4, $5)',
        [product_id, 'purchase', quantity, result.rows[0].id, 'purchase']
      );
    }

    await client.query('COMMIT');
    await logAudit(req.user.id, 'Purchase recorded', `Purchase: ${purchaseId}`);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Purchase error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// Delete purchase
router.delete('/:id', authenticate, authorize('manager'), async (req, res) => {
  try {
    const purchase = await pool.query('SELECT * FROM purchases WHERE id = $1', [req.params.id]);
    if (purchase.rows.length === 0) {
      return res.status(404).json({ error: 'Purchase not found' });
    }

    // Reverse stock
    const p = purchase.rows[0];
    const product = await pool.query('SELECT current_stock FROM products WHERE id = $1 AND deleted_at IS NULL', [p.product_id]);
    if (product.rows.length > 0) {
      const newStock = parseFloat(product.rows[0].current_stock) - parseFloat(p.quantity);
      await pool.query('UPDATE products SET current_stock = $1, updated_at = NOW() WHERE id = $2', [newStock, p.product_id]);
    }

    await pool.query('DELETE FROM purchases WHERE id = $1', [req.params.id]);
    await logAudit(req.user.id, 'Purchase deleted', `Purchase: ${p.purchase_id}`);
    res.json({ message: 'Purchase deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
