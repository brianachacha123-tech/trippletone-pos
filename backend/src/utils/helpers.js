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

function getWeekRange(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? 0 : -1); // Sunday start
  const weekStart = new Date(d);
  weekStart.setDate(diff);
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);
  return { weekStart, weekEnd };
}

// Round a money value to whole cents (KSh x.xx) - avoids float accumulation errors
function round2(value) {
  return Math.round((parseFloat(value) + Number.EPSILON) * 100) / 100;
}

module.exports = {
  generateSaleId,
  generatePurchaseId,
  generateExpenseId,
  generateKegId,
  logAudit,
  getWeekRange,
  round2
};
