const fs = require('fs');
const path = require('path');
const pool = require('./database');
const bcrypt = require('bcryptjs');

async function initDatabase() {
  const client = await pool.connect();
  try {
    // Read and execute schema
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    await client.query(schema);
    console.log('Database schema created successfully');

    // Create default users with env-provided (or fallback) passwords.
    // Passwords are NEVER logged. Seeded users are flagged must_change_password=true
    // so they must set their own password on first login (enforced by middleware/auth.js).
    const adminPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'admin123';
    const cashierPassword = process.env.DEFAULT_CASHIER_PASSWORD || 'cashier123';

    const adminCheck = await client.query('SELECT id FROM users WHERE username = $1', ['admin']);
    if (adminCheck.rows.length === 0) {
      const managerRole = await client.query('SELECT id FROM roles WHERE name = $1', ['manager']);
      const passwordHash = await bcrypt.hash(adminPassword, 10);
      await client.query(
        'INSERT INTO users (username, password_hash, full_name, role_id, must_change_password) VALUES ($1, $2, $3, $4, true)',
        ['admin', passwordHash, 'System Administrator', managerRole.rows[0].id]
      );
      console.log('Default admin user created (username: admin) - password change required on first login');
    }

    const cashierCheck = await client.query('SELECT id FROM users WHERE username = $1', ['cashier']);
    if (cashierCheck.rows.length === 0) {
      const cashierRole = await client.query('SELECT id FROM roles WHERE name = $1', ['cashier']);
      const passwordHash = await bcrypt.hash(cashierPassword, 10);
      await client.query(
        'INSERT INTO users (username, password_hash, full_name, role_id, must_change_password) VALUES ($1, $2, $3, $4, true)',
        ['cashier', passwordHash, 'Default Cashier', cashierRole.rows[0].id]
      );
      console.log('Default cashier user created (username: cashier) - password change required on first login');
    }

    console.log('Database initialization complete');
  } catch (err) {
    console.error('Error initializing database:', err);
    throw err;
  } finally {
    client.release();
  }
}

module.exports = initDatabase;

if (require.main === module) {
  initDatabase().then(() => process.exit(0)).catch(() => process.exit(1));
}
