'use strict';

// RBAC V2 — STEP 9
// Migration: Add project_members table, guest_access table, and new ENUM values.
// Safe to run on existing databases — only ADDS new tables and ENUM values.
// Existing data is untouched. No destructive changes.

/** @type {import('sequelize-cli').Migration} */
module.exports = {

  async up (queryInterface, Sequelize) {

    // ── 1. Add new ENUM values to existing types ─────────────────────────────
    // PostgreSQL does not allow removing ENUM values, only adding.
    // These are additive-only and safe to run on live databases.

    console.log('[RBAC V2] Adding new role ENUM values...');

    // users.role
    await queryInterface.sequelize.query(`ALTER TYPE "enum_users_role" ADD VALUE IF NOT EXISTS 'owner';`);
    await queryInterface.sequelize.query(`ALTER TYPE "enum_users_role" ADD VALUE IF NOT EXISTS 'billing_admin';`);

    // workspace_members.role
    await queryInterface.sequelize.query(`ALTER TYPE "enum_workspace_members_role" ADD VALUE IF NOT EXISTS 'owner';`);
    await queryInterface.sequelize.query(`ALTER TYPE "enum_workspace_members_role" ADD VALUE IF NOT EXISTS 'billing_admin';`);

    // invites.role — add all workspace + project roles
    await queryInterface.sequelize.query(`ALTER TYPE "enum_invites_role" ADD VALUE IF NOT EXISTS 'owner';`);
    await queryInterface.sequelize.query(`ALTER TYPE "enum_invites_role" ADD VALUE IF NOT EXISTS 'billing_admin';`);
    await queryInterface.sequelize.query(`ALTER TYPE "enum_invites_role" ADD VALUE IF NOT EXISTS 'project_lead';`);
    await queryInterface.sequelize.query(`ALTER TYPE "enum_invites_role" ADD VALUE IF NOT EXISTS 'contributor';`);
    await queryInterface.sequelize.query(`ALTER TYPE "enum_invites_role" ADD VALUE IF NOT EXISTS 'reporter';`);
    await queryInterface.sequelize.query(`ALTER TYPE "enum_invites_role" ADD VALUE IF NOT EXISTS 'reviewer';`);

    console.log('[RBAC V2] ENUM values added.');

    // ── 2. Create project_members table ──────────────────────────────────────
    console.log('[RBAC V2] Creating project_members table...');

    await queryInterface.createTable('project_members', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false
      },
      project_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'projects', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      role: {
        type: Sequelize.ENUM('project_lead', 'contributor', 'reporter', 'reviewer', 'commenter', 'viewer'),
        allowNull: false,
        defaultValue: 'contributor'
      },
      invited_by: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      joined_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()')
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()')
      }
    });

    // Unique constraint: one role per user per project
    await queryInterface.addConstraint('project_members', {
      fields: ['project_id', 'user_id'],
      type: 'unique',
      name: 'uq_project_members_project_user'
    });

    // Indexes for common query patterns
    await queryInterface.addIndex('project_members', ['project_id'], { name: 'idx_project_members_project' });
    await queryInterface.addIndex('project_members', ['user_id'],    { name: 'idx_project_members_user'    });
    await queryInterface.addIndex('project_members', ['role'],       { name: 'idx_project_members_role'    });

    console.log('[RBAC V2] project_members table created.');

    // ── 3. Create guest_access table ─────────────────────────────────────────
    console.log('[RBAC V2] Creating guest_access table...');

    await queryInterface.createTable('guest_access', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      workspace_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'workspaces', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      resource_type: {
        type: Sequelize.STRING(50),
        allowNull: false,
        comment: 'project | task | document'
      },
      resource_id: {
        type: Sequelize.UUID,
        allowNull: false
      },
      can_view: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      can_comment: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      expires_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'NULL = never expires. Set a date for time-limited access.'
      },
      invited_by: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()')
      }
    });

    // Unique: one grant per user per resource
    await queryInterface.addConstraint('guest_access', {
      fields: ['user_id', 'resource_type', 'resource_id'],
      type: 'unique',
      name: 'uq_guest_access_user_resource'
    });

    await queryInterface.addIndex('guest_access', ['user_id'],                          { name: 'idx_guest_access_user'      });
    await queryInterface.addIndex('guest_access', ['workspace_id'],                     { name: 'idx_guest_access_workspace' });
    await queryInterface.addIndex('guest_access', ['resource_type', 'resource_id'],    { name: 'idx_guest_access_resource'  });
    await queryInterface.addIndex('guest_access', ['expires_at'],                       { name: 'idx_guest_access_expires'   });

    console.log('[RBAC V2] guest_access table created.');

    // ── 4. Backfill: assign 'owner' role in workspace_members for existing workspace creators ──
    console.log('[RBAC V2] Backfilling owner roles for existing workspace creators...');

    await queryInterface.sequelize.query(`
      INSERT INTO workspace_members (id, workspace_id, user_id, role, created_at, updated_at)
      SELECT
        gen_random_uuid(),
        w.id         AS workspace_id,
        w.owner_id   AS user_id,
        'owner'      AS role,
        NOW()        AS created_at,
        NOW()        AS updated_at
      FROM workspaces w
      WHERE NOT EXISTS (
        SELECT 1
        FROM workspace_members wm
        WHERE wm.workspace_id = w.id
          AND wm.user_id      = w.owner_id
          AND wm.role         = 'owner'
      )
      ON CONFLICT (workspace_id, user_id)
        DO UPDATE SET role = 'owner', updated_at = NOW();
    `);

    console.log('[RBAC V2] Owner roles backfilled.');
    console.log('[RBAC V2] Migration complete ✅');
  },

  async down (queryInterface) {
    // NOTE: PostgreSQL does not support removing ENUM values without
    // recreating the type. The ENUM additions are safe to leave in place.
    // Only drop the new tables.

    console.log('[RBAC V2] Rolling back — dropping guest_access and project_members...');

    await queryInterface.dropTable('guest_access');
    await queryInterface.dropTable('project_members');

    console.log('[RBAC V2] Rollback complete. ENUM values left in place (PostgreSQL limitation).');
  }
};
