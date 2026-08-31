const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { logAudit, generateKegId, round2, getSettings } = require('../utils/helpers');

// Helper: compute profit status for a keg
function computeKegStatus(keg, profitLimit) {
  const revenue = parseFloat(keg.total_revenue) || 0;
  const buyingPrice = parseFloat(keg.buying_price) || 0;
  const sellingPrice = parseFloat(keg.selling_price) || 0;
  const profitReleased = parseFloat(keg.profit_released) || 0;

  // Profit target is the profit limit from settings OR selling_price - buying_price
  const profitTarget = sellingPrice > buyingPrice ? round2(sellingPrice - buyingPrice) : profitLimit;

  // Cumulative profit (before this session's release)
  const cumulativeProfit = round2(revenue - buyingPrice);

  // Profit already released in prior days
  const remainingProfit = round2(cumulativeProfit - profitReleased);

  // Has the remaining profit reached or exceeded the target?
  const profitReached = remainingProfit >= profitTarget;

  // If reached, the full target is released, excess goes to available_funds
  let newlyReleased = 0;
  let excessToAvailable = 0;
  if (profitReached) {
    newlyReleased = profitTarget;
    excessToAvailable = round2(remainingProfit - profitTarget);
  }

  const totalProfitAvailable = round2(profitReleased + newlyReleased);
  const profitPercentage = profitTarget > 0 ? round2(Math.min((totalProfitAvailable / profitTarget) * 100, 100)) : 0;

  // Status: has selling price been fully reached?
  const sellingPriceReached = revenue >= sellingPrice;

  let profitStatus;
  if (sellingPriceReached) {
    profitStatus = 'selling_price_reached';
  } else if (profitReached) {
    profitStatus = 'profit_limit_reached';
  } else if (profitPercentage >= 80) {
    profitStatus = 'approaching_limit';
  } else if (profitPercentage >= 50) {
    profitStatus = 'on_track';
  } else {
    profitStatus = 'early';
  }

  return {
    current_profit: cumulativeProfit,
    profit_released: totalProfitAvailable,
    profit_target: profitTarget,
    selling_price: sellingPrice,
    buying_price: buyingPrice,
    remaining_to_target: round2(Math.max(0, profitTarget - totalProfitAvailable)),
    remaining_to_selling_price: round2(Math.max(0, sellingPrice - revenue)),
    profit_percentage: profitPercentage,
    profit_status: profitStatus,
    profit_reached: profitReached,
    selling_price_reached: sellingPriceReached,
    newly_released: newlyReleased,
    excess_to_available: excessToAvailable,
  };
}

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

    const settings = await getSettings();
    const profitLimit = settings.keg_profit_limit || 5000;

    const kegsWithStatus = result.rows.map(keg => ({
      ...keg,
      ...computeKegStatus(keg, profitLimit),
    }));

    res.json(kegsWithStatus);
  } catch (err) {
    console.error('Get kegs error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get active kegs only
router.get('/active', authenticate, authorize('manager'), async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM kegs WHERE status = 'active' ORDER BY created_at DESC"
    );

    const settings = await getSettings();
    const profitLimit = settings.keg_profit_limit || 5000;

    const kegsWithStatus = result.rows.map(keg => ({
      ...keg,
      ...computeKegStatus(keg, profitLimit),
    }));

    res.json(kegsWithStatus);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Open a new keg (now with selling_price)
router.post('/', authenticate, authorize('manager'), async (req, res) => {
  try {
    const { product_name, buying_price, selling_price } = req.body;
    const kegId = generateKegId();
    const result = await pool.query(
      'INSERT INTO kegs (keg_id, product_name, buying_price, selling_price) VALUES ($1, $2, $3, $4) RETURNING *',
      [kegId, product_name, buying_price || 0, selling_price || 0]
    );
    await logAudit(req.user.id, 'Keg opened', `Keg: ${kegId}, Product: ${product_name}, Buy: ${buying_price}, Sell: ${selling_price}`);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Open keg error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update keg (e.g. set selling price after opening)
router.put('/:id', authenticate, authorize('manager'), async (req, res) => {
  try {
    const { product_name, buying_price, selling_price } = req.body;
    const result = await pool.query(
      `UPDATE kegs SET product_name = COALESCE($1, product_name), buying_price = COALESCE($2, buying_price), selling_price = COALESCE($3, selling_price) WHERE id = $4 RETURNING *`,
      [product_name, buying_price, selling_price, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Keg not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update keg error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Add daily keg transaction
router.post('/:id/transactions', authenticate, authorize('manager'), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { amount, till, daily_total, notes, date } = req.body;

    // Insert the daily transaction
    await client.query(
      'INSERT INTO keg_transactions (keg_id, amount, till, daily_total, notes, date) VALUES ($1, $2, $3, $4, $5, $6)',
      [req.params.id, amount || 0, till || 0, daily_total || 0, notes, date || new Date()]
    );

    // Update keg total revenue
    await client.query(
      'UPDATE kegs SET total_revenue = total_revenue + $1 WHERE id = $2',
      [daily_total || 0, req.params.id]
    );

    // Get updated keg
    const kegResult = await client.query('SELECT * FROM kegs WHERE id = $1', [req.params.id]);
    if (kegResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Keg not found' });
    }

    const keg = kegResult.rows[0];
    const settings = await getSettings();
    const profitLimit = settings.keg_profit_limit || 5000;
    const status = computeKegStatus(keg, profitLimit);

    // If profit target is reached today, release the profit and add excess to available_funds
    if (status.newly_released > 0) {
      await client.query(
        'UPDATE kegs SET profit_released = profit_released + $1, profit = $2, available_funds = available_funds + $3 WHERE id = $4',
        [status.newly_released, status.current_profit, status.excess_to_available, req.params.id]
      );

      await logAudit(
        req.user.id,
        'Keg profit released',
        `Keg: ${keg.keg_id}, Released: KSh ${status.newly_released}, Excess: KSh ${status.excess_to_available}`
      );
    } else {
      // Just update the profit field
      await client.query(
        'UPDATE kegs SET profit = $1 WHERE id = $2',
        [status.current_profit, req.params.id]
      );
    }

    await client.query('COMMIT');

    res.status(201).json({
      transaction: (await client.query('SELECT * FROM keg_transactions ORDER BY id DESC LIMIT 1')).rows[0],
      keg_status: status,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Add keg transaction error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
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

    const settings = await getSettings();
    const profitLimit = settings.keg_profit_limit || 5000;
    const status = computeKegStatus(keg.rows[0], profitLimit);

    res.json({
      keg_id: keg.rows[0].keg_id,
      product_name: keg.rows[0].product_name,
      ...status,
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

    const settings = await getSettings();
    const profitLimit = settings.keg_profit_limit || 5000;
    const status = computeKegStatus(keg.rows[0], profitLimit);

    // Release any remaining profit
    const result = await pool.query(
      'UPDATE kegs SET status = $1, close_date = NOW(), profit = $2, profit_released = profit_released + $3, available_funds = available_funds + $4 WHERE id = $5 RETURNING *',
      ['closed', status.current_profit, status.newly_released, status.excess_to_available, req.params.id]
    );

    await logAudit(req.user.id, 'Keg closed', `Keg: ${keg.rows[0].keg_id}, Profit: ${status.current_profit}`);

    res.json({
      ...result.rows[0],
      profit: status.current_profit,
      message: `Keg closed with profit of KSh ${status.current_profit}`,
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
        COALESCE(SUM(buying_price), 0) as total_cost,
        COALESCE(SUM(available_funds), 0) as total_available
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

    // Kegs approaching or at profit limit
    const kegsAtLimit = await pool.query(`
      SELECT COUNT(*) as count FROM kegs 
      WHERE status = 'active' 
      AND (total_revenue - buying_price - profit_released) >= (CASE WHEN selling_price > buying_price THEN selling_price - buying_price ELSE $1 END)
    `, [profitLimit]);

    // Total available funds from all kegs (released profits + excess)
    const totalAvailable = await pool.query(`
      SELECT COALESCE(SUM(available_funds), 0) as total FROM kegs WHERE status = 'active'
    `);

    res.json({
      active_count: parseInt(activeKegs.rows[0].count),
      active_revenue: activeKegs.rows[0].total_revenue,
      active_cost: activeKegs.rows[0].total_cost,
      closed_count: parseInt(closedKegs.rows[0].count),
      closed_profit: closedKegs.rows[0].total_profit,
      kegs_at_limit: parseInt(kegsAtLimit.rows[0].count),
      profit_limit: profitLimit,
      total_available_from_kegs: totalAvailable.rows[0].total,
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
