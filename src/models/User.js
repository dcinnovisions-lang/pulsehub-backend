const { DataTypes } = require('sequelize');
const bcrypt = require('bcryptjs');
const { sequelize } = require('../config/database');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  email: {
    type: DataTypes.STRING(255),
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true
    }
  },
  password: {
    type: DataTypes.STRING(255),
    allowNull: false,
    validate: {
      len: [6, 255]
    }
  },
  firstName: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  lastName: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  role: {
    // RBAC V2 — STEP 4
    // 'owner' and 'billing_admin' added.
    // 'owner'         = workspace creator / ownership-transferred user (workspace-level)
    // 'billing_admin' = finance-only access (billing dashboard, no project access)
    // Legacy values ('pm','viewer','guest','commenter') kept for backward compatibility
    // — they are now superseded by project_members.role at the project level.
    type: DataTypes.ENUM(
      'super_admin',
      'admin',
      'owner',
      'billing_admin',
      'pm',          // legacy — maps to project_lead at project level
      'member',
      'commenter',   // legacy — maps to commenter at project level
      'guest',       // legacy — maps to guest_access scoping
      'viewer'       // legacy — maps to viewer at project level
    ),
    defaultValue: 'member',
    allowNull: false
  },
  avatar: {
    type: DataTypes.STRING(500),
    allowNull: true
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  twoFactorEnabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'two_factor_enabled'
  },
  twoFactorSecret: {
    type: DataTypes.STRING(255),
    allowNull: true,
    field: 'two_factor_secret'
  },
  lastLogin: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'last_login'
  },
  isEmailVerified: { type: DataTypes.BOOLEAN, defaultValue: false, field: 'isEmailVerified' },
  emailVerificationToken: { type: DataTypes.STRING, allowNull: true, field: 'emailVerificationToken' },
  emailVerificationExpiry: { type: DataTypes.DATE, allowNull: true, field: 'emailVerificationExpiry' },
  passwordResetToken:  { type: DataTypes.STRING(255), allowNull: true, field: 'password_reset_token' },
  passwordResetExpiry: { type: DataTypes.DATE, allowNull: true, field: 'password_reset_expiry' },
  timezone: { type: DataTypes.STRING, defaultValue: 'UTC', allowNull: true },
  notificationPrefs: { type: DataTypes.JSONB, allowNull: true, field: 'notification_prefs' },
  bio: { type: DataTypes.TEXT, allowNull: true },
  twoFactorBackupCodes: { type: DataTypes.JSONB, defaultValue: [], field: 'twoFactorBackupCodes' },

  // ── Billing / Subscription (Razorpay) ────────────────────────────────────
  stripeCustomerId:   { type: DataTypes.STRING, allowNull: true,  field: 'stripe_customer_id' }, // kept for DB compat (unused)
  subscriptionId:     { type: DataTypes.STRING, allowNull: true,  field: 'subscription_id' },
  subscriptionStatus: {
    type: DataTypes.ENUM('free', 'active', 'past_due', 'canceled', 'incomplete'),
    defaultValue: 'free',
    allowNull: false,
    field: 'subscription_status'
  },
  planId: {
    type: DataTypes.ENUM('free', 'pro', 'business'),
    defaultValue: 'free',
    allowNull: false,
    field: 'plan_id'
  },
  // Incremented on logout to invalidate every refresh token issued before that
  // point (see auth-core.controller.js generateRefreshToken/refreshToken/logout).
  tokenVersion: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false,
    field: 'token_version'
  }
}, {
  tableName: 'users',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      unique: true,
      fields: ['email']
    }
  ],
  hooks: {
    beforeCreate: async (user) => {
      if (user.password) {
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(user.password, salt);
      }
    },
    beforeUpdate: async (user) => {
      if (user.changed('password')) {
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(user.password, salt);
      }
    }
  }
});

// Instance methods
User.prototype.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

User.prototype.toJSON = function() {
  const values = { ...this.get() };
  delete values.password;
  delete values.twoFactorSecret;
  return values;
};

// Associations
User.associate = (models) => {
  User.hasMany(models.Workspace, {
    foreignKey: 'owner_id',
    as: 'ownedWorkspaces'
  });
  
  User.belongsToMany(models.Workspace, {
    through: models.WorkspaceMembers,
    foreignKey: 'user_id',
    otherKey: 'workspace_id',
    as: 'workspaces'
  });
  
  User.hasMany(models.Task, {
    foreignKey: 'created_by',
    as: 'createdTasks'
  });
  
  User.belongsToMany(models.Task, {
    through: models.TaskAssignees,
    foreignKey: 'user_id',
    otherKey: 'task_id',
    as: 'assignedTasks'
  });
  
  User.hasMany(models.Comment, {
    foreignKey: 'user_id',
    as: 'comments'
  });
  
  User.hasMany(models.TimeLog, {
    foreignKey: 'user_id',
    as: 'timeLogs'
  });

  // RBAC V2 — project-level membership
  User.hasMany(models.ProjectMembers, {
    foreignKey: 'user_id',
    as: 'projectMemberships'
  });

  User.belongsToMany(models.Project, {
    through: models.ProjectMembers,
    foreignKey: 'user_id',
    otherKey: 'project_id',
    as: 'memberProjects'
  });

  // RBAC V2 — guest access scoping
  User.hasMany(models.GuestAccess, {
    foreignKey: 'user_id',
    as: 'guestAccesses'
  });
};

module.exports = User;

