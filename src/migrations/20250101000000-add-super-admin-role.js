'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Alter users table to add super_admin to ENUM
    await queryInterface.sequelize.query(`
      ALTER TYPE "enum_users_role" ADD VALUE IF NOT EXISTS 'super_admin';
    `);

    // Alter workspace_members table to add super_admin to ENUM
    await queryInterface.sequelize.query(`
      ALTER TYPE "enum_workspace_members_role" ADD VALUE IF NOT EXISTS 'super_admin';
    `);

    // Alter invites table to add super_admin to ENUM
    await queryInterface.sequelize.query(`
      ALTER TYPE "enum_invites_role" ADD VALUE IF NOT EXISTS 'super_admin';
    `);
  },

  async down(queryInterface, Sequelize) {
    // Note: PostgreSQL doesn't support removing ENUM values easily
    // This would require recreating the ENUM type, which is complex
    // In production, you'd need to handle this more carefully
    console.log('Warning: Removing ENUM values requires manual database intervention');
  }
};

