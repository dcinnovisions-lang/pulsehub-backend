'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('saved_views', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      name: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      workspace_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'workspaces',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      project_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'projects',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      view_type: {
        type: Sequelize.ENUM('list', 'kanban', 'calendar', 'gantt', 'workload'),
        allowNull: false,
        defaultValue: 'list'
      },
      filters: {
        type: Sequelize.JSONB,
        allowNull: true
      },
      sort_by: {
        type: Sequelize.JSONB,
        allowNull: true
      },
      group_by: {
        type: Sequelize.STRING(50),
        allowNull: true
      },
      columns: {
        type: Sequelize.JSONB,
        allowNull: true
      },
      is_default: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      is_public: {
        type: Sequelize.BOOLEAN,
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

    await queryInterface.addIndex('saved_views', ['user_id']);
    await queryInterface.addIndex('saved_views', ['workspace_id']);
    await queryInterface.addIndex('saved_views', ['project_id']);
    await queryInterface.addIndex('saved_views', ['view_type']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('saved_views');
  }
};




