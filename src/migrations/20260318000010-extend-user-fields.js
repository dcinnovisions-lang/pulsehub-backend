'use strict';
module.exports = {
  async up(queryInterface, Sequelize) {
    const tableDescription = await queryInterface.describeTable('users');

    if (!tableDescription.isEmailVerified) {
      await queryInterface.addColumn('users', 'isEmailVerified', {
        type: Sequelize.BOOLEAN, defaultValue: false, allowNull: false,
      });
    }
    if (!tableDescription.emailVerificationToken) {
      await queryInterface.addColumn('users', 'emailVerificationToken', {
        type: Sequelize.STRING, allowNull: true,
      });
    }
    if (!tableDescription.emailVerificationExpiry) {
      await queryInterface.addColumn('users', 'emailVerificationExpiry', {
        type: Sequelize.DATE, allowNull: true,
      });
    }
    if (!tableDescription.timezone) {
      await queryInterface.addColumn('users', 'timezone', {
        type: Sequelize.STRING, defaultValue: 'UTC', allowNull: true,
      });
    }
    if (!tableDescription.bio) {
      await queryInterface.addColumn('users', 'bio', {
        type: Sequelize.TEXT, allowNull: true,
      });
    }
    if (!tableDescription.twoFactorBackupCodes) {
      await queryInterface.addColumn('users', 'twoFactorBackupCodes', {
        type: Sequelize.JSONB, defaultValue: [], allowNull: true,
      });
    }
  },
  async down(queryInterface) {
    const cols = ['isEmailVerified','emailVerificationToken','emailVerificationExpiry','timezone','bio','twoFactorBackupCodes'];
    for (const col of cols) {
      try { await queryInterface.removeColumn('users', col); } catch(e) {}
    }
  }
};
