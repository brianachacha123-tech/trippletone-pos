const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { logAudit, generateSaleId } = require('../utils/helpers');

// Create a sale (cashier)
router.post('/', authenticate, authorize('cashier', 'manager'), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    const { items, payment_method } = req.body;
    
    if (!items || items.length === 0) {
      return res.status(400).json({ error: 'No items in the sale' });
    }

    const saleId = generateSaleId();
    let totalRevenue = 0;
    let totalCost = 0;

    // Calculate totals
    for (const item of items) {
      const productResult = await client.query('SELECT * FROM products WHERE id = $1', [item.product_id]);
      if (productResult.rows.length === 0) {
        throw new Error(`Product not found: ${item.product_id}`);
      }
      const product = productResult.rows[0];
      
      // Check stock availability (allow manager to override)
      if (req.user.role === 'cashier' && parseFloat(product.current_stock) < parseFloat(item.quantity)) {
        throw new Error(`Insufficient stock for ${product.name}. Available: ${product.current_stock}`);
      }

      const itemTotal = parseFloat(item.quantity) * parseFloat(item.unit_price);
      const itemCost = parseFloat(item.quantity) * parseFloat(product.buying_price);
      totalRevenue += itemTotal;
      totalCost += itemCost;
    }

    const totalProfit = totalRevenue - totalCost;

    // Insert sale
    const saleResult = await client.query(
      `INSERT INTO sales (sale_id, user_id, total_revenue, total_cost, total_profit, payment_method)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [saleId, req.user.id, totalRevenue, totalCost, totalProfit, payment_method || 'cash']
    );

    const sale = saleResult.rows[0];

    // Insert sale items and update inventory
    for (const item of items) {
      const productResult = await client.query('SELECT * FROM products WHERE id = $1', [item.product_id]);
      const product = productResult.rows[0];
      
      const itemTotal = parseFloat(item.quantity) * parseFloat(item.unit_price);
      const itemProfit = parseFloat(item.quantity) * (parseFloat(item.unit_price) - parseFloat(product.buying_price));

      await client.query(
        `INSERT INTO sale_items (sale_id, product_id, product_name, quantity, unit_price, buying_price, total_price, profit)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [sale.id, item.product_id, product.name, item.quantity, item.unit_price, product.buying_price, itemTotal, itemProfit]
      );

      // Deduct from inventory
      const newStock = parseFloat(product.current_stock) - parseFloat(item.quantity);
      await client.query('UPDATE products SET current_stock = $1, updated_at = NOW() WHERE id = $2', [newStock, item.product_id]);

      // Record inventory transaction
      await client.query(
        'INSERT INTO inventory_transactions (product_id, type, quantity, reference_id, reference_type) VALUES ($1, $2, $3, $4, $5)',
        [item.product_id, 'sale', -item.quantity, sale.id, 'sale']
      );
    }

    // Record payment
    await client.query(
      'INSERT INTO payments (sale_id, method, amount) VALUES ($1, $2, $3)',
      [sale.id, payment_method || 'cash', totalRevenue]
    );

    await client.query('COMMIT');
    
    await logAudit(req.user.id, 'Sale submitted', `Sale: ${saleId}, Total: ${totalRevenue}`);
    
    res.status(201).json({
      ...sale,
      items: items.map((item, idx) => ({
        ...item,
        total_price: parseFloat(item.quantity) * parseFloat(item.unit_price)
      }))
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Sale error:', err);
    res.status(500).json({ error: err.message || 'Server error' });
  } finally {
    client.release();
  }
});

// Get all sales (manager)
router.get('/', authenticate, authorize('manager'), async (req, res) => {
  try {
    const { date_from, date_to, cashier, payment_method, product } = req.query;
    let query = `
      SELECT s.*, u.full_name as cashier_name,
        (SELECT COUNT(*) FROM sale_items si WHERE si.sale_id = s.id) as item_count
      FROM sales s
      LEFT JOIN users u ON s.user_id = u.id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (date_from) {
      query += ` AND s.date >= $${paramIndex}`;
      params.push(date_from);
      paramIndex++;
    }
    if (date_to) {
      query += ` AND s.date <= $${paramIndex}::date + INTERVAL '1 day'`;
      params.push(date_to);
      paramIndex++;
    }
    if (cashier) {
      query += ` AND s.user_id = $${paramIndex}`;
      params.push(cashier);
      paramIndex++;
    }
    if (payment_method) {
      query += ` AND s.payment_method = $${paramIndex}`;
      params.push(payment_method);
      paramIndex++;
    }

    query += ' ORDER BY s.date DESC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get cashier's own sales
router.get('/my-sales', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM sales WHERE user_id = $1 ORDER BY date DESC LIMIT 50',
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get single sale with items
router.get('/:id', authenticate, async (req, res) => {
  try {
    const saleResult = await pool.query(
      'SELECT s.*, u.full_name as cashier_name FROM sales s LEFT JOIN users u ON s.user_id = u.id WHERE s.id = $1',
      [req.params.id]
    );
    
    if (saleResult.rows.length === 0) {
      return res.status(404).json({ error: 'Sale not found' });
    }

    const itemsResult = await pool.query(
      'SELECT si.*, p.name as product_name FROM sale_items si LEFT JOIN products p ON si.product_id = p.id WHERE si.sale_id = $1',
      [req.params.id]
    );

    res.json({
      ...saleResult.rows[0],
      items: itemsResult.rows
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Today's sales summary
router.get('/summary/today', authenticate, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        COUNT(*) as total_transactions,
        COALESCE(SUM(total_revenue), 0) as total_revenue,
        COALESCE(SUM(total_cost), 0) as total_cost,
        COALESCE(SUM(total_profit), 0) as total_profit,
        COALESCE(AVG(total_revenue), 0) as avg_sale,
        COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN total_revenue ELSE 0 END), 0) as cash_sales,
        COALESCE(SUM(CASE WHEN payment_method = 'mpesa' THEN total_revenue ELSE 0 END), 0) as mpesa_sales,
        COALESCE(SUM(CASE WHEN payment_method = 'card' THEN total_revenue ELSE 0 END), 0) as card_sales,
        COALESCE(SUM(CASE WHEN payment_method = 'other' THEN total_revenue ELSE 0 END), 0) as other_sales
      FROM sales WHERE date::date = CURRENT_DATE
    `);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Sales by day (for charts)
router.get('/charts/by-day', authenticate, async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const result = await pool.query(`
      SELECT 
        date::date as day,
        SUM(total_revenue) as revenue,
        SUM(total_cost) as cost,
        SUM(total_profit) as profit,
        COUNT(*) as transactions
      FROM sales
      WHERE date >= NOW() - INTERVAL '1 day' * $1
      GROUP BY date::date
      ORDER BY day
    `, [days]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Sales by category
router.get('/charts/by-category', authenticate, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        c.name as category,
        SUM(si.total_price) as revenue,
        SUM(si.quantity) as quantity
      FROM sale_items si
      JOIN products p ON si.product_id = p.id
      JOIN categories c ON p.category_id = c.id
      JOIN sales s ON si.sale_id = s.id
      WHERE s.date >= NOW() - INTERVAL '30 days'
      GROUP BY c.name
      ORDER BY revenue DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Top products
router.get('/charts/top-products', authenticate, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        p.name as product,
        SUM(si.quantity) as quantity_sold,
        SUM(si.total_price) as revenue,
        SUM(si.profit) as profit
      FROM sale_items si
      JOIN products p ON si.product_id = p.id
      JOIN sales s ON si.sale_id = s.id
      WHERE s.date >= NOW() - INTERVAL '30 days'
      GROUP BY p.name
      ORDER BY quantity_sold DESC
      LIMIT 10
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Cashier performance
router.get('/charts/cashier-performance', authenticate, authorize('manager'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        u.full_name as cashier,
        COUNT(*) as transactions,
        SUM(s.total_revenue) as revenue,
        SUM(s.total_profit) as profit,
        AVG(s.total_revenue) as avg_transaction
      FROM sales s
      JOIN users u ON s.user_id = u.id
      WHERE s.date >= NOW() - INTERVAL '30 days'
      GROUP BY u.full_name
      ORDER BY revenue DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
