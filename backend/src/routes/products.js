const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { logAudit, round2 } = require('../utils/helpers');

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

// Inventory report: Opening stock, purchases, units sold, closing stock for a date range
router.get('/inventory-report', authenticate, authorize('manager'), async (req, res) => {
  try {
    const { date_from, date_to, product_id } = req.query;
    const startDate = date_from || new Date(new Date().setDate(new Date().getDate() - 7)).toISOString().split('T')[0];
    const endDate = date_to || new Date().toISOString().split('T')[0];

    // Get all active products (or a specific one)
    let productQuery = `SELECT id, name, unit, buying_price, selling_price, current_stock FROM products WHERE status = 'active' AND deleted_at IS NULL`;
    const productParams = [];
    if (product_id) {
      productQuery += ' AND id = $1';
      productParams.push(product_id);
    }
    productQuery += ' ORDER BY name ASC';
    const products = await pool.query(productQuery, productParams);

    const report = [];

    for (const product of products.rows) {
      // Opening stock: current stock + sold during period - purchased during period
      const soldDuringPeriod = await pool.query(
        `SELECT COALESCE(SUM(quantity), 0) as total_sold
         FROM inventory_transactions
         WHERE product_id = $1 AND type = 'sale' AND date >= $2 AND date <= ($3::date + INTERVAL '1 day')`,
        [product.id, startDate, endDate]
      );

      const purchasedDuringPeriod = await pool.query(
        `SELECT COALESCE(SUM(quantity), 0) as total_purchased
         FROM inventory_transactions
         WHERE product_id = $1 AND type = 'purchase' AND date >= $2 AND date <= ($3::date + INTERVAL '1 day')`,
        [product.id, startDate, endDate]
      );

      const adjustmentsDuringPeriod = await pool.query(
        `SELECT COALESCE(SUM(quantity), 0) as total_adjusted
         FROM inventory_transactions
         WHERE product_id = $1 AND type = 'adjustment' AND date >= $2 AND date <= ($3::date + INTERVAL '1 day')`,
        [product.id, startDate, endDate]
      );

      const unitsSold = parseFloat(soldDuringPeriod.rows[0].total_sold) || 0;
      const unitsPurchased = parseFloat(purchasedDuringPeriod.rows[0].total_purchased) || 0;
      const adjustments = parseFloat(adjustmentsDuringPeriod.rows[0].total_adjusted) || 0;
      const closingStock = parseFloat(product.current_stock);

      // opening = closing + sold - purchased - adjustments
      const openingStock = round2(closingStock + unitsSold - unitsPurchased - adjustments);

      report.push({
        product_id: product.id,
        product_name: product.name,
        unit: product.unit,
        buying_price: product.buying_price,
        opening_stock: openingStock,
        purchases: unitsPurchased,
        unit_sold: unitsSold,
        adjustments: adjustments,
        closing_stock: closingStock,
      });
    }

    res.json({
      date_from: startDate,
      date_to: endDate,
      items: report,
    });
  } catch (err) {
    console.error('Inventory report error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Inventory report CSV download
router.get('/inventory-report/download', authenticate, authorize('manager'), async (req, res) => {
  try {
    const { date_from, date_to, format } = req.query;
    const startDate = date_from || new Date(new Date().setDate(new Date().getDate() - 7)).toISOString().split('T')[0];
    const endDate = date_to || new Date().toISOString().split('T')[0];

    // Reuse the same logic as the inventory report
    const products = await pool.query(
      `SELECT id, name, unit, buying_price, current_stock FROM products WHERE status = 'active' AND deleted_at IS NULL ORDER BY name`
    );

    let csvContent = 'Product,Unit,Buying Price,Opening Stock,Purchases,Units Sold,Adjustments,Closing Stock\n';

    for (const product of products.rows) {
      const sold = await pool.query(
        `SELECT COALESCE(SUM(quantity), 0) as total FROM inventory_transactions
         WHERE product_id = $1 AND type = 'sale' AND date >= $2 AND date <= ($3::date + INTERVAL '1 day')`,
        [product.id, startDate, endDate]
      );
      const purchased = await pool.query(
        `SELECT COALESCE(SUM(quantity), 0) as total FROM inventory_transactions
         WHERE product_id = $1 AND type = 'purchase' AND date >= $2 AND date <= ($3::date + INTERVAL '1 day')`,
        [product.id, startDate, endDate]
      );
      const adjusted = await pool.query(
        `SELECT COALESCE(SUM(quantity), 0) as total FROM inventory_transactions
         WHERE product_id = $1 AND type = 'adjustment' AND date >= $2 AND date <= ($3::date + INTERVAL '1 day')`,
        [product.id, startDate, endDate]
      );

      const unitsSold = parseFloat(sold.rows[0].total) || 0;
      const unitsPurchased = parseFloat(purchased.rows[0].total) || 0;
      const adjustments = parseFloat(adjusted.rows[0].total) || 0;
      const closingStock = parseFloat(product.current_stock);
      const openingStock = round2(closingStock + unitsSold - unitsPurchased - adjustments);

      csvContent += `"${product.name}","${product.unit}",${product.buying_price},${openingStock},${unitsPurchased},${unitsSold},${adjustments},${closingStock}\n`;
    }

    if (format === 'csv' || !format) {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=inventory-report-${startDate}-to-${endDate}.csv`);
      res.send(csvContent);
    } else {
      // Return as JSON for the frontend to handle
      res.json({ csv: csvContent });
    }
  } catch (err) {
    console.error('Inventory report download error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
