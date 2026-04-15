'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();

    // ── chat_rooms ─────────────────────────────────────────────────────────────
    if (!tables.includes('chat_rooms')) {
      await queryInterface.createTable('chat_rooms', {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.UUIDV4,
          primaryKey: true
        },
        name: {
          type: Sequelize.STRING(255),
          allowNull: false
        },
        scope: {
          type: Sequelize.ENUM('global', 'workspace', 'project'),
          allowNull: false,
          defaultValue: 'project'
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

    // Add indexes only if they don't already exist
    const roomIndexes = await queryInterface.showIndex('chat_rooms');
    const roomIndexNames = roomIndexes.map(i => i.name);
    if (!roomIndexNames.some(n => n.includes('workspace_id')))
      await queryInterface.addIndex('chat_rooms', ['workspace_id']);
    if (!roomIndexNames.some(n => n.includes('project_id')))
      await queryInterface.addIndex('chat_rooms', ['project_id']);
    if (!roomIndexNames.some(n => n.includes('scope')))
      await queryInterface.addIndex('chat_rooms', ['scope']);

    // ── chat_messages ──────────────────────────────────────────────────────────
    if (!tables.includes('chat_messages')) {
      await queryInterface.createTable('chat_messages', {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.UUIDV4,
          primaryKey: true
        },
        room_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: 'chat_rooms', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        user_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: 'users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },
        content: {
          type: Sequelize.TEXT,
          allowNull: false,
          defaultValue: ''
        },
        reactions: {
          type: Sequelize.JSONB,
          allowNull: true,
          defaultValue: {}
        },
        edited_at: {
          type: Sequelize.DATE,
          allowNull: true
        },
        parent_id: {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: 'chat_messages', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },
        attachment: {
          type: Sequelize.JSONB,
          allowNull: true,
          defaultValue: null
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

    const msgIndexes = await queryInterface.showIndex('chat_messages');
    const msgIndexNames = msgIndexes.map(i => i.name);
    if (!msgIndexNames.some(n => n.includes('room_id')))
      await queryInterface.addIndex('chat_messages', ['room_id']);
    if (!msgIndexNames.some(n => n.includes('user_id')))
      await queryInterface.addIndex('chat_messages', ['user_id']);
    if (!msgIndexNames.some(n => n.includes('created_at')))
      await queryInterface.addIndex('chat_messages', ['created_at']);
    if (!msgIndexNames.some(n => n.includes('parent_id')))
      await queryInterface.addIndex('chat_messages', ['parent_id']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('chat_messages');
    await queryInterface.dropTable('chat_rooms');
  }
};
