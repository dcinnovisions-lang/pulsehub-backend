// Runs a single migration file (up) and records it in SequelizeMeta.
// Usage: node scripts/run-one-migration.js <migration-file-name.js>
// Useful when the local migration filenames differ from what the target database has recorded.
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const path = require('path');
const { Sequelize } = require('sequelize');

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/run-one-migration.js <migration-file-name.js>');
  process.exit(1);
}

(async () => {
  const sequelize = new Sequelize(
    process.env.DB_NAME || 'projva_db',
    process.env.DB_USERNAME || 'postgres',
    process.env.DB_PASSWORD || 'postgres',
    { host: process.env.DB_HOST || 'localhost', port: process.env.DB_PORT || 5432, dialect: 'postgres', logging: false }
  );
  const qi = sequelize.getQueryInterface();
  const [done] = await sequelize.query('SELECT name FROM "SequelizeMeta" WHERE name = :file', { replacements: { file } });
  if (done.length > 0) {
    console.log(`${file} is already recorded as applied — nothing to do.`);
    process.exit(0);
  }
  const migration = require(path.resolve(__dirname, '../src/migrations', file));
  await migration.up(qi, Sequelize);
  await sequelize.query('INSERT INTO "SequelizeMeta" (name) VALUES (:file)', { replacements: { file } });
  console.log(`Applied ${file}`);
  await sequelize.close();
})().catch((e) => { console.error('Migration failed:', e.message); process.exit(1); });
