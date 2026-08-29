const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { logAudit } = require('../utils/helpers');

// Get all products with category and supplier info
router.get('/', authenticate, async (req, res) => {
  try {
    const { search, category, status } = req.query;
    let query = `
      SELECT p.*, c.name as category_name, s.name as supplier_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      WHERE 1=1 AND p.deleted_at IS NULL
    `;
    const params = [];
    let paramIndex = 1;

    if (search) {
      query += ` AND (p.name ILIKE $${paramIndex} OR p.id::text ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }
    if (category) {
      query += ` AND p.category_id = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }
    if (status) {
      query += ` AND p.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    query += ' ORDER BY p.name ASC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching products:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get low stock products
router.get('/low-stock', authenticate, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT p.*, c.name as category_name,
        CASE 
          WHEN p.current_stock = 0 THEN 'OUT OF STOCK'
          WHEN p.current_stock <= p.minimum_stock THEN 'LOW STOCK'
          ELSE 'OK'
        END as stock_status
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.current_stock <= p.minimum_stock AND p.status = 'active' AND p.deleted_at IS NULL
      ORDER BY p.current_stock ASC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get single product
router.get('/:id', authenticate, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT p.*, c.name as category_name, s.name as supplier_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      WHERE p.id = $1 AND p.deleted_at IS NULL
    `, [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Add product (manager only)
router.post('/', authenticate, authorize('manager'), async (req, res) => {
  try {
    const { name, category_id, buying_price, selling_price, current_stock, minimum_stock, unit, supplier_id } = req.body;
    
    const result = await pool.query(
      `INSERT INTO products (name, category_id, buying_price, selling_price, current_stock, minimum_stock, unit, supplier_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [name, category_id, buying_price || 0, selling_price, current_stock || 0, minimum_stock || 0, unit || 'piece', supplier_id || null]
    );
    
    await logAudit(req.user.id, 'Product added', `Product: ${name}`);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error adding product:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update product (manager only)
router.put('/:id', authenticate, authorize('manager'), async (req, res) => {
  try {
    const { name, category_id, buying_price, selling_price, current_stock, minimum_stock, unit, supplier_id, status } = req.body;
    
    const result = await pool.query(
      `UPDATE products SET name=$1, category_id=$2, buying_price=$3, selling_price=$4, current_stock=$5, minimum_stock=$6, unit=$7, supplier_id=$8, status=$9, updated_at=NOW()
       WHERE id=$10 AND deleted_at IS NULL RETURNING *`,
      [name, category_id, buying_price, selling_price, current_stock, minimum_stock, unit, supplier_id, status || 'active', req.params.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    await logAudit(req.user.id, 'Product edited', `Product: ${name}`);
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating product:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete product (manager only)
router.delete('/:id', authenticate, authorize('manager'), async (req, res) => {
  try {
    const product = await pool.query('SELECT name FROM products WHERE id = $1 AND deleted_at IS NULL', [req.params.id]);
    if (product.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Soft delete: keep the row (and its sales history) but hide it everywhere
    await pool.query(
      'UPDATE products SET deleted_at = NOW(), status = $1, updated_at = NOW() WHERE id = $2',
      ['archived', req.params.id]
    );
    await logAudit(req.user.id, 'Product deleted (soft)', `Product: ${product.rows[0].name}`);
    res.json({ message: 'Product deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Adjust stock (manager only)
router.post('/:id/adjust-stock', authenticate, authorize('manager'), async (req, res) => {
  try {
    const { quantity, notes } = req.body;
    const product = await pool.query('SELECT * FROM products WHERE id = $1 AND deleted_at IS NULL', [req.params.id]);
    
    if (product.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const newStock = parseFloat(product.rows[0].current_stock) + parseFloat(quantity);
    if (newStock < 0) {
      return res.status(400).json({ error: 'Stock cannot be negative' });
    }

    await pool.query('UPDATE products SET current_stock = $1, updated_at = NOW() WHERE id = $2', [newStock, req.params.id]);
    
    await pool.query(
      'INSERT INTO inventory_transactions (product_id, type, quantity, notes) VALUES ($1, $2, $3, $4)',
      [req.params.id, 'adjustment', quantity, notes || 'Stock adjustment']
    );
    
    await logAudit(req.user.id, 'Stock adjusted', `Product: ${product.rows[0].name}, Adjustment: ${quantity}`);
    res.json({ message: 'Stock adjusted', new_stock: newStock });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get categories
router.get('/meta/categories', authenticate, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM categories ORDER BY name');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Add category (manager only)
router.post('/meta/categories', authenticate, authorize('manager'), async (req, res) => {
  try {
    const { name, description } = req.body;
    const result = await pool.query(
      'INSERT INTO categories (name, description) VALUES ($1, $2) RETURNING *',
      [name, description]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'Category already exists' });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

// Stock value
router.get('/meta/stock-value', authenticate, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        SUM(current_stock * buying_price) as total_value,
        json_agg(json_build_object(
          'category', c.name,
          'value', SUM(p.current_stock * p.buying_price)
        )) as by_category
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.status = 'active' AND p.deleted_at IS NULL
      GROUP BY c.name
    `);
    
    const totalResult = await pool.query(`
      SELECT SUM(current_stock * buying_price) as total_value
      FROM products WHERE status = 'active' AND deleted_at IS NULL
    `);
    
    res.json({
      total_value: totalResult.rows[0].total_value || 0,
      by_category: result.rows
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
