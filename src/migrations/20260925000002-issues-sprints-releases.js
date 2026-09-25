'use strict';

// Issue types, readable keys (SCH-12), story points, bug fields, sprints, releases,
// and the QA workflow statuses (Ready for Retest / Reopened).

const slugKey = (name) => {
  const words = String(name || '').replace(/[^A-Za-z0-9 ]/g, ' ').trim().split(/\s+/).filter(Boolean);
  let key = '';
  if (words.length >= 2) key = words.slice(0, 3).map((w) => w[0]).join('');
  else if (words.length === 1) key = words[0].slice(0, 3);
  key = key.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (key.length < 2) key = (key + 'PRJ').slice(0, 3);
  return key;
};

module.exports = {
  async up(queryInterface, Sequelize) {
    const q = queryInterface.sequelize;

    // ── projects: key + counter ───────────────────────────────────────────────
    const projCols = await queryInterface.describeTable('projects');
    if (!projCols.key) {
      await queryInterface.addColumn('projects', 'key', { type: Sequelize.STRING(10), allowNull: true });
    }
    if (!projCols.task_counter) {
      await queryInterface.addColumn('projects', 'task_counter', { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 });
    }

    // ── sprints ───────────────────────────────────────────────────────────────
    const tables = await queryInterface.showAllTables();
    if (!tables.includes('sprints')) {
      await queryInterface.createTable('sprints', {
        id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
        project_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'projects', key: 'id' }, onDelete: 'CASCADE' },
        name: { type: Sequelize.STRING(120), allowNull: false },
        goal: { type: Sequelize.TEXT, allowNull: true },
        status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'planned' },
        start_date: { type: Sequelize.DATE, allowNull: true },
        end_date: { type: Sequelize.DATE, allowNull: true },
        completed_at: { type: Sequelize.DATE, allowNull: true },
        created_by: { type: Sequelize.UUID, allowNull: true, references: { model: 'users', key: 'id' }, onDelete: 'SET NULL' },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') }
      });
      await queryInterface.addIndex('sprints', ['project_id']);
      await queryInterface.addIndex('sprints', ['status']);
    }

    // ── releases ──────────────────────────────────────────────────────────────
    if (!tables.includes('releases')) {
      await queryInterface.createTable('releases', {
        id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
        project_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'projects', key: 'id' }, onDelete: 'CASCADE' },
        name: { type: Sequelize.STRING(120), allowNull: false },
        description: { type: Sequelize.TEXT, allowNull: true },
        status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'unreleased' },
        release_date: { type: Sequelize.DATE, allowNull: true },
        released_at: { type: Sequelize.DATE, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') }
      });
      await queryInterface.addIndex('releases', ['project_id']);
    }

    // ── tasks: issue fields ───────────────────────────────────────────────────
    const taskCols = await queryInterface.describeTable('tasks');
    const add = async (name, def) => {
      if (!taskCols[name]) await queryInterface.addColumn('tasks', name, def);
    };
    await add('issue_type', { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'task' });
    await add('task_number', { type: Sequelize.INTEGER, allowNull: true });
    await add('task_key', { type: Sequelize.STRING(30), allowNull: true });
    await add('story_points', { type: Sequelize.DECIMAL(6, 1), allowNull: true });
    await add('epic_id', { type: Sequelize.UUID, allowNull: true, references: { model: 'tasks', key: 'id' }, onDelete: 'SET NULL' });
    await add('sprint_id', { type: Sequelize.UUID, allowNull: true, references: { model: 'sprints', key: 'id' }, onDelete: 'SET NULL' });
    await add('release_id', { type: Sequelize.UUID, allowNull: true, references: { model: 'releases', key: 'id' }, onDelete: 'SET NULL' });
    await add('severity', { type: Sequelize.STRING(20), allowNull: true });
    await add('environment', { type: Sequelize.TEXT, allowNull: true });
    await add('steps_to_reproduce', { type: Sequelize.TEXT, allowNull: true });
    await add('expected_result', { type: Sequelize.TEXT, allowNull: true });
    await add('actual_result', { type: Sequelize.TEXT, allowNull: true });
    await add('fixed_by', { type: Sequelize.UUID, allowNull: true, references: { model: 'users', key: 'id' }, onDelete: 'SET NULL' });

    // ── backfill project keys ────────────────────────────────────────────────
    const [projects] = await q.query('SELECT id, name, key FROM projects ORDER BY created_at, id');
    const used = new Set(projects.filter((p) => p.key).map((p) => p.key));
    for (const p of projects) {
      if (p.key) continue;
      const base = slugKey(p.name);
      let key = base;
      let i = 2;
      while (used.has(key)) key = `${base.slice(0, 8)}${i++}`;
      used.add(key);
      await q.query('UPDATE projects SET key = :key WHERE id = :id', { replacements: { key, id: p.id } });
    }

    // ── backfill task numbers + keys ─────────────────────────────────────────
    await q.query(`
      UPDATE tasks t SET task_number = s.rn
      FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY project_id ORDER BY created_at, id) AS rn FROM tasks) s
      WHERE t.id = s.id AND t.task_number IS NULL
    `);
    await q.query(`
      UPDATE tasks t SET task_key = p.key || '-' || t.task_number
      FROM projects p WHERE p.id = t.project_id AND t.task_key IS NULL AND t.task_number IS NOT NULL
    `);
    await q.query(`
      UPDATE projects p SET task_counter = COALESCE((SELECT MAX(task_number) FROM tasks t WHERE t.project_id = p.id), 0)
    `);

    // ── indexes ──────────────────────────────────────────────────────────────
    await q.query('CREATE UNIQUE INDEX IF NOT EXISTS projects_key_unique ON projects (key) WHERE key IS NOT NULL');
    await q.query('CREATE UNIQUE INDEX IF NOT EXISTS tasks_project_number_unique ON tasks (project_id, task_number) WHERE task_number IS NOT NULL');
    await q.query('CREATE UNIQUE INDEX IF NOT EXISTS tasks_task_key_unique ON tasks (task_key) WHERE task_key IS NOT NULL');
    await q.query('CREATE INDEX IF NOT EXISTS tasks_sprint_idx ON tasks (sprint_id)');
    await q.query('CREATE INDEX IF NOT EXISTS tasks_epic_idx ON tasks (epic_id)');
    await q.query('CREATE INDEX IF NOT EXISTS tasks_release_idx ON tasks (release_id)');
    await q.query('CREATE INDEX IF NOT EXISTS tasks_issue_type_idx ON tasks (issue_type)');

    // ── QA workflow statuses for every existing project ──────────────────────
    // Order: To Do, In Progress, [In Review], Ready for Retest, Reopened, Done
    const [statusProjects] = await q.query('SELECT DISTINCT project_id FROM statuses');
    for (const { project_id: pid } of statusProjects) {
      const [rows] = await q.query('SELECT id, name, position FROM statuses WHERE project_id = :pid ORDER BY position, created_at', { replacements: { pid } });
      const names = rows.map((r) => r.name.toLowerCase());
      const need = [];
      if (!names.includes('ready for retest')) need.push({ name: 'Ready for Retest', color: '#F59E0B' });
      if (!names.includes('reopened')) need.push({ name: 'Reopened', color: '#EF4444' });
      if (need.length === 0) continue;
      const done = rows.find((r) => /^(done|closed|completed)$/i.test(r.name));
      const insertAt = done ? done.position : (rows.length ? Math.max(...rows.map((r) => r.position)) + 1 : 0);
      if (done) {
        await q.query('UPDATE statuses SET position = position + :n WHERE project_id = :pid AND position >= :at', { replacements: { n: need.length, pid, at: insertAt } });
      }
      for (let i = 0; i < need.length; i++) {
        await q.query(
          `INSERT INTO statuses (id, name, color, position, is_default, project_id, created_at, updated_at)
           VALUES (gen_random_uuid(), :name, :color, :pos, false, :pid, NOW(), NOW())`,
          { replacements: { name: need[i].name, color: need[i].color, pos: insertAt + i, pid } }
        );
      }
    }
  },

  async down(queryInterface) {
    const q = queryInterface.sequelize;
    await q.query('DROP INDEX IF EXISTS tasks_issue_type_idx, tasks_release_idx, tasks_epic_idx, tasks_sprint_idx, tasks_task_key_unique, tasks_project_number_unique, projects_key_unique');
    for (const c of ['fixed_by', 'actual_result', 'expected_result', 'steps_to_reproduce', 'environment', 'severity', 'release_id', 'sprint_id', 'epic_id', 'story_points', 'task_key', 'task_number', 'issue_type']) {
      await queryInterface.removeColumn('tasks', c).catch(() => {});
    }
    await queryInterface.dropTable('releases').catch(() => {});
    await queryInterface.dropTable('sprints').catch(() => {});
    await queryInterface.removeColumn('projects', 'task_counter').catch(() => {});
    await queryInterface.removeColumn('projects', 'key').catch(() => {});
  }
};
