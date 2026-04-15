'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();

    // ── whiteboards ────────────────────────────────────────────────────────────
    if (!tables.includes('whiteboards')) {
      await queryInterface.createTable('whiteboards', {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.UUIDV4,
          primaryKey: true
        },
        title: {
          type: Sequelize.STRING(255),
          allowNull: false
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

    const wbIndexes = await queryInterface.showIndex('whiteboards');
    const wbIndexNames = wbIndexes.map(i => i.name);
    if (!wbIndexNames.some(n => n.includes('workspace_id')))
      await queryInterface.addIndex('whiteboards', ['workspace_id']);
    if (!wbIndexNames.some(n => n.includes('project_id')))
      await queryInterface.addIndex('whiteboards', ['project_id']);
    if (!wbIndexNames.some(n => n.includes('created_by')))
      await queryInterface.addIndex('whiteboards', ['created_by']);

    // ── whiteboard_elements ────────────────────────────────────────────────────
    if (!tables.includes('whiteboard_elements')) {
      await queryInterface.createTable('whiteboard_elements', {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.UUIDV4,
          primaryKey: true
        },
        whiteboard_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: 'whiteboards', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        type: {
          type: Sequelize.ENUM('sticky', 'text', 'shape'),
          allowNull: false,
          defaultValue: 'sticky'
        },
        data: {
          type: Sequelize.JSONB,
          allowNull: true,
          defaultValue: {}
        },
        x: {
          type: Sequelize.DECIMAL(10, 2),
          allowNull: false,
          defaultValue: 0
        },
        y: {
          type: Sequelize.DECIMAL(10, 2),
          allowNull: false,
          defaultValue: 0
        },
        width: {
          type: Sequelize.DECIMAL(10, 2),
          allowNull: false,
          defaultValue: 200
        },
        height: {
          type: Sequelize.DECIMAL(10, 2),
          allowNull: false,
          defaultValue: 160
        },
        rotation: {
          type: Sequelize.DECIMAL(10, 2),
          allowNull: false,
          defaultValue: 0
        },
        z_index: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 1
        },
        color: {
          type: Sequelize.STRING(20),
          allowNull: true,
          defaultValue: '#fde68a'
        },
        locked: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false
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

    const wbeIndexes = await queryInterface.showIndex('whiteboard_elements');
    const wbeIndexNames = wbeIndexes.map(i => i.name);
    if (!wbeIndexNames.some(n => n.includes('whiteboard_id')))
      await queryInterface.addIndex('whiteboard_elements', ['whiteboard_id']);
    if (!wbeIndexNames.some(n => n.includes('created_by')))
      await queryInterface.addIndex('whiteboard_elements', ['created_by']);
    if (!wbeIndexNames.some(n => n.includes('z_index')))
      await queryInterface.addIndex('whiteboard_elements', ['z_index']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('whiteboard_elements');
    await queryInterface.dropTable('whiteboards');
  }
};
