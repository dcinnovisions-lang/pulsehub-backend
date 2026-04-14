'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Add due_date column to subtasks table
    await queryInterface.addColumn('subtasks', 'due_date', {
      type: Sequelize.DATE,
      allowNull: true
    });

    // Add estimated_hours column to subtasks table
    await queryInterface.addColumn('subtasks', 'estimated_hours', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true
    });

    // Add index for due_date for better query performance
    await queryInterface.addIndex('subtasks', ['due_date'], {
      name: 'subtasks_due_date_idx'
    });
  },

  down: async (queryInterface, Sequelize) => {
    // Remove index
    await queryInterface.removeIndex('subtasks', 'subtasks_due_date_idx');
    
    // Remove columns
    await queryInterface.removeColumn('subtasks', 'estimated_hours');
    await queryInterface.removeColumn('subtasks', 'due_date');
  }
};




