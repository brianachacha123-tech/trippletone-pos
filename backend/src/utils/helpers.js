const { v4: uuidv4 } = require('uuid');
const pool = require('../config/database');

// Business IDs are UUIDv4: collision-proof (the old YYMMDD+4-digit-random pattern
// collided at high daily volumes and broke the UNIQUE constraint). Prefixes keep the
// IDs human-readable; VARCHAR(50) columns hold 4 + 36 = 40 chars fine.
// No data migration needed: existing IDs remain valid, only the generator changes.
function generateSaleId() {
  return `SAL-${uuidv4()}`;
}

function generatePurchaseId() {
  return `PUR-${uuidv4()}`;
}

function generateExpenseId() {
  return `EXP-${uuidv4()}`;
}

function generateKegId() {
  return `KEG-${uuidv4()}`;
}

async function logAudit(userId, action, details = null) {
  try {
    await pool.query(
      'INSERT INTO audit_logs (user_id, action, details) VALUES ($1, $2, $3)',
      [userId, action, details]
    );
  } catch (err) {
    console.error('Audit log error:', err);
  }
}

// Get week range based on configurable week start day
// weekStartDay: 0=Sunday, 1=Monday, 2=Tuesday, etc.
async function getWeekRange(date = new Date(), weekStartDay = null) {
  // If no weekStartDay provided, get it from settings
  if (weekStartDay === null) {
    try {
      const settingsResult = await pool.query('SELECT week_start_day FROM settings LIMIT 1');
      if (settingsResult.rows.length > 0) {
        weekStartDay = settingsResult.rows[0].week_start_day;
      } else {
        weekStartDay = 1; // Default to Monday
      }
    } catch (err) {
      weekStartDay = 1; // Default to Monday on error
    }
  }

  const d = new Date(date);
  const currentDay = d.getDay(); // 0=Sunday, 1=Monday, etc.
  
  // Calculate days to subtract to get to week start
  let daysToSubtract;
  if (currentDay >= weekStartDay) {
    daysToSubtract = currentDay - weekStartDay;
  } else {
    daysToSubtract = currentDay + 7 - weekStartDay;
  }

  const weekStart = new Date(d);
  weekStart.setDate(d.getDate() - daysToSubtract);
  weekStart.setHours(0, 0, 0, 0);

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  return { weekStart, weekEnd };
}

// Get the current week number (ISO week)
function getWeekNumber(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
  const week1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d - week1) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
}

// Round a money value to whole cents (KSh x.xx) - avoids float accumulation errors
function round2(value) {
  return Math.round((parseFloat(value) + Number.EPSILON) * 100) / 100;
}

// Get settings from database
async function getSettings() {
  try {
    const result = await pool.query('SELECT * FROM settings LIMIT 1');
    if (result.rows.length > 0) {
      return result.rows[0];
    }
    // Return defaults if no settings exist
    return {
      business_name: 'Trippletone Bar',
      currency: 'KSh',
      tax_rate: 0,
      week_start_day: 1,
      keg_profit_limit: 5000
    };
  } catch (err) {
    console.error('Error getting settings:', err);
    return {
      business_name: 'Trippletone Bar',
      currency: 'KSh',
      tax_rate: 0,
      week_start_day: 1,
      keg_profit_limit: 5000
    };
  }
}

// Calculate available funds for purchases
async function calculateAvailableFunds(weekStart, weekEnd) {
  try {
    // Revenue from sales
    const revenueResult = await pool.query(
      'SELECT COALESCE(SUM(total_revenue), 0) as total FROM sales WHERE date >= $1 AND date <= $2',
      [weekStart, weekEnd]
    );
    const revenue = parseFloat(revenueResult.rows[0].total);

    // Cost of goods sold
    const costResult = await pool.query(
      'SELECT COALESCE(SUM(total_cost), 0) as total FROM sales WHERE date >= $1 AND date <= $2',
      [weekStart, weekEnd]
    );
    const costOfGoods = parseFloat(costResult.rows[0].total);

    // Expenses
    const expensesResult = await pool.query(
      'SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE date >= $1 AND date <= $2',
      [weekStart, weekEnd]
    );
    const expenses = parseFloat(expensesResult.rows[0].total);

    // Purchases
    const purchasesResult = await pool.query(
      'SELECT COALESCE(SUM(total_cost), 0) as total FROM purchases WHERE date >= $1 AND date <= $2',
      [weekStart, weekEnd]
    );
    const purchases = parseFloat(purchasesResult.rows[0].total);

    // Net profit = Revenue - Cost of Goods - Expenses
    const netProfit = revenue - costOfGoods - expenses;

    // Available for purchase = Net Profit - Purchases already made
    const availableForPurchase = Math.max(0, netProfit - purchases);

    return {
      revenue,
      cost_of_goods: costOfGoods,
      expenses,
      purchases,
      net_profit: round2(netProfit),
      available_for_purchase: round2(availableForPurchase)
    };
  } catch (err) {
    console.error('Error calculating available funds:', err);
    return {
      revenue: 0,
      cost_of_goods: 0,
      expenses: 0,
      purchases: 0,
      net_profit: 0,
      available_for_purchase: 0
    };
  }
}

module.exports = {
  generateSaleId,
  generatePurchaseId,
  generateExpenseId,
  generateKegId,
  logAudit,
  getWeekRange,
  getWeekNumber,
  round2,
  getSettings,
  calculateAvailableFunds
};
