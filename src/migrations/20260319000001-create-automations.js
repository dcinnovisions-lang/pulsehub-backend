'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('automations', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false
      },
      workspace_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'workspaces', key: 'id' },
        onDelete: 'CASCADE'
      },
      project_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'projects', key: 'id' },
        onDelete: 'CASCADE'
      },
      created_by: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE'
      },
      name: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
        allowNull: false
      },
      trigger: {
        type: Sequelize.JSONB,
        allowNull: false,
        comment: '{ type, conditions: [{ field, operator, value }] }'
      },
      actions: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: [],
        comment: '[{ type, params }]'
      },
      run_count: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        allowNull: false
      },
      last_run_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      }
    });

    await queryInterface.addIndex('automations', ['workspace_id']);
    await queryInterface.addIndex('automations', ['project_id']);
    await queryInterface.addIndex('automations', ['is_active']);
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('automations');
  }
};
