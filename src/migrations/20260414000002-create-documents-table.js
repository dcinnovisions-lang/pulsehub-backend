'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();

    if (!tables.includes('documents')) {
      await queryInterface.createTable('documents', {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.UUIDV4,
          primaryKey: true
        },
        title: {
          type: Sequelize.STRING(255),
          allowNull: false
        },
        content: {
          type: Sequelize.TEXT,
          allowNull: true
        },
        content_type: {
          type: Sequelize.ENUM('html', 'markdown'),
          allowNull: false,
          defaultValue: 'html'
        },
        workspace_id: {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: 'workspaces', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        project_id: {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: 'projects', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        created_by: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: 'users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },
        updated_by: {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: 'users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },
        is_archived: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false
        },
        version: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 1
        },
        share_token: {
          type: Sequelize.UUID,
          allowNull: true,
          defaultValue: null
        },
        is_public: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
        }
      });
    }

    const indexes = await queryInterface.showIndex('documents');
    const indexNames = indexes.map(i => i.name);
    if (!indexNames.some(n => n.includes('workspace_id')))
      await queryInterface.addIndex('documents', ['workspace_id']);
    if (!indexNames.some(n => n.includes('project_id')))
      await queryInterface.addIndex('documents', ['project_id']);
    if (!indexNames.some(n => n.includes('created_by')))
      await queryInterface.addIndex('documents', ['created_by']);
    if (!indexNames.some(n => n.includes('is_archived')))
      await queryInterface.addIndex('documents', ['is_archived']);
    if (!indexNames.some(n => n.includes('share_token') || n === 'documents_share_token_idx'))
      await queryInterface.addIndex('documents', ['share_token']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('documents');
  }
};
