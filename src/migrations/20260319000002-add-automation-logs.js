'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const table = await queryInterface.describeTable('automations');
    if (!table.recent_logs) {
      await queryInterface.addColumn('automations', 'recent_logs', {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: [],
        comment: 'Last 50 execution log entries [{ ts, status, taskId, taskTitle, actionsRun, error }]'
      });
    }
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('automations', 'recent_logs');
  }
};
