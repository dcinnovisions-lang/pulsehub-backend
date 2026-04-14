/**
 * E2E Helper: Reset test user password using raw pg Pool.
 * Bypasses Sequelize entirely — no hooks, no model magic.
 *
 * Usage (inline via node -e):
 *   node -e "require('./src/scripts/reset-password')()"
 *
 * Or as a module:
 *   const reset = require('./src/scripts/reset-password');
 *   await reset();
 */
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

// Inline credentials — no .env needed
const DB = {
  host:     process.env.PGHOST     || 'localhost',
  port:     parseInt(process.env.PGPORT     || '5432'),
  database: process.env.PGDATABASE || 'projva_db',
  user:     process.env.PGUSER     || 'postgres',
  password: process.env.PGPASSWORD  || 'postgres',
};

const TEST_EMAIL    = process.env.E2E_TEST_EMAIL    || 'member@test.com';
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD || 'Test@123';

async function resetTestUserPassword() {
  const pool = new Pool(DB);
  try {
    const hashedPassword = await bcrypt.hash(TEST_PASSWORD, 10);
    const result = await pool.query(
      `UPDATE users SET password = $1, is_active = true WHERE email = $2 RETURNING id, email`,
      [hashedPassword, TEST_EMAIL]
    );
    if (result.rowCount === 0) {
      console.warn(`[reset] WARNING: No user found with email ${TEST_EMAIL}`);
    } else {
      console.log(`[reset] OK — ${result.rows[0].email} password reset to '${TEST_PASSWORD}'`);
    }
  } catch (err) {
    console.error('[reset] ERROR:', err.message);
    throw err;
  } finally {
    await pool.end();
  }
}

// Allow both direct run and require()
if (require.main === module) {
  resetTestUserPassword()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
} else {
  module.exports = resetTestUserPassword;
}
