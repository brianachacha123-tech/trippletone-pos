const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { logAudit } = require('../utils/helpers');

// Simple in-memory login rate limiter (per IP + username)
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const LOGIN_MAX_FAILURES = 5;
const loginFailures = new Map();

function loginKey(username, ip) {
  return `${ip}|${String(username || '').toLowerCase()}`;
}

function recordLoginFailure(username, ip) {
  const key = loginKey(username, ip);
  const now = Date.now();
  const entry = loginFailures.get(key) || { count: 0, firstAt: now };
  if (now - entry.firstAt > LOGIN_WINDOW_MS) {
    entry.count = 0;
    entry.firstAt = now;
  }
  entry.count += 1;
  loginFailures.set(key, entry);
  return entry.count >= LOGIN_MAX_FAILURES;
}

function isLoginBlocked(username, ip) {
  const entry = loginFailures.get(loginKey(username, ip));
  return !!entry && (Date.now() - entry.firstAt <= LOGIN_WINDOW_MS) && entry.count >= LOGIN_MAX_FAILURES;
}

function clearLoginFailures(username, ip) {
  loginFailures.delete(loginKey(username, ip));
}

// Login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const ip = req.ip || req.socket.remoteAddress || 'unknown';

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    if (isLoginBlocked(username, ip)) {
      return res.status(429).json({ error: 'Too many login attempts. Please try again in 15 minutes.' });
    }

    const result = await pool.query(
      'SELECT u.*, r.name as role_name FROM users u JOIN roles r ON u.role_id = r.id WHERE u.username = $1 AND u.is_active = true',
      [username]
    );

    if (result.rows.length === 0) {
      if (recordLoginFailure(username, ip)) {
        return res.status(429).json({ error: 'Too many login attempts. Please try again in 15 minutes.' });
      }
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);
    
    if (!validPassword) {
      if (recordLoginFailure(username, ip)) {
        return res.status(429).json({ error: 'Too many login attempts. Please try again in 15 minutes.' });
      }
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    clearLoginFailures(username, ip);

    const token = jwt.sign(
      { userId: user.id, role: user.role_name },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );

    await logAudit(user.id, 'User logged in', `Username: ${username}`);

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        full_name: user.full_name,
        role: user.role_name,
        must_change_password: user.must_change_password
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get current user profile
router.get('/profile', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT u.id, u.username, u.full_name, u.phone, u.email, u.is_active, r.name as role, u.created_at FROM users u JOIN roles r ON u.role_id = r.id WHERE u.id = $1',
      [req.user.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Change password
router.put('/change-password', authenticate, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;

    if (!new_password || new_password.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }

    const result = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    const validPassword = await bcrypt.compare(current_password, result.rows[0].password_hash);
    
    if (!validPassword) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    const passwordHash = await bcrypt.hash(new_password, 10);
    await pool.query(
      'UPDATE users SET password_hash = $1, must_change_password = false, updated_at = NOW() WHERE id = $2',
      [passwordHash, req.user.id]
    );
    
    await logAudit(req.user.id, 'Password changed');
    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Logout (client-side token removal, but log the action)
router.post('/logout', authenticate, async (req, res) => {
  try {
    await logAudit(req.user.id, 'User logged out');
    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
