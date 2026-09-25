'use strict';

/**
 * Adds columns that exist in models/User.js (passwordResetToken/Expiry,
 * stripeCustomerId, subscriptionId, subscriptionStatus, planId) but were
 * never actually captured by any migration — they only existed in local dev
 * databases because they were added out-of-band at some point. A fresh
 * database built purely from `sequelize db:migrate` was missing all of them,
 * which silently breaks password reset and billing/plan tracking. Guarded
 * with existence checks so this is a safe no-op on databases (like local
 * dev) that already have these columns.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('users');

    if (!table.password_reset_token) {
      await queryInterface.addColumn('users', 'password_reset_token', {
        type: Sequelize.STRING(255),
        allowNull: true,
      });
    }
    if (!table.password_reset_expiry) {
      await queryInterface.addColumn('users', 'password_reset_expiry', {
        type: Sequelize.DATE,
        allowNull: true,
      });
    }
    if (!table.stripe_customer_id) {
      await queryInterface.addColumn('users', 'stripe_customer_id', {
        type: Sequelize.STRING,
        allowNull: true,
      });
    }
    if (!table.subscription_id) {
      await queryInterface.addColumn('users', 'subscription_id', {
        type: Sequelize.STRING,
        allowNull: true,
      });
    }
    if (!table.subscription_status) {
      await queryInterface.addColumn('users', 'subscription_status', {
        type: Sequelize.ENUM('free', 'active', 'past_due', 'canceled', 'incomplete'),
        defaultValue: 'free',
        allowNull: false,
      });
    }
    if (!table.plan_id) {
      await queryInterface.addColumn('users', 'plan_id', {
        type: Sequelize.ENUM('free', 'pro', 'business'),
        defaultValue: 'free',
        allowNull: false,
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('users', 'password_reset_token');
    await queryInterface.removeColumn('users', 'password_reset_expiry');
    await queryInterface.removeColumn('users', 'stripe_customer_id');
    await queryInterface.removeColumn('users', 'subscription_id');
    await queryInterface.removeColumn('users', 'subscription_status');
    await queryInterface.removeColumn('users', 'plan_id');
  }
};
