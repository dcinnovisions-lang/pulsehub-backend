'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('tasks', 'recurrence', {
      type: Sequelize.JSONB,
      allowNull: true,
      defaultValue: null,
      comment: 'Recurrence config: { type: "daily"|"weekly"|"monthly", interval: number, endDate: string|null }'
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('tasks', 'recurrence');
  }
};
