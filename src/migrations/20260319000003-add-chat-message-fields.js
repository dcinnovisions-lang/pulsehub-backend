'use strict';
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('chat_messages');
    if (!table.reactions) {
      await queryInterface.addColumn('chat_messages', 'reactions', {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {},
      });
    }
    if (!table.edited_at) {
      await queryInterface.addColumn('chat_messages', 'edited_at', {
        type: Sequelize.DATE,
        allowNull: true,
      });
    }
  },
  async down(queryInterface) {
    await queryInterface.removeColumn('chat_messages', 'reactions');
    await queryInterface.removeColumn('chat_messages', 'edited_at');
  }
};
