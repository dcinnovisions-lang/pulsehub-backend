const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const crypto = require('crypto');

const Invite = sequelize.define('Invite', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  email: {
    type: DataTypes.STRING(255),
    allowNull: false,
    validate: {
      isEmail: true
    }
  },
  token: {
    type: DataTypes.STRING(255),
    allowNull: false,
    unique: true,
    defaultValue: () => crypto.randomBytes(32).toString('hex')
  },
  workspaceId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'workspace_id',
    references: {
      model: 'workspaces',
      key: 'id'
    }
  },
  projectId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'project_id',
    references: {
      model: 'projects',
      key: 'id'
    }
  },
  role: {
    // RBAC V2 — STEP 6
    // Invite role = the role assigned to the user when they accept the invite.
    // Workspace invites use workspace roles; project invites use project roles.
    // All values must exist so the invite system can assign any role.
    type: DataTypes.ENUM(
      // Workspace-level roles
      'owner',
      'admin',
      'billing_admin',  // NEW V2
      'member',
      'guest',
      // Project-level roles (NEW V2)
      'project_lead',
      'contributor',
      'reporter',
      'reviewer',
      'commenter',
      'viewer',
      // Legacy (keep for backward compat)
      'super_admin',
      'pm'
    ),
    defaultValue: 'member',
    allowNull: false
  },
  invitedBy: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'invited_by',
    references: {
      model: 'users',
      key: 'id'
    }
  },
  status: {
    type: DataTypes.ENUM('pending', 'accepted', 'expired', 'cancelled'),
    defaultValue: 'pending',
    allowNull: false
  },
  expiresAt: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'expires_at',
    defaultValue: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
  },
  acceptedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'accepted_at'
  }
}, {
  tableName: 'invites',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      unique: true,
      fields: ['token']
    },
    {
      fields: ['email']
    },
    {
      fields: ['workspace_id']
    },
    {
      fields: ['project_id']
    },
    {
      fields: ['status']
    },
    {
      fields: ['expires_at']
    }
  ]
});

// Instance methods
Invite.prototype.isExpired = function() {
  return new Date() > this.expiresAt;
};

Invite.prototype.isValid = function() {
  return this.status === 'pending' && !this.isExpired();
};

// Associations
Invite.associate = (models) => {
  Invite.belongsTo(models.Workspace, {
    foreignKey: 'workspace_id',
    as: 'workspace'
  });
  
  Invite.belongsTo(models.Project, {
    foreignKey: 'project_id',
    as: 'project'
  });
  
  Invite.belongsTo(models.User, {
    foreignKey: 'invited_by',
    as: 'inviter'
  });
};

module.exports = Invite;

