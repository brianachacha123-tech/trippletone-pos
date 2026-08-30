const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { logAudit, generateKegId, round2, getSettings } = require('../utils/helpers');

// Get all kegs
router.get('/', authenticate, authorize('manager'), async (req, res) => {
  try {
    const { status, include_profit } = req.query;
    let query = 'SELECT * FROM kegs';
    const params = [];
    if (status) {
      query += ' WHERE status = $1';
      params.push(status);
    }
    query += ' ORDER BY created_at DESC';
    const result = await pool.query(query, params);
    
    // Get keg profit limit from settings
    const settings = await getSettings();
    const profitLimit = settings.keg_profit_limit || 5000;
    
    // Add profit status to each keg
    const kegsWithStatus = result.rows.map(keg => {
      const profit = parseFloat(keg.total_revenue) - parseFloat(keg.buying_price);
      const profitPercentage = (profit / profitLimit) * 100;
      
      return {
        ...keg,
        current_profit: round2(profit),
        profit_limit: profitLimit,
        profit_percentage: round2(Math.min(profitPercentage, 100)),
        profit_status: profit >= profitLimit ? 'limit_reached' : 
                       profitPercentage >= 80 ? 'approaching_limit' : 
                       profitPercentage >= 50 ? 'on_track' : 'early'
      };
    });
    
    res.json(kegsWithStatus);
  } catch (err) {
    console.error('Get kegs error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get active kegs only
router.get('/active', authenticate, authorize('manager'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM kegs WHERE status = 'active' ORDER BY created_at DESC
    `);
    
    const settings = await getSettings();
    const profitLimit = settings.keg_profit_limit || 5000;
    
    const kegsWithStatus = result.rows.map(keg => {
      const profit = parseFloat(keg.total_revenue) - parseFloat(keg.buying_price);
      const profitPercentage = (profit / profitLimit) * 100;
      
      return {
        ...keg,
        current_profit: round2(profit),
        profit_limit: profitLimit,
        profit_percentage: round2(Math.min(profitPercentage, 100)),
        profit_status: profit >= profitLimit ? 'limit_reached' : 
                       profitPercentage >= 80 ? 'approaching_limit' : 
                       profitPercentage >= 50 ? 'on_track' : 'early'
      };
    });
    
    res.json(kegsWithStatus);
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
    await logAudit(req.user.id, 'Keg opened', `Keg: ${kegId}, Product: ${product_name}`);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Open keg error:', err);
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

    // Update keg total revenue
    await pool.query(
      'UPDATE kegs SET total_revenue = total_revenue + $1 WHERE id = $2',
      [daily_total || 0, req.params.id]
    );

    // Check if profit limit reached
    const keg = await pool.query('SELECT * FROM kegs WHERE id = $1', [req.params.id]);
    if (keg.rows.length > 0) {
      const k = keg.rows[0];
      const settings = await getSettings();
      const profitLimit = settings.keg_profit_limit || 5000;
      const currentProfit = parseFloat(k.total_revenue) - parseFloat(k.buying_price);
      
      if (currentProfit >= profitLimit) {
        await logAudit(req.user.id, 'Keg profit limit reached', `Keg: ${k.keg_id}, Profit: ${currentProfit.toFixed(2)}`);
      }
    }

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Add keg transaction error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get keg transactions (grouped by day)
router.get('/:id/transactions', authenticate, authorize('manager'), async (req, res) => {
  try {
    const { group_by_day } = req.query;
    
    const result = await pool.query(
      'SELECT * FROM keg_transactions WHERE keg_id = $1 ORDER BY date DESC',
      [req.params.id]
    );
    
    if (group_by_day === 'true') {
      // Group by day
      const grouped = {};
      result.rows.forEach(row => {
        const day = new Date(row.date).toISOString().split('T')[0];
        if (!grouped[day]) {
          grouped[day] = { day, transactions: [], daily_revenue: 0 };
        }
        grouped[day].transactions.push(row);
        grouped[day].daily_revenue += parseFloat(row.daily_total || 0);
      });
      
      const dailyData = Object.values(grouped);
      res.json(dailyData);
    } else {
      res.json(result.rows);
    }
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get keg profit status
router.get('/:id/profit-status', authenticate, authorize('manager'), async (req, res) => {
  try {
    const keg = await pool.query('SELECT * FROM kegs WHERE id = $1', [req.params.id]);
    if (keg.rows.length === 0) {
      return res.status(404).json({ error: 'Keg not found' });
    }
    
    const k = keg.rows[0];
    const settings = await getSettings();
    const profitLimit = settings.keg_profit_limit || 5000;
    const currentProfit = parseFloat(k.total_revenue) - parseFloat(k.buying_price);
    const profitPercentage = (currentProfit / profitLimit) * 100;
    
    res.json({
      keg_id: k.keg_id,
      product_name: k.product_name,
      buying_price: k.buying_price,
      total_revenue: k.total_revenue,
      current_profit: round2(currentProfit),
      profit_limit: profitLimit,
      profit_percentage: round2(Math.min(profitPercentage, 100)),
      profit_status: currentProfit >= profitLimit ? 'limit_reached' : 
                     profitPercentage >= 80 ? 'approaching_limit' : 
                     profitPercentage >= 50 ? 'on_track' : 'early',
      remaining_to_limit: round2(Math.max(0, profitLimit - currentProfit))
    });
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
    
    // Log the keg profit for business profit tracking
    await logAudit(req.user.id, 'Keg closed', `Keg: ${k.keg_id}, Profit: ${profit}, Revenue: ${k.total_revenue}`);
    
    res.json({
      ...result.rows[0],
      profit: profit,
      message: `Keg closed with profit of KSh ${profit}`
    });
  } catch (err) {
    console.error('Close keg error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get keg summary (for dashboard)
router.get('/summary', authenticate, authorize('manager'), async (req, res) => {
  try {
    const activeKegs = await pool.query(`
      SELECT 
        COUNT(*) as count,
        COALESCE(SUM(total_revenue), 0) as total_revenue,
        COALESCE(SUM(buying_price), 0) as total_cost
      FROM kegs WHERE status = 'active'
    `);
    
    const closedKegs = await pool.query(`
      SELECT 
        COUNT(*) as count,
        COALESCE(SUM(profit), 0) as total_profit
      FROM kegs WHERE status = 'closed'
    `);
    
    const settings = await getSettings();
    const profitLimit = settings.keg_profit_limit || 5000;
    
    // Kegs approaching or at limit
    const kegsAtLimit = await pool.query(`
      SELECT COUNT(*) as count FROM kegs 
      WHERE status = 'active' 
      AND (total_revenue - buying_price) >= $1
    `, [profitLimit]);
    
    res.json({
      active_count: parseInt(activeKegs.rows[0].count),
      active_revenue: activeKegs.rows[0].total_revenue,
      active_cost: activeKegs.rows[0].total_cost,
      closed_count: parseInt(closedKegs.rows[0].count),
      closed_profit: closedKegs.rows[0].total_profit,
      kegs_at_limit: parseInt(kegsAtLimit.rows[0].count),
      profit_limit: profitLimit
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
