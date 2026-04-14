const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const WorkspaceMembers = sequelize.define('WorkspaceMembers', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  workspaceId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'workspace_id',
    references: {
      model: 'workspaces',
      key: 'id'
    }
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'user_id',
    references: {
      model: 'users',
      key: 'id'
    }
  },
  role: {
    // RBAC V2 — STEP 5
    // Workspace-level roles.
    // 'owner'         = workspace creator or transferred owner. Full control. One per workspace.
    // 'admin'         = delegated manager. Can't delete workspace or manage billing.
    // 'billing_admin' = finance-only. Billing dashboard access. NO project access.
    // 'member'        = default. Project role determines actual capabilities.
    // 'guest'         = external user. Must have guest_access record per project.
    // Legacy 'pm','viewer','commenter' kept for backward compat — superseded by project_members.role
    type: DataTypes.ENUM(
      'super_admin',    // legacy — should be set at users.role, not here
      'owner',          // NEW V2
      'admin',
      'billing_admin',  // NEW V2
      'pm',             // legacy
      'member',
      'commenter',      // legacy
      'guest',
      'viewer'          // legacy
    ),
    defaultValue: 'member',
    allowNull: false
  }
}, {
  tableName: 'workspace_members',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      unique: true,
      fields: ['workspace_id', 'user_id']
    },
    {
      fields: ['workspace_id']
    },
    {
      fields: ['user_id']
    }
  ]
});

WorkspaceMembers.associate = (models) => {
  WorkspaceMembers.belongsTo(models.User, {
    foreignKey: 'userId',
    as: 'user'
  });
  WorkspaceMembers.belongsTo(models.Workspace, {
    foreignKey: 'workspaceId',
    as: 'workspace'
  });
};

module.exports = WorkspaceMembers;


