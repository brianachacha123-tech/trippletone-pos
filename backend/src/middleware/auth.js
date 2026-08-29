const jwt = require('jsonwebtoken');
const pool = require('../config/database');

const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const result = await pool.query(
      'SELECT u.id, u.username, u.full_name, u.must_change_password, r.name as role FROM users u JOIN roles r ON u.role_id = r.id WHERE u.id = $1 AND u.is_active = true',
      [decoded.userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'User not found or inactive.' });
    }
    
    const user = result.rows[0];

    // First-login password change: block everything except the auth account routes
    if (user.must_change_password) {
      const path = req.originalUrl.split('?')[0];
      const allowed = ['/api/auth/change-password', '/api/auth/logout', '/api/auth/profile'];
      if (!allowed.includes(path)) {
        return res.status(403).json({ code: 'PASSWORD_CHANGE_REQUIRED', error: 'You must change your password before continuing.' });
      }
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token.' });
  }
};

const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Access denied.' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions.' });
    }
    next();
  };
};

module.exports = { authenticate, authorize };
