'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('time_logs');
    if (!table.is_billable) {
      await queryInterface.addColumn('time_logs', 'is_billable', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('time_logs', 'is_billable');
  }
};
