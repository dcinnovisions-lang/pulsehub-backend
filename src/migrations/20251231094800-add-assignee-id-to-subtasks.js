'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Add assignee_id column to subtasks table
    await queryInterface.addColumn('subtasks', 'assignee_id', {
      type: Sequelize.UUID,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });

    // Add index for assignee_id
    await queryInterface.addIndex('subtasks', ['assignee_id'], {
      name: 'subtasks_assignee_id'
    });
  },

  down: async (queryInterface, Sequelize) => {
    // Remove index
    await queryInterface.removeIndex('subtasks', 'subtasks_assignee_id');
    
    // Remove column
    await queryInterface.removeColumn('subtasks', 'assignee_id');
  }
};

