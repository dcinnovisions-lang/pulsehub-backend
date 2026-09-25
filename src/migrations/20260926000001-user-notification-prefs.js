'use strict';

// Per-user notification preferences, e.g. { "mention": { "email": true, "inApp": true }, ... }
module.exports = {
  async up(queryInterface, Sequelize) {
    const cols = await queryInterface.describeTable('users');
    if (!cols.notification_prefs) {
      await queryInterface.addColumn('users', 'notification_prefs', { type: Sequelize.JSONB, allowNull: true });
    }
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('users', 'notification_prefs').catch(() => {});
  }
};
