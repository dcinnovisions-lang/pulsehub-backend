'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('documents', 'share_token', {
      type: Sequelize.UUID,
      allowNull: true,
      defaultValue: null,
    });
    await queryInterface.addColumn('documents', 'is_public', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
    await queryInterface.addIndex('documents', ['share_token'], {
      name: 'documents_share_token_idx',
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeIndex('documents', 'documents_share_token_idx');
    await queryInterface.removeColumn('documents', 'share_token');
    await queryInterface.removeColumn('documents', 'is_public');
  }
};
