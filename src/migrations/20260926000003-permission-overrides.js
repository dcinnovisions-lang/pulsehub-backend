'use strict';

// Permission schemes: per-workspace and per-project overrides on top of the built-in role matrix.
module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    if (tables.includes('permission_overrides')) return;
    await queryInterface.createTable('permission_overrides', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      workspace_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'workspaces', key: 'id' }, onDelete: 'CASCADE' },
      project_id: { type: Sequelize.UUID, allowNull: true, references: { model: 'projects', key: 'id' }, onDelete: 'CASCADE' },
      role: { type: Sequelize.STRING(40), allowNull: false },
      resource: { type: Sequelize.STRING(40), allowNull: false },
      action: { type: Sequelize.STRING(40), allowNull: false },
      value: { type: Sequelize.STRING(20), allowNull: false },
      updated_by: { type: Sequelize.UUID, allowNull: true, references: { model: 'users', key: 'id' }, onDelete: 'SET NULL' },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') }
    });
    const q = queryInterface.sequelize;
    await q.query('CREATE UNIQUE INDEX permission_overrides_unique ON permission_overrides (workspace_id, COALESCE(project_id, \'00000000-0000-0000-0000-000000000000\'::uuid), role, resource, action)');
    await q.query('CREATE INDEX permission_overrides_scope_idx ON permission_overrides (workspace_id, project_id)');
  },

  async down(queryInterface) {
    await queryInterface.dropTable('permission_overrides').catch(() => {});
  }
};
