'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      ALTER TYPE "enum_users_role" ADD VALUE IF NOT EXISTS 'guest';
    `);
    await queryInterface.sequelize.query(`
      ALTER TYPE "enum_users_role" ADD VALUE IF NOT EXISTS 'commenter';
    `);

    await queryInterface.sequelize.query(`
      ALTER TYPE "enum_workspace_members_role" ADD VALUE IF NOT EXISTS 'guest';
    `);
    await queryInterface.sequelize.query(`
      ALTER TYPE "enum_workspace_members_role" ADD VALUE IF NOT EXISTS 'commenter';
    `);

    await queryInterface.sequelize.query(`
      ALTER TYPE "enum_invites_role" ADD VALUE IF NOT EXISTS 'guest';
    `);
    await queryInterface.sequelize.query(`
      ALTER TYPE "enum_invites_role" ADD VALUE IF NOT EXISTS 'commenter';
    `);
  },

  async down() {
    console.log('Skipping enum rollback. Removing ENUM values requires manual recreation of types.');
  }
};
