// RBAC V2 — STEP 3
// Guest access scoping table.
// Guests (external users) can only access resources explicitly granted here.
// Supports expiry dates and per-resource permission flags.

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const RESOURCE_TYPES = ['project', 'task', 'document'];

const GuestAccess = sequelize.define('GuestAccess', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
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
  workspaceId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'workspace_id',
    references: {
      model: 'workspaces',
      key: 'id'
    }
  },
  // What type of resource is being shared
  resourceType: {
    type: DataTypes.STRING(50),
    allowNull: false,
    field: 'resource_type',
    validate: {
      isIn: [RESOURCE_TYPES]
    }
  },
  // The specific resource ID (project ID, task ID, document ID)
  resourceId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'resource_id'
  },
  // Granular permission flags
  canView: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    field: 'can_view'
  },
  canComment: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'can_comment'
  },
  // Optional expiry — NULL means permanent (until revoked)
  expiresAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'expires_at'
  },
  // Who granted this access
  invitedBy: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'invited_by',
    references: {
      model: 'users',
      key: 'id'
    }
  }
}, {
  tableName: 'guest_access',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      unique: true,
      // One record per user per resource
      fields: ['user_id', 'resource_type', 'resource_id']
    },
    {
      fields: ['user_id']
    },
    {
      fields: ['workspace_id']
    },
    {
      fields: ['resource_type', 'resource_id']
    },
    {
      // For expiry cleanup queries
      fields: ['expires_at'],
      where: { expires_at: { [require('sequelize').Op.ne]: null } }
    }
  ]
});

// Instance Methods
GuestAccess.prototype.isExpired = function () {
  if (!this.expiresAt) return false;
  return new Date() > this.expiresAt;
};

GuestAccess.prototype.isValid = function () {
  return this.canView && !this.isExpired();
};

// Associations
GuestAccess.associate = (models) => {
  GuestAccess.belongsTo(models.User, {
    foreignKey: 'user_id',
    as: 'user'
  });

  GuestAccess.belongsTo(models.Workspace, {
    foreignKey: 'workspace_id',
    as: 'workspace'
  });

  GuestAccess.belongsTo(models.User, {
    foreignKey: 'invited_by',
    as: 'inviter'
  });
};

module.exports = GuestAccess;
module.exports.RESOURCE_TYPES = RESOURCE_TYPES;
