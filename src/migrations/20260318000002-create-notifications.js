'use strict';

const NOTIFICATION_TYPES = [
  'task_assigned', 'task_mentioned', 'task_comment', 'task_status_changed',
  'task_due_soon', 'task_overdue', 'project_member_added', 'project_member_removed',
  'workspace_member_added', 'invite_accepted', 'mention'
];

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('notifications', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        primaryKey: true,
        allowNull: false
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE'
      },
      type: {
        type: Sequelize.ENUM(...NOTIFICATION_TYPES),
        allowNull: false
      },
      title: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      body: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      entity_type: {
        type: Sequelize.ENUM('task', 'project', 'workspace', 'comment', 'invite'),
        allowNull: true
      },
      entity_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      actor_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL'
      },
      is_read: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        allowNull: false
      },
      read_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {}
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()')
      }
    });

    // Indexes
    await queryInterface.addIndex('notifications', ['user_id']);
    await queryInterface.addIndex('notifications', ['user_id', 'is_read']);
    await queryInterface.addIndex('notifications', ['entity_type', 'entity_id']);
    await queryInterface.addIndex('notifications', ['created_at']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('notifications');
    // Drop ENUMs (PostgreSQL-specific cleanup)
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_notifications_type" CASCADE;');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_notifications_entity_type" CASCADE;');
  }
};
