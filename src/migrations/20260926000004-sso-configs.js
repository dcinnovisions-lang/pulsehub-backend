'use strict';

// Single sign-on (OpenID Connect) settings, one per workspace.
module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    if (tables.includes('sso_configs')) return;
    await queryInterface.createTable('sso_configs', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      workspace_id: { type: Sequelize.UUID, allowNull: false, unique: true, references: { model: 'workspaces', key: 'id' }, onDelete: 'CASCADE' },
      enabled: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      issuer: { type: Sequelize.STRING(500), allowNull: true },
      client_id: { type: Sequelize.STRING(255), allowNull: true },
      client_secret_enc: { type: Sequelize.TEXT, allowNull: true },
      allowed_domains: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      auto_provision: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      default_role: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'member' },
      enforce: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      updated_by: { type: Sequelize.UUID, allowNull: true, references: { model: 'users', key: 'id' }, onDelete: 'SET NULL' },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') }
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('sso_configs').catch(() => {});
  }
};
