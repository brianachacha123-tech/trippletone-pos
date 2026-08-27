const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const pool = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { logAudit } = require('../utils/helpers');

// Get settings
router.get('/', authenticate, authorize('manager'), async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM settings ORDER BY id LIMIT 1');
    res.json(result.rows[0] || {});
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Update settings
router.put('/', authenticate, authorize('manager'), async (req, res) => {
  try {
    const { business_name, business_phone, business_location, currency, tax_rate } = req.body;
    const result = await pool.query(
      `UPDATE settings SET business_name=$1, business_phone=$2, business_location=$3, currency=$4, tax_rate=$5, updated_at=NOW()
       WHERE id = (SELECT id FROM settings LIMIT 1) RETURNING *`,
      [business_name, business_phone, business_location, currency || 'KSh', tax_rate || 0]
    );
    await logAudit(req.user.id, 'Settings updated');
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get all users
router.get('/users', authenticate, authorize('manager'), async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT u.id, u.username, u.full_name, u.phone, u.email, u.is_active, r.name as role, u.created_at FROM users u JOIN roles r ON u.role_id = r.id ORDER BY u.created_at DESC'
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Add user
router.post('/users', authenticate, authorize('manager'), async (req, res) => {
  try {
    const { username, password, full_name, role, phone, email } = req.body;
    
    const roleResult = await pool.query('SELECT id FROM roles WHERE name = $1', [role]);
    if (roleResult.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (username, password_hash, full_name, role_id, phone, email) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, username, full_name, is_active, created_at',
      [username, passwordHash, full_name, roleResult.rows[0].id, phone, email]
    );
    
    await logAudit(req.user.id, 'User created', `Username: ${username}`);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'Username already exists' });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

// Update user
router.put('/users/:id', authenticate, authorize('manager'), async (req, res) => {
  try {
    const { full_name, phone, email, is_active, role } = req.body;
    const roleResult = await pool.query('SELECT id FROM roles WHERE name = $1', [role]);
    
    const result = await pool.query(
      'UPDATE users SET full_name=$1, phone=$2, email=$3, is_active=$4, role_id=$5, updated_at=NOW() WHERE id=$6 RETURNING id, username, full_name, is_active',
      [full_name, phone, email, is_active, roleResult.rows[0].id, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Reset user password
router.put('/users/:id/reset-password', authenticate, authorize('manager'), async (req, res) => {
  try {
    const { new_password } = req.body;
    const passwordHash = await bcrypt.hash(new_password, 10);
    await pool.query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [passwordHash, req.params.id]);
    await logAudit(req.user.id, 'Password reset', `User ID: ${req.params.id}`);
    res.json({ message: 'Password reset successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Audit logs
router.get('/audit-logs', authenticate, authorize('manager'), async (req, res) => {
  try {
    const { limit = 100 } = req.query;
    const result = await pool.query(`
      SELECT al.*, u.full_name as user_name
      FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.id
      ORDER BY al.date DESC
      LIMIT $1
    `, [limit]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
