'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('invites', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      email: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      token: {
        type: Sequelize.STRING(255),
        allowNull: false,
        unique: true
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
      role: {
        type: Sequelize.ENUM('admin', 'pm', 'member', 'viewer'),
        defaultValue: 'member',
        allowNull: false
      },
      invited_by: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      status: {
        type: Sequelize.ENUM('pending', 'accepted', 'expired', 'cancelled'),
        defaultValue: 'pending',
        allowNull: false
      },
      expires_at: {
        type: Sequelize.DATE,
        allowNull: false
      },
      accepted_at: {
        type: Sequelize.DATE,
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

    // Create indexes
    await queryInterface.addIndex('invites', ['token'], { unique: true });
    await queryInterface.addIndex('invites', ['email']);
    await queryInterface.addIndex('invites', ['workspace_id']);
    await queryInterface.addIndex('invites', ['project_id']);
    await queryInterface.addIndex('invites', ['status']);
    await queryInterface.addIndex('invites', ['expires_at']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('invites');
  }
};

