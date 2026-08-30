const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { logAudit, generateSaleId, round2 } = require('../utils/helpers');

// Create a sale (cashier or manager)
router.post('/', authenticate, authorize('cashier', 'manager'), async (req, res) => {
  const { items, payment_method, client_ref } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'No items in the sale' });
  }

  // Idempotency guard: if this client_ref was already processed, return the existing sale.
  // This makes offline/retry syncs safe (a lost response can no longer create a duplicate).
  if (client_ref) {
    const existing = await pool.query('SELECT id FROM sales WHERE client_ref = $1', [client_ref]);
    if (existing.rows.length > 0) {
      const saleResult = await pool.query(
        'SELECT s.*, u.full_name as cashier_name FROM sales s LEFT JOIN users u ON s.user_id = u.id WHERE s.id = $1',
        [existing.rows[0].id]
      );
      const itemsResult = await pool.query(
        'SELECT * FROM sale_items WHERE sale_id = $1',
        [existing.rows[0].id]
      );
      return res.status(200).json({ ...saleResult.rows[0], items: itemsResult.rows, duplicate: true });
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Pass 1: validate items and price them SERVER-SIDE (any client-supplied unit_price is ignored)
    const prepared = [];
    let totalRevenue = 0;
    let totalCost = 0;
    let clbItems = []; // Track CLB items

    for (const raw of items) {
      const qty = parseFloat(raw.quantity);
      const productId = parseInt(raw.product_id, 10);
      if (!Number.isFinite(qty) || qty <= 0 || !Number.isInteger(productId)) {
        throw new Error(`Invalid item: ${JSON.stringify(raw)}`);
      }

      const productResult = await client.query(
        'SELECT id, name, selling_price, buying_price, current_stock, is_clb FROM products WHERE id = $1 AND status = $2 AND deleted_at IS NULL',
        [productId, 'active']
      );
      if (productResult.rows.length === 0) {
        throw new Error(`Product not found or inactive: ${productId}`);
      }
      const product = productResult.rows[0];

      const unitPrice = parseFloat(product.selling_price);
      const unitCost = parseFloat(product.buying_price);
      if (!Number.isFinite(unitPrice) || unitPrice < 0 || !Number.isFinite(unitCost) || unitCost < 0) {
        throw new Error(`Invalid pricing for product: ${product.name}`);
      }

      const itemTotal = round2(qty * unitPrice);
      const itemCost = round2(qty * unitCost);
      totalRevenue = round2(totalRevenue + itemTotal);
      totalCost = round2(totalCost + itemCost);

      // Track CLB items
      if (product.is_clb) {
        clbItems.push({
          product_id: product.id,
          name: product.name,
          quantity: qty,
          unit_price: unitPrice,
          total_price: itemTotal
        });
      }

      prepared.push({ product, qty, unitPrice, unitCost, itemTotal, itemCost });
    }

    const totalProfit = round2(totalRevenue - totalCost);
    const saleId = generateSaleId();

    const saleResult = await client.query(
      `INSERT INTO sales (sale_id, user_id, total_revenue, total_cost, total_profit, payment_method, client_ref)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [saleId, req.user.id, totalRevenue, totalCost, totalProfit, payment_method || 'cash', client_ref || null]
    );
    const sale = saleResult.rows[0];

    // Pass 2: deduct stock atomically (no negative stock for ANY role) and insert line items
    const responseItems = [];
    for (const p of prepared) {
      const deducted = await client.query(
        `UPDATE products SET current_stock = current_stock - $1, updated_at = NOW()
         WHERE id = $2 AND current_stock >= $1 RETURNING id`,
        [p.qty, p.product.id]
      );
      if (deducted.rows.length === 0) {
        throw new Error(`Insufficient stock for ${p.product.name}. Available: ${p.product.current_stock}`);
      }

      await client.query(
        `INSERT INTO sale_items (sale_id, product_id, product_name, quantity, unit_price, buying_price, total_price, profit)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [sale.id, p.product.id, p.product.name, p.qty, p.unitPrice, p.unitCost, p.itemTotal, round2(p.itemTotal - p.itemCost)]
      );

      await client.query(
        'INSERT INTO inventory_transactions (product_id, type, quantity, reference_id, reference_type) VALUES ($1, $2, $3, $4, $5)',
        [p.product.id, 'sale', -p.qty, sale.id, 'sale']
      );

      responseItems.push({
        product_id: p.product.id,
        name: p.product.name,
        quantity: p.qty,
        unit_price: p.unitPrice,
        total_price: p.itemTotal,
        is_clb: p.product.is_clb
      });
    }

    // Record payment
    await client.query(
      'INSERT INTO payments (sale_id, method, amount) VALUES ($1, $2, $3)',
      [sale.id, payment_method || 'cash', totalRevenue]
    );

    // Create CLB transaction if there are CLB items
    if (clbItems.length > 0) {
      const clbDescription = clbItems.map(item => `${item.name} x${item.quantity}`).join(', ');
      await client.query(
        'INSERT INTO clb_transactions (type, description, amount, sale_id, created_by, date) VALUES ($1, $2, $3, $4, $5, NOW())',
        ['sale', clbDescription, totalRevenue, sale.id, req.user.id]
      );
    }

    await client.query('COMMIT');

    await logAudit(req.user.id, 'Sale submitted', `Sale: ${saleId}, Total: ${totalRevenue}`);

    res.status(201).json({ ...sale, items: responseItems });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Sale error:', err);
    res.status(400).json({ error: err.message || 'Server error' });
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

// Get sales grouped by day (for easy daily verification)
router.get('/by-day', authenticate, authorize('manager'), async (req, res) => {
  try {
    const { date_from, date_to } = req.query;
    let query = `
      SELECT 
        date::date as day,
        COUNT(*) as transaction_count,
        COALESCE(SUM(total_revenue), 0) as revenue,
        COALESCE(SUM(total_cost), 0) as cost,
        COALESCE(SUM(total_profit), 0) as profit,
        COALESCE(SUM(total_expenses), 0) as expenses,
        COALESCE(SUM(total_revenue) - SUM(total_cost) - COALESCE(SUM(total_expenses), 0), 0) as net_profit
      FROM sales
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (date_from) {
      query += ` AND date >= $${paramIndex}`;
      params.push(date_from);
      paramIndex++;
    }
    if (date_to) {
      query += ` AND date <= $${paramIndex}::date + INTERVAL '1 day'`;
      params.push(date_to);
      paramIndex++;
    }

    query += ' GROUP BY date::date ORDER BY day DESC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get sales details for a specific day
router.get('/day/:date', authenticate, authorize('manager'), async (req, res) => {
  try {
    const { date } = req.params;
    const result = await pool.query(`
      SELECT s.*, u.full_name as cashier_name,
        (SELECT COUNT(*) FROM sale_items si WHERE si.sale_id = s.id) as item_count
      FROM sales s
      LEFT JOIN users u ON s.user_id = u.id
      WHERE date::date = $1
      ORDER BY s.date DESC
    `, [date]);
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

    // Ownership check: cashiers may only view their own sales; managers see everything
    if (req.user.role !== 'manager' && saleResult.rows[0].user_id !== req.user.id) {
      return res.status(403).json({ error: 'You can only view your own sales' });
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
        COALESCE(SUM(total_expenses), 0) as total_expenses,
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
