/**
 * PulseHub — Full Database Setup Script
 *
 * Usage:
 *   node scripts/setup-db.js           # Create DB + run all migrations + seed demo data
 *   node scripts/setup-db.js --migrate # Run migrations only (skip seed)
 *   node scripts/setup-db.js --seed    # Run seed only (DB must already exist)
 *   node scripts/setup-db.js --reset   # DROP all tables then re-run everything (DANGEROUS)
 */

require('dotenv').config();
const { execSync } = require('child_process');
const { Client } = require('pg');

const args = process.argv.slice(2);
const migrateOnly = args.includes('--migrate');
const seedOnly    = args.includes('--seed');
const reset       = args.includes('--reset');

const DB_NAME = process.env.DB_NAME || 'pulsehub_db';
const DB_USER = process.env.DB_USERNAME || 'postgres';
const DB_PASS = process.env.DB_PASSWORD || '';
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = process.env.DB_PORT || 5432;

function run(cmd, label) {
  console.log(`\n▶ ${label}`);
  try {
    execSync(cmd, { stdio: 'inherit', cwd: require('path').join(__dirname, '..') });
    console.log(`✓ ${label} — done`);
  } catch (err) {
    console.error(`✗ ${label} — FAILED`);
    process.exit(1);
  }
}

async function createDatabaseIfNotExists() {
  const client = new Client({
    host: DB_HOST, port: DB_PORT,
    user: DB_USER, password: DB_PASS,
    database: 'postgres'          // connect to default DB to create ours
  });
  try {
    await client.connect();
    const res = await client.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`, [DB_NAME]
    );
    if (res.rows.length === 0) {
      await client.query(`CREATE DATABASE "${DB_NAME}"`);
      console.log(`✓ Database "${DB_NAME}" created`);
    } else {
      console.log(`✓ Database "${DB_NAME}" already exists`);
    }
  } finally {
    await client.end();
  }
}

async function main() {
  console.log('\n═══════════════════════════════════════════');
  console.log('  PulseHub Database Setup');
  console.log('═══════════════════════════════════════════');
  console.log(`  Host    : ${DB_HOST}:${DB_PORT}`);
  console.log(`  Database: ${DB_NAME}`);
  console.log(`  User    : ${DB_USER}`);
  console.log('═══════════════════════════════════════════\n');

  if (!seedOnly) {
    // 1. Create DB if not exists
    await createDatabaseIfNotExists();

    if (reset) {
      // Drop and recreate all tables via sequelize-cli
      run('npx sequelize-cli db:migrate:undo:all', 'Rolling back all migrations');
    }

    // 2. Run all pending migrations
    run('npx sequelize-cli db:migrate', 'Running all migrations');
  }

  if (!migrateOnly) {
    // 3. Seed demo data
    run('node scripts/seed-demo.js', 'Seeding demo data');
  }

  console.log('\n═══════════════════════════════════════════');
  console.log('  Setup complete!');
  console.log('  Run: npm run dev  to start the server');
  console.log('═══════════════════════════════════════════\n');
}

main().catch(err => {
  console.error('Setup failed:', err.message);
  process.exit(1);
});
