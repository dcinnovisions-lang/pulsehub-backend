'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const table = await queryInterface.describeTable('chat_messages');
    if (!table.parent_id) {
      await queryInterface.addColumn('chat_messages', 'parent_id', {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'chat_messages', key: 'id' },
        onDelete: 'SET NULL',
      });
    }
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('chat_messages', 'parent_id');
  },
};
