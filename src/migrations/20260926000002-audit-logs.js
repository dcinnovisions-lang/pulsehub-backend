'use strict';

// Security / admin audit trail + workspace/project scoping for the existing activity log.
module.exports = {
  async up(queryInterface, Sequelize) {
    const q = queryInterface.sequelize;
    const tables = await queryInterface.showAllTables();

    if (!tables.includes('audit_logs')) {
      await queryInterface.createTable('audit_logs', {
        id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
        actor_id: { type: Sequelize.UUID, allowNull: true, references: { model: 'users', key: 'id' }, onDelete: 'SET NULL' },
        actor_email: { type: Sequelize.STRING(255), allowNull: true },
        workspace_id: { type: Sequelize.UUID, allowNull: true },
        project_id: { type: Sequelize.UUID, allowNull: true },
        action: { type: Sequelize.STRING(80), allowNull: false },
        target_type: { type: Sequelize.STRING(40), allowNull: true },
        target_id: { type: Sequelize.STRING(64), allowNull: true },
        target_label: { type: Sequelize.STRING(255), allowNull: true },
        metadata: { type: Sequelize.JSONB, allowNull: true },
        ip: { type: Sequelize.STRING(64), allowNull: true },
        user_agent: { type: Sequelize.STRING(255), allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') }
      });
      await q.query('CREATE INDEX audit_logs_ws_created_idx ON audit_logs (workspace_id, created_at DESC)');
      await q.query('CREATE INDEX audit_logs_actor_idx ON audit_logs (actor_id)');
      await q.query('CREATE INDEX audit_logs_action_idx ON audit_logs (action)');
      await q.query('CREATE INDEX audit_logs_created_idx ON audit_logs (created_at DESC)');
    }

    // Scope columns so the activity feed can be limited to what a user may see
    const cols = await queryInterface.describeTable('activity_logs');
    if (!cols.workspace_id) await queryInterface.addColumn('activity_logs', 'workspace_id', { type: Sequelize.UUID, allowNull: true });
    if (!cols.project_id) await queryInterface.addColumn('activity_logs', 'project_id', { type: Sequelize.UUID, allowNull: true });

    await q.query(`UPDATE activity_logs a SET project_id = t.project_id FROM tasks t WHERE a.entity_type = 'task' AND a.entity_id = t.id AND a.project_id IS NULL`);
    await q.query(`UPDATE activity_logs SET project_id = entity_id WHERE entity_type = 'project' AND project_id IS NULL`);
    await q.query(`UPDATE activity_logs SET workspace_id = entity_id WHERE entity_type = 'workspace' AND workspace_id IS NULL`);
    await q.query(`UPDATE activity_logs a SET project_id = t.project_id FROM comments c JOIN tasks t ON t.id = c.task_id WHERE a.entity_type = 'comment' AND a.entity_id = c.id AND a.project_id IS NULL`);
    await q.query(`UPDATE activity_logs a SET project_id = t.project_id FROM attachments at JOIN tasks t ON t.id = at.task_id WHERE a.entity_type = 'attachment' AND a.entity_id = at.id AND a.project_id IS NULL`);
    await q.query(`UPDATE activity_logs a SET workspace_id = p.workspace_id FROM projects p WHERE a.project_id = p.id AND a.workspace_id IS NULL`);
    await q.query('CREATE INDEX IF NOT EXISTS activity_logs_project_idx ON activity_logs (project_id)');
    await q.query('CREATE INDEX IF NOT EXISTS activity_logs_workspace_idx ON activity_logs (workspace_id)');
  },

  async down(queryInterface) {
    const q = queryInterface.sequelize;
    await q.query('DROP INDEX IF EXISTS activity_logs_workspace_idx, activity_logs_project_idx');
    await queryInterface.removeColumn('activity_logs', 'project_id').catch(() => {});
    await queryInterface.removeColumn('activity_logs', 'workspace_id').catch(() => {});
    await queryInterface.dropTable('audit_logs').catch(() => {});
  }
};
