'use strict';
module.exports = {
  async up(queryInterface, Sequelize) {
    const tableDescription = await queryInterface.describeTable('tasks');
    if (!tableDescription.labels) {
      await queryInterface.addColumn('tasks', 'labels', {
        type: Sequelize.JSONB,
        defaultValue: [],
        allowNull: true,
      });
    }
  },
  async down(queryInterface) {
    try { await queryInterface.removeColumn('tasks', 'labels'); } catch(e) {}
  }
};
