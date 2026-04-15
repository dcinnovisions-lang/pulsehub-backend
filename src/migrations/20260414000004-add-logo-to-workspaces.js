'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tableDescription = await queryInterface.describeTable('workspaces');
    if (!tableDescription.logo) {
      await queryInterface.addColumn('workspaces', 'logo', {
        type: Sequelize.STRING(500),
        allowNull: true,
        defaultValue: null,
        after: 'description'
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('workspaces', 'logo');
  }
};
