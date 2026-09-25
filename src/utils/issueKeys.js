const { sequelize } = require('../config/database');

const slugKey = (name) => {
  const words = String(name || '').replace(/[^A-Za-z0-9 ]/g, ' ').trim().split(/\s+/).filter(Boolean);
  let key = '';
  if (words.length >= 2) key = words.slice(0, 3).map((w) => w[0]).join('');
  else if (words.length === 1) key = words[0].slice(0, 3);
  key = key.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (key.length < 2) key = (key + 'PRJ').slice(0, 3);
  return key;
};

const normalizeKey = (key) => String(key || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);

// Returns a project key that no other project uses (SCH, SCH2, SCH3 ...)
const uniqueProjectKey = async (name, preferred, transaction) => {
  const base = normalizeKey(preferred) || slugKey(name);
  let key = base;
  let i = 2;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const [rows] = await sequelize.query('SELECT 1 FROM projects WHERE key = :key LIMIT 1', { replacements: { key }, transaction });
    if (rows.length === 0) return key;
    key = `${base.slice(0, 8)}${i++}`;
  }
};

// Atomically reserves the next issue number for a project: { number, key }
const allocateTaskNumber = async (projectId, transaction) => {
  const [rows] = await sequelize.query(
    'UPDATE projects SET task_counter = task_counter + 1 WHERE id = :id RETURNING task_counter, key, name',
    { replacements: { id: projectId }, transaction }
  );
  const row = rows[0];
  if (!row) throw new Error('Project not found while allocating issue number');
  let key = row.key;
  if (!key) {
    key = await uniqueProjectKey(row.name, null, transaction);
    await sequelize.query('UPDATE projects SET key = :key WHERE id = :id', { replacements: { key, id: projectId }, transaction });
  }
  return { number: row.task_counter, key: `${key}-${row.task_counter}` };
};

module.exports = { slugKey, normalizeKey, uniqueProjectKey, allocateTaskNumber };
