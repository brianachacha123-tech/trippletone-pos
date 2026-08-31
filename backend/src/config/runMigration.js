/**
 * Run migration.sql against the PostgreSQL database.
 *
 * Usage:
 *   node src/config/runMigration.js           # requires DATABASE_URL in env
 *   node src/config/runMigration.js --dry-run # prints SQL without executing
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const fs = require('fs');
const path = require('path');
const pool = require('./database');

const dryRun = process.argv.includes('--dry-run');

async function runMigration() {
  const client = await pool.connect();
  try {
    const sqlPath = path.join(__dirname, 'migration.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    // Split by semicolons, then strip leading/trailing comments and whitespace
    const statements = sql
      .split(';')
      .map(s => {
        // Remove lines that are purely comments (-- ...)
        return s.split('\n')
          .filter(line => !line.trim().startsWith('--'))
          .join('\n')
          .trim();
      })
      .filter(s => s.length > 0);

    console.log(`Found ${statements.length} SQL statement(s) in migration.sql`);

    if (dryRun) {
      console.log('\n--- DRY RUN (no changes applied) ---\n');
      statements.forEach((s, i) => {
        console.log(`[${i + 1}] ${s};\n`);
      });
      return;
    }

    for (const statement of statements) {
      try {
        await client.query(statement);
        console.log(`✅ Executed: ${statement.substring(0, 80)}...`);
      } catch (err) {
        // "column already exists" or "relation already exists" — safe to ignore
        if (err.code === '42701' || err.code === '42P07' || err.code === '42710') {
          console.log(`⏭️  Skipped (already exists): ${statement.substring(0, 80)}...`);
        } else {
          console.error(`❌ Failed: ${statement.substring(0, 80)}...`);
          console.error(`   Error: ${err.message}`);
        }
      }
    }

    console.log('\nMigration complete.');
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
