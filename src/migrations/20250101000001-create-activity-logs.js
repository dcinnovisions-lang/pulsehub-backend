'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('activity_logs', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false
      },
      entity_type: {
        type: Sequelize.ENUM('task', 'project', 'workspace', 'comment', 'attachment'),
        allowNull: false
      },
      entity_id: {
        type: Sequelize.UUID,
        allowNull: false
      },
      action: {
        type: Sequelize.ENUM(
          'created', 'updated', 'deleted', 'archived', 'restored',
          'status_changed', 'assigned', 'unassigned', 'commented',
          'attachment_added', 'attachment_removed', 'moved', 'duplicated'
        ),
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
      changes: {
        type: Sequelize.JSONB,
        allowNull: true
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true
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

    // Add indexes
    await queryInterface.addIndex('activity_logs', ['entity_type', 'entity_id'], {
      name: 'activity_logs_entity_idx'
    });
    await queryInterface.addIndex('activity_logs', ['user_id'], {
      name: 'activity_logs_user_idx'
    });
    await queryInterface.addIndex('activity_logs', ['created_at'], {
      name: 'activity_logs_created_at_idx'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('activity_logs');
  }
};

