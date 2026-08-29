const { v4: uuidv4 } = require('uuid');
const pool = require('../config/database');

function generateSaleId() {
  const date = new Date();
  const prefix = 'SAL';
  const timestamp = date.getFullYear().toString().slice(2) + 
    String(date.getMonth() + 1).padStart(2, '0') + 
    String(date.getDate()).padStart(2, '0');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `${prefix}-${timestamp}-${random}`;
}

function generatePurchaseId() {
  const date = new Date();
  const prefix = 'PUR';
  const timestamp = date.getFullYear().toString().slice(2) + 
    String(date.getMonth() + 1).padStart(2, '0') + 
    String(date.getDate()).padStart(2, '0');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `${prefix}-${timestamp}-${random}`;
}

function generateExpenseId() {
  const date = new Date();
  const prefix = 'EXP';
  const timestamp = date.getFullYear().toString().slice(2) + 
    String(date.getMonth() + 1).padStart(2, '0') + 
    String(date.getDate()).padStart(2, '0');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `${prefix}-${timestamp}-${random}`;
}

function generateKegId() {
  const date = new Date();
  const prefix = 'KEG';
  const timestamp = date.getFullYear().toString().slice(2) + 
    String(date.getMonth() + 1).padStart(2, '0') + 
    String(date.getDate()).padStart(2, '0');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `${prefix}-${timestamp}-${random}`;
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
